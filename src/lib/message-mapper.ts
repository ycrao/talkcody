// src/lib/message-mapper.ts
// Utility functions for mapping stored messages to UI messages

import type { StoredMessage } from '@/services/database-service';
import type { UIMessage } from '@/types/agent';
import { logger } from './logger';

/**
 * Map a stored message to a UI message format
 * Handles tool messages by parsing their JSON content
 */
export function mapStoredToUIMessage(msg: StoredMessage): UIMessage {
  // For tool messages, parse the JSON content to restore tool message structure
  if (msg.role === 'tool') {
    try {
      const toolContent = JSON.parse(msg.content);
      return {
        id: msg.id,
        role: 'tool' as const,
        content: [toolContent], // Wrap in array to match ToolMessageContent[] format
        timestamp: new Date(msg.timestamp),
        isStreaming: false,
        assistantId: msg.assistant_id,
        toolCallId: toolContent.toolCallId,
        toolName: toolContent.toolName,
      };
    } catch {
      // If parsing fails, return as regular message
      logger.warn('Failed to parse tool message content:', msg.id);
      return {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        isStreaming: false,
        assistantId: msg.assistant_id,
        attachments: msg.attachments,
      };
    }
  }

  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp),
    isStreaming: false,
    assistantId: msg.assistant_id,
    attachments: msg.attachments,
  };
}

/**
 * Map a stored message to a simple UI message format (without tool parsing)
 * Used when tool content doesn't need special handling
 */
export function mapStoredToSimpleUIMessage(msg: StoredMessage): UIMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp),
    isStreaming: false,
    assistantId: msg.assistant_id,
    attachments: msg.attachments,
  };
}

/**
 * Map an array of stored messages to UI messages
 */
export function mapStoredMessagesToUI(messages: StoredMessage[]): UIMessage[] {
  return messages.map(mapStoredToUIMessage);
}

/**
 * Map an array of stored messages to simple UI messages
 */
export function mapStoredMessagesToSimpleUI(messages: StoredMessage[]): UIMessage[] {
  return messages.map(mapStoredToSimpleUIMessage);
}
