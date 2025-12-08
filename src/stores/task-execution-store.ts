// src/stores/task-execution-store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { logger } from '@/lib/logger';
import type { UIMessage } from '@/types/agent';

/**
 * Task Execution Store
 *
 * Manages execution state for multiple concurrent tasks.
 * Each task has its own execution state including abort controller,
 * streaming content, and tool messages.
 */
export interface TaskExecutionState {
  /** Unique task ID (equivalent to conversationId) */
  taskId: string;
  /** Current execution status */
  status: 'running' | 'completed' | 'stopped' | 'error';
  /** Abort controller for this task's execution */
  abortController: AbortController;
  /** Current streaming content */
  streamingContent: string;
  /** Whether currently streaming */
  isStreaming: boolean;
  /** Server status message */
  serverStatus: string;
  /** Error message if any */
  error: string | null;
  /** Tool messages for this task */
  toolMessages: UIMessage[];
  /** Start time of execution */
  startTime: Date;
}

interface TaskExecutionStore {
  /** Map of taskId to execution state */
  executions: Map<string, TaskExecutionState>;
  /** Maximum concurrent executions allowed */
  maxConcurrentExecutions: number;

  // Actions
  /**
   * Start execution for a task.
   * Returns success:false if max concurrent executions reached or task already running.
   */
  startExecution: (taskId: string) => { success: boolean; error?: string };
  /** Stop execution for a task */
  stopExecution: (taskId: string) => void;
  /** Update streaming content for a task */
  updateStreamingContent: (taskId: string, content: string, append?: boolean) => void;
  /** Set server status for a task */
  setServerStatus: (taskId: string, status: string) => void;
  /** Set error for a task */
  setError: (taskId: string, error: string) => void;
  /** Mark execution as completed */
  completeExecution: (taskId: string) => void;
  /** Add a tool message to a task */
  addToolMessage: (taskId: string, message: UIMessage) => void;
  /** Clean up execution state for a task */
  cleanupExecution: (taskId: string) => void;
  /** Set streaming state */
  setIsStreaming: (taskId: string, isStreaming: boolean) => void;

  // Queries
  /** Check if a specific task is running */
  isTaskRunning: (taskId: string) => boolean;
  /** Get execution state for a task */
  getExecution: (taskId: string) => TaskExecutionState | undefined;
  /** Get all running task IDs */
  getRunningTaskIds: () => string[];
  /** Check if max concurrent executions reached */
  isMaxReached: () => boolean;
  /** Get current running count */
  getRunningCount: () => number;
}

const DEFAULT_MAX_CONCURRENT = 3;

