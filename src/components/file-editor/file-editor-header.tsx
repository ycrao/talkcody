import { projectIndexer } from '@/services/project-indexer';
import { repositoryService } from '@/services/repository-service';
import { useRepositoryStore } from '@/stores/repository-store';
import type { AICompletionState } from '@/types/file-editor';
import { formatLastSavedTime } from '@/utils/monaco-utils';

interface FileEditorHeaderProps {
  filePath: string;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isAICompleting: boolean;
  currentAICompletion: AICompletionState | null;
  lastSavedTime: Date | null;
}

export function FileEditorHeader({
  filePath,
  hasUnsavedChanges,
  isSaving,
  isAICompleting,
  currentAICompletion,
  lastSavedTime,
}: FileEditorHeaderProps) {
  const fileName = repositoryService.getFileNameFromPath(filePath);
  const language = repositoryService.getLanguageFromExtension(fileName);
  // Subscribe to indexed state from store for automatic re-renders
  const isIndexed = useRepositoryStore((state) => state.indexedFiles.has(filePath));
  const isIndexable = projectIndexer.isSupported(language);

  return (
    <div className="flex-shrink-0 border-b bg-gray-50 px-4 py-2 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 truncate font-medium text-sm" title={filePath}>
            {fileName}
            {hasUnsavedChanges && (
              <span className="flex items-center gap-1">
                <span
                  className="h-2 w-2 animate-pulse rounded-full bg-orange-500"
                  title="Auto-saving..."
                />
                {isSaving && <span className="text-gray-500 text-xs">Saving...</span>}
              </span>
            )}
            {isAICompleting && (
              <span className="flex items-center gap-1">
                <span className="text-blue-500 text-xs">AI analyzing...</span>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </span>
            )}
            {currentAICompletion && (
              <span className="rounded bg-green-100 px-2 py-1 text-green-600 text-xs dark:bg-green-900 dark:text-green-400">
                AI suggestion (Tab to accept, Esc to dismiss)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className="truncate text-gray-500 text-xs">{filePath}</p>
            {lastSavedTime && !hasUnsavedChanges && (
              <span className="text-green-600 text-xs dark:text-green-400">
                Saved at {formatLastSavedTime(lastSavedTime)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-700">{language}</span>
          {isIndexable && (
            <span
              className={`rounded px-2 py-1 text-xs ${
                isIndexed
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              }`}
              title={isIndexed ? 'Code navigation enabled' : 'Not indexed yet'}
            >
              {isIndexed ? 'Indexed' : 'Not indexed'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
