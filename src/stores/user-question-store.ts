// src/stores/user-question-store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { logger } from '@/lib/logger';
import type { AskUserQuestionsOutput, Question, QuestionAnswer } from '@/types/user-question';

/**
 * User Question Store
 *
 * Manages the state for AskUserQuestions tool.
 * Provides a mechanism to pause tool execution and wait for user input.
 */
interface UserQuestionState {
  /** Current questions waiting for user answers */
  pendingQuestions: Question[];

  /** Function to resolve the Promise when user submits answers */
  resolver: ((answers: AskUserQuestionsOutput) => void) | null;

  /**
   * Set pending questions and the resolver function
   * Called by the tool's execute function
   */
  setPendingQuestions: (
    questions: Question[],
    resolver: (answers: AskUserQuestionsOutput) => void
  ) => void;

  /**
   * Submit user's answers
   * Called by the UI component when user clicks submit
   */
  submitAnswers: (answers: AskUserQuestionsOutput) => void;

  /**
   * Clear pending questions and resolver
   */
  clearQuestions: () => void;
}

export const useUserQuestionStore = create<UserQuestionState>()(
  devtools(
    (set, get) => ({
      pendingQuestions: [],
      resolver: null,

      setPendingQuestions: (questions, resolver) => {
        logger.info('[UserQuestionStore] Setting pending questions', {
          questionCount: questions.length,
          questionIds: questions.map((q) => q.id),
        });

        set(
          {
            pendingQuestions: questions,
            resolver,
          },
          false,
          'setPendingQuestions'
        );
      },

      submitAnswers: (answers) => {
        const { resolver } = get();

        logger.info('[UserQuestionStore] Submitting answers', {
          answerCount: Object.keys(answers).length,
          questionIds: Object.keys(answers),
        });

        if (resolver) {
          resolver(answers);

          // Clear state after resolving
          set(
            {
              pendingQuestions: [],
              resolver: null,
            },
            false,
            'submitAnswers'
          );
        } else {
          logger.error('[UserQuestionStore] No resolver found when submitting answers');
        }
      },

      clearQuestions: () => {
        logger.info('[UserQuestionStore] Clearing questions');

        set(
          {
            pendingQuestions: [],
            resolver: null,
          },
          false,
          'clearQuestions'
        );
      },
    }),
    {
      name: 'user-question-store',
      enabled: import.meta.env.DEV,
    }
  )
);
