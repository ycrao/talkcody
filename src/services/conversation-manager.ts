// src/services/conversation-manager.ts

import { logger } from '@/lib/logger';
import { generateConversationTitle, generateId } from '@/lib/utils';
import { databaseService, type StoredMessage } from '@/services/database-service';
import { settingsManager } from '@/stores/settings-store';
import type { MessageAttachment, UIMessage } from '@/types/agent';
import { aiConversationTitleService } from './ai-conversation-title-service';
// Conversation mode removed - users directly select agents now

/**
 * ConversationManager - Provides a unified interface for conversation operations for the service layer
 * This class encapsulates all conversation-related database operations and can be used directly by service classes
 */
export class ConversationManager {
  private constructor() {}

  /**
   * Create new conversation
   */
  static async createConversation(userInput: string, projectId?: string): Promise<string> {
    const title = generateConversationTitle(userInput);
    const conversationId = generateId();
    const currentProject = projectId || (await settingsManager.getProject());

    await databaseService.createConversation(title, conversationId, currentProject);

    return conversationId;
  }

  /**
   * Save message
   */
  static async saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    positionIndex = 0,
    assistantId?: string,
    attachments?: MessageAttachment[]
  ): Promise<string> {
    return await databaseService.saveMessage(
      conversationId,
      role,
      content,
      positionIndex,
      assistantId,
      attachments
    );
  }

  /**
   * Get all messages for conversation
   */
  static async getConversationHistory(conversationId: string): Promise<UIMessage[]> {
    const storedMessages = await databaseService.getMessages(conversationId);
    return storedMessages.map((msg: StoredMessage) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp),
      isStreaming: false,
      assistantId: msg.assistant_id,
      attachments: msg.attachments,
    }));
  }

  /**
   * Get conversation details
   */
  static async getConversationDetails(conversationId: string) {
    return await databaseService.getConversationDetails(conversationId);
  }

  /**
   * Update conversation usage statistics
   */
  static async updateConversationUsage(
    conversationId: string,
    cost: number,
    inputToken: number,
    outputToken: number
  ): Promise<void> {
    await databaseService.updateConversationUsage(conversationId, cost, inputToken, outputToken);
  }

  /**
   * Delete conversation
   */
  static async deleteConversation(conversationId: string): Promise<void> {
    await databaseService.deleteConversation(conversationId);
  }

  /**
   * Update conversation title
   */
  static async updateConversationTitle(conversationId: string, title: string): Promise<void> {
    await databaseService.updateConversationTitle(conversationId, title);
  }

  /**
   * Get latest user message content
   */
  static async getLatestUserMessageContent(): Promise<string | null> {
    const conversationId = settingsManager.getCurrentConversationId();
    return await databaseService.getLatestUserMessageContent(conversationId);
  }

  /**
   * Update conversation settings
   */
  static async updateConversationSettings(conversationId: string, settings: string): Promise<void> {
    await databaseService.updateConversationSettings(conversationId, settings);
  }

  /**
   * Get conversation settings
   */
  static async getConversationSettings(conversationId: string): Promise<string | null> {
    return await databaseService.getConversationSettings(conversationId);
  }

  /**
   * Generate AI title for conversation and update it asynchronously
   * This method is fire-and-forget - it runs in the background without blocking
   */
  static async generateAndUpdateTitle(conversationId: string, userInput: string): Promise<void> {
    try {
      logger.info('Generating AI title for conversation:', conversationId);

      const result = await aiConversationTitleService.generateTitle(userInput);

      if (result && result.title) {
        await ConversationManager.updateConversationTitle(conversationId, result.title);
        logger.info('AI title updated successfully:', result.title);
      } else {
        logger.warn('AI title generation returned no result, keeping fallback title');
      }
    } catch (error) {
      logger.error('Failed to generate/update AI title:', error);
      // Silently fail - the fallback title is already in place
    }
  }
}
