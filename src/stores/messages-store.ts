// src/stores/messages-store.ts
/**
 * MessagesStore - Centralized message state management
 *
 * This store manages messages for all conversations, enabling:
 * - Fast conversation switching (messages cached per conversationId)
 * - State derivation instead of state synchronization
 * - No message loss when switching between running tasks
 *
 * The *AndPersist methods provide combined Store + DB operations for LLMService.
 */

import { create } from 'zustand';
import { logger } from '@/lib/logger';
import { generateId } from '@/lib/utils';
import type { StoredToolContent } from '@/services/database/types';
import { databaseService } from '@/services/database-service';
import type { MessageAttachment, ToolMessageContent, UIMessage } from '@/types/agent';
import { useTaskExecutionStore } from './task-execution-store';

interface MessagesState {
  // conversationId -> messages[]
  messagesByConversation: Map<string, UIMessage[]>;

  // Actions
  setMessages: (conversationId: string, messages: UIMessage[]) => void;
  addMessage: (
    conversationId: string,
    role: 'user' | 'assistant' | 'tool',
    content: string | unknown,
    options?: {
      isStreaming?: boolean;
      assistantId?: string;
      attachments?: MessageAttachment[];
      id?: string;
      toolCallId?: string;
      toolName?: string;
      nestedTools?: UIMessage[];
      renderDoingUI?: boolean;
    }
  ) => string; // Returns message id
  updateMessage: (conversationId: string, messageId: string, updates: Partial<UIMessage>) => void;
  updateMessageContent: (
    conversationId: string,
    messageId: string,
    content: string,
    isStreaming?: boolean
  ) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  deleteMessagesFromIndex: (conversationId: string, index: number) => void;
  clearMessages: (conversationId: string) => void;
  stopStreaming: (conversationId: string) => void;
  addAttachmentToMessage: (
    conversationId: string,
    messageId: string,
    attachment: MessageAttachment
  ) => void;
  updateMessageWithNestedTool: (
    conversationId: string,
    parentToolCallId: string,
    nestedMessage: UIMessage
  ) => void;

  // Selectors (pure functions, no side effects)
  getMessages: (conversationId: string) => UIMessage[];
  findMessageIndex: (conversationId: string, messageId: string) => number;
  getLastUserMessage: (conversationId: string) => UIMessage | null;

  // ============================================
  // *AndPersist methods for LLMService
  // These methods update Store synchronously (for immediate UI update)
  // and persist to database asynchronously
  // ============================================

  /**
   * Create an assistant message and persist to database.
   * Used when starting a new assistant response.
   * Returns message ID synchronously; DB persistence is fire-and-forget.
   */
  createAssistantMessageAndPersist: (conversationId: string, agentId?: string) => string;

  /**
   * Update streaming content in Store and TaskExecutionStore.
   * Does NOT persist to database (use finalizeMessageAndPersist when done).
   */
  updateStreamingContent: (conversationId: string, messageId: string, content: string) => void;

  /**
   * Finalize a message by updating Store (isStreaming=false) and persisting to database.
   */
  finalizeMessageAndPersist: (
    conversationId: string,
    messageId: string,
    content: string
  ) => Promise<void>;

  /**
   * Add a tool message to Store and persist to database.
   * Handles nested tools (only updates parent's nestedTools array, no separate persist).
   */
  addToolMessageAndPersist: (conversationId: string, message: UIMessage) => Promise<void>;

  /**
   * Add an attachment to a message and persist to database.
   */
  addAttachmentAndPersist: (
    conversationId: string,
    messageId: string,
    attachment: MessageAttachment
  ) => Promise<void>;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messagesByConversation: new Map(),

  setMessages: (conversationId, messages) => {
    set((state) => {
      const newMap = new Map(state.messagesByConversation);
      newMap.set(conversationId, messages);
      return { messagesByConversation: newMap };
    });
  },

  addMessage: (conversationId, role, content, options = {}) => {
    const newMessage: UIMessage = {
      id: options.id || generateId(),
      role,
      content: content as string | ToolMessageContent[],
      timestamp: new Date(),
      isStreaming: options.isStreaming ?? false,
      assistantId: options.assistantId,
      attachments: options.attachments,
      toolCallId: options.toolCallId,
      toolName: options.toolName,
      nestedTools: options.nestedTools,
      renderDoingUI: options.renderDoingUI,
    };

    set((state) => {
      const newMap = new Map(state.messagesByConversation);
      const existing = newMap.get(conversationId) || [];
      newMap.set(conversationId, [...existing, newMessage]);
      return { messagesByConversation: newMap };
    });

    return newMessage.id;
  },

