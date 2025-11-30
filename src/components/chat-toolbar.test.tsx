// src/components/chat-toolbar.test.tsx
import { act, render, screen, waitFor } from '@testing-library/react';
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

// Mock model service
const mockGetCurrentModel = vi.fn();
vi.mock('@/services/model-service', () => ({
  modelService: {
    getCurrentModel: () => mockGetCurrentModel(),
  },
}));

// Create a mock Zustand store
const mockUseSettingsStore = vi.fn();
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: () => mockUseSettingsStore(),
}));

// Mock database service
vi.mock('@/services/database-service', () => ({
  databaseService: {
    getProjects: vi.fn(() => Promise.resolve([])),
  },
}));

// Import the component after mocks
import { ChatToolbar } from './chat-toolbar';

describe('ChatToolbar - Model Name Real-time Update', () => {
  const defaultProps = {
    currentConversationId: 'test-conv-1',
    isHistoryOpen: false,
    onHistoryOpenChange: vi.fn(),
    onConversationSelect: vi.fn(),
    onNewChat: vi.fn(),
    currentProjectId: 'default',
    onProjectSelect: vi.fn().mockResolvedValue(undefined),
    onImportRepository: vi.fn().mockResolvedValue(undefined),
    isLoadingProject: false,
    rootPath: '/test/path',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default store state
    mockUseSettingsStore.mockReturnValue({
      model_type_main: 'claude-3-sonnet@anthropic',
      model_type_small: 'gpt-4o-mini@openai',
      model_type_image_generator: '',
      model_type_transcription: '',
      assistantId: 'planner',
    });

    // Default model service response
    mockGetCurrentModel.mockResolvedValue('claude-3-sonnet@anthropic');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should display the current model name on mount', async () => {
    render(<ChatToolbar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('claude-3-sonnet@anthropic')).toBeInTheDocument();
    });

    expect(mockGetCurrentModel).toHaveBeenCalled();
  });

  it('should update model name when model_type_main changes in store', async () => {
    const { rerender } = render(<ChatToolbar {...defaultProps} />);

    // Initial render shows first model
    await waitFor(() => {
      expect(screen.getByText('claude-3-sonnet@anthropic')).toBeInTheDocument();
    });

    const initialCallCount = mockGetCurrentModel.mock.calls.length;

    // Simulate store update (new model selected in settings)
    mockUseSettingsStore.mockReturnValue({
      model_type_main: 'gpt-4o@openai', // Changed
      model_type_small: 'gpt-4o-mini@openai',
      model_type_image_generator: '',
      model_type_transcription: '',
      assistantId: 'planner',
    });

    mockGetCurrentModel.mockResolvedValue('gpt-4o@openai');

    // Re-render to trigger useEffect with new store values
    rerender(<ChatToolbar {...defaultProps} />);

    // Should call getCurrentModel again due to model_type_main change
    await waitFor(() => {
      expect(mockGetCurrentModel.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    // Should display new model name
    await waitFor(() => {
      expect(screen.getByText('gpt-4o@openai')).toBeInTheDocument();
    });
  });

  it('should update model name when provider changes for same model', async () => {
    const { rerender } = render(<ChatToolbar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('claude-3-sonnet@anthropic')).toBeInTheDocument();
    });

    const initialCallCount = mockGetCurrentModel.mock.calls.length;

    // Simulate provider change
    mockUseSettingsStore.mockReturnValue({
      model_type_main: 'claude-3-sonnet@openrouter', // Provider changed
      model_type_small: 'gpt-4o-mini@openai',
      model_type_image_generator: '',
      model_type_transcription: '',
      assistantId: 'planner',
    });

    mockGetCurrentModel.mockResolvedValue('claude-3-sonnet@openrouter');

    rerender(<ChatToolbar {...defaultProps} />);

    await waitFor(() => {
      expect(mockGetCurrentModel.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    await waitFor(() => {
      expect(screen.getByText('claude-3-sonnet@openrouter')).toBeInTheDocument();
    });
  });

  it('should update model name when assistantId changes', async () => {
    const { rerender } = render(<ChatToolbar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('claude-3-sonnet@anthropic')).toBeInTheDocument();
    });

    const initialCallCount = mockGetCurrentModel.mock.calls.length;

    // Simulate agent change (different agents may use different model types)
    mockUseSettingsStore.mockReturnValue({
      model_type_main: 'claude-3-sonnet@anthropic',
      model_type_small: 'gpt-4o-mini@openai',
      model_type_image_generator: '',
      model_type_transcription: '',
      assistantId: 'coder', // Changed agent
    });

    // New agent might use a different model type
    mockGetCurrentModel.mockResolvedValue('gpt-4o-mini@openai');

    rerender(<ChatToolbar {...defaultProps} />);

    await waitFor(() => {
      expect(mockGetCurrentModel.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    await waitFor(() => {
      expect(screen.getByText('gpt-4o-mini@openai')).toBeInTheDocument();
    });
  });

  it('should not trigger update when unrelated store values change', async () => {
    const { rerender } = render(<ChatToolbar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('claude-3-sonnet@anthropic')).toBeInTheDocument();
    });

    // Wait for initial effects to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const callCountAfterMount = mockGetCurrentModel.mock.calls.length;

    // Re-render with same store values (simulating other prop changes)
    rerender(<ChatToolbar {...defaultProps} />);

    // Wait a bit to ensure no additional calls
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Should not call getCurrentModel again since model_type_* didn't change
    expect(mockGetCurrentModel.mock.calls.length).toBe(callCountAfterMount);
  });

  it('should handle getCurrentModel errors gracefully', async () => {
    // Import the mocked logger
    const { logger } = await import('@/lib/logger');

    mockGetCurrentModel.mockRejectedValue(new Error('Failed to get model'));

    render(<ChatToolbar {...defaultProps} />);

    // Should not crash, and model name should be empty
    await waitFor(() => {
      expect(screen.queryByText('Model:')).not.toBeInTheDocument();
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to get current model:',
      expect.any(Error)
    );
  });

  it('should handle empty model name', async () => {
    mockGetCurrentModel.mockResolvedValue('');

    render(<ChatToolbar {...defaultProps} />);

    // Wait for the component to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Model badge should not be displayed when model name is empty
    expect(screen.queryByText('Model:')).not.toBeInTheDocument();
  });
});
