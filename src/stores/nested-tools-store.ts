// src/stores/nested-tools-store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { logger } from '@/lib/logger';
import type { UIMessage } from '@/types/agent';

// Stable empty array reference to avoid unnecessary re-renders
const EMPTY_MESSAGES: UIMessage[] = [];

/**
 * Nested Tools Store
 *
 * Manages nested tool messages for callAgent executions.
 * Uses parent toolCallId as key to organize nested messages.
 */
interface NestedToolsState {
  // Map<parentToolCallId, messages[]>
  messagesByParent: Record<string, UIMessage[]>;

  /**
   * Add a nested tool message for a parent tool call
   */
  addMessage: (parentToolCallId: string, message: UIMessage) => void;

  /**
   * Get all nested messages for a parent tool call
   */
  getMessages: (parentToolCallId: string) => UIMessage[];

  /**
   * Clear messages for a specific parent tool call
   * Useful when the parent tool execution completes
   */
  clearMessages: (parentToolCallId: string) => void;

  /**
   * Clear all nested messages
   * Useful when starting a new conversation or session
   */
  clearAll: () => void;
}

export const useNestedToolsStore = create<NestedToolsState>()(
  devtools(
    (set, get) => ({
      messagesByParent: {},

      addMessage: (parentToolCallId: string, message: UIMessage) => {
        logger.info('[NestedToolsStore] Adding message', {
          parentToolCallId,
          messageId: message.id,
          role: message.role,
          toolName: message.toolName,
        });

        set(
          (state) => {
            const existingMessages = state.messagesByParent[parentToolCallId] || [];
            return {
              messagesByParent: {
                ...state.messagesByParent,
                [parentToolCallId]: [...existingMessages, message],
              },
            };
          },
          false,
          'addMessage'
        );
      },

      getMessages: (parentToolCallId: string) => {
        const messages = get().messagesByParent[parentToolCallId] || EMPTY_MESSAGES;
        logger.info('[NestedToolsStore] Getting messages', {
          parentToolCallId,
          count: messages.length,
        });
        return messages;
      },

      clearMessages: (parentToolCallId: string) => {
        logger.info('[NestedToolsStore] Clearing messages', {
          parentToolCallId,
        });

        set(
          (state) => {
            const newMessagesByParent = { ...state.messagesByParent };
            delete newMessagesByParent[parentToolCallId];
            return {
              messagesByParent: newMessagesByParent,
            };
          },
          false,
          'clearMessages'
        );
      },

      clearAll: () => {
        logger.info('[NestedToolsStore] Clearing all messages');
        set({ messagesByParent: {} }, false, 'clearAll');
      },
    }),
    {
      name: 'nested-tools-store',
      enabled: import.meta.env.DEV,
    }
  )
);
