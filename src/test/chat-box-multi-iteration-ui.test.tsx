/**
 * Integration test for chat-box multi-iteration UI behavior using real useMessages hook
 *
 * This test verifies the critical bug fix where the first assistant message
 * would "disappear" from the UI when a second iteration started.
 *
 * Bug scenario:
 * 1. First iteration: AI responds "AAAA"
 * 2. Tool call
 * 3. Second iteration: AI responds "BBBB"
 * 4. BUG: First message "AAAA" disappears from UI (but exists in DB)
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
import { beforeEach, describe, expect, it } from 'vitest';
import { useMessages } from '@/hooks/use-messages';
import { useMessagesStore } from '@/stores/messages-store';

// Test conversation ID for all tests
const TEST_CONVERSATION_ID = 'test-multi-iteration-ui-conversation';

describe('Chat-box multi-iteration UI state management', () => {
  let streamedContent = '';
  let assistantMessageId = '';

  // Mock database
  const database = new Map<string, { content: string; isStreaming: boolean }>();

  const saveMessage = async (messageId: string, content: string) => {
    database.set(messageId, { content, isStreaming: true });
    return messageId;
  };

  const updateMessage = async (messageId: string, content: string) => {
    const existing = database.get(messageId);
    if (existing) {
      database.set(messageId, { content, isStreaming: false });
    }
  };

  beforeEach(() => {
    streamedContent = '';
    assistantMessageId = '';
    database.clear();
    // Reset messages store
    useMessagesStore.getState().messagesByConversation.clear();
  });

  it('should maintain all messages in UI during multi-iteration', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    // Helper function to simulate iteration
    const simulateIteration = async (text: string) => {
      // Finalize previous message
      if (assistantMessageId && streamedContent) {
        act(() => {
          result.current.updateMessageById(assistantMessageId, streamedContent, false);
        });
        await updateMessage(assistantMessageId, streamedContent);
      }

      // Create new message
      streamedContent = '';
      act(() => {
        assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
      });
      await saveMessage(assistantMessageId, '');

      // Stream content
      for (const char of text) {
        streamedContent += char;
        act(() => {
          result.current.updateMessageById(assistantMessageId, streamedContent, true);
        });
      }

      // Finalize
      act(() => {
        result.current.updateMessageById(assistantMessageId, text, false);
      });
      await updateMessage(assistantMessageId, text);
    };

    // Add user message
    act(() => {
      result.current.addMessage('user', 'Test question', false);
    });

    // First iteration: AI responds "AAAA"
    await simulateIteration('AAAA');

    expect(result.current.messages.length).toBe(2); // user + assistant
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'AAAA',
      isStreaming: false,
    });

    const firstAssistantId = result.current.messages[1].id;

    // Simulate tool call
    act(() => {
      result.current.addMessage(
        'assistant',
        [{ type: 'tool-call', toolName: 'test-tool' }] as any,
        false
      );
      result.current.addMessage('tool', 'Tool result', false);
    });

    // Second iteration: AI responds "BBBB"
    await simulateIteration('BBBB');

    // CRITICAL TEST: First message should still be visible in UI
    expect(result.current.messages.length).toBe(5); // user + assistant1 + tool-call + tool-result + assistant2

    // Verify first assistant message is still there with correct content
    const firstMessage = result.current.messages.find((m) => m.id === firstAssistantId);
    expect(firstMessage).toBeDefined();
    expect(firstMessage).toMatchObject({
      role: 'assistant',
      content: 'AAAA',
      isStreaming: false,
    });

    // Verify second assistant message
    expect(result.current.messages[4]).toMatchObject({
      role: 'assistant',
      content: 'BBBB',
      isStreaming: false,
    });

    // Verify database state
    expect(database.get(firstAssistantId)).toEqual({
      content: 'AAAA',
      isStreaming: false,
    });
    expect(database.get(result.current.messages[4].id)).toEqual({
      content: 'BBBB',
      isStreaming: false,
    });
  });

  it('should handle three iterations correctly', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    const simulateIteration = async (text: string) => {
      if (assistantMessageId && streamedContent) {
        act(() => {
          result.current.updateMessageById(assistantMessageId, streamedContent, false);
        });
        await updateMessage(assistantMessageId, streamedContent);
      }

      streamedContent = '';
      act(() => {
        assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
      });
      await saveMessage(assistantMessageId, '');

      streamedContent = text;
      act(() => {
        result.current.updateMessageById(assistantMessageId, text, false);
      });
      await updateMessage(assistantMessageId, text);
    };

    act(() => {
      result.current.addMessage('user', 'Complex question', false);
    });

    // Iteration 1: "First"
    await simulateIteration('First');
    expect(result.current.messages.length).toBe(2);
    expect(result.current.messages[1].content).toBe('First');
    expect(result.current.messages[1].isStreaming).toBe(false);
    const firstId = result.current.messages[1].id;

    // Tool call 1
    act(() => {
      result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
      result.current.addMessage('tool', 'Result 1', false);
    });

    // Iteration 2: "Second"
    await simulateIteration('Second');
    expect(result.current.messages.length).toBe(5);
    expect(result.current.messages[1].content).toBe('First'); // First message unchanged
    expect(result.current.messages[4].content).toBe('Second');
    const secondId = result.current.messages[4].id;

    // Tool call 2
    act(() => {
      result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
      result.current.addMessage('tool', 'Result 2', false);
    });

    // Iteration 3: "Third"
    await simulateIteration('Third');
    expect(result.current.messages.length).toBe(8);

    // Verify all three assistant text messages are present
    expect(result.current.messages[1].content).toBe('First');
    expect(result.current.messages[4].content).toBe('Second');
    expect(result.current.messages[7].content).toBe('Third');

    // All should be finalized
    expect(result.current.messages[1].isStreaming).toBe(false);
    expect(result.current.messages[4].isStreaming).toBe(false);
    expect(result.current.messages[7].isStreaming).toBe(false);

    // Verify database
    expect(database.get(firstId)?.content).toBe('First');
    expect(database.get(secondId)?.content).toBe('Second');
    expect(database.get(result.current.messages[7].id)?.content).toBe('Third');
  });

  it('should handle empty first message followed by content', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    act(() => {
      result.current.addMessage('user', 'Test', false);
    });

    // First iteration: empty (only tool call, no text)
    act(() => {
      assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });
    const firstId = assistantMessageId;
    act(() => {
      result.current.updateMessageById(assistantMessageId, '', false);
    });
    await updateMessage(assistantMessageId, '');

    // Tool call
    act(() => {
      result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
      result.current.addMessage('tool', 'Result', false);
    });

    // Second iteration: actual content
    streamedContent = '';
    act(() => {
      assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });
    act(() => {
      result.current.updateMessageById(assistantMessageId, 'Actual response', false);
    });

    // Verify empty message is preserved
    expect(result.current.messages[1]).toMatchObject({
      id: firstId,
      content: '',
      isStreaming: false,
    });

    // Verify second message has content
    expect(result.current.messages[4]).toMatchObject({
      content: 'Actual response',
      isStreaming: false,
    });
  });

  it('should correctly set isStreaming flag during and after streaming', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    act(() => {
      result.current.addMessage('user', 'Test', false);
    });

    // Start first iteration
    act(() => {
      assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });
    const firstId = assistantMessageId;

    // During streaming
    act(() => {
      result.current.updateMessageById(assistantMessageId, 'A', true);
    });
    expect(result.current.messages[1].isStreaming).toBe(true);

    act(() => {
      result.current.updateMessageById(assistantMessageId, 'AA', true);
    });
    expect(result.current.messages[1].isStreaming).toBe(true);

    // Complete streaming
    act(() => {
      result.current.updateMessageById(assistantMessageId, 'AAAA', false);
    });
    expect(result.current.messages[1].isStreaming).toBe(false);

    streamedContent = 'AAAA';
    await updateMessage(assistantMessageId, streamedContent);

    // Start second iteration
    streamedContent = '';
    act(() => {
      assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });

    // CRITICAL: First message should still have isStreaming: false
    expect(result.current.messages[1]).toMatchObject({
      id: firstId,
      content: 'AAAA',
      isStreaming: false,
    });

    // Second message is streaming
    expect(result.current.messages[2].isStreaming).toBe(true);
  });

  it('should preserve message content when creating new iteration', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    act(() => {
      result.current.addMessage('user', 'Test', false);
    });

    // First iteration
    act(() => {
      assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });
    streamedContent = 'AAAA';
    act(() => {
      result.current.updateMessageById(assistantMessageId, streamedContent, false);
    });
    await updateMessage(assistantMessageId, streamedContent);

    const firstMessageBefore = { ...result.current.messages[1] };

    // Second iteration
    streamedContent = '';
    act(() => {
      assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });

    // First message content should be exactly the same
    expect(result.current.messages[1]).toEqual(firstMessageBefore);
    expect(result.current.messages[1].content).toBe('AAAA');
  });

  it('should handle rapid iterations without losing messages', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    act(() => {
      result.current.addMessage('user', 'Test', false);
    });

    const iterations = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
    const messageIds: string[] = [];

    for (const text of iterations) {
      if (assistantMessageId && streamedContent) {
        act(() => {
          result.current.updateMessageById(assistantMessageId, streamedContent, false);
        });
        await updateMessage(assistantMessageId, streamedContent);
      }

      streamedContent = text;
      act(() => {
        assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
        messageIds.push(assistantMessageId);
      });
      await saveMessage(assistantMessageId, '');

      act(() => {
        result.current.updateMessageById(assistantMessageId, text, false);
      });
      await updateMessage(assistantMessageId, text);
    }

    // All messages should be present
    expect(result.current.messages.length).toBe(6); // user + 5 assistant messages

    // Verify each message
    for (let i = 0; i < iterations.length; i++) {
      expect(result.current.messages[i + 1]).toMatchObject({
        id: messageIds[i],
        content: iterations[i],
        isStreaming: false,
      });
    }

    // Verify database
    for (let i = 0; i < iterations.length; i++) {
      expect(database.get(messageIds[i])).toEqual({
        content: iterations[i],
        isStreaming: false,
      });
    }
  });

  it('should maintain chronological order of messages', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    const simulateIteration = async (text: string) => {
      if (assistantMessageId && streamedContent) {
        act(() => {
          result.current.updateMessageById(assistantMessageId, streamedContent, false);
        });
        await updateMessage(assistantMessageId, streamedContent);
      }

      streamedContent = text;
      act(() => {
        assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
      });
      act(() => {
        result.current.updateMessageById(assistantMessageId, text, false);
      });
      await updateMessage(assistantMessageId, text);
    };

    act(() => {
      result.current.addMessage('user', 'Question', false);
    });

    // First assistant response
    await simulateIteration('Answer 1');

    // Tool call and result
    act(() => {
      result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
      result.current.addMessage('tool', 'Tool result', false);
    });

    // Second assistant response
    await simulateIteration('Answer 2');

    // Verify chronological order
    expect(result.current.messages.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Answer 1' },
      { role: 'assistant', content: [{ type: 'tool-call' }] },
      { role: 'tool', content: 'Tool result' },
      { role: 'assistant', content: 'Answer 2' },
    ]);
  });
});

describe('Chat-box with updateMessageById fix', () => {
  let streamedContent = '';
  let assistantMessageId = '';
  const database = new Map<string, { content: string; isStreaming: boolean }>();

  const _saveMessage = async (messageId: string, content: string) => {
    database.set(messageId, { content, isStreaming: true });
    return messageId;
  };

  const _updateMessage = async (messageId: string, content: string) => {
    const existing = database.get(messageId);
    if (existing) {
      database.set(messageId, { content, isStreaming: false });
    }
  };

  beforeEach(() => {
    streamedContent = '';
    assistantMessageId = '';
    database.clear();
    // Reset messages store
    useMessagesStore.getState().messagesByConversation.clear();
  });

  it('should correctly update messages using updateMessageById', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    act(() => {
      result.current.addMessage('user', 'Test question', false);
      assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });

    act(() => {
      result.current.updateMessageById(assistantMessageId, 'First response', false);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe('First response');
    expect(result.current.messages[1].isStreaming).toBe(false);
  });

  it('should prevent the race condition bug with updateMessageById', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    act(() => {
      result.current.addMessage('user', 'What is the capital of France?', false);
    });

    // First iteration
    act(() => {
      assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });
    act(() => {
      result.current.updateMessageById(assistantMessageId, 'Let me think...', false);
    });

    const firstMessageId = result.current.messages[1].id;
    const firstMessageContent = result.current.messages[1].content;

    // Tool call
    act(() => {
      result.current.addMessage(
        'assistant',
        [{ type: 'tool-call', toolName: 'search' }] as any,
        false
      );
      result.current.addMessage('tool', 'Paris is the capital', false);
    });

    // Second iteration - THIS IS WHERE THE BUG WOULD OCCUR
    streamedContent = '';
    act(() => {
      assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });
    act(() => {
      result.current.updateMessageById(
        assistantMessageId,
        'The capital of France is Paris.',
        false
      );
    });

    // CRITICAL: First message should not be corrupted
    const firstMessage = result.current.messages.find((m) => m.id === firstMessageId);
    expect(firstMessage).toBeDefined();
    expect(firstMessage?.content).toBe(firstMessageContent);
    expect(firstMessage?.content).toBe('Let me think...');

    // Second message should have correct content
    expect(result.current.messages[4].content).toBe('The capital of France is Paris.');

    // All messages should be present
    expect(result.current.messages).toHaveLength(5);
  });

  it('should handle simultaneous addMessage and updateMessageById calls', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    act(() => {
      result.current.addMessage('user', 'Test', false);
    });

    // First message
    let firstId: string;
    act(() => {
      firstId = result.current.addMessage('assistant', '', true, 'test-agent');
      result.current.updateMessageById(firstId, 'First', false);
    });

    // Simulate the exact bug scenario:
    // Add new message and immediately update it before React state has synchronized
    let secondId: string;
    act(() => {
      secondId = result.current.addMessage('assistant', '', true, 'test-agent');
      // Immediately update the newly added message
      result.current.updateMessageById(secondId, 'Second chunk', true);
    });

    // First message should remain intact
    expect(result.current.messages.find((m) => m.id === firstId!)?.content).toBe('First');

    // Second message should have the update
    expect(result.current.messages.find((m) => m.id === secondId!)?.content).toBe('Second chunk');
  });

  it('should maintain message integrity across multiple rapid iterations', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    act(() => {
      result.current.addMessage('user', 'Complex task', false);
    });

    const responses = ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5'];
    const messageIds: string[] = [];

    for (const response of responses) {
      act(() => {
        if (assistantMessageId && streamedContent) {
          result.current.updateMessageById(assistantMessageId, streamedContent, false);
        }

        streamedContent = response;
        assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
        result.current.updateMessageById(assistantMessageId, response, false);
        messageIds.push(assistantMessageId);
      });

      // Add tool call between each iteration (except last)
      if (response !== responses[responses.length - 1]) {
        act(() => {
          result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
          result.current.addMessage('tool', `Result for ${response}`, false);
        });
      }
    }

    // Verify all assistant messages are present and correct
    for (let i = 0; i < responses.length; i++) {
      const message = result.current.messages.find((m) => m.id === messageIds[i]);
      expect(message).toBeDefined();
      expect(message?.content).toBe(responses[i]);
      expect(message?.isStreaming).toBe(false);
    }
  });

  it('should handle streaming updates correctly with updateMessageById', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    act(() => {
      result.current.addMessage('user', 'Write hello world', false);
      assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });

    const messageId = assistantMessageId;

    // Simulate character-by-character streaming
    const fullText = 'Hello, World!';
    for (let i = 1; i <= fullText.length; i++) {
      const chunk = fullText.substring(0, i);
      act(() => {
        result.current.updateMessageById(messageId, chunk, true);
      });

      // Verify the message is being updated
      const msg = result.current.messages.find((m) => m.id === messageId);
      expect(msg?.content).toBe(chunk);
      expect(msg?.isStreaming).toBe(true);
    }

    // Finalize
    act(() => {
      result.current.updateMessageById(messageId, fullText, false);
    });

    const finalMsg = result.current.messages.find((m) => m.id === messageId);
    expect(finalMsg?.content).toBe(fullText);
    expect(finalMsg?.isStreaming).toBe(false);
  });

  it('should handle reasoning/thinking content correctly', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    act(() => {
      result.current.addMessage('user', '你好', false);
    });

    // Simulate AI with thinking
    let messageId: string;
    act(() => {
      messageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });

    // Thinking content (like in the original bug screenshots)
    const thinkingContent =
      '> Reasoning:\n> \n> 首先,用户说了"你好",这是中文的"hello"。我需要用中文回复,因为用户用中文打招呼。';

    act(() => {
      result.current.updateMessageById(messageId!, thinkingContent, true);
    });

    // Add actual response
    const fullContent = `${thinkingContent}\n\n你好!我是你的智能AI助手,很高兴见到你。今天是2025年10月5日,有什么问题或需要帮助的吗?我会尽力提供准确、详细的答案。`;

    act(() => {
      result.current.updateMessageById(messageId!, fullContent, false);
    });

    // Verify content
    const msg = result.current.messages.find((m) => m.id === messageId!);
    expect(msg?.content).toBe(fullContent);
    expect(msg?.isStreaming).toBe(false);

    // Now simulate second question - this is where corruption would happen
    act(() => {
      result.current.addMessage('user', '程序员如何保护眼睛', false);
    });

    let secondMessageId: string;
    act(() => {
      secondMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
    });

    const secondThinking =
      '> Reasoning:\n> \n> 首先,用户的问题是"程序员如何保护眼睛",这是中文,翻译成"How do programmers protect their eyes"。';
    act(() => {
      result.current.updateMessageById(secondMessageId!, secondThinking, true);
    });

    // CRITICAL TEST: First message should NOT be replaced with second message's thinking
    const firstMsg = result.current.messages.find((m) => m.id === messageId!);
    expect(firstMsg?.content).toBe(fullContent);
    expect(firstMsg?.content).not.toContain('程序员如何保护眼睛');

    // Second message should have its own thinking
    const secondMsg = result.current.messages.find((m) => m.id === secondMessageId!);
    expect(secondMsg?.content).toBe(secondThinking);
  });

  it('should maintain correct message order and IDs throughout iterations', async () => {
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    const messageSnapshots: Array<{ id: string; content: string; role: string }> = [];

    const simulateIteration = async (text: string) => {
      if (assistantMessageId && streamedContent) {
        act(() => {
          result.current.updateMessageById(assistantMessageId, streamedContent, false);
        });
      }

      streamedContent = text;
      act(() => {
        assistantMessageId = result.current.addMessage('assistant', '', true, 'test-agent');
        result.current.updateMessageById(assistantMessageId, text, false);
      });
      return assistantMessageId;
    };

    act(() => {
      const userId = result.current.addMessage('user', 'Question 1', false);
      messageSnapshots.push({ id: userId, content: 'Question 1', role: 'user' });
    });

    const answer1Id = await simulateIteration('Answer 1');
    messageSnapshots.push({ id: answer1Id, content: 'Answer 1', role: 'assistant' });

    let toolCallId: string, toolResultId: string;
    act(() => {
      toolCallId = result.current.addMessage('assistant', [{ type: 'tool-call' }] as any, false);
      toolResultId = result.current.addMessage('tool', 'Tool result', false);
      messageSnapshots.push({ id: toolCallId, content: '[object Object]', role: 'assistant' });
      messageSnapshots.push({ id: toolResultId, content: 'Tool result', role: 'tool' });
    });

    const answer2Id = await simulateIteration('Answer 2');
    messageSnapshots.push({ id: answer2Id, content: 'Answer 2', role: 'assistant' });

    // Verify all snapshots match current messages
    for (let i = 0; i < messageSnapshots.length; i++) {
      expect(result.current.messages[i].id).toBe(messageSnapshots[i].id);
      expect(result.current.messages[i].role).toBe(messageSnapshots[i].role);
      if (typeof result.current.messages[i].content === 'string') {
        expect(result.current.messages[i].content).toBe(messageSnapshots[i].content);
      }
    }
  });
});
