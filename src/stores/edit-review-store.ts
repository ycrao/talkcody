// src/stores/edit-review-store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { logger } from '@/lib/logger';

/**
 * Edit Review Store
 *
 * Manages the state for inline edit review functionality.
 * This store is used to display edit previews inline in the chat message
 * instead of in a popup dialog.
 */

// ============================================================================
// Types (moved from review-state-manager.ts)
// ============================================================================

export interface PendingEdit {
  id: string;
  filePath: string;
  originalContent: string;
  newContent: string;
  operation: 'edit' | 'write';
  timestamp: number;
  toolCallId?: string;
  metadata?: {
    editCount?: number;
    edits?: Array<{
      index: number;
      description: string;
      occurrences: number;
      matchType: string;
    }>;
  };
}

export interface ReviewResult {
  approved: boolean;
  feedback?: string;
}

export interface FileEditReviewResult {
  success: boolean;
  message: string;
  approved?: boolean;
  feedback?: string;
}

interface EditCallbacks {
  onApprove: () => Promise<{ success: boolean; message: string }>;
  onReject: (feedback: string) => Promise<{ success: boolean; message: string; feedback?: string }>;
  onAllowAll?: () => Promise<{ success: boolean; message: string }>;
}

// ============================================================================
// Store State and Actions
// ============================================================================

interface EditReviewState {
  /** Current edit waiting for user review */
  pendingEdit: PendingEdit | null;

  /** Unique ID for the pending edit */
  editId: string | null;

  /** Callbacks for the current edit */
  callbacks: EditCallbacks | null;

  /** Function to resolve the Promise when user reviews the edit */
  editResolver: ((result: FileEditReviewResult) => void) | null;

  /**
   * Set pending edit with all required data
   * Called by edit-file-tool's execute function
   */
  setPendingEdit: (
    editId: string,
    pendingEdit: PendingEdit,
    callbacks: EditCallbacks,
    resolver: (result: FileEditReviewResult) => void
  ) => void;

  /**
   * Approve the current edit
   * Executes the onApprove callback and resolves the Promise
   */
  approveEdit: () => Promise<void>;

  /**
   * Reject the current edit with feedback
   * Executes the onReject callback and resolves the Promise
   */
  rejectEdit: (feedback: string) => Promise<void>;

  /**
   * Allow all edits in this conversation
   * Executes the onAllowAll callback and resolves the Promise
   */
  allowAllEdit: () => Promise<void>;

  /**
   * Clear pending edit and resolver
   */
  clearPendingEdit: () => void;
}

export const useEditReviewStore = create<EditReviewState>()(
  devtools(
    (set, get) => ({
      pendingEdit: null,
      editId: null,
      callbacks: null,
      editResolver: null,

      setPendingEdit: (editId, pendingEdit, callbacks, resolver) => {
        logger.info('[EditReviewStore] Setting pending edit', {
          editId,
          filePath: pendingEdit.filePath,
          operation: pendingEdit.operation,
        });

        set(
          {
            editId,
            pendingEdit,
            callbacks,
            editResolver: resolver,
          },
          false,
          'setPendingEdit'
        );
      },

      approveEdit: async () => {
        const { editId, callbacks, editResolver } = get();

        if (!editId || !callbacks || !editResolver) {
          logger.error('[EditReviewStore] No pending edit to approve');
          throw new Error('No pending edit to approve');
        }

        logger.info('[EditReviewStore] Approving edit', { editId });

        try {
          // Execute the onApprove callback
          const result = await callbacks.onApprove();

          // Resolve the Promise with success result
          editResolver({
            success: true,
            message: result.message,
            approved: true,
          });

          // Clear state after resolving
          set(
            {
              pendingEdit: null,
              editId: null,
              callbacks: null,
              editResolver: null,
            },
            false,
            'approveEdit'
          );
        } catch (error) {
          logger.error('[EditReviewStore] Error approving edit:', error);

          // Resolve with error
          editResolver({
            success: false,
            message: `Failed to approve edit: ${error instanceof Error ? error.message : 'Unknown error'}`,
            approved: false,
          });

          // Clear state
          set(
            {
              pendingEdit: null,
              editId: null,
              callbacks: null,
              editResolver: null,
            },
            false,
            'approveEdit-error'
          );

          throw error;
        }
      },

      rejectEdit: async (feedback: string) => {
        const { editId, callbacks, editResolver } = get();

        if (!editId || !callbacks || !editResolver) {
          logger.error('[EditReviewStore] No pending edit to reject');
          throw new Error('No pending edit to reject');
        }

        logger.info('[EditReviewStore] Rejecting edit', { editId, feedback });

        try {
          // Execute the onReject callback
          const result = await callbacks.onReject(feedback);

          // Resolve the Promise with rejection result
          editResolver({
            success: true,
            message: result.message || `Edit rejected. Feedback: ${feedback}`,
            approved: false,
            feedback,
          });

          // Clear state after resolving
          set(
            {
              pendingEdit: null,
              editId: null,
              callbacks: null,
              editResolver: null,
            },
            false,
            'rejectEdit'
          );
        } catch (error) {
          logger.error('[EditReviewStore] Error rejecting edit:', error);

          // Resolve with error
          editResolver({
            success: false,
            message: `Failed to reject edit: ${error instanceof Error ? error.message : 'Unknown error'}`,
            approved: false,
          });

          // Clear state
          set(
            {
              pendingEdit: null,
              editId: null,
              callbacks: null,
              editResolver: null,
            },
            false,
            'rejectEdit-error'
          );

          throw error;
        }
      },

      allowAllEdit: async () => {
        const { editId, callbacks, editResolver } = get();

        if (!editId || !callbacks || !editResolver) {
          logger.error('[EditReviewStore] No pending edit to allow all');
          throw new Error('No pending edit to allow all');
        }

        if (!callbacks.onAllowAll) {
          logger.error('[EditReviewStore] No onAllowAll callback registered');
          throw new Error('No onAllowAll callback registered');
        }

        logger.info('[EditReviewStore] Allowing all edits', { editId });

        try {
          // Execute the onAllowAll callback
          const result = await callbacks.onAllowAll();

          // Resolve the Promise with success result
          editResolver({
            success: true,
            message: result.message,
            approved: true,
          });

          // Clear state after resolving
          set(
            {
              pendingEdit: null,
              editId: null,
              callbacks: null,
              editResolver: null,
            },
            false,
            'allowAllEdit'
          );
        } catch (error) {
          logger.error('[EditReviewStore] Error allowing all edits:', error);

          // Resolve with error
          editResolver({
            success: false,
            message: `Failed to allow all edits: ${error instanceof Error ? error.message : 'Unknown error'}`,
            approved: false,
          });

          // Clear state
          set(
            {
              pendingEdit: null,
              editId: null,
              callbacks: null,
              editResolver: null,
            },
            false,
            'allowAllEdit-error'
          );

          throw error;
        }
      },

      clearPendingEdit: () => {
        logger.info('[EditReviewStore] Clearing pending edit');

        set(
          {
            pendingEdit: null,
            editId: null,
            callbacks: null,
            editResolver: null,
          },
          false,
          'clearPendingEdit'
        );
      },
    }),
    {
      name: 'edit-review-store',
      enabled: import.meta.env.DEV,
    }
  )
);
