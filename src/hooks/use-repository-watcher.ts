import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { logger } from '@/lib/logger';
import { fastDirectoryTreeService } from '@/services/fast-directory-tree-service';
import { useGitStore } from '@/stores/git-store';
import { useRepositoryStore } from '@/stores/repository-store';

/**
 * Hook to set up file system watching for the currently open repository
 * This should be called in components that need to monitor file system changes
 */
export function useRepositoryWatcher() {
  const rootPath = useRepositoryStore((state) => state.rootPath);
  const refreshFileTree = useRepositoryStore((state) => state.refreshFileTree);

  useEffect(() => {
    if (!rootPath) {
      return;
    }

    // Start file watching
    const startWatching = async () => {
      try {
        await invoke('start_file_watching', { path: rootPath });
        logger.info('File watching started for:', rootPath);
      } catch (error) {
        logger.error('Failed to start file watching:', error);
      }
    };

    startWatching();

    // Listen for file system changes
    const unlistenFileSystem = listen('file-system-changed', (event) => {
      // logger.info('File system changed:', event.payload);

      // Intelligently invalidate cache for changed paths
      const payload = event.payload as any;
      if (payload?.path) {
        fastDirectoryTreeService.invalidatePath(payload.path);

        // If the changed file is currently open, refresh its content
        const { openFiles, handleExternalFileChange } = useRepositoryStore.getState();
        const changedFilePath = payload.path;
        const isFileOpen = openFiles.some((file) => file.path === changedFilePath);
        if (isFileOpen) {
          setTimeout(() => {
            handleExternalFileChange(changedFilePath);
          }, 100);
        }
      }

      // Debounced refresh of file tree
      setTimeout(() => {
        refreshFileTree();
      }, 200);

      // Also refresh git status when working directory files change
      // This is needed because .git directory only changes on git add/commit,
      // but git status should reflect working directory changes immediately
      setTimeout(() => {
        useGitStore.getState().refreshStatus();
      }, 300);
    });

    // Listen for git status changes (from .git directory watcher)
    const unlistenGitStatus = listen('git-status-changed', () => {
      logger.info('Git status changed, refreshing...');

      // Debounced refresh of git status
      setTimeout(() => {
        useGitStore.getState().refreshStatus();
      }, 200);
    });

    return () => {
      unlistenFileSystem.then((fn) => fn());
      unlistenGitStatus.then((fn) => fn());
      invoke('stop_file_watching').catch(logger.error);
    };
  }, [rootPath, refreshFileTree]);
}
