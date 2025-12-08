// src/hooks/use-messages.ts
/**
 * useMessages hook - Interface to MessagesStore
 *
 * This hook provides a React-friendly interface to the MessagesStore.
 * All message state is now centralized in the store, enabling:
 * - Fast conversation switching (no re-fetch needed)
 * - State derivation instead of synchronization
 * - Messages persist across conversation switches
 */

import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMessagesStore } from '@/stores/messages-store';
import type { MessageAttachment, UIMessage } from '@/types/agent';

export function useMessages(conversationId?: string) {
  // Get messages from store (reactive)
  const messages = useMessagesStore(
    useShallow((state) => (conversationId ? state.getMessages(conversationId) : []))
  );

  // Get store actions
  const store = useMessagesStore.getState();

  const addMessage = useCallback(
    (
      role: 'user' | 'assistant' | 'tool',
      content: string | unknown,
      isStreaming = false,
      assistantId?: string,
      attachments?: MessageAttachment[],
      id?: string,
      toolCallId?: string,
      toolName?: string,
      nestedTools?: UIMessage[],
      renderDoingUI?: boolean
    ) => {
      if (!conversationId) return '';
      return store.addMessage(conversationId, role, content, {
        isStreaming,
        assistantId,
        attachments,
        id,
        toolCallId,
        toolName,
        nestedTools,
        renderDoingUI,
      });
    },
    [conversationId, store]
  );

  const updateMessageById = useCallback(
    (
      messageId: string,
      content: string,
      isStreaming = false,
      attachments?: MessageAttachment[]
    ) => {
      if (!conversationId) return;
      if (attachments) {
        store.updateMessage(conversationId, messageId, { content, isStreaming, attachments });
      } else {
        store.updateMessageContent(conversationId, messageId, content, isStreaming);
      }
    },
    [conversationId, store]
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      if (!conversationId) return;
      store.deleteMessage(conversationId, messageId);
    },
    [conversationId, store]
  );

  const editMessage = useCallback(
    (messageId: string, newContent: string) => {
      if (!conversationId) return;
      store.updateMessage(conversationId, messageId, { content: newContent });
    },
    [conversationId, store]
  );

  const deleteMessagesFromIndex = useCallback(
    (index: number) => {
      if (!conversationId) return;
      store.deleteMessagesFromIndex(conversationId, index);
    },
    [conversationId, store]
  );

  const clearMessages = useCallback(() => {
    if (!conversationId) return;
    store.clearMessages(conversationId);
  }, [conversationId, store]);

  const stopStreaming = useCallback(() => {
    if (!conversationId) return;
    store.stopStreaming(conversationId);
  }, [conversationId, store]);

  const setMessagesFromHistory = useCallback(
    (historyMessages: UIMessage[]) => {
      if (!conversationId) return;
      store.setMessages(conversationId, historyMessages);
    },
    [conversationId, store]
  );

  const findMessageIndex = useCallback(
    (messageId: string) => {
      if (!conversationId) return -1;
      return store.findMessageIndex(conversationId, messageId);
    },
    [conversationId, store]
  );

  const getLastUserMessage = useCallback(() => {
    if (!conversationId) return null;
    return store.getLastUserMessage(conversationId);
  }, [conversationId, store]);

  const addAttachmentToMessage = useCallback(
    (messageId: string, attachment: MessageAttachment) => {
      if (!conversationId) return;
      store.addAttachmentToMessage(conversationId, messageId, attachment);
    },
    [conversationId, store]
  );

  const updateMessageWithNestedTool = useCallback(
    (parentToolCallId: string, nestedMessage: UIMessage) => {
      if (!conversationId) return;
      store.updateMessageWithNestedTool(conversationId, parentToolCallId, nestedMessage);
    },
    [conversationId, store]
  );

  return useMemo(
    () => ({
      messages,
      addMessage,
      updateMessageById,
      deleteMessage,
      editMessage,
      deleteMessagesFromIndex,
      clearMessages,
      stopStreaming,
      setMessagesFromHistory,
      findMessageIndex,
      getLastUserMessage,
      addAttachmentToMessage,
      updateMessageWithNestedTool,
    }),
    [
      messages,
      addMessage,
      updateMessageById,
      deleteMessage,
      editMessage,
      deleteMessagesFromIndex,
      clearMessages,
      stopStreaming,
      setMessagesFromHistory,
      findMessageIndex,
      getLastUserMessage,
      addAttachmentToMessage,
      updateMessageWithNestedTool,
    ]
  );
}
