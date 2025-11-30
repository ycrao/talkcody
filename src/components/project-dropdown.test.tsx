// src/components/project-dropdown.test.tsx

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock database service
vi.mock('@/services/database-service', () => ({
  databaseService: {
    getProjects: vi.fn(() =>
      Promise.resolve([
        {
          id: 'default',
          name: 'Default Project',
          root_path: '/path/to/default',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'project-1',
          name: 'Project 1',
          root_path: '/path/to/project1',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ])
    ),
  },
}));

// Now import the component
import { ProjectDropdown } from './project-dropdown';

describe('ProjectDropdown - Infinite Loop Regression Test', () => {
  const mockOnProjectSelect = vi.fn().mockResolvedValue(undefined);
  const mockOnImportRepository = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render without causing infinite re-renders', async () => {
    // This test verifies the fix for the bug where loadProjects function
    // was not wrapped in useCallback, causing infinite re-renders.

    // Mock console.error to detect React errors
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Render the component
    const { unmount } = render(
      <ProjectDropdown
        currentProjectId="default"
        onProjectSelect={mockOnProjectSelect}
        onImportRepository={mockOnImportRepository}
        isLoading={false}
      />
    );

    // Wait for the component to load projects
    await screen.findByText('Default Project');

    // Verify no React errors occurred (like "Maximum update depth exceeded")
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Maximum update depth exceeded')
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('should be cached to avoid an infinite loop')
    );

    // Verify getProjects was called a reasonable number of times (should be 1-2)
    const { databaseService } = await import('@/services/database-service');
    const callCount = (databaseService.getProjects as any).mock.calls.length;
    expect(callCount).toBeLessThanOrEqual(2); // Allow for initial mount + effect

    // Clean up
    unmount();
    consoleErrorSpy.mockRestore();
  });

  it('should handle currentProjectId changes without infinite loops', async () => {
    // Mock console.error to detect React errors
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Render with initial project
    const { rerender, unmount } = render(
      <ProjectDropdown
        currentProjectId="default"
        onProjectSelect={mockOnProjectSelect}
        onImportRepository={mockOnImportRepository}
        isLoading={false}
      />
    );

    // Wait for initial render
    await screen.findByText('Default Project');

    // Get initial call count
    const { databaseService } = await import('@/services/database-service');
    const initialCallCount = (databaseService.getProjects as any).mock.calls.length;

    // Change currentProjectId
    rerender(
      <ProjectDropdown
        currentProjectId="project-1"
        onProjectSelect={mockOnProjectSelect}
        onImportRepository={mockOnImportRepository}
        isLoading={false}
      />
    );

    // Wait for re-render
    await screen.findByText('Project 1');

    // Verify getProjects was called again due to currentProjectId change
    const finalCallCount = (databaseService.getProjects as any).mock.calls.length;
    expect(finalCallCount).toBeGreaterThan(initialCallCount);
    // But not excessively (should be around initialCallCount + 1)
    expect(finalCallCount - initialCallCount).toBeLessThanOrEqual(2);

    // Verify no React errors occurred
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Maximum update depth exceeded')
    );

    // Clean up
    unmount();
    consoleErrorSpy.mockRestore();
  });

  it('should maintain stable loadProjects reference when currentProjectId unchanged', async () => {
    // This test ensures loadProjects is wrapped in useCallback with correct dependencies

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender, unmount } = render(
      <ProjectDropdown
        currentProjectId="default"
        onProjectSelect={mockOnProjectSelect}
        onImportRepository={mockOnImportRepository}
        isLoading={false}
      />
    );

    await screen.findByText('Default Project');

    const { databaseService } = await import('@/services/database-service');
    const callCountAfterMount = (databaseService.getProjects as any).mock.calls.length;

    // Re-render multiple times with same props
    for (let i = 0; i < 3; i++) {
      rerender(
        <ProjectDropdown
          currentProjectId="default"
          onProjectSelect={mockOnProjectSelect}
          onImportRepository={mockOnImportRepository}
          isLoading={false}
        />
      );
    }

    // getProjects should not be called again if currentProjectId hasn't changed
    const finalCallCount = (databaseService.getProjects as any).mock.calls.length;
    expect(finalCallCount).toBe(callCountAfterMount);

    // Verify no React errors occurred
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Maximum update depth exceeded')
    );

    unmount();
    consoleErrorSpy.mockRestore();
  });
});
