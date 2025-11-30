// src/stores/plan-mode-store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { logger } from '@/lib/logger';
import { useSettingsStore } from './settings-store';

/**
 * Plan Mode Store
 *
 * Manages the state for Plan Mode functionality.
 * Plan Mode requires AI to create a plan and get user approval before executing modifications.
 */

export interface PlanReviewResult {
  action: 'approve this plan, please implement it' | 'reject this plan, do not implement it';
  editedPlan?: string; // If user edited the plan before approval
  feedback?: string; // If user rejected and provided feedback
}

interface PendingPlan {
  planId: string;
  content: string;
  timestamp: Date;
}

interface PlanModeState {
  /** Global plan mode toggle - affects all conversations */
  isPlanModeEnabled: boolean;

  /** Current plan waiting for user review */
  pendingPlan: PendingPlan | null;

  /** Function to resolve the Promise when user reviews the plan */
  planResolver: ((result: PlanReviewResult) => void) | null;

  /**
   * Initialize plan mode state from settings store
   */
  initialize: () => void;

  /**
   * Toggle plan mode on/off
   */
  togglePlanMode: () => void;

  /**
   * Set plan mode state
   */
  setPlanMode: (enabled: boolean) => void;

  /**
   * Set pending plan and resolver function
   * Called by ExitPlanMode tool's execute function
   */
  setPendingPlan: (plan: string, resolver: (result: PlanReviewResult) => void) => void;

  /**
   * Approve the current plan (optionally with edits)
   * Called by UI when user clicks Approve
   */
  approvePlan: (editedPlan?: string) => void;

  /**
   * Reject the current plan with optional feedback
   * Called by UI when user clicks Reject
   */
  rejectPlan: (feedback?: string) => void;

  /**
   * Clear pending plan and resolver
   */
  clearPendingPlan: () => void;
}

export const usePlanModeStore = create<PlanModeState>()(
  devtools(
    (set, get) => ({
      isPlanModeEnabled: false,
      pendingPlan: null,
      planResolver: null,

      initialize: () => {
        // Load initial state from settings store
        const settingsStore = useSettingsStore.getState();
        const isPlanModeEnabled = settingsStore.getPlanModeEnabled();

        logger.info('[PlanModeStore] Initializing from settings', {
          isPlanModeEnabled,
        });

        set({ isPlanModeEnabled }, false, 'initialize');
      },

      togglePlanMode: () => {
        const currentState = get().isPlanModeEnabled;
        const newState = !currentState;

        set({ isPlanModeEnabled: newState }, false, 'togglePlanMode');

        // Sync with settings store for persistence
        useSettingsStore
          .getState()
          .setPlanModeEnabled(newState)
          .catch((error) => {
            logger.error('[PlanModeStore] Failed to persist plan mode state:', error);
          });
      },

      setPlanMode: (enabled) => {
        logger.info('[PlanModeStore] Setting plan mode', { enabled });

        set({ isPlanModeEnabled: enabled }, false, 'setPlanMode');

        // Sync with settings store for persistence
        useSettingsStore
          .getState()
          .setPlanModeEnabled(enabled)
          .catch((error) => {
            logger.error('[PlanModeStore] Failed to persist plan mode state:', error);
          });
      },

      setPendingPlan: (plan, resolver) => {
        const planId = `plan_${Date.now()}`;

        logger.info('[PlanModeStore] Setting pending plan', {
          planId,
          planLength: plan.length,
          planPreview: plan.substring(0, 100),
        });

        set(
          {
            pendingPlan: {
              planId,
              content: plan,
              timestamp: new Date(),
            },
            planResolver: resolver,
          },
          false,
          'setPendingPlan'
        );
      },

      approvePlan: (editedPlan) => {
        const { pendingPlan, planResolver } = get();

        if (!pendingPlan) {
          logger.error('[PlanModeStore] No pending plan to approve');
          return;
        }

        logger.info('[PlanModeStore] Approving plan', {
          planId: pendingPlan.planId,
          wasEdited: !!editedPlan,
        });

        if (planResolver) {
          planResolver({
            action: 'approve this plan, please implement it',
            editedPlan,
          });

          // Exit plan mode after approval so AI can execute the plan
          logger.info('[PlanModeStore] Exiting plan mode after plan approval');

          // Clear state and disable plan mode after resolving
          set(
            {
              pendingPlan: null,
              planResolver: null,
              isPlanModeEnabled: false,
            },
            false,
            'approvePlan'
          );

          // Sync with settings store for persistence
          useSettingsStore
            .getState()
            .setPlanModeEnabled(false)
            .catch((error) => {
              logger.error(
                '[PlanModeStore] Failed to persist plan mode state after approval:',
                error
              );
            });
        } else {
          logger.error('[PlanModeStore] No resolver found when approving plan');
        }
      },

      rejectPlan: (feedback) => {
        const { pendingPlan, planResolver } = get();

        if (!pendingPlan) {
          logger.error('[PlanModeStore] No pending plan to reject');
          return;
        }

        logger.info('[PlanModeStore] Rejecting plan', {
          planId: pendingPlan.planId,
          hasFeedback: !!feedback,
          feedbackLength: feedback?.length || 0,
        });

        if (planResolver) {
          planResolver({
            action: 'reject this plan, do not implement it',
            feedback,
          });

          // Clear state after resolving
          set(
            {
              pendingPlan: null,
              planResolver: null,
            },
            false,
            'rejectPlan'
          );
        } else {
          logger.error('[PlanModeStore] No resolver found when rejecting plan');
        }
      },

      clearPendingPlan: () => {
        logger.info('[PlanModeStore] Clearing pending plan');

        set(
          {
            pendingPlan: null,
            planResolver: null,
          },
          false,
          'clearPendingPlan'
        );
      },
    }),
    {
      name: 'plan-mode-store',
      enabled: import.meta.env.DEV,
    }
  )
);
