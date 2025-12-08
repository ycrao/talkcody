// src/components/chat-box.tsx
import type { ChatStatus } from 'ai';
import { LoaderCircle, Square } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useConversations } from '@/hooks/use-conversations';
import { useMessages } from '@/hooks/use-messages';
import { logger } from '@/lib/logger';
import { generateId } from '@/lib/utils';
import { getLocale, type SupportedLocale } from '@/locales';
import { agentRegistry } from '@/services/agents/agent-registry';
import { type AgentLoopConfig, createLLMService } from '@/services/agents/llm-service';
import { commandExecutor } from '@/services/commands/command-executor';
import { databaseService } from '@/services/database-service';
import { modelService } from '@/services/model-service';
import { previewSystemPrompt } from '@/services/prompt/preview';
import { getValidatedWorkspaceRoot } from '@/services/workspace-root-service';
import { useMessagesStore } from '@/stores/messages-store';
import { settingsManager, useSettingsStore } from '@/stores/settings-store';
import { useTaskExecutionStore } from '@/stores/task-execution-store';
import type { MessageAttachment, UIMessage } from '@/types/agent';
import type { Command, CommandContext, CommandResult } from '@/types/command';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from './ai-elements/conversation';
import { ChatInput, type ChatInputRef } from './chat/chat-input';
import { FileChangesSummary } from './chat/file-changes-summary';
import { MessageList } from './chat/message-list';
import { Button } from './ui/button';

interface ChatBoxProps {
  onMessageSent?: (message: string) => void;
  onResponseReceived?: (response: string) => void;
  onError?: (error: string) => void;
  conversationId?: string;
  onConversationStart?: (conversationId: string, title: string) => void;
  selectedFile?: string | null;
  fileContent?: string | null;
  repositoryPath?: string;
  onDiffApplied?: () => void;
  showModeSelection?: boolean;
  onAddFileToChat?: (filePath: string, fileContent: string) => Promise<void>;
  onFileSelect?: (filePath: string) => void;
}

export interface ChatBoxRef {
  addFileToChat: (filePath: string, fileContent: string) => Promise<void>;
  appendToInput: (text: string) => void;
}

