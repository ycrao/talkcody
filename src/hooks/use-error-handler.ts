import { useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface ErrorHandlerOptions {
  showToast?: boolean;
  toastTitle?: string;
  logLevel?: 'error' | 'warn' | 'info';
}

export function useErrorHandler() {
  const handleError = useCallback(
    (error: unknown, context: string, options: ErrorHandlerOptions = {}): string => {
      const { showToast = true, toastTitle, logLevel = 'error' } = options;

      // Extract error message
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'An unknown error occurred';

      // Log error with context
      const logMessage = `[${context}] ${errorMessage}`;

      if (logLevel === 'error') {
        logger.error(logMessage, error);
      } else if (logLevel === 'warn') {
        logger.warn(logMessage, error);
      } else {
        logger.info(logMessage, error);
      }

      // Show toast notification if enabled
      if (showToast) {
        toast.error(toastTitle || `Error in ${context}`, {
          description: errorMessage,
        });
      }

      return errorMessage;
    },
    []
  );

  return { handleError };
}
