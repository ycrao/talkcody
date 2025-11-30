/**
 * Unit test for chat-box error handling
 *
 * This test verifies the critical bug fix where error messages from the LLM service
 * were appearing twice in the chatbox.
 *
 * Bug scenario:
 * 1. User sends a message
 * 2. LLM service throws an error (e.g., "No available provider for model")
 * 3. BUG: Error message appears twice in the chatbox
 *
 * Root cause: Error handling was duplicated in two places:
 * 1. onError callback passed to llmService.runAgentLoop() - displays error in UI
 * 2. catch block in chat-box.tsx - also displays error in UI
 *
 * Fix: Remove duplicate error display logic from the catch block, keeping only
 * the onError callback path for displaying errors.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMessages } from '@/hooks/use-messages';

describe('ChatBox error handling - duplicate error message fix', () => {
  it('should add error message only once when error occurs', () => {
    const { result } = renderHook(() => useMessages());
    const errorMessage =
      'Manual agent loop failed (Error): No available provider for model: glm-4.6. Please configure API keys in settings. Provider: unknown';

    // Simulate user message
    act(() => {
      result.current.addMessage('user', '你好', false);
    });

    expect(result.current.messages.length).toBe(1);

    // Simulate error handling - onError callback adds error message
    let errorMessageId: string;
    act(() => {
      errorMessageId = result.current.addMessage('assistant', errorMessage, false);
    });

    // After the fix, there should be exactly 2 messages: user message + 1 error message
    expect(result.current.messages.length).toBe(2);
    expect(result.current.messages[1].role).toBe('assistant');
    expect(result.current.messages[1].content).toBe(errorMessage);

    // Verify the error message is not duplicated
    const errorMessages = result.current.messages.filter(
      (msg) => msg.role === 'assistant' && msg.content === errorMessage
    );
    expect(errorMessages.length).toBe(1);
  });

  it('should update existing assistant message with error without creating duplicate', () => {
    const { result } = renderHook(() => useMessages());
    const errorMessage = 'Stream processing failed: Connection timeout';

    // Simulate user message
    act(() => {
      result.current.addMessage('user', 'test question', false);
    });

    // Simulate starting assistant response
    let assistantMessageId: string;
    act(() => {
      assistantMessageId = result.current.addMessage('assistant', 'Starting response...', true);
    });

    expect(result.current.messages.length).toBe(2);

    // Simulate error occurring - onError callback updates the message
    act(() => {
      result.current.updateMessageById(assistantMessageId, errorMessage, false);
    });

    // After the fix, there should still be exactly 2 messages (no duplicate)
    expect(result.current.messages.length).toBe(2);
    expect(result.current.messages[1].content).toBe(errorMessage);
    expect(result.current.messages[1].isStreaming).toBe(false);

    // Verify no duplicate error messages exist
    const errorMessages = result.current.messages.filter(
      (msg) => msg.role === 'assistant' && msg.content === errorMessage
    );
    expect(errorMessages.length).toBe(1);
  });

  it('should handle provider configuration errors without duplication', () => {
    const { result } = renderHook(() => useMessages());
    const errorMessage = 'No available provider for model: glm-4.6. Please configure API keys';

    act(() => {
      result.current.addMessage('user', 'test message', false);
    });

    // Simulate error - onError callback creates error message
    act(() => {
      result.current.addMessage('assistant', errorMessage, false);
    });

    // Should have exactly 2 messages total
    expect(result.current.messages.length).toBe(2);

    // Count how many times the error appears
    const errorCount = result.current.messages.filter(
      (msg) => msg.content === errorMessage
    ).length;
    expect(errorCount).toBe(1);
  });

  it('should handle multiple error scenarios correctly', () => {
    const { result } = renderHook(() => useMessages());

    // First conversation with error
    act(() => {
      result.current.addMessage('user', 'First question', false);
      result.current.addMessage('assistant', 'Error 1: Connection failed', false);
    });

    expect(result.current.messages.length).toBe(2);

    // Second conversation with error
    act(() => {
      result.current.addMessage('user', 'Second question', false);
      result.current.addMessage('assistant', 'Error 2: Model not found', false);
    });

    // Should have 4 messages total, no duplicates
    expect(result.current.messages.length).toBe(4);

    // Verify each error message appears exactly once
    const error1Count = result.current.messages.filter(
      (msg) => msg.content === 'Error 1: Connection failed'
    ).length;
    const error2Count = result.current.messages.filter(
      (msg) => msg.content === 'Error 2: Model not found'
    ).length;

    expect(error1Count).toBe(1);
    expect(error2Count).toBe(1);
  });

  it('should maintain correct message flow when error occurs mid-stream', () => {
    const { result } = renderHook(() => useMessages());

    act(() => {
      result.current.addMessage('user', 'Complex task', false);
    });

    // Start streaming
    let messageId: string;
    act(() => {
      messageId = result.current.addMessage('assistant', '', true);
    });

    // Stream some content
    act(() => {
      result.current.updateMessageById(messageId, 'Processing...', true);
    });

    // Error occurs mid-stream
    const errorMessage = 'Processing interrupted: Rate limit exceeded';
    act(() => {
      result.current.updateMessageById(messageId, errorMessage, false);
    });

    // Should have exactly 2 messages, no duplicates
    expect(result.current.messages.length).toBe(2);
    expect(result.current.messages[1].content).toBe(errorMessage);

    // Verify error message appears only once
    const errorMessages = result.current.messages.filter(
      (msg) => msg.content === errorMessage
    );
    expect(errorMessages.length).toBe(1);
  });
});
