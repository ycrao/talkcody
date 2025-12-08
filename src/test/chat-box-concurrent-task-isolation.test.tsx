/**
 * Integration test for chat-box concurrent task UI isolation
 *
 * This test verifies the critical bug fixes where:
 *
 * Bug 1: When a task is running and user clicks '+' to create a new task,
 * the chat box UI should be empty, NOT showing the previous task's messages.
 *
 * Root cause: isCurrentlyDisplayed() used closure-captured conversationId which
 * didn't update when props changed. Fixed by using displayedConversationIdRef.
 *
 * Bug 2: When switching to a new conversation, the status indicator (e.g., "步骤 2")
 * from the previous task should be cleared.
 *
 * Root cause: The effect that syncs running task state would early-return when
 * conversationId was undefined, without clearing the status states.
 */

import { act, renderHook } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessages } from '@/hooks/use-messages';
import { useMessagesStore } from '@/stores/messages-store';
import { useTaskExecutionStore } from '@/stores/task-execution-store';

// Reset the stores before each test
beforeEach(() => {
  useTaskExecutionStore.setState({
    executions: new Map(),
    maxConcurrentExecutions: 3,
  });
  useMessagesStore.setState({
    messagesByConversation: new Map(),
  });
});

describe('Bug 1: displayedConversationIdRef prevents background task UI pollution', () => {
  /**
   * This simulates the core logic of ChatBox that uses displayedConversationIdRef
   * to check if UI updates should be applied.
   */
  function useSimulatedChatBoxLogic(conversationId: string | undefined) {
    // Pass conversationId to useMessages for per-conversation message caching
    const { messages, addMessage, updateMessageById, clearMessages } = useMessages(conversationId);
    const [isLoading, setIsLoading] = useState(false);
    const [serverStatus, setServerStatus] = useState('');

    // This ref tracks the currently displayed conversationId (from props)
    // This is the FIX - using ref instead of closure-captured value
    const displayedConversationIdRef = useRef<string | undefined>(conversationId);

    // Sync conversationId prop to ref
    useEffect(() => {
      displayedConversationIdRef.current = conversationId;
    }, [conversationId]);

    // Clear state when switching to new conversation
    useEffect(() => {
      if (!conversationId) {
        clearMessages();
        setIsLoading(false);
        setServerStatus('');
      }
    }, [conversationId, clearMessages]);

    // Simulate isCurrentlyDisplayed check using ref (the fix)
    const isCurrentlyDisplayedFixed = (activeTaskId: string) => {
      return activeTaskId === displayedConversationIdRef.current;
    };

    // Simulate the OLD buggy behavior using closure-captured value
    const isCurrentlyDisplayedBuggy = (activeTaskId: string, capturedConversationId: string) => {
      return activeTaskId === capturedConversationId;
    };

    // Simulate handleToolMessage
    const handleToolMessage = (taskId: string, content: string) => {
      // Using the FIXED check with ref
      if (isCurrentlyDisplayedFixed(taskId)) {
        addMessage('tool', content, false);
        return true;
      }
      return false;
    };

    // Simulate streaming content update
    const updateStreamingContent = (taskId: string, content: string) => {
      if (isCurrentlyDisplayedFixed(taskId)) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
          updateMessageById(lastMsg.id, content, true);
          return true;
        }
      }
      return false;
    };

    return {
      messages,
      addMessage,
      isLoading,
      setIsLoading,
      serverStatus,
      setServerStatus,
      handleToolMessage,
      updateStreamingContent,
      isCurrentlyDisplayedFixed,
      isCurrentlyDisplayedBuggy,
      displayedConversationIdRef,
    };
  }

  it('should prevent background task from updating UI when user creates new conversation', () => {
    // Start with task-A active
    const taskAId = 'task-a-123';
    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedChatBoxLogic(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    // Task-A is running, add some messages
    act(() => {
      result.current.addMessage('user', 'Hello from task A', false);
      result.current.addMessage('assistant', '', true);
    });

    expect(result.current.messages.length).toBe(2);

    // Simulate user clicking '+' to create new conversation
    // conversationId becomes undefined
    rerender({ conversationId: undefined });

    // Messages should be cleared
    expect(result.current.messages.length).toBe(0);

    // The ref should now be undefined
    expect(result.current.displayedConversationIdRef.current).toBeUndefined();

    // Simulate task-A still running in background and trying to update UI
    // This should be BLOCKED because displayedConversationIdRef.current is undefined
    const toolMessageAdded = result.current.handleToolMessage(taskAId, 'Tool result from task A');
    expect(toolMessageAdded).toBe(false);
    expect(result.current.messages.length).toBe(0); // Still empty!

    // isCurrentlyDisplayedFixed should return false
    expect(result.current.isCurrentlyDisplayedFixed(taskAId)).toBe(false);
  });

  it('should demonstrate the bug with closure-captured value', () => {
    const taskAId = 'task-a-123';
    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedChatBoxLogic(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    // Capture the conversationId at this point (simulating closure)
    const capturedConversationId = taskAId;

    // Simulate user clicking '+' - conversationId becomes undefined
    rerender({ conversationId: undefined });

    // With the BUGGY approach (closure-captured value), the check would still pass
    // because capturedConversationId still equals taskAId
    expect(result.current.isCurrentlyDisplayedBuggy(taskAId, capturedConversationId)).toBe(true);

    // But with the FIXED approach (using ref), it correctly returns false
    expect(result.current.isCurrentlyDisplayedFixed(taskAId)).toBe(false);
  });

  it('should correctly update ref when switching between tasks', () => {
    const taskAId = 'task-a-123';
    const taskBId = 'task-b-456';

    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedChatBoxLogic(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    expect(result.current.displayedConversationIdRef.current).toBe(taskAId);
    expect(result.current.isCurrentlyDisplayedFixed(taskAId)).toBe(true);
    expect(result.current.isCurrentlyDisplayedFixed(taskBId)).toBe(false);

    // Switch to task B
    rerender({ conversationId: taskBId });

    expect(result.current.displayedConversationIdRef.current).toBe(taskBId);
    expect(result.current.isCurrentlyDisplayedFixed(taskAId)).toBe(false);
    expect(result.current.isCurrentlyDisplayedFixed(taskBId)).toBe(true);

    // Switch to new conversation (undefined)
    rerender({ conversationId: undefined });

    expect(result.current.displayedConversationIdRef.current).toBeUndefined();
    expect(result.current.isCurrentlyDisplayedFixed(taskAId)).toBe(false);
    expect(result.current.isCurrentlyDisplayedFixed(taskBId)).toBe(false);
  });

  it('should block streaming updates from background tasks', () => {
    const taskAId = 'task-a-123';
    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedChatBoxLogic(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    // Task-A is running with a streaming message
    act(() => {
      result.current.addMessage('user', 'Hello', false);
      result.current.addMessage('assistant', 'Initial content', true);
    });

    expect(result.current.messages[1].content).toBe('Initial content');
    expect(result.current.messages[1].isStreaming).toBe(true);

    // User creates new conversation
    rerender({ conversationId: undefined });

    // Messages cleared
    expect(result.current.messages.length).toBe(0);

    // Background task-A tries to update streaming content
    // This should be blocked!
    const updated = result.current.updateStreamingContent(taskAId, 'Updated content from background');
    expect(updated).toBe(false);
    expect(result.current.messages.length).toBe(0); // Still empty
  });

  it('should allow updates when switching back to a running task', () => {
    const taskAId = 'task-a-123';
    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedChatBoxLogic(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    // Task-A running with messages
    act(() => {
      result.current.addMessage('user', 'Hello', false);
      result.current.addMessage('assistant', 'Response', true);
    });
    expect(result.current.messages.length).toBe(2);

    // Switch to new conversation
    rerender({ conversationId: undefined });
    expect(result.current.messages.length).toBe(0); // undefined has no messages

    // Switch back to task A
    rerender({ conversationId: taskAId });

    // Messages are preserved in the store! (This is the NEW correct behavior)
    // Previously messages would be lost, but now they're cached per conversationId
    expect(result.current.messages.length).toBe(2);

    // Now updates from task-A should be allowed
    expect(result.current.isCurrentlyDisplayedFixed(taskAId)).toBe(true);

    act(() => {
      result.current.addMessage('assistant', 'Continued response', true);
    });
    // 2 previous messages + 1 new = 3 total
    expect(result.current.messages.length).toBe(3);
  });
});

describe('Bug 2: serverStatus and loading state reset when creating new conversation', () => {
  /**
   * This simulates the state management logic for loading indicators
   */
  function useSimulatedLoadingState(conversationId: string | undefined) {
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<'ready' | 'streaming'>('ready');
    const [serverStatus, setServerStatus] = useState('');

    // Subscribe to execution state
    const currentExecution = useTaskExecutionStore((state) =>
      conversationId ? state.getExecution(conversationId) : undefined
    );

    // The FIXED effect that clears state when conversationId is undefined
    useEffect(() => {
      // When switching to a new (empty) conversation, reset all loading states
      if (!conversationId) {
        setIsLoading(false);
        setStatus('ready');
        setServerStatus('');
        return;
      }

      if (!currentExecution) return;

      if (currentExecution.status === 'running') {
        setIsLoading(true);
        setStatus('streaming');
        setServerStatus(currentExecution.serverStatus);
      } else {
        setIsLoading(false);
        setStatus('ready');
        setServerStatus('');
      }
    }, [conversationId, currentExecution?.status, currentExecution?.serverStatus]);

    return {
      isLoading,
      status,
      serverStatus,
      setIsLoading,
      setStatus,
      setServerStatus,
    };
  }

  /**
   * This simulates the BUGGY behavior that doesn't clear state
   */
  function useSimulatedLoadingStateBuggy(conversationId: string | undefined) {
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<'ready' | 'streaming'>('ready');
    const [serverStatus, setServerStatus] = useState('');

    const currentExecution = useTaskExecutionStore((state) =>
      conversationId ? state.getExecution(conversationId) : undefined
    );

    // The BUGGY effect that doesn't clear state when conversationId is undefined
    useEffect(() => {
      // BUG: Early return without clearing state!
      if (!conversationId || !currentExecution) return;

      if (currentExecution.status === 'running') {
        setIsLoading(true);
        setStatus('streaming');
        setServerStatus(currentExecution.serverStatus);
      } else {
        setIsLoading(false);
        setStatus('ready');
        setServerStatus('');
      }
    }, [conversationId, currentExecution?.status, currentExecution?.serverStatus]);

    return {
      isLoading,
      status,
      serverStatus,
      setIsLoading,
      setStatus,
      setServerStatus,
    };
  }

  it('should clear serverStatus when creating new conversation (fixed behavior)', () => {
    const taskAId = 'task-a-123';

    // Start task A execution
    act(() => {
      useTaskExecutionStore.getState().startExecution(taskAId);
      useTaskExecutionStore.getState().setServerStatus(taskAId, '步骤 2');
    });

    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedLoadingState(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    // Verify initial state shows task A's status
    expect(result.current.isLoading).toBe(true);
    expect(result.current.status).toBe('streaming');
    expect(result.current.serverStatus).toBe('步骤 2');

    // User creates new conversation
    rerender({ conversationId: undefined });

    // With the FIX, all states should be cleared
    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toBe('ready');
    expect(result.current.serverStatus).toBe('');
  });

  it('should demonstrate the bug where serverStatus persists (buggy behavior)', () => {
    const taskAId = 'task-a-123';

    // Start task A execution with status
    act(() => {
      useTaskExecutionStore.getState().startExecution(taskAId);
      useTaskExecutionStore.getState().setServerStatus(taskAId, '步骤 2');
    });

    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedLoadingStateBuggy(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    // Set initial state manually (simulating previous state)
    act(() => {
      result.current.setIsLoading(true);
      result.current.setStatus('streaming');
      result.current.setServerStatus('步骤 2');
    });

    expect(result.current.serverStatus).toBe('步骤 2');

    // User creates new conversation
    rerender({ conversationId: undefined });

    // With the BUG, serverStatus would NOT be cleared!
    // The effect early-returns without clearing state
    expect(result.current.serverStatus).toBe('步骤 2'); // BUG: Still shows old status!
  });

  it('should handle rapid conversation switching correctly', () => {
    const taskAId = 'task-a-123';
    const taskBId = 'task-b-456';

    // Start both tasks
    act(() => {
      useTaskExecutionStore.getState().startExecution(taskAId);
      useTaskExecutionStore.getState().setServerStatus(taskAId, 'Task A - Step 1');
      useTaskExecutionStore.getState().startExecution(taskBId);
      useTaskExecutionStore.getState().setServerStatus(taskBId, 'Task B - Step 3');
    });

    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedLoadingState(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    expect(result.current.serverStatus).toBe('Task A - Step 1');

    // Switch to task B
    rerender({ conversationId: taskBId });
    expect(result.current.serverStatus).toBe('Task B - Step 3');

    // Switch to new conversation
    rerender({ conversationId: undefined });
    expect(result.current.serverStatus).toBe('');
    expect(result.current.isLoading).toBe(false);

    // Switch back to task A
    rerender({ conversationId: taskAId });
    expect(result.current.serverStatus).toBe('Task A - Step 1');
  });

  it('should clear loading state even when task is still running in background', () => {
    const taskAId = 'task-a-123';

    // Start task A (still running)
    act(() => {
      useTaskExecutionStore.getState().startExecution(taskAId);
      useTaskExecutionStore.getState().setServerStatus(taskAId, 'Processing...');
    });

    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedLoadingState(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.serverStatus).toBe('Processing...');

    // Create new conversation while task A is still running
    rerender({ conversationId: undefined });

    // New conversation should show clean state
    expect(result.current.isLoading).toBe(false);
    expect(result.current.serverStatus).toBe('');

    // Task A should still be running in the store
    expect(useTaskExecutionStore.getState().isTaskRunning(taskAId)).toBe(true);
  });
});

describe('Bug 4: Retry button should work after switching from running task to historical conversation', () => {
  /**
   * This test verifies the fix for the bug where Retry button doesn't work
   * after switching from a running task to a historical conversation.
   *
   * Root cause: The effect that syncs running task state had:
   *   if (!currentExecution) return;
   *
   * This caused isLoading to stay true after switching to a conversation
   * that has no execution in the store.
   *
   * Fix: When !currentExecution, reset loading state instead of just returning.
   */

  /**
   * Simulates the loading state sync logic in ChatBox
   */
  function useSimulatedLoadingStateSync(conversationId: string | undefined) {
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<'ready' | 'streaming'>('ready');
    const [serverStatus, setServerStatus] = useState('');

    const currentExecution = useTaskExecutionStore((state) =>
      conversationId ? state.getExecution(conversationId) : undefined
    );

    // Simulate the FIXED effect
    useEffect(() => {
      if (!conversationId) {
        setIsLoading(false);
        setStatus('ready');
        setServerStatus('');
        return;
      }

      // FIXED: Reset loading state when no execution exists for this conversation
      if (!currentExecution) {
        setIsLoading(false);
        setStatus('ready');
        setServerStatus('');
        return;
      }

      if (currentExecution.status !== 'running') {
        setIsLoading(false);
        setStatus('ready');
        setServerStatus('');
        return;
      }

      setIsLoading(true);
      setStatus('streaming');
      setServerStatus(currentExecution.serverStatus);
    }, [conversationId, currentExecution?.status, currentExecution?.serverStatus]);

    // Simulate handleRegenerate's guard
    const canRegenerate = () => !isLoading;

    return {
      isLoading,
      status,
      serverStatus,
      canRegenerate,
      setIsLoading,
    };
  }

  /**
   * Simulates the BUGGY loading state sync logic
   */
  function useSimulatedLoadingStateSyncBuggy(conversationId: string | undefined) {
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<'ready' | 'streaming'>('ready');
    const [serverStatus, setServerStatus] = useState('');

    const currentExecution = useTaskExecutionStore((state) =>
      conversationId ? state.getExecution(conversationId) : undefined
    );

    // Simulate the BUGGY effect
    useEffect(() => {
      if (!conversationId) {
        setIsLoading(false);
        setStatus('ready');
        setServerStatus('');
        return;
      }

      // BUGGY: Just returns without resetting loading state!
      if (!currentExecution) return;

      if (currentExecution.status !== 'running') {
        setIsLoading(false);
        setStatus('ready');
        setServerStatus('');
        return;
      }

      setIsLoading(true);
      setStatus('streaming');
      setServerStatus(currentExecution.serverStatus);
    }, [conversationId, currentExecution?.status, currentExecution?.serverStatus]);

    const canRegenerate = () => !isLoading;

    return {
      isLoading,
      status,
      serverStatus,
      canRegenerate,
      setIsLoading,
    };
  }

  it('should allow Retry after switching from running task to historical conversation (fixed behavior)', () => {
    const taskAId = 'task-a-running';
    const taskBId = 'task-b-history';

    // Start task A
    act(() => {
      useTaskExecutionStore.getState().startExecution(taskAId);
      useTaskExecutionStore.getState().setServerStatus(taskAId, 'Processing...');
    });

    // Start viewing task A (running)
    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedLoadingStateSync(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    // Task A is running, isLoading should be true
    expect(result.current.isLoading).toBe(true);
    expect(result.current.canRegenerate()).toBe(false);

    // Switch to task B (historical, no execution in store)
    rerender({ conversationId: taskBId });

    // With the FIX, isLoading should be reset to false
    expect(result.current.isLoading).toBe(false);
    expect(result.current.canRegenerate()).toBe(true); // Retry should work!
  });

  it('should demonstrate the bug where Retry is blocked (buggy behavior)', () => {
    const taskAId = 'task-a-running';
    const taskBId = 'task-b-history';

    // Start task A
    act(() => {
      useTaskExecutionStore.getState().startExecution(taskAId);
    });

    // Start viewing task A with buggy hook
    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedLoadingStateSyncBuggy(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    // Task A is running
    expect(result.current.isLoading).toBe(true);

    // Switch to task B (historical)
    rerender({ conversationId: taskBId });

    // With the BUG, isLoading stays true because the effect just returns without resetting
    expect(result.current.isLoading).toBe(true); // BUG!
    expect(result.current.canRegenerate()).toBe(false); // BUG: Retry is blocked!
  });

  it('should correctly sync loading state when switching between multiple conversations', () => {
    const taskAId = 'task-a-running';
    const taskBId = 'task-b-completed';
    const taskCId = 'task-c-no-execution';

    // Start task A (running)
    act(() => {
      useTaskExecutionStore.getState().startExecution(taskAId);
    });

    // Start task B and complete it
    act(() => {
      useTaskExecutionStore.getState().startExecution(taskBId);
      useTaskExecutionStore.getState().completeExecution(taskBId);
    });

    // Task C has never been executed (no entry in store)

    const { result, rerender } = renderHook(
      ({ conversationId }) => useSimulatedLoadingStateSync(conversationId),
      { initialProps: { conversationId: taskAId as string | undefined } }
    );

    // Task A is running
    expect(result.current.isLoading).toBe(true);
    expect(result.current.canRegenerate()).toBe(false);

    // Switch to task B (completed)
    rerender({ conversationId: taskBId });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.canRegenerate()).toBe(true);

    // Switch to task C (no execution)
    rerender({ conversationId: taskCId });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.canRegenerate()).toBe(true);

    // Switch back to task A (still running)
    rerender({ conversationId: taskAId });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.canRegenerate()).toBe(false);
  });
});

describe('Bug 3: Conversation switching should work even when a task is running', () => {
  /**
   * This test verifies the fix for the bug where conversation switching was blocked
   * when isLoading was true (another task was running).
   *
   * Root cause: The handleConversationLoad effect had condition:
   *   if (conversationId && conversationId !== currentConversationId && !isLoading)
   *
   * The !isLoading condition blocked conversation switching when any task was running.
   * Fix: Remove the !isLoading condition to allow switching while tasks run in background.
   */

  /**
   * Simulates the conversation loading logic in ChatBox
   */
  function useSimulatedConversationLoad(
    conversationId: string | undefined,
    currentConversationId: string | undefined,
    isLoading: boolean
  ) {
    const [loadedConversationId, setLoadedConversationId] = useState<string | undefined>(undefined);
    const [loadConversationCalled, setLoadConversationCalled] = useState(false);

    // Simulate the FIXED handleConversationLoad effect (without !isLoading check)
    useEffect(() => {
      const handleConversationLoad = async () => {
        // FIXED: Removed !isLoading condition to allow switching while tasks run
        if (conversationId && conversationId !== currentConversationId) {
          // Simulate loadConversation call
          setLoadConversationCalled(true);
          setLoadedConversationId(conversationId);
        }
      };

      handleConversationLoad();
    }, [conversationId, currentConversationId]); // Note: isLoading removed from deps

    return {
      loadedConversationId,
      loadConversationCalled,
      resetLoadState: () => {
        setLoadConversationCalled(false);
        setLoadedConversationId(undefined);
      },
    };
  }

  /**
   * Simulates the BUGGY conversation loading logic (with !isLoading check)
   */
  function useSimulatedConversationLoadBuggy(
    conversationId: string | undefined,
    currentConversationId: string | undefined,
    isLoading: boolean
  ) {
    const [loadedConversationId, setLoadedConversationId] = useState<string | undefined>(undefined);
    const [loadConversationCalled, setLoadConversationCalled] = useState(false);

    // Simulate the BUGGY handleConversationLoad effect (with !isLoading check)
    useEffect(() => {
      const handleConversationLoad = async () => {
        // BUGGY: !isLoading blocks switching when any task is running
        if (conversationId && conversationId !== currentConversationId && !isLoading) {
          setLoadConversationCalled(true);
          setLoadedConversationId(conversationId);
        }
      };

      handleConversationLoad();
    }, [conversationId, currentConversationId, isLoading]);

    return {
      loadedConversationId,
      loadConversationCalled,
      resetLoadState: () => {
        setLoadConversationCalled(false);
        setLoadedConversationId(undefined);
      },
    };
  }

  it('should allow switching to another conversation while a task is running (fixed behavior)', () => {
    const taskAId = 'task-a-running';
    const taskBId = 'task-b-history';

    // Task A is currently displayed and running (isLoading = true)
    const { result, rerender } = renderHook(
      ({ conversationId, currentConversationId, isLoading }) =>
        useSimulatedConversationLoad(conversationId, currentConversationId, isLoading),
      {
        initialProps: {
          conversationId: taskAId,
          currentConversationId: taskAId,
          isLoading: true, // Task A is running
        },
      }
    );

    // Initial state - no load needed since conversationId === currentConversationId
    expect(result.current.loadConversationCalled).toBe(false);

    // User clicks on task B in chat history while task A is still running
    rerender({
      conversationId: taskBId, // User wants to view task B
      currentConversationId: taskAId, // Still shows task A's messages
      isLoading: true, // Task A is still running
    });

    // With the FIX, loadConversation should be called even though isLoading is true
    expect(result.current.loadConversationCalled).toBe(true);
    expect(result.current.loadedConversationId).toBe(taskBId);
  });

  it('should demonstrate the bug where conversation switching is blocked (buggy behavior)', () => {
    const taskAId = 'task-a-running';
    const taskBId = 'task-b-history';

    // Task A is currently displayed and running (isLoading = true)
    const { result, rerender } = renderHook(
      ({ conversationId, currentConversationId, isLoading }) =>
        useSimulatedConversationLoadBuggy(conversationId, currentConversationId, isLoading),
      {
        initialProps: {
          conversationId: taskAId,
          currentConversationId: taskAId,
          isLoading: true,
        },
      }
    );

    expect(result.current.loadConversationCalled).toBe(false);

    // User clicks on task B in chat history while task A is still running
    rerender({
      conversationId: taskBId,
      currentConversationId: taskAId,
      isLoading: true, // Task A is still running
    });

    // With the BUG, loadConversation is NOT called because !isLoading is false
    expect(result.current.loadConversationCalled).toBe(false); // BUG!
    expect(result.current.loadedConversationId).toBeUndefined(); // BUG!
  });

  it('should work correctly when no task is running', () => {
    const taskAId = 'task-a';
    const taskBId = 'task-b';

    const { result, rerender } = renderHook(
      ({ conversationId, currentConversationId, isLoading }) =>
        useSimulatedConversationLoad(conversationId, currentConversationId, isLoading),
      {
        initialProps: {
          conversationId: taskAId,
          currentConversationId: taskAId,
          isLoading: false, // No task running
        },
      }
    );

    // Switch to task B
    rerender({
      conversationId: taskBId,
      currentConversationId: taskAId,
      isLoading: false,
    });

    expect(result.current.loadConversationCalled).toBe(true);
    expect(result.current.loadedConversationId).toBe(taskBId);
  });

  it('should allow switching back to a running task', () => {
    const taskAId = 'task-a-running';
    const taskBId = 'task-b-history';

    // Start on task A (running)
    const { result, rerender } = renderHook(
      ({ conversationId, currentConversationId, isLoading }) =>
        useSimulatedConversationLoad(conversationId, currentConversationId, isLoading),
      {
        initialProps: {
          conversationId: taskAId,
          currentConversationId: taskAId,
          isLoading: true,
        },
      }
    );

    // Switch to task B (historical, not running)
    rerender({
      conversationId: taskBId,
      currentConversationId: taskAId,
      isLoading: true,
    });

    expect(result.current.loadedConversationId).toBe(taskBId);

    // Reset and switch back to task A
    act(() => {
      result.current.resetLoadState();
    });

    rerender({
      conversationId: taskAId,
      currentConversationId: taskBId,
      isLoading: true,
    });

    expect(result.current.loadedConversationId).toBe(taskAId);
  });

  it('should handle rapid switching between multiple conversations while tasks run', () => {
    const taskAId = 'task-a';
    const taskBId = 'task-b';
    const taskCId = 'task-c';

    const { result, rerender } = renderHook(
      ({ conversationId, currentConversationId, isLoading }) =>
        useSimulatedConversationLoad(conversationId, currentConversationId, isLoading),
      {
        initialProps: {
          conversationId: taskAId,
          currentConversationId: taskAId,
          isLoading: true,
        },
      }
    );

    // Switch A -> B
    rerender({
      conversationId: taskBId,
      currentConversationId: taskAId,
      isLoading: true,
    });
    expect(result.current.loadedConversationId).toBe(taskBId);

    // Switch B -> C
    act(() => result.current.resetLoadState());
    rerender({
      conversationId: taskCId,
      currentConversationId: taskBId,
      isLoading: true,
    });
    expect(result.current.loadedConversationId).toBe(taskCId);

    // Switch C -> A
    act(() => result.current.resetLoadState());
    rerender({
      conversationId: taskAId,
      currentConversationId: taskCId,
      isLoading: true,
    });
    expect(result.current.loadedConversationId).toBe(taskAId);
  });

  it('should not reload when conversationId equals currentConversationId', () => {
    const taskAId = 'task-a';

    const { result, rerender } = renderHook(
      ({ conversationId, currentConversationId, isLoading }) =>
        useSimulatedConversationLoad(conversationId, currentConversationId, isLoading),
      {
        initialProps: {
          conversationId: taskAId,
          currentConversationId: undefined as string | undefined,
          isLoading: false,
        },
      }
    );

    // Initial load
    expect(result.current.loadedConversationId).toBe(taskAId);

    // Reset and simulate currentConversationId catching up
    act(() => result.current.resetLoadState());
    rerender({
      conversationId: taskAId,
      currentConversationId: taskAId, // Now matches
      isLoading: true,
    });

    // Should not reload since they match
    expect(result.current.loadConversationCalled).toBe(false);
  });
});

describe('Integration: TaskExecutionStore with concurrent tasks', () => {
  it('should track multiple running tasks independently', () => {
    const store = useTaskExecutionStore.getState();

    // Start multiple tasks
    const result1 = store.startExecution('task-1');
    const result2 = store.startExecution('task-2');
    const result3 = store.startExecution('task-3');

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result3.success).toBe(true);

    // All should be running
    expect(store.getRunningCount()).toBe(3);
    expect(store.isTaskRunning('task-1')).toBe(true);
    expect(store.isTaskRunning('task-2')).toBe(true);
    expect(store.isTaskRunning('task-3')).toBe(true);

    // Fourth task should fail (max 3 concurrent)
    const result4 = store.startExecution('task-4');
    expect(result4.success).toBe(false);
    expect(result4.error).toContain('Maximum');
  });

  it('should allow independent serverStatus for each task', () => {
    const store = useTaskExecutionStore.getState();

    store.startExecution('task-1');
    store.startExecution('task-2');

    store.setServerStatus('task-1', '步骤 1');
    store.setServerStatus('task-2', 'Step 3 of 5');

    expect(store.getExecution('task-1')?.serverStatus).toBe('步骤 1');
    expect(store.getExecution('task-2')?.serverStatus).toBe('Step 3 of 5');

    // Updating one shouldn't affect the other
    store.setServerStatus('task-1', '步骤 2');
    expect(store.getExecution('task-1')?.serverStatus).toBe('步骤 2');
    expect(store.getExecution('task-2')?.serverStatus).toBe('Step 3 of 5');
  });

  it('should return undefined for non-existent task', () => {
    const store = useTaskExecutionStore.getState();
    expect(store.getExecution('non-existent')).toBeUndefined();
  });

  it('should correctly identify running vs completed tasks', () => {
    const store = useTaskExecutionStore.getState();

    store.startExecution('task-1');
    store.startExecution('task-2');

    expect(store.isTaskRunning('task-1')).toBe(true);
    expect(store.isTaskRunning('task-2')).toBe(true);

    store.completeExecution('task-1');

    expect(store.isTaskRunning('task-1')).toBe(false);
    expect(store.isTaskRunning('task-2')).toBe(true);
    expect(store.getRunningCount()).toBe(1);
  });
});
