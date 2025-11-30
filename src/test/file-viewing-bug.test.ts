import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryStore } from '@/stores/repository-store';

// Mock the repository service
vi.mock('@/services/repository-service', () => ({
  repositoryService: {
    readFileWithCache: vi.fn((path: string) => Promise.resolve(`Content of ${path}`)),
    buildDirectoryTree: vi.fn(() =>
      Promise.resolve({ path: '/test', name: 'test', is_directory: true, children: [] })
    ),
    writeFile: vi.fn(() => Promise.resolve()),
    getFileNameFromPath: (path: string) => path.split('/').pop(),
    getLanguageFromExtension: () => 'plaintext',
    selectRepositoryFolder: vi.fn(() => Promise.resolve('/test')),
    clearCache: vi.fn(),
    invalidateCache: vi.fn(),
    getCacheSize: vi.fn(() => 0),
  },
}));

// Mock the database service
vi.mock('@/services/database-service', () => ({
  databaseService: {
    createOrGetProjectForRepository: vi.fn(() =>
      Promise.resolve({ id: 'test-project', name: 'Test Project' })
    ),
  },
}));

// Mock the settings manager
vi.mock('@/stores/settings-store', () => ({
  settingsManager: {
    setCurrentRootPath: vi.fn(),
    getCurrentRootPath: vi.fn(() => ''),
    setCurrentProjectId: vi.fn(),
    getProject: vi.fn(() => Promise.resolve('test-project')),
    setProject: vi.fn(),
  },
}));

// Mock the fast directory tree service
vi.mock('@/services/fast-directory-tree-service', () => ({
  fastDirectoryTreeService: {
    clearCache: vi.fn(() => Promise.resolve()),
    loadDirectoryChildren: vi.fn(() => Promise.resolve([])),
  },
}));

describe('File Viewing Bug - currentFile should update when switching tabs', () => {
  beforeEach(() => {
    // Reset the store before each test
    const store = useRepositoryStore.getState();
    store.closeRepository();
    vi.clearAllMocks();
  });

  it('should have correct currentFile when opening multiple files', async () => {
    // Open first file
    await useRepositoryStore.getState().selectFile('/test/file1.txt');

    // Verify first file is open and active
    let state = useRepositoryStore.getState();
    expect(state.openFiles.length).toBe(1);
    expect(state.activeFileIndex).toBe(0);
    expect(state.openFiles[0].path).toBe('/test/file1.txt');

    // Wait for content to load
    await vi.waitFor(() => {
      const state = useRepositoryStore.getState();
      return state.openFiles[0].content !== null;
    });

    // Verify content is loaded
    state = useRepositoryStore.getState();
    expect(state.openFiles[0].content).toBe('Content of /test/file1.txt');

    // Open second file
    await useRepositoryStore.getState().selectFile('/test/file2.txt');

    // Verify both files are open and second is active
    state = useRepositoryStore.getState();
    expect(state.openFiles.length).toBe(2);
    expect(state.activeFileIndex).toBe(1);
    expect(state.openFiles[1].path).toBe('/test/file2.txt');
  });

  it('should update activeFileIndex when switching tabs', async () => {
    const store = useRepositoryStore.getState();

    // Open two files
    await store.selectFile('/test/file1.txt');
    await store.selectFile('/test/file2.txt');

    const state1 = useRepositoryStore.getState();
    expect(state1.activeFileIndex).toBe(1);
    expect(state1.openFiles[1].path).toBe('/test/file2.txt');

    // Switch to first tab
    store.switchToTab(0);

    const state2 = useRepositoryStore.getState();
    expect(state2.activeFileIndex).toBe(0);
    expect(state2.openFiles[0].path).toBe('/test/file1.txt');
  });

  it('should return correct file based on activeFileIndex (currentFile derivation test)', async () => {
    const store = useRepositoryStore.getState();

    // Open three files
    await store.selectFile('/test/file1.txt');
    await store.selectFile('/test/file2.txt');
    await store.selectFile('/test/file3.txt');

    // Wait for all content to load
    await vi.waitFor(() => {
      const state = useRepositoryStore.getState();
      return state.openFiles.every((file) => file.content !== null);
    });

    // Test that deriving currentFile works correctly
    const deriveCurrentFile = (state: typeof store) => {
      if (state.activeFileIndex >= 0 && state.activeFileIndex < state.openFiles.length) {
        return state.openFiles[state.activeFileIndex];
      }
      return null;
    };

    // Check file 3 (currently active)
    let state = useRepositoryStore.getState();
    let currentFile = deriveCurrentFile(state);
    expect(currentFile?.path).toBe('/test/file3.txt');
    expect(currentFile?.content).toBe('Content of /test/file3.txt');

    // Switch to file 1
    store.switchToTab(0);
    state = useRepositoryStore.getState();
    currentFile = deriveCurrentFile(state);
    expect(currentFile?.path).toBe('/test/file1.txt');
    expect(currentFile?.content).toBe('Content of /test/file1.txt');

    // Switch to file 2
    store.switchToTab(1);
    state = useRepositoryStore.getState();
    currentFile = deriveCurrentFile(state);
    expect(currentFile?.path).toBe('/test/file2.txt');
    expect(currentFile?.content).toBe('Content of /test/file2.txt');
  });

  it('should return null currentFile when no files are open', () => {
    const store = useRepositoryStore.getState();

    const deriveCurrentFile = (state: typeof store) => {
      if (state.activeFileIndex >= 0 && state.activeFileIndex < state.openFiles.length) {
        return state.openFiles[state.activeFileIndex];
      }
      return null;
    };

    const currentFile = deriveCurrentFile(store);
    expect(currentFile).toBeNull();
  });

  it('should return null currentFile after closing all files', async () => {
    const store = useRepositoryStore.getState();

    // Open files
    await store.selectFile('/test/file1.txt');
    await store.selectFile('/test/file2.txt');

    // Close all files
    store.closeAllFiles();

    const deriveCurrentFile = (state: typeof store) => {
      if (state.activeFileIndex >= 0 && state.activeFileIndex < state.openFiles.length) {
        return state.openFiles[state.activeFileIndex];
      }
      return null;
    };

    const state = useRepositoryStore.getState();
    const currentFile = deriveCurrentFile(state);
    expect(currentFile).toBeNull();
    expect(state.openFiles.length).toBe(0);
    expect(state.activeFileIndex).toBe(-1);
  });

  it('should re-open already open file and switch to it', async () => {
    const store = useRepositoryStore.getState();

    // Open two files
    await store.selectFile('/test/file1.txt');
    await store.selectFile('/test/file2.txt');

    let state = useRepositoryStore.getState();
    expect(state.openFiles.length).toBe(2);
    expect(state.activeFileIndex).toBe(1); // file2 is active

    // Try to open file1 again
    await store.selectFile('/test/file1.txt');

    state = useRepositoryStore.getState();
    expect(state.openFiles.length).toBe(2); // Still only 2 files
    expect(state.activeFileIndex).toBe(0); // Switched to file1
    expect(state.openFiles[0].path).toBe('/test/file1.txt');
  });
});
