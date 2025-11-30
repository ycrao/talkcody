// src/services/agents/message-filter.ts

import type { ReasoningPart } from '@ai-sdk/provider-utils';
import type { FilePart, ModelMessage, TextPart, ToolCallPart, ToolResultPart } from 'ai';
import { logger } from '@/lib/logger';

// Type for message content parts
type MessageContentPart = TextPart | FilePart | ToolCallPart | ToolResultPart | ReasoningPart;

/**
 * MessageFilter handles message optimization and filtering
 * to reduce token usage and improve performance
 */
export class MessageFilter {
  // Exploratory tools that can be filtered after initial discovery phase
  private readonly exploratoryTools = new Set(['globTool', 'listFiles', 'codeSearch']);

  /**
   * Main filtering entry point
   * Applies all filtering optimizations to messages
   */
  filterMessages(messages: ModelMessage[]): ModelMessage[] {
    const toolCallCount = this.countToolCalls(messages);

    logger.info(`Filtering messages: ${messages.length} messages, ${toolCallCount} tool calls`);

    let filteredMessages = messages;

    // Optimization 1: Remove duplicate file reads (always apply)
    filteredMessages = this.filterDuplicateFileReads(filteredMessages);

    // Optimization 2: Remove exploratory tools if we have enough tool calls
    if (toolCallCount > 20) {
      logger.info('Tool call count > 20, filtering exploratory tools');
      filteredMessages = this.filterExploratoryTools(filteredMessages);
    }

    const removedCount = messages.length - filteredMessages.length;
    if (removedCount > 0) {
      logger.info(`Filtered out ${removedCount} messages`);
    }

    return filteredMessages;
  }

  /**
   * Filter duplicate file reads, keeping only the most recent read for each file
   * Considers both file path and line range (start_line, line_count) when determining duplicates
   */
  filterDuplicateFileReads(messages: ModelMessage[]): ModelMessage[] {
    // Map to track the latest tool call index for each unique file read
    // Key format: "file_path:start_line:line_count"
    const fileReadMap = new Map<string, { callIndex: number; resultIndex: number }>();
    const indicesToRemove = new Set<number>();

    // First pass: identify all readFile tool calls and their results
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      if (!message) continue;

      if (message.role === 'assistant' && Array.isArray(message.content)) {
        const toolCall = message.content.find((c: MessageContentPart) => c.type === 'tool-call') as
          | ToolCallPart
          | undefined;
        if (toolCall && toolCall.type === 'tool-call' && toolCall.toolName === 'readFile') {
          const fileReadKey = this.extractFileReadKey(toolCall);
          if (fileReadKey) {
            // If we've seen this exact file read before (same path and line range), mark the old call and result for removal
            const previous = fileReadMap.get(fileReadKey);
            if (previous) {
              indicesToRemove.add(previous.callIndex);
              indicesToRemove.add(previous.resultIndex);
              logger.info(`Marking duplicate readFile for removal: ${fileReadKey}`);
            }

            // Find the corresponding tool result
            if (toolCall.toolCallId) {
              const resultIndex = this.findToolResultIndex(messages, toolCall.toolCallId, index);
              if (resultIndex !== -1) {
                fileReadMap.set(fileReadKey, { callIndex: index, resultIndex });
              }
            }
          }
        }
      }
    }

    // Second pass: filter out marked messages
    const filteredMessages = messages.filter((_, index) => !indicesToRemove.has(index));

    if (indicesToRemove.size > 0) {
      logger.info(`Filtered ${indicesToRemove.size} duplicate readFile messages`);
    }

    return filteredMessages;
  }

  /**
   * Filter exploratory tool calls when we have enough context
   * Only filters old exploratory tools, keeping recent ones in the protection window
   */
  filterExploratoryTools(messages: ModelMessage[]): ModelMessage[] {
    const indicesToRemove = new Set<number>();

    // Define a protection window for recent messages
    // Keep the last 10 messages intact to preserve recent context
    const protectionWindowSize = 20;
    const protectionThreshold = Math.max(0, messages.length - protectionWindowSize);

    logger.info(`Protection threshold: ${protectionThreshold}, total messages: ${messages.length}`);

    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      if (!message) continue;

      // Skip messages in the protection window (recent messages)
      if (index >= protectionThreshold) {
        continue;
      }

      if (message.role === 'assistant' && Array.isArray(message.content)) {
        const toolCall = message.content.find((c: MessageContentPart) => c.type === 'tool-call') as
          | ToolCallPart
          | undefined;
        if (
          toolCall &&
          toolCall.type === 'tool-call' &&
          this.isExploratoryTool(toolCall.toolName)
        ) {
          indicesToRemove.add(index);

          // Also remove the corresponding tool result
          const resultIndex = this.findToolResultIndex(messages, toolCall.toolCallId, index);
          if (resultIndex !== -1) {
            indicesToRemove.add(resultIndex);
          }

          logger.info(
            `Marking exploratory tool for removal: ${toolCall.toolName} at index ${index}`
          );
        }
      }
    }

    const filteredMessages = messages.filter((_, index) => !indicesToRemove.has(index));

    if (indicesToRemove.size > 0) {
      logger.info(`Filtered ${indicesToRemove.size} exploratory tool messages`);
    }

    return filteredMessages;
  }

  /**
   * Count total tool calls in messages
   */
  private countToolCalls(messages: ModelMessage[]): number {
    let count = 0;
    for (const message of messages) {
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        const hasToolCall = message.content.some((c: MessageContentPart) => c.type === 'tool-call');
        if (hasToolCall) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Extract file read key from readFile tool call
   * Returns a unique key that includes file path and line range (if specified)
   * Format: "file_path:start_line:line_count"
   * For full file reads (no line range): "file_path:full:full"
   */
  private extractFileReadKey(toolCall: ToolCallPart | undefined): string | null {
    if (!toolCall || toolCall.type !== 'tool-call') {
      return null;
    }
    try {
      // The input might be directly an object or need parsing
      const input =
        typeof toolCall.input === 'string' ? JSON.parse(toolCall.input) : toolCall.input;

      const filePath = input?.file_path || input?.filePath || input?.path;
      if (!filePath) {
        return null;
      }

      // Include start_line and line_count in the key to distinguish different read ranges
      const startLine = input?.start_line ?? 'full';
      const lineCount = input?.line_count ?? 'full';

      return `${filePath}:${startLine}:${lineCount}`;
    } catch (error) {
      logger.warn('Failed to extract file read key from tool call:', error);
      return null;
    }
  }

  /**
   * Check if a tool is exploratory
   */
  private isExploratoryTool(toolName: string): boolean {
    return this.exploratoryTools.has(toolName);
  }

  /**
   * Find the index of tool result message corresponding to a tool call
   */
  private findToolResultIndex(
    messages: ModelMessage[],
    toolCallId: string,
    startIndex: number
  ): number {
    // Search forward from the tool call to find its result
    for (let i = startIndex + 1; i < messages.length; i++) {
      const message = messages[i];
      if (!message) continue;

      if (message.role === 'tool' && Array.isArray(message.content)) {
        const toolResult = message.content.find(
          (c: MessageContentPart) => c.type === 'tool-result' && c.toolCallId === toolCallId
        );
        if (toolResult) {
          return i;
        }
      }
    }
    return -1;
  }
}
