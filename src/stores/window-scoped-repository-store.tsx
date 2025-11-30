import type React from 'react';
import { createContext, useContext, useRef } from 'react';
import { toast } from 'sonner';
import { createStore, useStore } from 'zustand';
import { logger } from '@/lib/logger';
import { databaseService } from '@/services/database-service';
import { fastDirectoryTreeService } from '@/services/fast-directory-tree-service';
import { repositoryService } from '@/services/repository-service';
import { WindowManagerService } from '@/services/window-manager-service';
import { WindowRestoreService } from '@/services/window-restore-service';
import { settingsManager } from '@/stores/settings-store';
import type {
  FileNode,
  IndexingProgress,
  LoadingPhase,
  OpenFile,
  RepositoryState,
} from '@/types/file-system';

interface RepositoryActions {
  // Actions
  openRepository: (path: string, projectId: string) => Promise<void>;
  selectRepository: () => Promise<{ id: string; name: string } | null>;
  setLoadingPhase: (phase: LoadingPhase) => void;
  setIndexingProgress: (progress: IndexingProgress | null) => void;
  selectFile: (filePath: string, lineNumber?: number) => Promise<void>;
  switchToTab: (index: number) => Promise<void>;
  closeTab: (index: number) => void;
  closeOthers: (keepIndex: number) => void;
  closeAllFiles: () => void;
  updateFileContent: (filePath: string, content: string, hasUnsavedChanges?: boolean) => void;
  saveFile: (filePath: string, content: string) => Promise<void>;
  searchFiles: (query: string) => Promise<FileNode[]>;
  createFile: (parentPath: string, fileName: string, isDirectory: boolean) => Promise<void>;
  renameFile: (oldPath: string, newName: string) => Promise<void>;
  closeRepository: () => void;
  refreshFile: (filePath: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  loadDirectoryChildren: (node: FileNode) => Promise<FileNode[]>;
  updateNodeInTree: (tree: FileNode, targetPath: string, updatedNode: FileNode) => FileNode;
  findNodeByPath: (tree: FileNode, targetPath: string) => FileNode | null;
  expandToFile: (filePath: string) => Promise<void>;
  toggleExpansion: (path: string) => void;
  getFileLanguage: (filename: string) => string;
  getCacheSize: () => number;
}

type RepositoryStore = RepositoryState & RepositoryActions;

// Store factory function for creating window-scoped stores
function createRepositoryStore() {
  return createStore<RepositoryStore>((set, get) => ({
    // Initial state
    rootPath: null,
    fileTree: null,
    openFiles: [],
    activeFileIndex: -1,
    isLoading: false,
    error: null,
    expandedPaths: new Set<string>(),
    selectedFilePath: null,
    loadingPhase: 'idle',
    indexingProgress: null,

    // Loading phase setter
    setLoadingPhase: (phase: LoadingPhase) => set({ loadingPhase: phase }),

    // Indexing progress setter
    setIndexingProgress: (progress: IndexingProgress | null) => set({ indexingProgress: progress }),

    // Helper function to update a node in the file tree
    updateNodeInTree: (tree: FileNode, targetPath: string, updatedNode: FileNode): FileNode => {
      if (tree.path === targetPath) {
        return updatedNode;
      }

      if (tree.children) {
        return {
          ...tree,
          children: tree.children.map((child) =>
            get().updateNodeInTree(child, targetPath, updatedNode)
          ),
        };
      }

      return tree;
    },

    // Helper function to find a node by path in the file tree
    findNodeByPath: (tree: FileNode, targetPath: string): FileNode | null => {
      if (tree.path === targetPath) {
        return tree;
      }

      if (tree.children) {
        for (const child of tree.children) {
          const found = get().findNodeByPath(child, targetPath);
          if (found) {
            return found;
          }
        }
      }

      return null;
    },

    // Load children for a lazy-loaded directory node
    loadDirectoryChildren: async (node: FileNode): Promise<FileNode[]> => {
      if (!(node.is_directory && node.is_lazy_loaded)) {
        return node.children || [];
      }

      try {
        set({ isLoading: true });

        const children = await fastDirectoryTreeService.loadDirectoryChildren(node.path);

        // Update the file tree with loaded children
        set((state) => ({
          fileTree: state.fileTree
            ? get().updateNodeInTree(state.fileTree, node.path, {
                ...node,
                children,
                is_lazy_loaded: false,
              })
            : null,
          isLoading: false,
        }));

        return children;
      } catch (error) {
        logger.error('Failed to load directory children:', error);
        set({ isLoading: false });
        toast.error('Failed to load directory contents');
        return node.children || [];
      }
    },

    // Open a repository
    openRepository: async (path: string, projectId: string) => {
      // Skip if already opening or already opened the same path
      const currentState = get();
      if (currentState.rootPath === path) {
        return;
      }
      if (currentState.isLoading) {
        return;
      }

      set({ isLoading: true, error: null });

      try {
        const fileTree = await repositoryService.buildDirectoryTree(path);
        settingsManager.setCurrentRootPath(path);

        // Set the project if provided
        if (projectId) {
          await settingsManager.setCurrentProjectId(projectId);
        }

        set({
          rootPath: path,
          fileTree,
          openFiles: [],
          activeFileIndex: -1,
          isLoading: false,
        });

        // Update window project info in backend
        try {
          const windowLabel = await WindowManagerService.getCurrentWindowLabel();
          await WindowManagerService.updateWindowProject(windowLabel, projectId, path);
        } catch (error) {
          logger.error('Failed to update window project:', error);
        }

        // Save window state for restoration
        try {
          await WindowRestoreService.saveCurrentWindowState(projectId, path);
        } catch (error) {
          logger.error('Failed to save window state:', error);
        }

        toast.success('Repository opened successfully');
      } catch (error) {
        const errorMessage = (error as Error).message;
        set({
          error: errorMessage,
          isLoading: false,
        });

        toast.error(`Failed to open repository: ${errorMessage}`);
        throw error;
      }
    },

    // Select a repository folder
    selectRepository: async () => {
      set({ isLoading: true, error: null });

      try {
        const path = await repositoryService.selectRepositoryFolder();

        if (!path) {
          set({ isLoading: false });
          return null;
        }

        const project = await databaseService.createOrGetProjectForRepository(path);
        await get().openRepository(path, project.id);
        return project;
      } catch (_error) {
        // Error handling is done in openRepository
        return null;
      }
    },

    // Select a file to open
    selectFile: async (filePath: string, lineNumber?: number) => {
      const { openFiles, expandToFile } = get();

      // Expand file tree to show the selected file
      await expandToFile(filePath);

      // Check if file is already open
      const existingIndex = openFiles.findIndex((file) => file.path === filePath);
      if (existingIndex !== -1) {
        // File is already open, just switch to it and update line number
        set({
          activeFileIndex: existingIndex,
          openFiles: openFiles.map((file, index) =>
            index === existingIndex ? { ...file, lineNumber } : file
          ),
        });
        return;
      }

      // File is not open, add it to open files
      const newFile: OpenFile = {
        path: filePath,
        content: null,
        isLoading: true,
        error: null,
        lineNumber,
      };

      set((state) => ({
        openFiles: [...state.openFiles, newFile],
        activeFileIndex: state.openFiles.length,
        isLoading: true,
        error: null,
      }));

      try {
        const content = await repositoryService.readFileWithCache(filePath);

        set((state) => ({
          openFiles: state.openFiles.map((file, index) =>
            index === state.openFiles.length - 1 ? { ...file, content, isLoading: false } : file
          ),
          isLoading: false,
        }));
      } catch (error) {
        const errorMessage = (error as Error).message;
        set((state) => ({
          openFiles: state.openFiles.map((file, index) =>
            index === state.openFiles.length - 1
              ? { ...file, error: errorMessage, isLoading: false }
              : file
          ),
          isLoading: false,
        }));

        toast.error(`Failed to read file: ${errorMessage}`);
      }
    },

    // Switch to a tab
    switchToTab: async (index: number) => {
      const { openFiles, expandToFile } = get();
      if (index >= 0 && index < openFiles.length) {
        const file = openFiles[index];
        if (file) {
          await expandToFile(file.path);
          set({ activeFileIndex: index });
        }
      }
    },

    // Close a tab
    closeTab: (index: number) => {
      set((state) => {
        const newOpenFiles = state.openFiles.filter((_, i) => i !== index);
        let newActiveIndex = state.activeFileIndex;

        if (newOpenFiles.length === 0) {
          newActiveIndex = -1;
        } else if (index <= state.activeFileIndex) {
          newActiveIndex = Math.max(0, state.activeFileIndex - 1);
        }

        return {
          openFiles: newOpenFiles,
          activeFileIndex: newActiveIndex,
        };
      });
    },

    // Close all tabs except the specified one
    closeOthers: (keepIndex: number) => {
      set((state) => {
        if (keepIndex < 0 || keepIndex >= state.openFiles.length) {
          return state;
        }

        const fileToKeep = state.openFiles[keepIndex];
        if (!fileToKeep) {
          return state;
        }

        return {
          openFiles: [fileToKeep],
          activeFileIndex: 0,
        };
      });
    },

    // Close all files
    closeAllFiles: () => {
      set({
        openFiles: [],
        activeFileIndex: -1,
      });
    },

    // Update file content
    updateFileContent: (filePath: string, content: string, hasUnsavedChanges = false) => {
      set((state) => ({
        openFiles: state.openFiles.map((file) =>
          file.path === filePath ? { ...file, content, hasUnsavedChanges } : file
        ),
      }));
    },

    // Save a file
    saveFile: async (filePath: string, content: string) => {
      try {
        await repositoryService.writeFile(filePath, content);

        set((state) => ({
          openFiles: state.openFiles.map((file) =>
            file.path === filePath ? { ...file, content, hasUnsavedChanges: false } : file
          ),
        }));

        toast.success(`File saved: ${repositoryService.getFileNameFromPath(filePath)}`);
      } catch (error) {
        const errorMessage = (error as Error).message;
        logger.error('Failed to save file:', error);
        toast.error(`Failed to save file: ${errorMessage}`);
        throw error;
      }
    },

    // Search files
    searchFiles: async (query: string): Promise<FileNode[]> => {
      const { rootPath } = get();
      if (!(rootPath && query.trim())) {
        return [];
      }

      try {
        return await repositoryService.searchFiles(rootPath, query);
      } catch (error) {
        logger.error('Search failed:', error);
        toast.error('Search failed');
        return [];
      }
    },

    // Create a file or directory
    createFile: async (parentPath: string, fileName: string, isDirectory: boolean) => {
      const { rootPath, refreshFileTree } = get();
      if (!rootPath) return;

      try {
        await repositoryService.createFile(parentPath, fileName, isDirectory);
        // Refresh file tree to show the new item
        await refreshFileTree();
      } catch (error) {
        logger.error('Failed to create file/directory:', error);
        throw error;
      }
    },

    // Rename a file or directory
    renameFile: async (oldPath: string, newName: string) => {
      const { rootPath, refreshFileTree } = get();
      if (!rootPath) return;

      try {
        await repositoryService.renameFile(oldPath, newName);
        // If the renamed file is open, update its path
        set((state) => ({
          openFiles: state.openFiles.map((file) =>
            file.path === oldPath ? { ...file, path: oldPath.replace(/[^/]+$/, newName) } : file
          ),
        }));
        await refreshFileTree();
      } catch (error) {
        logger.error('Failed to rename file/directory:', error);
        throw error;
      }
    },

    // Close the repository
    closeRepository: () => {
      // Clear cache when closing repository
      repositoryService.clearCache();

      // Clear the current root path in settings
      settingsManager.setCurrentRootPath('');

      set({
        rootPath: null,
        fileTree: null,
        openFiles: [],
        activeFileIndex: -1,
        isLoading: false,
        error: null,
        expandedPaths: new Set<string>(),
        selectedFilePath: null,
        loadingPhase: 'idle',
        indexingProgress: null,
      });
    },

    // Refresh a file
    refreshFile: async (filePath: string) => {
      if (!filePath) return;

      set((state) => ({
        openFiles: state.openFiles.map((file) =>
          file.path === filePath ? { ...file, isLoading: true, error: null } : file
        ),
      }));

      try {
        // First clear cache to force fresh read from disk
        repositoryService.invalidateCache(filePath);

        // Then read the file content from disk
        const content = await repositoryService.readFileWithCache(filePath);

        set((state) => ({
          openFiles: state.openFiles.map((file) =>
            file.path === filePath ? { ...file, content, isLoading: false, error: null } : file
          ),
        }));

        toast.success('File refreshed successfully');
      } catch (error) {
        const errorMessage = (error as Error).message;
        logger.error('Failed to refresh file:', error);

        set((state) => ({
          openFiles: state.openFiles.map((file) =>
            file.path === filePath ? { ...file, error: errorMessage, isLoading: false } : file
          ),
        }));

        toast.error(`Failed to refresh file: ${errorMessage}`);
      }
    },

    // Refresh the file tree
    refreshFileTree: async () => {
      const { rootPath } = get();
      if (!rootPath) return;

      set({ isLoading: true, error: null });

      try {
        // Clear all caches first - both file content cache and directory tree cache
        repositoryService.clearCache();
        await fastDirectoryTreeService.clearCache();

        // Then rebuild the directory tree with high-performance implementation
        const tree = await repositoryService.buildDirectoryTree(rootPath);

        set({
          fileTree: tree,
          isLoading: false,
        });
      } catch (error) {
        const errorMessage = (error as Error).message;
        logger.error('Failed to refresh file tree:', error);

        set({
          error: errorMessage,
          isLoading: false,
        });

        toast.error(`Failed to refresh file tree: ${errorMessage}`);
      }
    },

    // Expand all parent directories of a file
    expandToFile: async (filePath: string) => {
      const {
        rootPath,
        expandedPaths: currentExpandedPaths,
        fileTree,
        findNodeByPath,
        loadDirectoryChildren,
      } = get();
      if (!rootPath || !fileTree) return;

      const expandedPaths = new Set(currentExpandedPaths);

      // Get relative path from root
      const relativePath = filePath.startsWith(rootPath)
        ? filePath.substring(rootPath.length + 1)
        : filePath;

      // Build all parent paths that need to be expanded
      const parts = relativePath.split('/');
      let currentPath = rootPath;
      const pathsToExpand: string[] = [];

      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = `${currentPath}/${parts[i]}`;
        expandedPaths.add(currentPath);
        pathsToExpand.push(currentPath);
      }

      // Update expansion state immediately for visual feedback
      set({
        expandedPaths,
        selectedFilePath: filePath,
      });

      // Load children for each lazy-loaded directory in the path
      for (const path of pathsToExpand) {
        const currentTree = get().fileTree;
        if (!currentTree) continue;
        const node = findNodeByPath(currentTree, path);
        if (node?.is_directory && node.is_lazy_loaded) {
          await loadDirectoryChildren(node);
        }
      }
    },

    // Toggle expansion state of a directory
    toggleExpansion: (path: string) => {
      set((state) => {
        const newExpandedPaths = new Set(state.expandedPaths);

        if (newExpandedPaths.has(path)) {
          newExpandedPaths.delete(path);
        } else {
          newExpandedPaths.add(path);
        }

        return { expandedPaths: newExpandedPaths };
      });
    },

    // Utility methods
    getFileLanguage: (filename: string) => repositoryService.getLanguageFromExtension(filename),

    getCacheSize: () => repositoryService.getCacheSize(),
  }));
}

// Create context for repository store
const RepositoryStoreContext = createContext<ReturnType<typeof createRepositoryStore> | null>(null);

// Provider component
export function RepositoryStoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<ReturnType<typeof createRepositoryStore> | null>(null);

  if (!storeRef.current) {
    storeRef.current = createRepositoryStore();
  }

  return (
    <RepositoryStoreContext.Provider value={storeRef.current}>
      {children}
    </RepositoryStoreContext.Provider>
  );
}

// Hook to use window-scoped repository store
export function useWindowScopedRepositoryStore<T>(selector: (state: RepositoryStore) => T): T {
  const store = useContext(RepositoryStoreContext);
  if (!store) {
    throw new Error('useWindowScopedRepositoryStore must be used within RepositoryStoreProvider');
  }
  return useStore(store, selector);
}

// Export backward-compatible hook that delegates to window-scoped store
export { useWindowScopedRepositoryStore as useRepositoryStore };
