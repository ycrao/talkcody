// src/stores/task-execution-store.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskExecutionStore } from './task-execution-store';

describe('TaskExecutionStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useTaskExecutionStore.setState({
      executions: new Map(),
      maxConcurrentExecutions: 3,
    });
  });

  describe('startExecution', () => {
    it('should start a new execution successfully', () => {
      const result = useTaskExecutionStore.getState().startExecution('task-1');
      expect(result.success).toBe(true);

      const execution = useTaskExecutionStore.getState().getExecution('task-1');
      expect(execution).toBeDefined();
      expect(execution?.status).toBe('running');
      expect(execution?.taskId).toBe('task-1');
    });

    it('should fail when task is already running', () => {
      useTaskExecutionStore.getState().startExecution('task-1');
      const result = useTaskExecutionStore.getState().startExecution('task-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task is already running');
    });

    it('should fail when max concurrent executions reached', () => {
      useTaskExecutionStore.getState().startExecution('task-1');
      useTaskExecutionStore.getState().startExecution('task-2');
      useTaskExecutionStore.getState().startExecution('task-3');

      const result = useTaskExecutionStore.getState().startExecution('task-4');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum');
    });
  });

  describe('multiple task isolation', () => {
    it('should maintain separate state for each task', () => {
      const store = useTaskExecutionStore.getState();

      // Start two tasks
      store.startExecution('task-1');
      store.startExecution('task-2');

      // Update streaming content for task-1
      store.updateStreamingContent('task-1', 'Hello from task 1');
      store.setServerStatus('task-1', 'Processing task 1');

      // Update streaming content for task-2
      store.updateStreamingContent('task-2', 'Hello from task 2');
      store.setServerStatus('task-2', 'Processing task 2');

      // Verify isolation
      const execution1 = store.getExecution('task-1');
      const execution2 = store.getExecution('task-2');

      expect(execution1?.streamingContent).toBe('Hello from task 1');
      expect(execution1?.serverStatus).toBe('Processing task 1');
      expect(execution2?.streamingContent).toBe('Hello from task 2');
      expect(execution2?.serverStatus).toBe('Processing task 2');
    });

    it('should track tool messages separately per task', () => {
      const store = useTaskExecutionStore.getState();

      store.startExecution('task-1');
      store.startExecution('task-2');

      // Add tool messages to task-1
      store.addToolMessage('task-1', {
        id: 'tool-1',
        role: 'tool',
        content: 'Tool result for task 1',
        timestamp: new Date(),
      } as any);

      // Add tool messages to task-2
      store.addToolMessage('task-2', {
        id: 'tool-2',
        role: 'tool',
        content: 'Tool result for task 2',
        timestamp: new Date(),
      } as any);

      const execution1 = store.getExecution('task-1');
      const execution2 = store.getExecution('task-2');

      expect(execution1?.toolMessages).toHaveLength(1);
      expect(execution1?.toolMessages[0].id).toBe('tool-1');
      expect(execution2?.toolMessages).toHaveLength(1);
      expect(execution2?.toolMessages[0].id).toBe('tool-2');
    });
  });

  describe('stopExecution', () => {
    it('should stop a running execution', () => {
      const store = useTaskExecutionStore.getState();
      store.startExecution('task-1');

      store.stopExecution('task-1');

      const execution = store.getExecution('task-1');
      expect(execution?.status).toBe('stopped');
    });

    it('should abort the controller when stopping', () => {
      const store = useTaskExecutionStore.getState();
      store.startExecution('task-1');

      const execution = store.getExecution('task-1');
      const abortController = execution?.abortController;
      expect(abortController?.signal.aborted).toBe(false);

      store.stopExecution('task-1');

      expect(abortController?.signal.aborted).toBe(true);
    });
  });

  describe('completeExecution', () => {
    it('should mark execution as completed', () => {
      const store = useTaskExecutionStore.getState();
      store.startExecution('task-1');

      store.completeExecution('task-1');

      const execution = store.getExecution('task-1');
      expect(execution?.status).toBe('completed');
      expect(execution?.isStreaming).toBe(false);
    });
  });

  describe('setError', () => {
    it('should set error state for a task', () => {
      const store = useTaskExecutionStore.getState();
      store.startExecution('task-1');

      store.setError('task-1', 'Something went wrong');

      const execution = store.getExecution('task-1');
      expect(execution?.status).toBe('error');
      expect(execution?.error).toBe('Something went wrong');
      expect(execution?.isStreaming).toBe(false);
    });
  });

  describe('getRunningTaskIds', () => {
    it('should return only running task IDs', () => {
      const store = useTaskExecutionStore.getState();

      store.startExecution('task-1');
      store.startExecution('task-2');
      store.startExecution('task-3');

      store.completeExecution('task-2');

      const runningIds = store.getRunningTaskIds();
      expect(runningIds).toContain('task-1');
      expect(runningIds).toContain('task-3');
      expect(runningIds).not.toContain('task-2');
    });
  });

  describe('isMaxReached', () => {
    it('should return true when at max capacity', () => {
      const store = useTaskExecutionStore.getState();

      expect(store.isMaxReached()).toBe(false);

      store.startExecution('task-1');
      store.startExecution('task-2');
      expect(store.isMaxReached()).toBe(false);

      store.startExecution('task-3');
      expect(store.isMaxReached()).toBe(true);
    });

    it('should return false after completing a task', () => {
      const store = useTaskExecutionStore.getState();

      store.startExecution('task-1');
      store.startExecution('task-2');
      store.startExecution('task-3');
      expect(store.isMaxReached()).toBe(true);

      store.completeExecution('task-2');
      expect(store.isMaxReached()).toBe(false);
    });
  });

  describe('parallel task scenario', () => {
    it('should handle switching between tasks while one is running', () => {
      const store = useTaskExecutionStore.getState();

      // Simulate: User starts task-1, then creates task-2 (new chat)
      store.startExecution('task-1');
      store.updateStreamingContent('task-1', 'Streaming content from task 1');
      store.setServerStatus('task-1', 'Running tool...');

      // User clicks "New" to create task-2
      // task-1 continues running in background
      expect(store.isTaskRunning('task-1')).toBe(true);

      // User can start task-2
      const result = store.startExecution('task-2');
      expect(result.success).toBe(true);

      // Both tasks are now running
      expect(store.getRunningCount()).toBe(2);
      expect(store.getRunningTaskIds()).toContain('task-1');
      expect(store.getRunningTaskIds()).toContain('task-2');

      // task-1's state is preserved
      const task1Execution = store.getExecution('task-1');
      expect(task1Execution?.streamingContent).toBe('Streaming content from task 1');
      expect(task1Execution?.serverStatus).toBe('Running tool...');

      // task-2 has fresh state
      const task2Execution = store.getExecution('task-2');
      expect(task2Execution?.streamingContent).toBe('');
      expect(task2Execution?.serverStatus).toBe('');
    });

    it('should preserve task state when user switches back', () => {
      const store = useTaskExecutionStore.getState();

      // Start task-1 and add some state
      store.startExecution('task-1');
      store.updateStreamingContent('task-1', 'Initial content');
      store.addToolMessage('task-1', {
        id: 'tool-msg-1',
        role: 'tool',
        content: 'Tool result',
        timestamp: new Date(),
      } as any);

      // Simulate switching to task-2
      store.startExecution('task-2');

      // task-1 continues updating in background
      store.updateStreamingContent('task-1', 'Updated content from background');
      store.addToolMessage('task-1', {
        id: 'tool-msg-2',
        role: 'tool',
        content: 'Another tool result',
        timestamp: new Date(),
      } as any);

      // When user switches back to task-1, state should be preserved
      const task1State = store.getExecution('task-1');
      expect(task1State?.streamingContent).toBe('Updated content from background');
      expect(task1State?.toolMessages).toHaveLength(2);
    });
  });
});