  updateMessage: (conversationId, messageId, updates) => {
    set((state) => {
      const newMap = new Map(state.messagesByConversation);
      const messages = newMap.get(conversationId);
      if (!messages) return state;

      const updatedMessages = messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      );
      newMap.set(conversationId, updatedMessages);
      return { messagesByConversation: newMap };
    });
  },

  updateMessageContent: (conversationId, messageId, content, isStreaming = false) => {
    set((state) => {
      const newMap = new Map(state.messagesByConversation);
      const messages = newMap.get(conversationId);
      if (!messages) return state;

      const updatedMessages = messages.map((msg) =>
        msg.id === messageId ? { ...msg, content, isStreaming } : msg
      );
      newMap.set(conversationId, updatedMessages);
      return { messagesByConversation: newMap };
    });
  },

  deleteMessage: (conversationId, messageId) => {
    set((state) => {
      const newMap = new Map(state.messagesByConversation);
      const messages = newMap.get(conversationId);
      if (!messages) return state;

      newMap.set(
        conversationId,
        messages.filter((msg) => msg.id !== messageId)
      );
      return { messagesByConversation: newMap };
    });
  },

  deleteMessagesFromIndex: (conversationId, index) => {
    set((state) => {
      const newMap = new Map(state.messagesByConversation);
      const messages = newMap.get(conversationId);
      if (!messages) return state;

      newMap.set(conversationId, messages.slice(0, index));
      return { messagesByConversation: newMap };
    });
  },

  clearMessages: (conversationId) => {
    set((state) => {
      const newMap = new Map(state.messagesByConversation);
      newMap.set(conversationId, []);
      return { messagesByConversation: newMap };
    });
  },

  stopStreaming: (conversationId) => {
    set((state) => {
      const newMap = new Map(state.messagesByConversation);
      const messages = newMap.get(conversationId);
      if (!messages) return state;

      const updatedMessages = messages.map((msg) =>
        msg.isStreaming ? { ...msg, isStreaming: false } : msg
      );
      newMap.set(conversationId, updatedMessages);
      return { messagesByConversation: newMap };
    });
  },

  addAttachmentToMessage: (conversationId, messageId, attachment) => {
    set((state) => {
      const newMap = new Map(state.messagesByConversation);
      const messages = newMap.get(conversationId);
      if (!messages) return state;

      const updatedMessages = messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, attachments: [...(msg.attachments || []), attachment] }
          : msg
      );
      newMap.set(conversationId, updatedMessages);
      return { messagesByConversation: newMap };
    });
  },

  updateMessageWithNestedTool: (conversationId, parentToolCallId, nestedMessage) => {
    logger.info('[MessagesStore] updateMessageWithNestedTool called:', {
      conversationId,
      parentToolCallId,
      nestedMessageId: nestedMessage.id,
    });

    set((state) => {
      const newMap = new Map(state.messagesByConversation);
      const messages = newMap.get(conversationId);
      if (!messages) {
        logger.warn('[MessagesStore] No messages found for conversation:', conversationId);
        return state;
      }

      let foundParent = false;
      const updatedMessages = messages.map((msg) => {
        if (msg.toolCallId === parentToolCallId && msg.role === 'tool') {
          foundParent = true;
          const existingNestedTools = msg.nestedTools || [];
          const existingIndex = existingNestedTools.findIndex((t) => t.id === nestedMessage.id);

          let updatedNestedTools: UIMessage[];
          if (existingIndex >= 0) {
            updatedNestedTools = [...existingNestedTools];
            updatedNestedTools[existingIndex] = nestedMessage;
          } else {
            updatedNestedTools = [...existingNestedTools, nestedMessage];
          }

          return { ...msg, nestedTools: updatedNestedTools };
        }
        return msg;
      });

      if (!foundParent) {
        logger.warn('[MessagesStore] Parent message NOT FOUND for toolCallId:', parentToolCallId);
      }

      newMap.set(conversationId, updatedMessages);
      return { messagesByConversation: newMap };
    });
  },

  // Selectors
  getMessages: (conversationId) => {
    return get().messagesByConversation.get(conversationId) || [];
  },

  findMessageIndex: (conversationId, messageId) => {
    const messages = get().messagesByConversation.get(conversationId) || [];
    return messages.findIndex((msg) => msg.id === messageId);
  },

  getLastUserMessage: (conversationId) => {
    const messages = get().messagesByConversation.get(conversationId) || [];
    const userMessages = messages.filter((msg) => msg.role === 'user');
    const lastMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
    return lastMessage ?? null;
  },

  // ============================================
  // *AndPersist method implementations
  // ============================================

  createAssistantMessageAndPersist: (conversationId, agentId) => {
    // 1. Synchronously add message to store (UI updates immediately)
    const messageId = get().addMessage(conversationId, 'assistant', '', {
      isStreaming: true,
      assistantId: agentId,
    });

    // 2. Fire-and-forget: persist to database asynchronously
    // This allows the message ID to be returned immediately, preventing race conditions
    // where onChunk might be called before the message ID is set
    databaseService
      .saveMessage(
        conversationId,
        'assistant',
        '',
        0, // positionIndex
        agentId,
        undefined, // attachments
        messageId
      )
      .then(() => {
        logger.info('[MessagesStore] Created and persisted assistant message', {
          conversationId,
          messageId,
        });
      })
      .catch((error) => {
        logger.error('[MessagesStore] Failed to persist assistant message:', error);
      });

    return messageId;
  },

  updateStreamingContent: (conversationId, messageId, content) => {
    // 1. Update message content in store (synchronous, UI updates immediately)
    get().updateMessageContent(conversationId, messageId, content, true);

    // 2. Update TaskExecutionStore for task switching status display
    useTaskExecutionStore.getState().updateStreamingContent(conversationId, content);
  },

  finalizeMessageAndPersist: async (conversationId, messageId, content) => {
    // 1. Synchronously update store (isStreaming = false)
    get().updateMessageContent(conversationId, messageId, content, false);

    // 2. Asynchronously persist to database
    try {
      await databaseService.updateMessage(messageId, content);
      logger.info('[MessagesStore] Finalized and persisted message', {
        conversationId,
        messageId,
      });
    } catch (error) {
      logger.error('[MessagesStore] Failed to persist finalized message:', error);
    }
  },

  addToolMessageAndPersist: async (conversationId, message) => {
    const taskStore = useTaskExecutionStore.getState();

    // Store tool message in execution store for task switching support
    if (!message.parentToolCallId) {
      taskStore.addToolMessage(conversationId, message);
    }

    // Handle nested tool messages - only update parent's nestedTools array
    if (message.parentToolCallId) {
      get().updateMessageWithNestedTool(conversationId, message.parentToolCallId, message);
      logger.info('[MessagesStore] Updated parent with nested tool message', {
        parentToolCallId: message.parentToolCallId,
        nestedMessageId: message.id,
      });
      return; // Don't persist nested messages separately
    }

    // Add message to store (synchronous)
    if (message.role === 'tool') {
      get().addMessage(conversationId, message.role, message.content, {
        isStreaming: false,
        id: message.id,
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        nestedTools: message.nestedTools,
        renderDoingUI: message.renderDoingUI,
      });
    }

    // Persist tool message to database (asynchronous)
    if (message.toolCallId && message.toolName) {
      try {
        const toolContent = Array.isArray(message.content) ? message.content[0] : null;

        if (toolContent) {
          let storedContent: StoredToolContent | null = null;

          if ((toolContent as ToolMessageContent).type === 'tool-call') {
            storedContent = {
              type: 'tool-call',
              toolCallId: (toolContent as ToolMessageContent).toolCallId,
              toolName: (toolContent as ToolMessageContent).toolName,
              input: (toolContent as ToolMessageContent).input as
                | Record<string, unknown>
                | undefined,
            };
          } else if ((toolContent as ToolMessageContent).type === 'tool-result') {
            const input = (toolContent as ToolMessageContent)?.input || {};
            const output = (toolContent as ToolMessageContent)?.output;
            const isError =
              output &&
              typeof output === 'object' &&
              (('error' in output && !!(output as { error?: unknown }).error) ||
                ('status' in output && (output as { status?: string }).status === 'error'));

            storedContent = {
              type: 'tool-result',
              toolCallId: message.toolCallId,
              toolName: message.toolName,
              input: input as Record<string, unknown>,
              output: output,
              status: isError ? 'error' : 'success',
              errorMessage:
                isError && output && typeof output === 'object' && 'error' in output
                  ? String((output as { error?: unknown }).error)
                  : undefined,
            };
          }

          if (storedContent) {
            await databaseService.saveMessage(
              conversationId,
              'tool',
              JSON.stringify(storedContent),
              0,
              undefined,
              undefined,
              message.id
            );
            logger.info('[MessagesStore] Persisted tool message', {
              messageId: message.id,
              toolName: message.toolName,
            });
          }
        }
      } catch (error) {
        logger.error('[MessagesStore] Failed to persist tool message:', error);
      }
    }
  },

  addAttachmentAndPersist: async (conversationId, messageId, attachment) => {
    // 1. Synchronously add attachment to store
    get().addAttachmentToMessage(conversationId, messageId, attachment);

    // 2. Asynchronously persist to database
    try {
      await databaseService.saveAttachment(messageId, attachment);
      logger.info('[MessagesStore] Persisted attachment', {
        messageId,
        attachmentId: attachment.id,
        type: attachment.type,
      });
    } catch (error) {
      logger.error('[MessagesStore] Failed to persist attachment:', error);
    }
  },
}));

// Export store instance for direct access in non-React contexts
export const messagesStore = useMessagesStore;
