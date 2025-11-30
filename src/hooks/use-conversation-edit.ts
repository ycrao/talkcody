// src/hooks/use-conversation-edit.ts
// Hook for managing conversation title editing state

import { useCallback, useState } from 'react';
import { logger } from '@/lib/logger';
import { type Conversation, databaseService } from '@/services/database-service';

export interface UseConversationEditReturn {
  // Edit state
  editingId: string | null;
  editingTitle: string;
  error: string | null;

  // Edit operations
  startEditing: (conversation: Conversation, e?: React.MouseEvent) => void;
  finishEditing: (onSuccess?: () => Promise<void>) => Promise<void>;
  cancelEditing: () => void;
  setEditingTitle: (title: string) => void;

  // State setters
  setError: (error: string | null) => void;
}

export function useConversationEdit(): UseConversationEditReturn {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startEditing = useCallback((conversation: Conversation, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
    setError(null);
  }, []);

  const finishEditing = useCallback(
    async (onSuccess?: () => Promise<void>) => {
      if (!(editingId && editingTitle.trim())) return;

      try {
        setError(null);
        await databaseService.updateConversationTitle(editingId, editingTitle);
        if (onSuccess) {
          await onSuccess();
        }
        setEditingId(null);
        setEditingTitle('');
      } catch (err) {
        logger.error('Failed to update conversation title:', err);
        setError('Failed to update conversation title');
      }
    },
    [editingId, editingTitle]
  );

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditingTitle('');
    setError(null);
  }, []);

  return {
    editingId,
    editingTitle,
    error,
    startEditing,
    finishEditing,
    cancelEditing,
    setEditingTitle,
    setError,
  };
}
