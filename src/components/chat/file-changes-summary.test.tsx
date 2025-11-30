import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileChangesSummary } from './file-changes-summary';
import type { FileChange } from '@/stores/file-changes-store';

// Mock stores
const mockSelectFile = vi.fn();
const mockChangesByConversation = new Map<string, FileChange[]>();

vi.mock('@/stores/file-changes-store', () => ({
  useFileChangesStore: (selector: (state: { changesByConversation: Map<string, FileChange[]> }) => Map<string, FileChange[]>) => {
    return selector({ changesByConversation: mockChangesByConversation });
  },
}));

vi.mock('@/stores/repository-store', () => ({
  useRepositoryStore: (selector: (state: { selectFile: () => void }) => () => void) => {
    return selector({ selectFile: mockSelectFile });
  },
}));

vi.mock('./file-change-item', () => ({
  FileChangeItem: ({
    filePath,
    onOpen,
    onViewDiff,
    showDiff,
  }: {
    filePath: string;
    onOpen: (path: string) => void;
    onViewDiff?: (path: string) => void;
    showDiff: boolean;
  }) => (
    <div data-testid={`file-change-item-${filePath}`}>
      <span>{filePath}</span>
      <button type="button" onClick={() => onOpen(filePath)}>
        Open
      </button>
      {showDiff && onViewDiff && (
        <button type="button" onClick={() => onViewDiff(filePath)}>
          View Diff
        </button>
      )}
    </div>
  ),
}));

vi.mock('./file-diff-modal', () => ({
  FileDiffModal: ({
    open,
    filePath,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    filePath: string;
    originalContent: string;
    newContent: string;
  }) => (open ? <div data-testid="file-diff-modal">{filePath}</div> : null),
}));

