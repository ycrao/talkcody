import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTO_SAVE_DELAY, TYPING_TIMEOUT } from '@/constants/editor';
import { logger } from '@/lib/logger';
import { repositoryService } from '@/services/repository-service';

interface UseFileEditorStateProps {
  filePath: string | null;
  fileContent: string | null;
  onFileSaved?: (filePath: string) => void;
  isAICompleting?: boolean;
  currentAICompletion?: any;
  onContentChange?: (content: string) => void;
}

export function useFileEditorState({
  filePath,
  fileContent,
  onFileSaved,
  isAICompleting = false,
  currentAICompletion,
  onContentChange,
}: UseFileEditorStateProps) {
  const [currentContent, setCurrentContent] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [isUserTyping, setIsUserTyping] = useState(false);

  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userActionRef = useRef<boolean>(false);
  const currentFilePathRef = useRef<string | null>(filePath);
  const isSwitchingFilesRef = useRef<boolean>(false);

  const saveFileInternal = useCallback(
    async (filePathToSave: string, content: string) => {
      if (!filePathToSave || isSaving) return;

      setIsSaving(true);
      try {
        await repositoryService.writeFile(filePathToSave, content);
        if (filePathToSave === filePath) {
          setHasUnsavedChanges(false);
          setLastSavedTime(new Date());
        }

        if (onFileSaved) {
          onFileSaved(filePathToSave);
        }
      } catch (error) {
        logger.error('Error saving file:', error);
      } finally {
        setIsSaving(false);
      }
    },
    [filePath, onFileSaved, isSaving]
  );

  const scheduleAutoSave = useCallback(
    (filePathToSave: string, content: string) => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      const shouldDelayAutoSave = (): boolean => {
        return isUserTyping || isAICompleting || userActionRef.current || !!currentAICompletion;
      };

      const attemptAutoSave = () => {
        if (shouldDelayAutoSave()) {
          autoSaveTimeoutRef.current = setTimeout(attemptAutoSave, 1000);
          return;
        }
        saveFileInternal(filePathToSave, content);
      };

      autoSaveTimeoutRef.current = setTimeout(attemptAutoSave, AUTO_SAVE_DELAY);
    },
    [saveFileInternal, isUserTyping, isAICompleting, currentAICompletion]
  );

  const markUserTyping = useCallback(() => {
    setIsUserTyping(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsUserTyping(false);
    }, TYPING_TIMEOUT);
  }, []);

  const handleContentChange = useCallback(
    (value: string | undefined) => {
      const newContent = value || '';
      setCurrentContent(newContent);

      // Only mark as typing if this wasn't our own programmatic change
      if (!userActionRef.current) {
        markUserTyping();
      }

      const hasChanges = newContent !== fileContent;
      setHasUnsavedChanges(hasChanges);

      // Call external content change callback if provided
      if (onContentChange && !userActionRef.current) {
        onContentChange(newContent);
      }

      if (hasChanges && filePath && !userActionRef.current) {
        scheduleAutoSave(filePath, newContent);
      }
    },
    [fileContent, filePath, scheduleAutoSave, markUserTyping, onContentChange]
  );

  const handleContentChangeWithCallback = useCallback(
    (value: string | undefined) => {
      const newContent = value || '';
      setCurrentContent(newContent);

      // Only mark as typing if this wasn't our own programmatic change
      if (!userActionRef.current) {
        markUserTyping();
      }

      const hasChanges = newContent !== fileContent;
      setHasUnsavedChanges(hasChanges);

      // Always call external content change callback if provided
      if (onContentChange) {
        onContentChange(newContent);
      }

      if (hasChanges && filePath && !userActionRef.current) {
        scheduleAutoSave(filePath, newContent);
      }
    },
    [fileContent, filePath, scheduleAutoSave, markUserTyping, onContentChange]
  );

  const setUserAction = useCallback((isUserAction: boolean) => {
    userActionRef.current = isUserAction;
  }, []);

  const cleanup = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  // Reset state when file path changes
  useEffect(() => {
    const previousFilePath = currentFilePathRef.current;

    // If file path is actually changing (not initial render)
    if (previousFilePath && previousFilePath !== filePath) {
      // Mark that we're switching files
      isSwitchingFilesRef.current = true;

      // Save any pending changes for the previous file
      if (hasUnsavedChanges && currentContent) {
        saveFileInternal(previousFilePath, currentContent);
      }
      // Clear any scheduled saves to prevent saving to wrong file
      cleanup();

      // Reset the flag after a short delay
      setTimeout(() => {
        isSwitchingFilesRef.current = false;
      }, 0);
    }

    // Update the ref to the new file path
    currentFilePathRef.current = filePath;
  }, [filePath, hasUnsavedChanges, currentContent, saveFileInternal, cleanup]);

  // Reset state when file content changes (file loaded)
  useEffect(() => {
    if (fileContent !== null) {
      setCurrentContent(fileContent);
      setHasUnsavedChanges(false);
      setLastSavedTime(null);
      userActionRef.current = false;
    } else {
      setCurrentContent('');
      setHasUnsavedChanges(false);
      setLastSavedTime(null);
      userActionRef.current = false;
    }
  }, [fileContent]);

  // Save on component unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      // Don't save if we're just switching files (already handled in file switch effect)
      if (
        !isSwitchingFilesRef.current &&
        hasUnsavedChanges &&
        currentFilePathRef.current &&
        currentContent
      ) {
        // Use a synchronous approach for cleanup saves
        repositoryService
          .writeFile(currentFilePathRef.current, currentContent)
          .catch((err) => logger.error('Auto-save error:', err));
      }
    };
    // We want the cleanup to use the latest values, so we include all deps
  }, [hasUnsavedChanges, currentContent]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    currentContent,
    hasUnsavedChanges,
    isSaving,
    lastSavedTime,
    isUserTyping,
    handleContentChange,
    setUserAction,
    handleContentChangeWithCallback,
    saveFileInternal,
    cleanup,
  };
}
