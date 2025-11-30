// Test for multi-iteration assistant messages persistence using real useMessages hook

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMessages } from '@/hooks/use-messages';

/**
 * This test verifies that when an agent loop has multiple iterations
 * (e.g., text -> tool call -> text), each assistant message is properly
 * saved to the database and displayed in the UI in chronological order.
 *
 * Expected behavior:
 * 1. First iteration: AI responds with "AAAA"
 * 2. Tool call iteration: Tool is called
 * 3. Second iteration: AI responds with "BBBB"
 *
 * UI should display (in order):
 * - User message
 * - Assistant: "AAAA"
 * - Tool call message
 * - Assistant: "BBBB"
 *
 * All messages should persist to database with correct content.
 */

describe('Multi-iteration assistant messages', () => {
  let databaseMessages: Map<string, string>;

  const saveMessage = async (messageId: string, _role: string, content: string) => {
    databaseMessages.set(messageId, content);
  };

  const updateMessage = async (messageId: string, content: string) => {
    databaseMessages.set(messageId, content);
  };

  beforeEach(() => {
    databaseMessages = new Map();
  });

  it('should persist multiple assistant messages correctly during agent loop', async () => {
    const { result } = renderHook(() => useMessages());

    // Add user message
    let userMsgId: string;
    act(() => {
      userMsgId = result.current.addMessage('user', 'Test question', false);
    });
    await saveMessage(userMsgId!, 'user', 'Test question');

    let streamedContent = '';
    let assistantMessageId = '';

    // Simulate handleAssistantMessageStart - First iteration
    const handleAssistantMessageStart = async () => {
      // Save the previous message's content to database before creating a new one
      if (assistantMessageId && streamedContent) {
        await updateMessage(assistantMessageId, streamedContent);
      }

      // Reset streamedContent when starting a new assistant message
      streamedContent = '';
      // Create new assistant message for this iteration
      act(() => {
        assistantMessageId = result.current.addMessage('assistant', '', true);
      });

      // Save initial message to database immediately with the same ID
      await saveMessage(assistantMessageId, 'assistant', '');
    };

    // First iteration: Stream "AAAA"
    await handleAssistantMessageStart();
    const firstAssistantId = assistantMessageId;

    // Simulate streaming chunks
    streamedContent += 'AA';
    act(() => {
      result.current.updateMessageById(assistantMessageId, streamedContent, true);
    });

    streamedContent += 'AA';
    act(() => {
      result.current.updateMessageById(assistantMessageId, streamedContent, true);
    });

    // Simulate onComplete for first iteration
    const firstContent = 'AAAA';
    act(() => {
      result.current.updateMessageById(assistantMessageId, firstContent, false);
    });
    await updateMessage(assistantMessageId, firstContent);

    // Verify first assistant message in UI
    expect(result.current.messages).toHaveLength(2); // user + assistant
    expect(result.current.messages[1]).toMatchObject({
      id: firstAssistantId,
      role: 'assistant',
      content: 'AAAA',
    });

    // Verify first assistant message in database
    expect(databaseMessages.get(firstAssistantId)).toBe('AAAA');

    // Simulate tool call
    let toolCallId: string;
    act(() => {
      toolCallId = result.current.addMessage(
        'assistant',
        [{ type: 'tool-call', toolName: 'test-tool' }] as any,
        false
      );
    });
    await saveMessage(toolCallId!, 'assistant', JSON.stringify([{ type: 'tool-call' }]));

    let toolResultId: string;
    act(() => {
      toolResultId = result.current.addMessage('tool', 'Tool result', false);
    });
    await saveMessage(toolResultId!, 'tool', 'Tool result');

    // Second iteration: Stream "BBBB"
    await handleAssistantMessageStart();
    const secondAssistantId = assistantMessageId;

    // Verify that first message's content was saved before creating second message
    expect(databaseMessages.get(firstAssistantId)).toBe('AAAA');

    // Simulate streaming chunks for second iteration
    streamedContent += 'BB';
    act(() => {
      result.current.updateMessageById(assistantMessageId, streamedContent, true);
    });

    streamedContent += 'BB';
    act(() => {
      result.current.updateMessageById(assistantMessageId, streamedContent, true);
    });

    // Simulate onComplete for second iteration
    const secondContent = 'BBBB';
    act(() => {
      result.current.updateMessageById(assistantMessageId, secondContent, false);
    });
    await updateMessage(assistantMessageId, secondContent);

    // Verify all messages in UI (chronological order)
    expect(result.current.messages).toHaveLength(5); // user + assistant1 + tool call + tool result + assistant2
    expect(result.current.messages[0]).toMatchObject({
      id: userMsgId!,
      role: 'user',
      content: 'Test question',
    });
    expect(result.current.messages[1]).toMatchObject({
      id: firstAssistantId,
      role: 'assistant',
      content: 'AAAA',
    });
    expect(result.current.messages[2].role).toBe('assistant'); // tool call
    expect(result.current.messages[3]).toMatchObject({
      id: toolResultId!,
      role: 'tool',
      content: 'Tool result',
    });
    expect(result.current.messages[4]).toMatchObject({
      id: secondAssistantId,
      role: 'assistant',
      content: 'BBBB',
    });

    // Verify all assistant messages persisted to database
    expect(databaseMessages.get(firstAssistantId)).toBe('AAAA');
    expect(databaseMessages.get(secondAssistantId)).toBe('BBBB');
  });

  it('should handle three iterations correctly', async () => {
    const { result } = renderHook(() => useMessages());

    // Add user message
    let userMsgId: string;
    act(() => {
      userMsgId = result.current.addMessage('user', 'Complex question', false);
    });
    await saveMessage(userMsgId!, 'user', 'Complex question');

    let streamedContent = '';
    let assistantMessageId = '';

    const handleAssistantMessageStart = async () => {
      if (assistantMessageId && streamedContent) {
        await updateMessage(assistantMessageId, streamedContent);
      }
      streamedContent = '';
      act(() => {
        assistantMessageId = result.current.addMessage('assistant', '', true);
      });
      await saveMessage(assistantMessageId, 'assistant', '');
    };

    // Iteration 1
    await handleAssistantMessageStart();
    const firstId = assistantMessageId;
    streamedContent = 'First response';
    act(() => {
      result.current.updateMessageById(assistantMessageId, streamedContent, false);
    });
    await updateMessage(assistantMessageId, streamedContent);

    // Tool call 1
    act(() => {
      result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
      result.current.addMessage('tool', 'Result 1', false);
    });

    // Iteration 2
    await handleAssistantMessageStart();
    const secondId = assistantMessageId;
    streamedContent = 'Second response';
    act(() => {
      result.current.updateMessageById(assistantMessageId, streamedContent, false);
    });
    await updateMessage(assistantMessageId, streamedContent);

    // Tool call 2
    act(() => {
      result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
      result.current.addMessage('tool', 'Result 2', false);
    });

    // Iteration 3
    await handleAssistantMessageStart();
    const thirdId = assistantMessageId;
    streamedContent = 'Third response';
    act(() => {
      result.current.updateMessageById(assistantMessageId, streamedContent, false);
    });
    await updateMessage(assistantMessageId, streamedContent);

    // Verify all three assistant text messages persisted correctly
    expect(databaseMessages.get(firstId)).toBe('First response');
    expect(databaseMessages.get(secondId)).toBe('Second response');
    expect(databaseMessages.get(thirdId)).toBe('Third response');

    // Verify UI has all messages in order
    expect(result.current.messages.length).toBeGreaterThanOrEqual(7); // user + 3 assistant texts + 2 tool calls + 2 tool results
  });

  it('should handle empty first message followed by content', async () => {
    const { result } = renderHook(() => useMessages());

    let streamedContent = '';
    let assistantMessageId = '';

    const handleAssistantMessageStart = async () => {
      if (assistantMessageId && streamedContent) {
        await updateMessage(assistantMessageId, streamedContent);
      }
      streamedContent = '';
      act(() => {
        assistantMessageId = result.current.addMessage('assistant', '', true);
      });
      await saveMessage(assistantMessageId, 'assistant', '');
    };

    // First iteration produces empty content (e.g., only tool call, no text)
    await handleAssistantMessageStart();
    const firstId = assistantMessageId;
    // streamedContent remains empty
    await updateMessage(assistantMessageId, ''); // Save empty content

    // Tool call
    act(() => {
      result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
      result.current.addMessage('tool', 'Result', false);
    });

    // Second iteration has content
    await handleAssistantMessageStart();
    const secondId = assistantMessageId;
    // Since first message had no content (streamedContent was empty), it shouldn't be saved again
    streamedContent = 'Actual response';
    act(() => {
      result.current.updateMessageById(assistantMessageId, streamedContent, false);
    });
    await updateMessage(assistantMessageId, streamedContent);

    // Verify database state
    expect(databaseMessages.get(firstId)).toBe('');
    expect(databaseMessages.get(secondId)).toBe('Actual response');
  });
});