export const ChatBox = forwardRef<ChatBoxRef, ChatBoxProps>(
  (
    {
      onMessageSent,
      onResponseReceived,
      onError,
      conversationId,
      onConversationStart,
      selectedFile,
      fileContent,
      repositoryPath,
      onDiffApplied,
      onFileSelect: _onFileSelect,
      onAddFileToChat: _onAddFileToChat,
    },
    ref
  ) => {
    const [input, setInput] = useState('');
    const chatInputRef = useRef<ChatInputRef>(null);
    // Per-task abort controllers - keyed by conversationId for proper concurrent task isolation
    const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
    const activeConversationIdRef = useRef<string | undefined>(undefined);
    // Ref to track the currently displayed conversationId (from props) for background task UI isolation
    const displayedConversationIdRef = useRef<string | undefined>(conversationId);
    const language = useSettingsStore((state) => state.language);
    const t = useMemo(() => getLocale((language || 'en') as SupportedLocale), [language]);

    // Derive loading state from TaskExecutionStore (instead of local state)
    // This ensures correct state when switching between conversations
    const isLoading = useTaskExecutionStore((state) =>
      conversationId ? state.isTaskRunning(conversationId) : false
    );
    const serverStatus = useTaskExecutionStore((state) =>
      conversationId ? (state.getExecution(conversationId)?.serverStatus ?? '') : ''
    );
    const status: ChatStatus = isLoading ? 'streaming' : 'ready';

    // Get store for actions (not reactive)
    const taskExecutionStore = useTaskExecutionStore.getState();

    // useConversations first to get currentConversationId
    const {
      currentConversationId,
      setCurrentConversationId,
      setError,
      loadConversation,
      createConversation,
      saveMessage,
      clearConversation,
      getConversationDetails,
    } = useConversations(conversationId, onConversationStart);

    // useMessages with conversationId for per-conversation message caching
    const {
      messages,
      clearMessages,
      stopStreaming,
      deleteMessage,
      deleteMessagesFromIndex,
      findMessageIndex,
    } = useMessages(currentConversationId);

    // Handle input changes
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
    };

    // Handle external addFileToChat calls and delegate to ChatInput
    const handleExternalAddFileToChat = useCallback(
      async (filePath: string, fileContent: string) => {
        if (chatInputRef.current) {
          await chatInputRef.current.addFileToChat(filePath, fileContent);
        }
      },
      []
    );

    // Expose addFileToChat and appendToInput methods through ref
    useImperativeHandle(
      ref,
      () => ({
        addFileToChat: handleExternalAddFileToChat,
        appendToInput: (text: string) => {
          if (chatInputRef.current) {
            chatInputRef.current.appendToInput(text);
          }
        },
      }),
      [handleExternalAddFileToChat]
    );

    // Command registry is now initialized in InitializationManager during app startup

    // Sync conversationId prop to ref for background task UI isolation
    // This ensures isCurrentlyDisplayed() checks always use the latest prop value
    useEffect(() => {
      displayedConversationIdRef.current = conversationId;
    }, [conversationId]);

    useEffect(() => {
      const handleConversationLoad = async () => {
        // Note: Removed !isLoading condition to allow switching conversations
        // even when another task is running (parallel task support)
        if (conversationId && conversationId !== currentConversationId) {
          const taskStore = useTaskExecutionStore.getState();
          const messagesStore = useMessagesStore.getState();

          // Running task: use memory messages (preserve runtime state like renderDoingUI)
          // Finished task: load from database
          const isTargetTaskRunning = taskStore.isTaskRunning(conversationId);
          const hasMessagesInMemory = messagesStore.getMessages(conversationId).length > 0;

          if (isTargetTaskRunning && hasMessagesInMemory) {
            // Running task with existing memory data, don't reload from DB
            // This preserves runtime state like renderDoingUI for tool doing UI
            logger.info('[ChatBox] Skipping DB load for running task with existing messages', {
              conversationId,
            });
            // Still need to update currentConversationId for UI to switch
            setCurrentConversationId(conversationId);
          } else {
            // Finished task or first load, fetch from database
            await loadConversation(conversationId, 0, (loadedMessages) => {
              messagesStore.setMessages(conversationId, loadedMessages);
            });
          }
        } else if (!conversationId && currentConversationId) {
          clearMessages();
          clearConversation();
        }
      };

      handleConversationLoad();
    }, [
      conversationId,
      currentConversationId,
      clearConversation,
      clearMessages,
      loadConversation,
      setCurrentConversationId,
    ]);

    // Subscribe to execution state for streaming content sync
    const currentExecution = useTaskExecutionStore((state) =>
      conversationId ? state.getExecution(conversationId) : undefined
    );

    // Note: State sync effect removed - isLoading and serverStatus now derived from store

    // Real-time streaming content sync from store
    // This updates the UI when streaming content changes in the store (e.g., from background task)
    // Note: We no longer create missing messages here - messages are always created by handleAssistantMessageStart
    // biome-ignore lint/correctness/useExhaustiveDependencies: We intentionally use streamingContent to only re-run when streaming content changes
    useEffect(() => {
      if (!conversationId || !currentExecution) return;
      if (currentExecution.status !== 'running' || !currentExecution.streamingContent) return;

      // Find a streaming assistant message to update
      // Note: The last message might be a tool message, so we search backwards
      const messagesStoreState = useMessagesStore.getState();
      const streamingMessage = [...messages]
        .reverse()
        .find((msg) => msg.role === 'assistant' && msg.isStreaming);

      if (streamingMessage) {
        // Update existing streaming message if content has changed
        const currentContent =
          typeof streamingMessage.content === 'string' ? streamingMessage.content : '';
        if (currentContent !== currentExecution.streamingContent) {
          messagesStoreState.updateMessageContent(
            conversationId,
            streamingMessage.id,
            currentExecution.streamingContent,
            true
          );
        }
      }
      // If no streaming message exists, don't create one here
      // The task's handleAssistantMessageStart will create it
    }, [conversationId, currentExecution?.streamingContent, messages]);

    const processMessage = async (
      userMessage: string,
      attachments: MessageAttachment[] | undefined,
      conversationId: string | undefined,
      skipUserMessage = false,
      baseHistory?: UIMessage[],
      overrideAgentId?: string
    ) => {
      if (!userMessage.trim() || isLoading) return;

      // Use override agent if provided (for commands), otherwise use user's selected agent
      const agentId = overrideAgentId || (await settingsManager.getAgentId());
      // Get agent with MCP tools resolved
      let agent = await agentRegistry.getWithResolvedTools(agentId);
      if (!agent) {
        logger.warn(
          `Agent with ID "${agentId}" not found, falling back to default 'planner' agent`
        );
        agent = await agentRegistry.getWithResolvedTools('planner');
      }
      const model = await modelService.getCurrentModel();
      logger.info(`Using model "${model}" for message processing`);

      // Note: isLoading state is now derived from store - startExecution will set it
      setError(null);

      onMessageSent?.(userMessage);

      let activeConversationId = conversationId;
      let isNewConversation = false;

      if (!activeConversationId) {
        try {
          activeConversationId = await createConversation(userMessage);
          isNewConversation = true;
        } catch (error) {
          logger.error('Failed to create conversation:', error);
          // Note: No need to reset loading state - nothing was started
          return;
        }
      }

      if (!activeConversationId) {
        logger.error('No conversation ID available');
        return;
      }

      // Start task execution tracking (for parallel task support)
      // This will set isLoading=true in the store
      const startResult = taskExecutionStore.startExecution(activeConversationId);
      if (!startResult.success) {
        logger.warn('Failed to start task execution:', startResult.error);
        toast.error(startResult.error || 'Failed to start task');
        return;
      }

      // Store conversation ID in ref for handleToolMessage to access
      activeConversationIdRef.current = activeConversationId;

      // Add user message with attachments only if not skipping
      let userChatMessage: UIMessage;
      if (skipUserMessage) {
        // For regeneration, create the message object from existing data
        userChatMessage = {
          id: generateId(),
          role: 'user',
          content: userMessage,
          timestamp: new Date(),
          assistantId: agentId,
          attachments,
        };
      } else {
        userChatMessage = {
          id: generateId(),
          role: 'user',
          content: userMessage,
          timestamp: new Date(),
          assistantId: agentId,
          attachments,
        };

        // Use store directly with activeConversationId (not hook's addMessage)
        // This is necessary because the hook is bound to currentConversationId which
        // may be undefined when creating a new conversation
        useMessagesStore.getState().addMessage(activeConversationId, 'user', userMessage, {
          isStreaming: false,
          assistantId: agentId,
          attachments,
        });
        await saveMessage(activeConversationId, 'user', userMessage, 0, agentId, attachments);
      }

      const abortController = new AbortController();
      // Store abort controller per conversation for concurrent task support
      abortControllersRef.current.set(activeConversationId, abortController);

      try {
        // Generate text response
        const sourceMessages = baseHistory ?? messages;
        const conversationHistory: UIMessage[] = sourceMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          assistantId: msg.assistantId,
          attachments: msg.attachments || [],
        }));

        // When regenerating, we already include the triggering user message
        if (!skipUserMessage) {
          conversationHistory.push(userChatMessage);
        }
        logger.info('conversationHistory length', conversationHistory.length);

        let systemPrompt = agent
          ? typeof agent.systemPrompt === 'function'
            ? await Promise.resolve(agent.systemPrompt())
            : agent.systemPrompt
          : undefined;

        // If dynamic prompt is enabled for this agent, compose it with providers
        if (agent?.dynamicPrompt?.enabled) {
          try {
            const root = await getValidatedWorkspaceRoot();
            const { finalSystemPrompt } = await previewSystemPrompt({
              agent: agent,
              workspaceRoot: root,
            });
            systemPrompt = finalSystemPrompt;
          } catch (e) {
            logger.warn('Failed to compose dynamic system prompt, falling back to static:', e);
          }
        }

        logger.info('Using system prompt:', systemPrompt);
        const tools = agent?.tools ?? {};
        logger.info('Using tools:', Object.keys(tools));

        // Create a new LLMService instance for this task (supports parallel execution)
        const taskLLMService = createLLMService(activeConversationId);

        // Use the new simplified runAgentLoopWithPersist method
        // All state updates are now handled internally via MessagesStore
        const config: AgentLoopConfig = {
          conversationId: activeConversationId,
          messages: conversationHistory,
          model,
          systemPrompt,
          tools,
          isThink: true,
          suppressReasoning: false,
          agentId,
          isNewConversation,
          userMessage,
        };

        await taskLLMService.runAgentLoopWithPersist(
          config,
          {
            onComplete: (result) => {
              onResponseReceived?.(result.fullText);
            },
            onError: (error) => {
              const errorMessage =
                error.message || 'Sorry, I encountered some issues. Please try again later.';
              setError(errorMessage);
              onError?.(errorMessage);
            },
          },
          abortController
        );

        if (activeConversationId) {
          // Fetch the updated conversation data for cost logging
          const updatedConv = await getConversationDetails(activeConversationId);
          if (updatedConv) {
            logger.info('Updated conversation cost:', updatedConv.cost);
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Sorry, I encountered some issues. Please try again later.';
        setError(errorMessage);

        // Note: Error message display is handled by the onError callback passed to llmService
        // to avoid duplicate error messages in the chatbox

        onError?.(errorMessage);
      } finally {
        // Stop task execution if still running (e.g., on error)
        // This will automatically update isLoading via store derivation
        if (activeConversationId && taskExecutionStore.isTaskRunning(activeConversationId)) {
          taskExecutionStore.stopExecution(activeConversationId);
        }
        // Clean up abort controller for this conversation
        abortControllersRef.current.delete(activeConversationId);
      }
    };

    const handleRegenerate = async (messageId: string) => {
      if (isLoading) return;

      const messageIndex = findMessageIndex(messageId);
      if (messageIndex === -1) return;

      const targetMessage = messages[messageIndex];
      if (!targetMessage) return;

      // Stop any ongoing generation
      stopGeneration();

      // For assistant message, find the previous user message to regenerate from
      let userMessage: UIMessage | null = null;
      let regenerateFromIndex = messageIndex;
      let baseHistory: UIMessage[] = [];

      if (targetMessage.role === 'assistant') {
        // Find the previous user message
        for (let i = messageIndex - 1; i >= 0; i--) {
          const msg = messages[i];
          if (msg?.role === 'user') {
            userMessage = msg;
            regenerateFromIndex = messageIndex; // Only delete the assistant message
            break;
          }
        }
      } else {
        // For user message, regenerate from next message (assistant response)
        userMessage = targetMessage;
        regenerateFromIndex = messageIndex + 1; // Delete from next message onwards
      }

      if (!userMessage) return;

      // Build base history up to the point we regenerate from
      baseHistory = messages.slice(0, regenerateFromIndex);

      // Delete messages from the regenerate index onwards (UI first for immediate feedback)
      deleteMessagesFromIndex(regenerateFromIndex);

      // Kick off database deletions in the background (non-blocking)
      if (currentConversationId) {
        const messagesToDelete = messages.slice(regenerateFromIndex);
        (async () => {
          for (const msg of messagesToDelete) {
            try {
              logger.info('Deleting message from database:', msg.id, msg.role);
              await databaseService.deleteMessage(msg.id);
            } catch (error) {
              logger.error(`Failed to delete message ${msg.id} from database:`, error);
            }
          }
        })();
      }

      // Regenerate the response with the curated base history and without re-adding user message
      await processMessage(
        typeof userMessage.content === 'string'
          ? userMessage.content
          : JSON.stringify(userMessage.content),
        userMessage.attachments,
        currentConversationId,
        true,
        baseHistory
      );
    };

    const handleDeleteMessage = async (messageId: string) => {
      if (isLoading) return;

      // Delete from database
      if (currentConversationId) {
        try {
          logger.info('Deleting message from database:', messageId);
          await databaseService.deleteMessage(messageId);
        } catch (error) {
          logger.error('Failed to delete message from database:', error);
          return;
        }
      }

      // Delete from UI
      deleteMessage(messageId);
    };

    const handleSubmit = async (e: React.FormEvent, attachments?: MessageAttachment[]) => {
      e.preventDefault();

      if (!input.trim() || isLoading) return;

      const userMessage = input.trim();
      setInput('');

      await processMessage(userMessage, attachments, currentConversationId);
    };

    const stopGeneration = () => {
      // Use conversationId prop (not ref) to get the correct abort controller
      // This ensures we stop the task for the currently displayed conversation
      const taskId = conversationId;
      if (taskId) {
        const controller = abortControllersRef.current.get(taskId);
        if (controller) {
          controller.abort();
          abortControllersRef.current.delete(taskId);
        }
        stopStreaming();

        // Stop the task execution in store
        if (taskExecutionStore.isTaskRunning(taskId)) {
          taskExecutionStore.stopExecution(taskId);
        }
      }
    };

    // Handle command execution
    const handleCommandExecute = async (command: Command, rawArgs: string) => {
      try {
        // Build command context
        const context: CommandContext = {
          conversationId: currentConversationId,
          repositoryPath,
          selectedFile: selectedFile || undefined,
          fileContent: fileContent || undefined,
          sendMessage: async (message: string) => {
            await processMessage(message, undefined, currentConversationId);
          },
          createNewConversation: async () => {
            if (onConversationStart) {
              onConversationStart('', '');
            }
          },
          showNotification: (message: string, type = 'info') => {
            toast[type](message);
          },
        };

        // Execute the command
        const result: CommandResult = await commandExecutor.executeFromInput(
          `/${command.name} ${rawArgs}`.trim(),
          context
        );

        // Handle the result
        if (result.success) {
          if (result.message) {
            toast.success(result.message);
          }

          // If command wants to continue processing (send message to AI)
          if (result.continueProcessing && result.aiMessage) {
            // Use command's preferred agent if specified
            await processMessage(
              result.aiMessage,
              undefined,
              currentConversationId,
              false,
              undefined,
              command.preferredAgentId
            );
          }
        } else {
          // Show error
          if (result.error) {
            toast.error(result.error);
          }
        }
      } catch (error) {
        logger.error('Command execution failed:', error);
        toast.error(`Command execution failed: ${error}`);
      }
    };

    return (
      <div className="flex h-full w-full min-w-0 flex-col">
        <Conversation className="flex min-h-0 w-full flex-1 flex-col">
          <ConversationContent className="w-full min-w-0">
            <MessageList
              messages={messages}
              onDelete={handleDeleteMessage}
              onDiffApplied={onDiffApplied}
              onRegenerate={handleRegenerate}
              repositoryPath={repositoryPath}
            />

            {isLoading && (
              <div
                className={`mx-auto my-6 flex w-1/2 items-center justify-center text-md ${
                  serverStatus.startsWith('Error:')
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-blue-800 dark:text-blue-200'
                }`}
              >
                {!serverStatus.startsWith('Error:') && (
                  <LoaderCircle className="mr-2 size-5 animate-spin" />
                )}
                <div>{serverStatus}</div>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {isLoading && (
          <div className="flex justify-center py-3">
            <Button
              className="flex items-center gap-2 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-800 dark:hover:bg-red-950 dark:hover:text-red-400"
              onClick={stopGeneration}
              size="sm"
              variant="outline"
            >
              <Square className="size-3" />
              {t.Chat.stop}
            </Button>
          </div>
        )}

        {currentConversationId && <FileChangesSummary conversationId={currentConversationId} />}

        <ChatInput
          ref={chatInputRef}
          fileContent={fileContent}
          input={input}
          isLoading={isLoading}
          onInputChange={handleInputChange}
          onSubmit={handleSubmit}
          onCommandExecute={handleCommandExecute}
          repositoryPath={repositoryPath}
          selectedFile={selectedFile}
          status={status}
          conversationId={currentConversationId}
        />
      </div>
    );
  }
);

ChatBox.displayName = 'ChatBox';