describe('FileChangesSummary - Infinite Loop Regression Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChangesByConversation.clear();
  });

  it('should render without causing infinite re-renders', () => {
    const conversationId = 'test-conversation-1';
    const changes: FileChange[] = [
      {
        filePath: 'src/test.ts',
        operation: 'write',
        timestamp: Date.now(),
      },
    ];

    mockChangesByConversation.set(conversationId, changes);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(<FileChangesSummary conversationId={conversationId} />);

    // Verify no React errors occurred
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Maximum update depth exceeded')
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('should be cached to avoid an infinite loop')
    );

    unmount();
    consoleErrorSpy.mockRestore();
  });

  it('should not re-render infinitely when changes map updates with same conversation data', () => {
    const conversationId = 'test-conversation-1';
    const changes: FileChange[] = [
      {
        filePath: 'src/test.ts',
        operation: 'write',
        timestamp: Date.now(),
      },
    ];

    mockChangesByConversation.set(conversationId, changes);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender, unmount } = render(<FileChangesSummary conversationId={conversationId} />);

    // Force multiple re-renders to simulate store updates
    for (let i = 0; i < 5; i++) {
      rerender(<FileChangesSummary conversationId={conversationId} />);
    }

    // Verify no React errors occurred
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Maximum update depth exceeded')
    );

    unmount();
    consoleErrorSpy.mockRestore();
  });

  it('should render null when there are no changes', () => {
    const conversationId = 'test-conversation-empty';
    const { container } = render(<FileChangesSummary conversationId={conversationId} />);

    expect(container.firstChild).toBeNull();
  });

  it('should render new files section when there are write operations', () => {
    const conversationId = 'test-conversation-2';
    const changes: FileChange[] = [
      {
        filePath: 'src/new-file.ts',
        operation: 'write',
        timestamp: Date.now(),
      },
      {
        filePath: 'src/another-file.ts',
        operation: 'write',
        timestamp: Date.now(),
      },
    ];

    mockChangesByConversation.set(conversationId, changes);

    render(<FileChangesSummary conversationId={conversationId} />);

    // Expand the collapsible to see the content
    const expandButton = screen.getByRole('button', { expanded: false });
    fireEvent.click(expandButton);

    expect(screen.getByText('New Files (2)')).toBeDefined();
    expect(screen.getByTestId('file-change-item-src/new-file.ts')).toBeDefined();
    expect(screen.getByTestId('file-change-item-src/another-file.ts')).toBeDefined();
  });

  it('should render edited files section when there are edit operations', () => {
    const conversationId = 'test-conversation-3';
    const changes: FileChange[] = [
      {
        filePath: 'src/edited-file.ts',
        operation: 'edit',
        timestamp: Date.now(),
        originalContent: 'original',
        newContent: 'new',
      },
    ];

    mockChangesByConversation.set(conversationId, changes);

    render(<FileChangesSummary conversationId={conversationId} />);

    // Expand the collapsible to see the content
    const expandButton = screen.getByRole('button', { expanded: false });
    fireEvent.click(expandButton);

    expect(screen.getByText('Edited Files (1)')).toBeDefined();
    expect(screen.getByTestId('file-change-item-src/edited-file.ts')).toBeDefined();
  });

  it('should render both new and edited files sections', () => {
    const conversationId = 'test-conversation-4';
    const changes: FileChange[] = [
      {
        filePath: 'src/new-file.ts',
        operation: 'write',
        timestamp: Date.now(),
      },
      {
        filePath: 'src/edited-file.ts',
        operation: 'edit',
        timestamp: Date.now(),
        originalContent: 'original',
        newContent: 'new',
      },
    ];

    mockChangesByConversation.set(conversationId, changes);

    render(<FileChangesSummary conversationId={conversationId} />);

    // Expand the collapsible to see the content
    const expandButton = screen.getByRole('button', { expanded: false });
    fireEvent.click(expandButton);

    expect(screen.getByText('New Files (1)')).toBeDefined();
    expect(screen.getByText('Edited Files (1)')).toBeDefined();
  });

  it('should call selectFile when file is opened', () => {
    const conversationId = 'test-conversation-5';
    const changes: FileChange[] = [
      {
        filePath: 'src/test-file.ts',
        operation: 'write',
        timestamp: Date.now(),
      },
    ];

    mockChangesByConversation.set(conversationId, changes);

    render(<FileChangesSummary conversationId={conversationId} />);

    // Expand the collapsible to see the content
    const expandButton = screen.getByRole('button', { expanded: false });
    fireEvent.click(expandButton);

    const openButton = screen.getByText('Open');
    fireEvent.click(openButton);

    expect(mockSelectFile).toHaveBeenCalledWith('src/test-file.ts');
  });

  it('should open diff modal when View Diff is clicked for edited files', () => {
    const conversationId = 'test-conversation-6';
    const changes: FileChange[] = [
      {
        filePath: 'src/edited-file.ts',
        operation: 'edit',
        timestamp: Date.now(),
        originalContent: 'original content',
        newContent: 'new content',
      },
    ];

    mockChangesByConversation.set(conversationId, changes);

    render(<FileChangesSummary conversationId={conversationId} />);

    // Expand the collapsible to see the content
    const expandButton = screen.getByRole('button', { expanded: false });
    fireEvent.click(expandButton);

    const viewDiffButton = screen.getByText('View Diff');
    fireEvent.click(viewDiffButton);

    expect(screen.getByTestId('file-diff-modal')).toBeDefined();
  });

  it('should not open diff modal for files without content', () => {
    const conversationId = 'test-conversation-7';
    const changes: FileChange[] = [
      {
        filePath: 'src/edited-file.ts',
        operation: 'edit',
        timestamp: Date.now(),
        // Missing originalContent and newContent
      },
    ];

    mockChangesByConversation.set(conversationId, changes);

    render(<FileChangesSummary conversationId={conversationId} />);

    // Expand the collapsible to see the content
    const expandButton = screen.getByRole('button', { expanded: false });
    fireEvent.click(expandButton);

    const viewDiffButton = screen.getByText('View Diff');
    fireEvent.click(viewDiffButton);

    expect(screen.queryByTestId('file-diff-modal')).toBeNull();
  });

  it('should handle conversation ID changes without infinite loops', () => {
    const conversationId1 = 'test-conversation-8';
    const conversationId2 = 'test-conversation-9';

    const changes1: FileChange[] = [
      {
        filePath: 'src/file1.ts',
        operation: 'write',
        timestamp: Date.now(),
      },
    ];

    const changes2: FileChange[] = [
      {
        filePath: 'src/file2.ts',
        operation: 'edit',
        timestamp: Date.now(),
        originalContent: 'original',
        newContent: 'new',
      },
    ];

    mockChangesByConversation.set(conversationId1, changes1);
    mockChangesByConversation.set(conversationId2, changes2);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender, unmount } = render(<FileChangesSummary conversationId={conversationId1} />);

    // Switch conversation
    rerender(<FileChangesSummary conversationId={conversationId2} />);

    // Switch back
    rerender(<FileChangesSummary conversationId={conversationId1} />);

    // Verify no React errors occurred
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Maximum update depth exceeded')
    );

    unmount();
    consoleErrorSpy.mockRestore();
  });

  it('should properly memoize changes array', () => {
    const conversationId = 'test-conversation-10';
    const changes: FileChange[] = [
      {
        filePath: 'src/test.ts',
        operation: 'write',
        timestamp: Date.now(),
      },
    ];

    mockChangesByConversation.set(conversationId, changes);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender, unmount } = render(<FileChangesSummary conversationId={conversationId} />);

    // Multiple re-renders with same data should not cause issues
    for (let i = 0; i < 10; i++) {
      rerender(<FileChangesSummary conversationId={conversationId} />);
    }

    // Verify no infinite loop warnings
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('should be cached to avoid an infinite loop')
    );

    unmount();
    consoleErrorSpy.mockRestore();
  });

  it('should handle empty changes array without errors', () => {
    const conversationId = 'test-conversation-11';
    mockChangesByConversation.set(conversationId, []);

    const { container } = render(<FileChangesSummary conversationId={conversationId} />);

    expect(container.firstChild).toBeNull();
  });

  it('should group files by operation type correctly', () => {
    const conversationId = 'test-conversation-12';
    const changes: FileChange[] = [
      {
        filePath: 'src/new1.ts',
        operation: 'write',
        timestamp: Date.now(),
      },
      {
        filePath: 'src/new2.ts',
        operation: 'write',
        timestamp: Date.now(),
      },
      {
        filePath: 'src/edited1.ts',
        operation: 'edit',
        timestamp: Date.now(),
        originalContent: 'original1',
        newContent: 'new1',
      },
      {
        filePath: 'src/edited2.ts',
        operation: 'edit',
        timestamp: Date.now(),
        originalContent: 'original2',
        newContent: 'new2',
      },
      {
        filePath: 'src/edited3.ts',
        operation: 'edit',
        timestamp: Date.now(),
        originalContent: 'original3',
        newContent: 'new3',
      },
    ];

    mockChangesByConversation.set(conversationId, changes);

    render(<FileChangesSummary conversationId={conversationId} />);

    // Click the collapsible trigger to expand it (more than 3 files means it starts collapsed)
    const trigger = screen.getByRole('button', { expanded: false });
    fireEvent.click(trigger);

    expect(screen.getByText('New Files (2)')).toBeDefined();
    expect(screen.getByText('Edited Files (3)')).toBeDefined();
  });
});