export const useTaskExecutionStore = create<TaskExecutionStore>()(
  devtools(
    (set, get) => ({
      executions: new Map(),
      maxConcurrentExecutions: DEFAULT_MAX_CONCURRENT,

      startExecution: (taskId: string) => {
        const state = get();
        const existing = state.executions.get(taskId);

        // Check if already running
        if (existing?.status === 'running') {
          logger.warn('[TaskExecutionStore] Task already running', { taskId });
          return { success: false, error: 'Task is already running' };
        }

        // Check concurrency limit
        const runningCount = state.getRunningCount();
        if (runningCount >= state.maxConcurrentExecutions) {
          logger.warn('[TaskExecutionStore] Max concurrent executions reached', {
            taskId,
            runningCount,
            max: state.maxConcurrentExecutions,
          });
          return {
            success: false,
            error: `Maximum ${state.maxConcurrentExecutions} concurrent tasks reached`,
          };
        }

        const abortController = new AbortController();

        logger.info('[TaskExecutionStore] Starting execution', {
          taskId,
          runningCount: runningCount + 1,
        });

        set(
          (state) => {
            const newExecutions = new Map(state.executions);
            newExecutions.set(taskId, {
              taskId,
              status: 'running',
              abortController,
              streamingContent: '',
              isStreaming: false,
              serverStatus: '',
              error: null,
              toolMessages: [],
              startTime: new Date(),
            });
            return { executions: newExecutions };
          },
          false,
          'startExecution'
        );

        return { success: true };
      },

      stopExecution: (taskId: string) => {
        const execution = get().executions.get(taskId);
        if (!execution) {
          logger.warn('[TaskExecutionStore] No execution found to stop', { taskId });
          return;
        }

        logger.info('[TaskExecutionStore] Stopping execution', { taskId });

        // Abort the execution
        execution.abortController.abort();

        set(
          (state) => {
            const newExecutions = new Map(state.executions);
            const existing = newExecutions.get(taskId);
            if (existing) {
              newExecutions.set(taskId, {
                ...existing,
                status: 'stopped',
                isStreaming: false,
              });
            }
            return { executions: newExecutions };
          },
          false,
          'stopExecution'
        );
      },

      updateStreamingContent: (taskId: string, content: string, append = false) => {
        set(
          (state) => {
            const newExecutions = new Map(state.executions);
            const existing = newExecutions.get(taskId);
            if (existing) {
              newExecutions.set(taskId, {
                ...existing,
                streamingContent: append ? existing.streamingContent + content : content,
                isStreaming: true,
              });
            }
            return { executions: newExecutions };
          },
          false,
          'updateStreamingContent'
        );
      },

      setServerStatus: (taskId: string, status: string) => {
        set(
          (state) => {
            const newExecutions = new Map(state.executions);
            const existing = newExecutions.get(taskId);
            if (existing) {
              newExecutions.set(taskId, {
                ...existing,
                serverStatus: status,
              });
            }
            return { executions: newExecutions };
          },
          false,
          'setServerStatus'
        );
      },

      setError: (taskId: string, error: string) => {
        logger.error('[TaskExecutionStore] Setting error', { taskId, error });
        set(
          (state) => {
            const newExecutions = new Map(state.executions);
            const existing = newExecutions.get(taskId);
            if (existing) {
              newExecutions.set(taskId, {
                ...existing,
                status: 'error',
                error,
                isStreaming: false,
              });
            }
            return { executions: newExecutions };
          },
          false,
          'setError'
        );
      },

      completeExecution: (taskId: string) => {
        logger.info('[TaskExecutionStore] Completing execution', { taskId });
        set(
          (state) => {
            const newExecutions = new Map(state.executions);
            const existing = newExecutions.get(taskId);
            if (existing) {
              newExecutions.set(taskId, {
                ...existing,
                status: 'completed',
                isStreaming: false,
              });
            }
            return { executions: newExecutions };
          },
          false,
          'completeExecution'
        );
      },

      addToolMessage: (taskId: string, message: UIMessage) => {
        set(
          (state) => {
            const newExecutions = new Map(state.executions);
            const existing = newExecutions.get(taskId);
            if (existing) {
              newExecutions.set(taskId, {
                ...existing,
                toolMessages: [...existing.toolMessages, message],
              });
            }
            return { executions: newExecutions };
          },
          false,
          'addToolMessage'
        );
      },

      cleanupExecution: (taskId: string) => {
        const execution = get().executions.get(taskId);
        if (!execution) return;

        // Only cleanup if not running
        if (execution.status === 'running') {
          logger.warn('[TaskExecutionStore] Cannot cleanup running execution', { taskId });
          return;
        }

        logger.info('[TaskExecutionStore] Cleaning up execution', { taskId });
        set(
          (state) => {
            const newExecutions = new Map(state.executions);
            newExecutions.delete(taskId);
            return { executions: newExecutions };
          },
          false,
          'cleanupExecution'
        );
      },

      setIsStreaming: (taskId: string, isStreaming: boolean) => {
        set(
          (state) => {
            const newExecutions = new Map(state.executions);
            const existing = newExecutions.get(taskId);
            if (existing) {
              newExecutions.set(taskId, {
                ...existing,
                isStreaming,
              });
            }
            return { executions: newExecutions };
          },
          false,
          'setIsStreaming'
        );
      },

      // Queries
      isTaskRunning: (taskId: string) => {
        const execution = get().executions.get(taskId);
        return execution?.status === 'running';
      },

      getExecution: (taskId: string) => {
        return get().executions.get(taskId);
      },

      getRunningTaskIds: () => {
        const { executions } = get();
        return Array.from(executions.values())
          .filter((e) => e.status === 'running')
          .map((e) => e.taskId);
      },

      isMaxReached: () => {
        const state = get();
        return state.getRunningCount() >= state.maxConcurrentExecutions;
      },

      getRunningCount: () => {
        const { executions } = get();
        return Array.from(executions.values()).filter((e) => e.status === 'running').length;
      },
    }),
    {
      name: 'task-execution-store',
      enabled: import.meta.env.DEV,
    }
  )
);
