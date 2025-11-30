// src/stores/agent-execution-store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { logger } from '@/lib/logger';

/**
 * Agent Execution Store
 *
 * Tracks whether an agent is currently executing to prevent user actions
 * that could interrupt the execution (like creating a new conversation).
 */

interface AgentExecutionState {
  /** Whether an agent is currently running */
  isAgentRunning: boolean;

  /** ID of the conversation where the agent is running (if any) */
  runningConversationId: string | null;

  /** Start agent execution for a conversation */
  startExecution: (conversationId?: string) => void;

  /** Stop agent execution */
  stopExecution: () => void;
}

export const useAgentExecutionStore = create<AgentExecutionState>()(
  devtools(
    (set) => ({
      isAgentRunning: false,
      runningConversationId: null,

      startExecution: (conversationId?: string) => {
        logger.info('[AgentExecutionStore] Starting execution', { conversationId });
        set(
          { isAgentRunning: true, runningConversationId: conversationId ?? null },
          false,
          'startExecution'
        );
      },

      stopExecution: () => {
        logger.info('[AgentExecutionStore] Stopping execution');
        set({ isAgentRunning: false, runningConversationId: null }, false, 'stopExecution');
      },
    }),
    {
      name: 'agent-execution-store',
      enabled: import.meta.env.DEV,
    }
  )
);
