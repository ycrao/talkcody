/**
 * Unit tests for useMessages hook
 *
 * These tests verify the fix for the bug where the first assistant message
 * would be incorrectly updated when streaming the second assistant message.
 *
 * Root cause: React state updates are asynchronous. When addMessage() was called
 * followed immediately by updateLastAssistantMessage(), the new message hadn't
 * been added to the array yet, causing updateLastAssistantMessage() to find and
 * update the wrong (previous) assistant message.
 *
 * Fix: Use updateMessageById() to target specific messages by ID instead of
 * searching for the "last assistant message".
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMessages } from './use-messages';

describe('useMessages hook', () => {
  describe('updateMessageById', () => {
    it('should update a specific message by ID', () => {
      const { result } = renderHook(() => useMessages());

      let messageId: string = '';

      // Add a message
      act(() => {
        messageId = result.current.addMessage('assistant', 'Original content', false);
      });

      // Verify initial state
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Original content');

      // Update the message by ID
      act(() => {
        result.current.updateMessageById(messageId, 'Updated content', false);
      });

      // Verify update
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Updated content');
    });

    it('should update streaming state correctly', () => {
      const { result } = renderHook(() => useMessages());

      let messageId: string = '';

      act(() => {
        messageId = result.current.addMessage('assistant', '', true);
      });

      expect(result.current.messages[0].isStreaming).toBe(true);

      // Update with streaming = false
      act(() => {
        result.current.updateMessageById(messageId, 'Complete content', false);
      });

      expect(result.current.messages[0].isStreaming).toBe(false);
      expect(result.current.messages[0].content).toBe('Complete content');
    });

    it('should update the correct message when multiple messages exist', () => {
      const { result } = renderHook(() => useMessages());

      let firstId: string = '';
      let secondId: string = '';
      let thirdId: string = '';

      // Add three messages
      act(() => {
        firstId = result.current.addMessage('assistant', 'First', false);
        secondId = result.current.addMessage('assistant', 'Second', false);
        thirdId = result.current.addMessage('assistant', 'Third', false);
      });

      expect(result.current.messages).toHaveLength(3);

      // Update the middle message
      act(() => {
        result.current.updateMessageById(secondId, 'Second Updated', false);
      });

      // Verify only the middle message was updated
      expect(result.current.messages[0].id).toBe(firstId);
      expect(result.current.messages[0].content).toBe('First');
      expect(result.current.messages[1].id).toBe(secondId);
      expect(result.current.messages[1].content).toBe('Second Updated');
      expect(result.current.messages[2].id).toBe(thirdId);
      expect(result.current.messages[2].content).toBe('Third');
    });

    it('should handle updating non-existent message ID gracefully', () => {
      const { result } = renderHook(() => useMessages());

      act(() => {
        result.current.addMessage('assistant', 'Existing message', false);
      });

      expect(result.current.messages).toHaveLength(1);

      // Try to update non-existent ID
      act(() => {
        result.current.updateMessageById('non-existent-id', 'Should not appear', false);
      });

      // Original message should remain unchanged
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Existing message');
    });

    it('should work with empty message list', () => {
      const { result } = renderHook(() => useMessages());

      // Try to update in empty list
      act(() => {
        result.current.updateMessageById('some-id', 'Content', false);
      });

      // Should remain empty
      expect(result.current.messages).toHaveLength(0);
    });
  });

  describe('Race condition fix - updateMessageById vs updateLastAssistantMessage', () => {
    it('should correctly update new message even when called immediately after addMessage', () => {
      const { result } = renderHook(() => useMessages());

      let firstId: string = '';
      let secondId: string = '';

      // Add first assistant message
      act(() => {
        firstId = result.current.addMessage('assistant', 'First message', false);
      });

      // Simulate the bug scenario:
      // 1. Add second message
      // 2. Immediately try to update it
      act(() => {
        // Add new message (this updates state asynchronously)
        secondId = result.current.addMessage('assistant', '', true);

        // Immediately update it by ID (this should work correctly)
        result.current.updateMessageById(secondId, 'Second message chunk', true);
      });

      // Both messages should exist and have correct content
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].id).toBe(firstId);
      expect(result.current.messages[0].content).toBe('First message');
      expect(result.current.messages[1].id).toBe(secondId);
      expect(result.current.messages[1].content).toBe('Second message chunk');
    });

    it('should maintain message integrity during rapid updates', () => {
      const { result } = renderHook(() => useMessages());

      let messageId: string = '';

      act(() => {
        messageId = result.current.addMessage('assistant', '', true);
      });

      // Simulate rapid streaming updates
      const chunks = [
        'H',
        'He',
        'Hel',
        'Hell',
        'Hello',
        'Hello ',
        'Hello W',
        'Hello Wo',
        'Hello Wor',
        'Hello Worl',
        'Hello World',
      ];

      act(() => {
        for (const chunk of chunks) {
          result.current.updateMessageById(messageId, chunk, true);
        }
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Hello World');
      expect(result.current.messages[0].isStreaming).toBe(true);

      // Finalize
      act(() => {
        result.current.updateMessageById(messageId, 'Hello World', false);
      });

      expect(result.current.messages[0].isStreaming).toBe(false);
    });
  });

  describe('Multi-iteration scenario - the original bug', () => {
    it('should not corrupt first message when second iteration starts', () => {
      const { result } = renderHook(() => useMessages());

      let firstAssistantId: string = '';
      let secondAssistantId: string = '';

      // User asks a question
      act(() => {
        result.current.addMessage('user', 'What is 2+2?', false);
      });

      // First iteration: AI responds
      act(() => {
        firstAssistantId = result.current.addMessage('assistant', '', true);
        result.current.updateMessageById(firstAssistantId, 'Let me calculate that.', true);
        result.current.updateMessageById(firstAssistantId, 'Let me calculate that.', false);
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].content).toBe('Let me calculate that.');

      // Tool call (simulated)
      act(() => {
        result.current.addMessage(
          'assistant',
          [{ type: 'tool-call', toolName: 'calculator' }] as any,
          false
        );
        result.current.addMessage('tool', '4', false);
      });

      // Second iteration: AI responds with result
      // THIS IS WHERE THE BUG OCCURRED - second iteration would corrupt first message
      act(() => {
        secondAssistantId = result.current.addMessage('assistant', '', true);
        // Using updateMessageById with the correct ID prevents the bug
        result.current.updateMessageById(secondAssistantId, 'The answer is 4.', true);
        result.current.updateMessageById(secondAssistantId, 'The answer is 4.', false);
      });

      // CRITICAL: First message should still have its original content
      const firstMessage = result.current.messages.find((m) => m.id === firstAssistantId);
      expect(firstMessage).toBeDefined();
      expect(firstMessage?.content).toBe('Let me calculate that.');

      // Second message should have new content
      const secondMessage = result.current.messages.find((m) => m.id === secondAssistantId);
      expect(secondMessage).toBeDefined();
      expect(secondMessage?.content).toBe('The answer is 4.');

      // All messages should be present
      expect(result.current.messages).toHaveLength(5);
    });

    it('should handle three iterations without message corruption', () => {
      const { result } = renderHook(() => useMessages());

      const messageIds: string[] = [];

      act(() => {
        result.current.addMessage('user', 'Complex task', false);
      });

      // Iteration 1
      act(() => {
        const id = result.current.addMessage('assistant', '', true);
        messageIds.push(id);
        result.current.updateMessageById(id, 'First response', false);
      });

      // Tool call 1
      act(() => {
        result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
        result.current.addMessage('tool', 'Result 1', false);
      });

      // Iteration 2
      act(() => {
        const id = result.current.addMessage('assistant', '', true);
        messageIds.push(id);
        result.current.updateMessageById(id, 'Second response', false);
      });

      // Tool call 2
      act(() => {
        result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
        result.current.addMessage('tool', 'Result 2', false);
      });

      // Iteration 3
      act(() => {
        const id = result.current.addMessage('assistant', '', true);
        messageIds.push(id);
        result.current.updateMessageById(id, 'Third response', false);
      });

      // Verify all three assistant text responses are intact
      const firstMsg = result.current.messages.find((m) => m.id === messageIds[0]);
      const secondMsg = result.current.messages.find((m) => m.id === messageIds[1]);
      const thirdMsg = result.current.messages.find((m) => m.id === messageIds[2]);

      expect(firstMsg?.content).toBe('First response');
      expect(secondMsg?.content).toBe('Second response');
      expect(thirdMsg?.content).toBe('Third response');
    });
  });

  describe('Comparison with updateLastAssistantMessage', () => {
    it('updateLastAssistantMessage finds the last assistant message with string content', () => {
      const { result } = renderHook(() => useMessages());

      let _firstId: string = '';
      let _secondId: string = '';

      act(() => {
        _firstId = result.current.addMessage('assistant', 'First', false);
        result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
        _secondId = result.current.addMessage('assistant', 'Second', false);
      });

      // Simulate updateLastAssistantMessage behavior using updateMessageById
      act(() => {
        // Find the last assistant message with string content (not tool calls)
        const lastAssistantMessage = [...result.current.messages]
          .reverse()
          .find((msg) => msg.role === 'assistant' && typeof msg.content === 'string');
        if (lastAssistantMessage) {
          result.current.updateMessageById(lastAssistantMessage.id, 'Second Updated', false);
        }
      });

      expect(result.current.messages[0].content).toBe('First');
      expect(result.current.messages[2].content).toBe('Second Updated');
    });

    it('updateMessageById is more precise than updateLastAssistantMessage', () => {
      const { result } = renderHook(() => useMessages());

      let firstId: string = '';
      let _secondId: string = '';

      act(() => {
        firstId = result.current.addMessage('assistant', 'First', false);
        _secondId = result.current.addMessage('assistant', 'Second', false);
      });

      // updateMessageById can target any message, not just the last one
      act(() => {
        result.current.updateMessageById(firstId, 'First Updated', false);
      });

      expect(result.current.messages[0].content).toBe('First Updated');
      expect(result.current.messages[1].content).toBe('Second');

      // Simulate updateLastAssistantMessage behavior using updateMessageById
      act(() => {
        // Find the last assistant message
        const lastAssistantMessage = [...result.current.messages]
          .reverse()
          .find((msg) => msg.role === 'assistant');
        if (lastAssistantMessage) {
          result.current.updateMessageById(lastAssistantMessage.id, 'Second Updated', false);
        }
      });

      expect(result.current.messages[0].content).toBe('First Updated');
      expect(result.current.messages[1].content).toBe('Second Updated');
    });
  });

  describe('Edge cases', () => {
    it('should handle messages with attachments', () => {
      const { result } = renderHook(() => useMessages());

      const attachments = [
        {
          id: 'test-attachment-1',
          type: 'image' as const,
          filename: 'test.png',
          content: 'base64data',
          filePath: '/path/to/test.png',
          mimeType: 'image/png',
          size: 1024,
        },
      ];

      let messageId: string = '';

      act(() => {
        messageId = result.current.addMessage(
          'user',
          'Check this image',
          false,
          undefined,
          attachments
        );
      });

      expect(result.current.messages[0].attachments).toEqual(attachments);

      // Update with new attachments
      const newAttachments = [
        {
          id: 'test-attachment-2',
          type: 'file' as const,
          filename: 'test.txt',
          content: 'file content',
          filePath: '/path/to/test.txt',
          mimeType: 'text/plain',
          size: 512,
        },
      ];

      act(() => {
        result.current.updateMessageById(messageId, 'Updated message', false, newAttachments);
      });

      expect(result.current.messages[0].content).toBe('Updated message');
      expect(result.current.messages[0].attachments).toEqual(newAttachments);
    });

    it('should preserve other message properties when updating', () => {
      const { result } = renderHook(() => useMessages());

      let messageId: string = '';
      const assistantId = 'test-assistant';
      const toolCallId = 'tool-call-123';
      const toolName = 'test-tool';

      act(() => {
        messageId = result.current.addMessage(
          'assistant',
          'Original',
          true,
          assistantId,
          undefined,
          undefined,
          toolCallId,
          toolName
        );
      });

      const originalTimestamp = result.current.messages[0].timestamp;
      const originalId = result.current.messages[0].id;

      // Update content and streaming state
      act(() => {
        result.current.updateMessageById(messageId, 'Updated', false);
      });

      const updatedMessage = result.current.messages[0];

      // These should be preserved
      expect(updatedMessage.id).toBe(originalId);
      expect(updatedMessage.timestamp).toEqual(originalTimestamp);
      expect(updatedMessage.assistantId).toBe(assistantId);
      expect(updatedMessage.toolCallId).toBe(toolCallId);
      expect(updatedMessage.toolName).toBe(toolName);
      expect(updatedMessage.role).toBe('assistant');

      // These should be updated
      expect(updatedMessage.content).toBe('Updated');
      expect(updatedMessage.isStreaming).toBe(false);
    });

    it('should handle mixed role messages correctly', () => {
      const { result } = renderHook(() => useMessages());

      let userId: string = '';
      let assistantId: string = '';
      let toolId: string = '';

      act(() => {
        userId = result.current.addMessage('user', 'User message', false);
        assistantId = result.current.addMessage('assistant', 'Assistant message', false);
        toolId = result.current.addMessage('tool', 'Tool result', false);
      });

      // Update each by ID
      act(() => {
        result.current.updateMessageById(userId, 'Updated user', false);
        result.current.updateMessageById(assistantId, 'Updated assistant', false);
        result.current.updateMessageById(toolId, 'Updated tool', false);
      });

      expect(result.current.messages[0].content).toBe('Updated user');
      expect(result.current.messages[1].content).toBe('Updated assistant');
      expect(result.current.messages[2].content).toBe('Updated tool');
    });
  });

  describe('Integration with other useMessages functions', () => {
    it('should work correctly with deleteMessage', () => {
      const { result } = renderHook(() => useMessages());

      let firstId: string = '';
      let secondId: string = '';
      let thirdId: string = '';

      act(() => {
        firstId = result.current.addMessage('assistant', 'First', false);
        secondId = result.current.addMessage('assistant', 'Second', false);
        thirdId = result.current.addMessage('assistant', 'Third', false);
      });

      // Delete middle message
      act(() => {
        result.current.deleteMessage(secondId);
      });

      expect(result.current.messages).toHaveLength(2);

      // Update remaining messages by ID
      act(() => {
        result.current.updateMessageById(firstId, 'First Updated', false);
        result.current.updateMessageById(thirdId, 'Third Updated', false);
      });

      expect(result.current.messages[0].content).toBe('First Updated');
      expect(result.current.messages[1].content).toBe('Third Updated');
    });

    it('should work correctly with clearMessages', () => {
      const { result } = renderHook(() => useMessages());

      let messageId: string = '';

      act(() => {
        messageId = result.current.addMessage('assistant', 'Test', false);
      });

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toHaveLength(0);

      // Updating non-existent message after clear should be safe
      act(() => {
        result.current.updateMessageById(messageId, 'Should not appear', false);
      });

      expect(result.current.messages).toHaveLength(0);
    });

    it('should work correctly with stopStreaming', () => {
      const { result } = renderHook(() => useMessages());

      let firstId: string = '';
      let _secondId: string = '';

      act(() => {
        firstId = result.current.addMessage('assistant', 'First', true);
        _secondId = result.current.addMessage('assistant', 'Second', true);
      });

      expect(result.current.messages[0].isStreaming).toBe(true);
      expect(result.current.messages[1].isStreaming).toBe(true);

      // Stop all streaming
      act(() => {
        result.current.stopStreaming();
      });

      expect(result.current.messages[0].isStreaming).toBe(false);
      expect(result.current.messages[1].isStreaming).toBe(false);

      // Can still update by ID after stopping
      act(() => {
        result.current.updateMessageById(firstId, 'First Updated', false);
      });

      expect(result.current.messages[0].content).toBe('First Updated');
    });
  });
});
