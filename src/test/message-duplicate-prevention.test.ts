/**
 * Tests for preventing duplicate assistant message display during streaming.
 *
 * Bug scenario:
 * When `onAssistantMessageStart` is async and contains `await`, the following race condition occurs:
 * 1. `onAssistantMessageStart()` called from `processTextDelta`
 * 2. Async function yields at `await finalizeMessageAndPersist(...)`
 * 3. Control returns to `processTextDelta`, which calls `onChunk(text)`
 * 4. `onChunk` uses OLD `currentMessageId` to update streaming content
 * 5. New iteration's content gets added to the OLD message!
 *
 * Fix: Reset state (currentMessageId, streamedContent) BEFORE any async operation,
 * so that any `onChunk` calls during the `await` will use the NEW message ID.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessagesStore } from '@/stores/messages-store';

// Mock database service
vi.mock('@/services/database-service', () => ({
  databaseService: {
    saveMessage: vi.fn().mockResolvedValue(undefined),
    updateMessage: vi.fn().mockResolvedValue(undefined),
  },
}));

// Test conversation ID
const TEST_CONVERSATION_ID = 'test-duplicate-prevention';

describe('Message duplicate prevention', () => {
  beforeEach(() => {
    // Reset messages store before each test
    useMessagesStore.getState().messagesByConversation.clear();
    vi.clearAllMocks();
  });

  describe('Race condition between onAssistantMessageStart and onChunk', () => {
    it('should route chunks to new message even when finalization is pending', async () => {
      const messagesStore = useMessagesStore.getState();
      let currentMessageId = '';
      let streamedContent = '';

      // Track all message content updates
      const messageUpdates: Array<{ messageId: string; content: string }> = [];

      // Simulate the FIXED onAssistantMessageStart callback
      const onAssistantMessageStart = async () => {
        // Save old state BEFORE resetting (the fix!)
        const oldMessageId = currentMessageId;
        const oldContent = streamedContent;

        // Reset for new message FIRST (synchronous)
        streamedContent = '';
        currentMessageId = messagesStore.createAssistantMessageAndPersist(
          TEST_CONVERSATION_ID,
          'test-agent'
        );

        // NOW finalize old message (async, but currentMessageId already updated)
        if (oldMessageId && oldContent) {
          // Simulate async delay
          await new Promise((resolve) => setTimeout(resolve, 10));
          messagesStore.finalizeMessageAndPersist(TEST_CONVERSATION_ID, oldMessageId, oldContent);
        }
      };

      // Simulate onChunk callback
      const onChunk = (chunk: string) => {
        streamedContent += chunk;
        messageUpdates.push({ messageId: currentMessageId, content: streamedContent });
        messagesStore.updateStreamingContent(TEST_CONVERSATION_ID, currentMessageId, streamedContent);
      };

      // === Iteration 1 ===
      await onAssistantMessageStart();
      const firstMessageId = currentMessageId;

      onChunk('Hello ');
      onChunk('World');

      // Verify first message has correct content
      expect(streamedContent).toBe('Hello World');
      expect(messageUpdates.every((u) => u.messageId === firstMessageId)).toBe(true);

      // === Iteration 2 (with race condition scenario) ===
      // This simulates a tool call completing and new iteration starting

      // Start the async operation - it will save old state before yielding
      const asyncOperation = onAssistantMessageStart();

      // CRITICAL: These chunks should go to the NEW message, not the old one!
      // With the fix, currentMessageId is already updated before the await
      const secondMessageId = currentMessageId;
      expect(secondMessageId).not.toBe(firstMessageId);

      onChunk('New ');
      onChunk('Content');

      // Wait for async finalization to complete
      await asyncOperation;

      // Verify chunks went to the correct (NEW) message
      const messages = messagesStore.getMessages(TEST_CONVERSATION_ID);
      expect(messages).toHaveLength(2);

      // First message should be finalized with "Hello World"
      const firstMsg = messages.find((m) => m.id === firstMessageId);
      expect(firstMsg?.content).toBe('Hello World');
      expect(firstMsg?.isStreaming).toBe(false);

      // Second message should have "New Content"
      const secondMsg = messages.find((m) => m.id === secondMessageId);
      expect(secondMsg?.content).toBe('New Content');
    });

    it('should NOT route chunks to old message (demonstrating the bug scenario)', async () => {
      const messagesStore = useMessagesStore.getState();
      let currentMessageId = '';
      let streamedContent = '';

      // Track which messages received content
      const contentByMessage = new Map<string, string>();

      // Simulate BUGGY onAssistantMessageStart (await BEFORE resetting state)
      const buggyOnAssistantMessageStart = async () => {
        // BUG: Finalize BEFORE resetting state
        if (currentMessageId && streamedContent) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          messagesStore.finalizeMessageAndPersist(
            TEST_CONVERSATION_ID,
            currentMessageId,
            streamedContent
          );
        }

        // BUG: State reset happens AFTER await - too late!
        streamedContent = '';
        currentMessageId = messagesStore.createAssistantMessageAndPersist(
          TEST_CONVERSATION_ID,
          'test-agent'
        );
      };

      const onChunk = (chunk: string) => {
        streamedContent += chunk;
        // Track which message received this content
        const current = contentByMessage.get(currentMessageId) || '';
        contentByMessage.set(currentMessageId, current + chunk);
      };

      // === Iteration 1 ===
      await buggyOnAssistantMessageStart();
      const firstMessageId = currentMessageId;

      onChunk('Hello ');
      onChunk('World');

      // === Iteration 2 with BUG ===
      const asyncOperation = buggyOnAssistantMessageStart();

      // BUG DEMONSTRATION: currentMessageId is still the OLD id!
      expect(currentMessageId).toBe(firstMessageId); // This is the bug!

      // These chunks go to the WRONG message
      onChunk('New ');
      onChunk('Content');

      // Wait for async to complete
      await asyncOperation;

      // The first message incorrectly received extra content
      expect(contentByMessage.get(firstMessageId)).toContain('New Content');
    });
  });

  describe('Store-based guard for duplicate detection', () => {
    it('should skip message creation when streaming message already exists', async () => {
      const messagesStore = useMessagesStore.getState();
      let currentMessageId = '';
      let streamedContent = '';
      let skipCount = 0;

      const onAssistantMessageStart = async () => {
        // Primary guard
        if (currentMessageId && !streamedContent) {
          skipCount++;
          return;
        }

        // Secondary guard: Check store
        const existingMessages = messagesStore.getMessages(TEST_CONVERSATION_ID);
        const hasStreamingMessage = existingMessages.some(
          (msg) => msg.role === 'assistant' && msg.isStreaming
        );
        if (hasStreamingMessage && !streamedContent) {
          skipCount++;
          return;
        }

        const oldMessageId = currentMessageId;
        const oldContent = streamedContent;

        streamedContent = '';
        currentMessageId = messagesStore.createAssistantMessageAndPersist(
          TEST_CONVERSATION_ID,
          'test-agent'
        );

        if (oldMessageId && oldContent) {
          await messagesStore.finalizeMessageAndPersist(
            TEST_CONVERSATION_ID,
            oldMessageId,
            oldContent
          );
        }
      };

      // First call creates message
      await onAssistantMessageStart();
      expect(messagesStore.getMessages(TEST_CONVERSATION_ID)).toHaveLength(1);
      expect(skipCount).toBe(0);

      // Second call with no content should be skipped (primary guard)
      await onAssistantMessageStart();
      expect(messagesStore.getMessages(TEST_CONVERSATION_ID)).toHaveLength(1);
      expect(skipCount).toBe(1);

      // Third call should also be skipped (still no content)
      await onAssistantMessageStart();
      expect(messagesStore.getMessages(TEST_CONVERSATION_ID)).toHaveLength(1);
      expect(skipCount).toBe(2);
    });

    it('should use store-based guard when local variables are stale', async () => {
      const messagesStore = useMessagesStore.getState();
      let skipCount = 0;

      // Simulate stale local variables (empty but store has streaming message)
      let currentMessageId = '';
      let streamedContent = '';

      // Manually add a streaming message to the store
      messagesStore.addMessage(TEST_CONVERSATION_ID, 'assistant', '', {
        isStreaming: true,
        assistantId: 'test-agent',
      });

      const onAssistantMessageStart = async () => {
        // Primary guard won't catch this (currentMessageId is empty)
        if (currentMessageId && !streamedContent) {
          skipCount++;
          return;
        }

        // Secondary guard catches it via store check
        const existingMessages = messagesStore.getMessages(TEST_CONVERSATION_ID);
        const hasStreamingMessage = existingMessages.some(
          (msg) => msg.role === 'assistant' && msg.isStreaming
        );
        if (hasStreamingMessage && !streamedContent) {
          skipCount++;
          return;
        }

        currentMessageId = messagesStore.createAssistantMessageAndPersist(
          TEST_CONVERSATION_ID,
          'test-agent'
        );
      };

      // Should be caught by secondary guard
      await onAssistantMessageStart();
      expect(skipCount).toBe(1);
      // Should NOT create another message
      expect(messagesStore.getMessages(TEST_CONVERSATION_ID)).toHaveLength(1);
    });
  });

  describe('State reset after finalization', () => {
    it('should reset streamedContent in onComplete to prevent stale state', async () => {
      const messagesStore = useMessagesStore.getState();
      let currentMessageId = '';
      let streamedContent = '';

      const onAssistantMessageStart = async () => {
        const oldMessageId = currentMessageId;
        const oldContent = streamedContent;

        streamedContent = '';
        currentMessageId = messagesStore.createAssistantMessageAndPersist(
          TEST_CONVERSATION_ID,
          'test-agent'
        );

        if (oldMessageId && oldContent) {
          await messagesStore.finalizeMessageAndPersist(
            TEST_CONVERSATION_ID,
            oldMessageId,
            oldContent
          );
        }
      };

      const onComplete = async () => {
        if (currentMessageId && streamedContent) {
          await messagesStore.finalizeMessageAndPersist(
            TEST_CONVERSATION_ID,
            currentMessageId,
            streamedContent
          );
          // IMPORTANT: Reset after finalization
          streamedContent = '';
        }
      };

      const onChunk = (chunk: string) => {
        streamedContent += chunk;
        messagesStore.updateStreamingContent(TEST_CONVERSATION_ID, currentMessageId, streamedContent);
      };

      // Create and complete a message
      await onAssistantMessageStart();
      onChunk('Test content');
      await onComplete();

      // streamedContent should be empty after onComplete
      expect(streamedContent).toBe('');

      // Message should be finalized in store
      const messages = messagesStore.getMessages(TEST_CONVERSATION_ID);
      expect(messages[0].isStreaming).toBe(false);
      expect(messages[0].content).toBe('Test content');
    });
  });

  describe('Fast response scenarios', () => {
    it('should handle very fast responses without duplicates', async () => {
      const messagesStore = useMessagesStore.getState();
      let currentMessageId = '';
      let streamedContent = '';

      const onAssistantMessageStart = async () => {
        if (currentMessageId && !streamedContent) {
          return; // Skip duplicate
        }

        const existingMessages = messagesStore.getMessages(TEST_CONVERSATION_ID);
        const hasStreamingMessage = existingMessages.some(
          (msg) => msg.role === 'assistant' && msg.isStreaming
        );
        if (hasStreamingMessage && !streamedContent) {
          return; // Skip duplicate
        }

        const oldMessageId = currentMessageId;
        const oldContent = streamedContent;

        streamedContent = '';
        currentMessageId = messagesStore.createAssistantMessageAndPersist(
          TEST_CONVERSATION_ID,
          'test-agent'
        );

        if (oldMessageId && oldContent) {
          await messagesStore.finalizeMessageAndPersist(
            TEST_CONVERSATION_ID,
            oldMessageId,
            oldContent
          );
        }
      };

      const onChunk = (chunk: string) => {
        streamedContent += chunk;
        messagesStore.updateStreamingContent(TEST_CONVERSATION_ID, currentMessageId, streamedContent);
      };

      // Simulate very fast response - all chunks arrive almost simultaneously
      await onAssistantMessageStart();
      const messageId = currentMessageId;

      // Rapid fire chunks
      onChunk('A');
      onChunk('B');
      onChunk('C');
      onChunk('D');

      // Should still have only one message
      const messages = messagesStore.getMessages(TEST_CONVERSATION_ID);
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(messageId);
      expect(messages[0].content).toBe('ABCD');
    });

    it('should handle multiple rapid onAssistantMessageStart calls', async () => {
      const messagesStore = useMessagesStore.getState();
      let currentMessageId = '';
      let streamedContent = '';
      let createCount = 0;

      const onAssistantMessageStart = async () => {
        if (currentMessageId && !streamedContent) {
          return;
        }

        const existingMessages = messagesStore.getMessages(TEST_CONVERSATION_ID);
        const hasStreamingMessage = existingMessages.some(
          (msg) => msg.role === 'assistant' && msg.isStreaming
        );
        if (hasStreamingMessage && !streamedContent) {
          return;
        }

        const oldMessageId = currentMessageId;
        const oldContent = streamedContent;

        streamedContent = '';
        currentMessageId = messagesStore.createAssistantMessageAndPersist(
          TEST_CONVERSATION_ID,
          'test-agent'
        );
        createCount++;

        if (oldMessageId && oldContent) {
          await messagesStore.finalizeMessageAndPersist(
            TEST_CONVERSATION_ID,
            oldMessageId,
            oldContent
          );
        }
      };

      // Simulate rapid multiple calls (shouldn't happen in normal flow, but guard against it)
      await Promise.all([
        onAssistantMessageStart(),
        onAssistantMessageStart(),
        onAssistantMessageStart(),
      ]);

      // Should have created only one message
      expect(createCount).toBe(1);
      expect(messagesStore.getMessages(TEST_CONVERSATION_ID)).toHaveLength(1);
    });
  });

  describe('Multi-iteration message isolation', () => {
    it('should keep content separate between iterations', async () => {
      const messagesStore = useMessagesStore.getState();
      let currentMessageId = '';
      let streamedContent = '';

      const onAssistantMessageStart = async () => {
        const oldMessageId = currentMessageId;
        const oldContent = streamedContent;

        streamedContent = '';
        currentMessageId = messagesStore.createAssistantMessageAndPersist(
          TEST_CONVERSATION_ID,
          'test-agent'
        );

        if (oldMessageId && oldContent) {
          await messagesStore.finalizeMessageAndPersist(
            TEST_CONVERSATION_ID,
            oldMessageId,
            oldContent
          );
        }
      };

      const onChunk = (chunk: string) => {
        streamedContent += chunk;
        messagesStore.updateStreamingContent(TEST_CONVERSATION_ID, currentMessageId, streamedContent);
      };

      // Iteration 1
      await onAssistantMessageStart();
      const msg1Id = currentMessageId;
      onChunk('First iteration content');

      // Iteration 2
      await onAssistantMessageStart();
      const msg2Id = currentMessageId;
      onChunk('Second iteration content');

      // Iteration 3
      await onAssistantMessageStart();
      const msg3Id = currentMessageId;
      onChunk('Third iteration content');

      // Finalize last message
      await messagesStore.finalizeMessageAndPersist(
        TEST_CONVERSATION_ID,
        currentMessageId,
        streamedContent
      );

      // Verify each message has its own isolated content
      const messages = messagesStore.getMessages(TEST_CONVERSATION_ID);
      expect(messages).toHaveLength(3);

      const msg1 = messages.find((m) => m.id === msg1Id);
      const msg2 = messages.find((m) => m.id === msg2Id);
      const msg3 = messages.find((m) => m.id === msg3Id);

      expect(msg1?.content).toBe('First iteration content');
      expect(msg2?.content).toBe('Second iteration content');
      expect(msg3?.content).toBe('Third iteration content');

      // Content should NOT be accumulated across messages
      expect(msg1?.content).not.toContain('Second');
      expect(msg2?.content).not.toContain('First');
      expect(msg2?.content).not.toContain('Third');
    });

    it('should handle empty first iteration followed by content', async () => {
      const messagesStore = useMessagesStore.getState();
      let currentMessageId = '';
      let streamedContent = '';

      const onAssistantMessageStart = async () => {
        const oldMessageId = currentMessageId;
        const oldContent = streamedContent;

        streamedContent = '';
        currentMessageId = messagesStore.createAssistantMessageAndPersist(
          TEST_CONVERSATION_ID,
          'test-agent'
        );

        if (oldMessageId && oldContent) {
          await messagesStore.finalizeMessageAndPersist(
            TEST_CONVERSATION_ID,
            oldMessageId,
            oldContent
          );
        }
      };

      const onChunk = (chunk: string) => {
        streamedContent += chunk;
        messagesStore.updateStreamingContent(TEST_CONVERSATION_ID, currentMessageId, streamedContent);
      };

      // Iteration 1: No text (tool call only scenario)
      await onAssistantMessageStart();
      const msg1Id = currentMessageId;
      // No onChunk calls - empty content

      // Iteration 2: Has content
      await onAssistantMessageStart();
      const msg2Id = currentMessageId;
      onChunk('Actual response');

      // Finalize
      await messagesStore.finalizeMessageAndPersist(
        TEST_CONVERSATION_ID,
        currentMessageId,
        streamedContent
      );

      const messages = messagesStore.getMessages(TEST_CONVERSATION_ID);
      expect(messages).toHaveLength(2);

      const msg1 = messages.find((m) => m.id === msg1Id);
      const msg2 = messages.find((m) => m.id === msg2Id);

      // First message should be empty (or have empty string content)
      expect(msg1?.content).toBe('');
      // Second message should have the actual content
      expect(msg2?.content).toBe('Actual response');
    });
  });

  describe('Concurrent task isolation', () => {
    it('should maintain message isolation across different conversations', async () => {
      const messagesStore = useMessagesStore.getState();
      const CONV_1 = 'conversation-1';
      const CONV_2 = 'conversation-2';

      // Task 1 state
      let task1MessageId = '';
      let task1Content = '';

      // Task 2 state
      let task2MessageId = '';
      let task2Content = '';

      // Task 1: Create message
      task1MessageId = messagesStore.createAssistantMessageAndPersist(CONV_1, 'agent');

      // Task 2: Create message
      task2MessageId = messagesStore.createAssistantMessageAndPersist(CONV_2, 'agent');

      // Interleaved updates
      task1Content += 'Task 1 ';
      messagesStore.updateStreamingContent(CONV_1, task1MessageId, task1Content);

      task2Content += 'Task 2 ';
      messagesStore.updateStreamingContent(CONV_2, task2MessageId, task2Content);

      task1Content += 'content';
      messagesStore.updateStreamingContent(CONV_1, task1MessageId, task1Content);

      task2Content += 'content';
      messagesStore.updateStreamingContent(CONV_2, task2MessageId, task2Content);

      // Verify isolation
      const conv1Messages = messagesStore.getMessages(CONV_1);
      const conv2Messages = messagesStore.getMessages(CONV_2);

      expect(conv1Messages).toHaveLength(1);
      expect(conv2Messages).toHaveLength(1);

      expect(conv1Messages[0].content).toBe('Task 1 content');
      expect(conv2Messages[0].content).toBe('Task 2 content');

      // Content should NOT leak between conversations
      expect(conv1Messages[0].content).not.toContain('Task 2');
      expect(conv2Messages[0].content).not.toContain('Task 1');
    });
  });
});
