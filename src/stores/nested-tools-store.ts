// src/stores/nested-tools-store.ts
/**
 * COMPATIBILITY SHIM - Nested tools store
 * This file maintains backward compatibility with existing code.
 * New code should use nestedMessages in ToolMessage directly.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { UIMessage } from '@/types/agent';

interface NestedToolsState {
  // Map of parentToolCallId -> nested messages
  messagesByParent: Record<string, UIMessage[]>;

  // Actions
  addMessage: (parentToolCallId: string, message: UIMessage) => void;
  clearMessages: (parentToolCallId: string) => void;
  clearAll: () => void;
  getMessages: (parentToolCallId: string) => UIMessage[];
}

export const useNestedToolsStore = create<NestedToolsState>()(
  devtools(
    (set, get) => ({
      messagesByParent: {},

      addMessage: (parentToolCallId, message) => {
        set(
          (state) => ({
            messagesByParent: {
              ...state.messagesByParent,
              [parentToolCallId]: [...(state.messagesByParent[parentToolCallId] || []), message],
            },
          }),
          false,
          'addMessage'
        );
      },

      clearMessages: (parentToolCallId) => {
        set(
          (state) => {
            const { [parentToolCallId]: _, ...rest } = state.messagesByParent;
            return { messagesByParent: rest };
          },
          false,
          'clearMessages'
        );
      },

      clearAll: () => {
        set({ messagesByParent: {} }, false, 'clearAll');
      },

      getMessages: (parentToolCallId) => {
        return get().messagesByParent[parentToolCallId] || [];
      },
    }),
    {
      name: 'nested-tools-store',
      enabled: import.meta.env.DEV,
    }
  )
);
