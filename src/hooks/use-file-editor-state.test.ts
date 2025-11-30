import { vi } from 'vitest';

vi.mock('@/services/repository-service', () => ({
  repositoryService: {
    writeFile: vi.fn(() => Promise.resolve()),
  },
}));

vi.useFakeTimers();

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repositoryService } from '@/services/repository-service';
import { useFileEditorState } from './use-file-editor-state';

describe('useFileEditorState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should not save to the wrong file when switching files quickly', async () => {
    const onFileSaved = vi.fn();
    const { rerender, result } = renderHook(
      ({ filePath, fileContent }) =>
        useFileEditorState({
          filePath,
          fileContent,
          onFileSaved,
        }),
      {
        initialProps: {
          filePath: 'fileA.txt',
          fileContent: 'content of file A',
        },
      }
    );

    // 1. Modify file A
    act(() => {
      result.current.handleContentChange('new content for file A');
    });

    // 2. Quickly switch to file B before auto-save triggers
    rerender({ filePath: 'fileB.txt', fileContent: 'content of file B' });

    // 3. Advance timers to trigger auto-save
    await act(async () => {
      vi.runAllTimers();
    });

    // Assert that writeFile was called for fileA with the correct content
    expect(repositoryService.writeFile).toHaveBeenCalledWith('fileA.txt', 'new content for file A');

    // Assert that writeFile was NOT called for fileB with fileA's content
    expect(repositoryService.writeFile).not.toHaveBeenCalledWith(
      'fileB.txt',
      'new content for file A'
    );

    expect(onFileSaved).toHaveBeenCalledWith('fileA.txt');
  });
});
