// src/hooks/use-conversation-list.ts
// Hook for managing conversation list CRUD operations

import { ask } from '@tauri-apps/plugin-dialog';
import { useCallback, useState } from 'react';
import { logger } from '@/lib/logger';
import { generateConversationTitle, generateId } from '@/lib/utils';
import { type Conversation, databaseService } from '@/services/database-service';
import { settingsManager } from '@/stores/settings-store';

export interface UseConversationListReturn {
  // State
  conversations: Conversation[];
  currentConversationId: string | undefined;
  loading: boolean;
  error: string | null;

  // Conversation CRUD
  createConversation: (userMessage: string, projectId?: string) => Promise<string>;
  loadConversations: (projectId?: string) => Promise<void>;
  getConversationDetails: (conversationId: string) => Promise<Conversation | null>;
  deleteConversation: (conversationId: string, e?: React.MouseEvent) => Promise<void>;
  updateConversationTitle: (conversationId: string, title: string) => Promise<void>;

  // Navigation and state management
  selectConversation: (conversationId: string) => void;
  startNewChat: () => void;
  clearConversation: () => void;
  setCurrentConversationId: (conversationId: string | undefined) => void;

  // State setters
  setError: (error: string | null) => void;
}

export function useConversationList(
  initialConversationId?: string,
  onConversationStart?: (conversationId: string, title: string) => void
): UseConversationListReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(
    initialConversationId
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createConversation = useCallback(
    async (userMessage: string, projectId?: string) => {
      try {
        const title = generateConversationTitle(userMessage);
        const activeConversationId = generateId();
        const currentProject = projectId || (await settingsManager.getProject());

        await databaseService.createConversation(title, activeConversationId, currentProject);

        setCurrentConversationId(activeConversationId);
        setError(null);
        onConversationStart?.(activeConversationId, title);
        return activeConversationId;
      } catch (err) {
        logger.error('Failed to create conversation:', err);
        setError('Failed to create conversation');
        throw err;
      }
    },
    [onConversationStart]
  );

  const loadConversations = useCallback(async (projectId?: string) => {
    try {
      setLoading(true);
      setError(null);
      const conversationList = projectId
        ? await databaseService.getConversations(projectId)
        : await databaseService.getConversations();
      setConversations(conversationList);
    } catch (err) {
      logger.error('Failed to load conversations:', err);
      setError('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  const getConversationDetails = useCallback(
    async (conversationId: string): Promise<Conversation | null> => {
      try {
        setError(null);
        return await databaseService.getConversationDetails(conversationId);
      } catch (err) {
        logger.error('Failed to get conversation details:', err);
        setError('Failed to get conversation details');
        return null;
      }
    },
    []
  );

  const deleteConversation = useCallback(
    async (conversationId: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();

      try {
        const userConfirmed = await ask('Are you sure you want to delete this conversation?', {
          title: 'Delete Conversation',
          kind: 'warning',
        });

        if (!userConfirmed) return;

        setError(null);
        await databaseService.deleteConversation(conversationId);
        await loadConversations();

        if (conversationId === currentConversationId) {
          setCurrentConversationId(undefined);
        }
      } catch (err) {
        logger.error('Failed to delete conversation:', err);
        setError('Failed to delete conversation');
      }
    },
    [currentConversationId, loadConversations]
  );

  const updateConversationTitle = useCallback(
    async (conversationId: string, title: string) => {
      try {
        setError(null);
        await databaseService.updateConversationTitle(conversationId, title);
        await loadConversations();
      } catch (err) {
        logger.error('Failed to update conversation title:', err);
        setError('Failed to update conversation title');
      }
    },
    [loadConversations]
  );

  const selectConversation = useCallback((conversationId: string) => {
    setCurrentConversationId(conversationId);
    settingsManager.setCurrentConversationId(conversationId);
    setError(null);
  }, []);

  const startNewChat = useCallback(() => {
    setCurrentConversationId(undefined);
    setError(null);
  }, []);

  const clearConversation = useCallback(() => {
    setCurrentConversationId(undefined);
    setError(null);
  }, []);

  return {
    conversations,
    currentConversationId,
    loading,
    error,
    createConversation,
    loadConversations,
    getConversationDetails,
    deleteConversation,
    updateConversationTitle,
    selectConversation,
    startNewChat,
    clearConversation,
    setCurrentConversationId,
    setError,
  };
}
