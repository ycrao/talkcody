import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentExecutionStore } from './agent-execution-store';

describe('useAgentExecutionStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAgentExecutionStore.setState({
      isAgentRunning: false,
      runningConversationId: null,
    });
  });

  describe('initial state', () => {
    it('should start with default state', () => {
      const state = useAgentExecutionStore.getState();
      expect(state.isAgentRunning).toBe(false);
      expect(state.runningConversationId).toBeNull();
    });
  });

  describe('startExecution', () => {
    it('should start execution with conversation ID', () => {
      const { startExecution } = useAgentExecutionStore.getState();
      startExecution('conv-123');

      const state = useAgentExecutionStore.getState();
      expect(state.isAgentRunning).toBe(true);
      expect(state.runningConversationId).toBe('conv-123');
    });

    it('should start execution without conversation ID', () => {
      const { startExecution } = useAgentExecutionStore.getState();
      startExecution();

      const state = useAgentExecutionStore.getState();
      expect(state.isAgentRunning).toBe(true);
      expect(state.runningConversationId).toBeNull();
    });

    it('should handle undefined conversation ID', () => {
      const { startExecution } = useAgentExecutionStore.getState();
      startExecution(undefined);

      const state = useAgentExecutionStore.getState();
      expect(state.isAgentRunning).toBe(true);
      expect(state.runningConversationId).toBeNull();
    });
  });

  describe('stopExecution', () => {
    it('should stop execution and clear conversation ID', () => {
      const { startExecution, stopExecution } = useAgentExecutionStore.getState();
      startExecution('conv-123');
      stopExecution();

      const state = useAgentExecutionStore.getState();
      expect(state.isAgentRunning).toBe(false);
      expect(state.runningConversationId).toBeNull();
    });

    it('should be safe to call when not running', () => {
      const { stopExecution } = useAgentExecutionStore.getState();
      stopExecution();

      const state = useAgentExecutionStore.getState();
      expect(state.isAgentRunning).toBe(false);
      expect(state.runningConversationId).toBeNull();
    });
  });

  describe('state transitions', () => {
    it('should handle start -> stop -> start cycle', () => {
      const { startExecution, stopExecution } = useAgentExecutionStore.getState();

      startExecution('conv-1');
      expect(useAgentExecutionStore.getState().isAgentRunning).toBe(true);

      stopExecution();
      expect(useAgentExecutionStore.getState().isAgentRunning).toBe(false);

      startExecution('conv-2');
      const state = useAgentExecutionStore.getState();
      expect(state.isAgentRunning).toBe(true);
      expect(state.runningConversationId).toBe('conv-2');
    });

    it('should allow starting a new execution while one is running', () => {
      const { startExecution } = useAgentExecutionStore.getState();

      startExecution('conv-1');
      expect(useAgentExecutionStore.getState().runningConversationId).toBe('conv-1');

      startExecution('conv-2');
      const state = useAgentExecutionStore.getState();
      expect(state.isAgentRunning).toBe(true);
      expect(state.runningConversationId).toBe('conv-2');
    });
  });
});
