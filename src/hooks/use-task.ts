// src/hooks/use-task.ts
/**
 * useTask - Hook for single task operations
 *
 * This hook provides access to a single task's data and operations.
 * It combines data from TaskStore (persistent) and ExecutionStore (ephemeral).
 *
 * Design principles:
 * - Derived state for streaming content (merged into messages)
 * - Memoized selectors for performance
 * - Clean separation between read and write operations
 */

import { useCallback, useMemo } from 'react';
import { messageService } from '@/services/message-service';
import { useExecutionStore } from '@/stores/execution-store';
import { useTaskStore } from '@/stores/task-store';
import type { UIMessage } from '@/types/agent';

// Stable empty array reference
const EMPTY_MESSAGES: UIMessage[] = [];

/**
 * Hook for accessing a single task's data and execution state
 */
export function useTask(taskId: string | null | undefined) {
  // Get tasks Map from TaskStore (stable reference)
  const tasksMap = useTaskStore((state) => state.tasks);
  const task = useMemo(() => (taskId ? tasksMap.get(taskId) : undefined), [tasksMap, taskId]);

  // Get messages Map from TaskStore (stable reference)
  const messagesMap = useTaskStore((state) => state.messages);
  const rawMessages = useMemo(() => {
    if (!taskId) return EMPTY_MESSAGES;
    return messagesMap.get(taskId) || EMPTY_MESSAGES;
  }, [messagesMap, taskId]);

  // Get executions Map from ExecutionStore (stable reference)
  const executionsMap = useExecutionStore((state) => state.executions);
  const execution = useMemo(
    () => (taskId ? executionsMap.get(taskId) : undefined),
    [executionsMap, taskId]
  );

  // Derived: is this task currently running?
  const isRunning = execution?.status === 'running';

  // Derived: streaming content from ExecutionStore
  const streamingContent = execution?.streamingContent;

  // Derived: server status (e.g., "Thinking...", "Executing tool...")
  const serverStatus = execution?.serverStatus;

  // Merge streaming content into messages for display
  // This creates a view where the latest assistant message shows streaming content
  const messages = useMemo(() => {
    if (!streamingContent || !isRunning) return rawMessages;

    // Find the last streaming assistant message and update its content
    return rawMessages.map((msg, index) => {
      if (index === rawMessages.length - 1 && msg.role === 'assistant' && msg.isStreaming) {
        return { ...msg, content: streamingContent } as UIMessage;
      }
      return msg;
    });
  }, [rawMessages, streamingContent, isRunning]);

  // Get loading state
  const isLoadingMessages = useTaskStore((state) =>
    taskId ? state.loadingMessages.has(taskId) : false
  );

  return {
    // Data
    task,
    messages,

    // Execution state
    isRunning,
    serverStatus,
    error: execution?.error,

    // Loading states
    isLoadingMessages,

    // Usage info (from task)
    cost: task?.cost ?? 0,
    inputTokens: task?.input_token ?? 0,
    outputTokens: task?.output_token ?? 0,
    contextUsage: task?.context_usage ?? 0,
  };
}

/**
 * Hook for checking if any task is currently running
 */
export function useAnyTaskRunning(): boolean {
  const executions = useExecutionStore((state) => state.executions);
  return useMemo(() => {
    return Array.from(executions.values()).some((e) => e.status === 'running');
  }, [executions]);
}

/**
 * Hook for getting all running task IDs
 */
export function useRunningTaskIds(): string[] {
  const executions = useExecutionStore((state) => state.executions);
  return useMemo(() => {
    return Array.from(executions.values())
      .filter((e) => e.status === 'running')
      .map((e) => e.taskId);
  }, [executions]);
}

/**
 * Hook for checking if a new task execution can be started
 */
export function useCanStartNewExecution(): boolean {
  const executions = useExecutionStore((state) => state.executions);
  const maxConcurrent = useExecutionStore((state) => state.maxConcurrent);
  return useMemo(() => {
    const runningCount = Array.from(executions.values()).filter(
      (e) => e.status === 'running'
    ).length;
    return runningCount < maxConcurrent;
  }, [executions, maxConcurrent]);
}

/**
 * Hook for accessing messages by conversation ID
 * Provides message operations like clear, delete, and stop streaming
 */
export function useMessages(conversationId?: string) {
  // Get messages Map from TaskStore (stable reference)
  const messagesMap = useTaskStore((state) => state.messages);

  // Derive messages with memoization
  const messages: UIMessage[] = useMemo(() => {
    if (!conversationId) return EMPTY_MESSAGES;
    return messagesMap.get(conversationId) || EMPTY_MESSAGES;
  }, [messagesMap, conversationId]);

  // Clear messages
  const clearMessages = useCallback(() => {
    if (conversationId) {
      useTaskStore.getState().clearMessages(conversationId);
    }
  }, [conversationId]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (conversationId) {
      useTaskStore.getState().stopStreaming(conversationId);
    }
  }, [conversationId]);

  // Delete message
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (conversationId) {
        await messageService.deleteMessage(conversationId, messageId);
      }
    },
    [conversationId]
  );

  // Delete messages from index
  const deleteMessagesFromIndex = useCallback(
    async (index: number) => {
      if (conversationId) {
        await messageService.deleteMessagesFromIndex(conversationId, index);
      }
    },
    [conversationId]
  );

  // Find message index
  const findMessageIndex = useCallback(
    (messageId: string): number => {
      return messages.findIndex((msg) => msg.id === messageId);
    },
    [messages]
  );

  return {
    messages,
    clearMessages,
    stopStreaming,
    deleteMessage,
    deleteMessagesFromIndex,
    findMessageIndex,
  };
}
