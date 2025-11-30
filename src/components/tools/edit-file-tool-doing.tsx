import { useEffect, useState } from 'react';
import { FileEditReviewCard } from '@/components/tools/file-edit-review-card';
import { GenericToolDoing } from '@/components/tools/generic-tool-doing';
import { useEditReviewStore } from '@/stores/edit-review-store';

interface EditBlock {
  old_string: string;
  new_string: string;
  description?: string;
}

interface EditFileToolDoingProps {
  file_path: string;
  edits?: EditBlock[];
}

/**
 * Responsive wrapper component for edit-file-tool's renderToolDoing
 *
 * This component subscribes to the edit review store and automatically
 * switches between showing the inline review card (when a pending edit exists)
 * and the generic "doing" status (when no review is pending).
 *
 * Uses local state + useEffect to force re-renders when store changes
 */
export function EditFileToolDoing({ file_path, edits }: EditFileToolDoingProps) {
  // Subscribe to the store using the hook (reactive)
  const storePendingEdit = useEditReviewStore((state) => state.pendingEdit);
  const storeEditId = useEditReviewStore((state) => state.editId);

  // Use local state to ensure component re-renders when store updates
  const [pendingEdit, setPendingEdit] = useState(storePendingEdit);
  const [editId, setEditId] = useState(storeEditId);

  // Update local state when store changes
  useEffect(() => {
    setPendingEdit(storePendingEdit);
    setEditId(storeEditId);
  }, [storePendingEdit, storeEditId]);

  // Poll the store periodically as a fallback
  useEffect(() => {
    const interval = setInterval(() => {
      const currentPendingEdit = useEditReviewStore.getState().pendingEdit;
      const currentEditId = useEditReviewStore.getState().editId;

      if (currentPendingEdit !== pendingEdit || currentEditId !== editId) {
        setPendingEdit(currentPendingEdit);
        setEditId(currentEditId);
      }
    }, 100); // Check every 100ms

    return () => clearInterval(interval);
  }, [pendingEdit, editId]);

  // If there's a pending edit for this file, show the inline review card
  if (pendingEdit && editId && pendingEdit.filePath === file_path) {
    return <FileEditReviewCard editId={editId} pendingEdit={pendingEdit} />;
  }

  // Otherwise, show the generic "doing" status
  return (
    <GenericToolDoing
      operation="edit"
      filePath={file_path}
      details={edits && edits.length > 1 ? `Applying ${edits.length} edits` : undefined}
    />
  );
}
