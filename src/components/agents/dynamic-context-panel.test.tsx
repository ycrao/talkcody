import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamicContextPanel } from './dynamic-context-panel';
import type { AgentDefinition } from '@/types/agent';
import { ModelType } from '@/types/model-types';

// Mock external dependencies
vi.mock('@/services/prompt/preview', () => ({
  previewSystemPrompt: vi.fn().mockResolvedValue({
    finalSystemPrompt: 'Test prompt',
    unresolvedPlaceholders: [],
  }),
}));

vi.mock('@/services/workspace-root-service', () => ({
  getValidatedWorkspaceRoot: vi.fn().mockResolvedValue('/test/workspace'),
}));


describe('DynamicContextPanel', () => {
  const mockAgent: AgentDefinition = {
    id: 'test-agent',
    name: 'Test Agent',
    description: 'Test description',
    modelType: ModelType.MAIN,
    systemPrompt: 'Test system prompt',
    tools: {},
    dynamicPrompt: {
      enabled: false,
      providers: ['env'],
      variables: {},
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not cause infinite re-renders when onChange is called', async () => {
    const mockOnChange = vi.fn();
    let renderCount = 0;

    const TestWrapper = () => {
      renderCount++;
      return <DynamicContextPanel agent={mockAgent} onChange={mockOnChange} />;
    };

    await act(async () => {
      render(<TestWrapper />);
    });

    // Wait for effects to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    // onChange should be called once initially, not continuously
    // The exact count may vary, but it should be finite (not exceeding React's limit)
    expect(mockOnChange).toHaveBeenCalled();
    // React's limit is ~50 before it throws "Maximum update depth exceeded"
    expect(renderCount).toBeLessThan(50);
  });

  it('should render Dynamic Context title', async () => {
    const mockOnChange = vi.fn();

    await act(async () => {
      render(<DynamicContextPanel agent={mockAgent} onChange={mockOnChange} />);
    });

    expect(screen.getByText('Dynamic Context')).toBeInTheDocument();
  });

  it('should render provider checkboxes', async () => {
    const mockOnChange = vi.fn();

    await act(async () => {
      render(<DynamicContextPanel agent={mockAgent} onChange={mockOnChange} />);
    });

    expect(screen.getByText('Environment')).toBeInTheDocument();
    expect(screen.getByText('AGENTS.md')).toBeInTheDocument();
  });

  it('should call onChange with correct structure when mounted', async () => {
    const mockOnChange = vi.fn();

    await act(async () => {
      render(<DynamicContextPanel agent={mockAgent} onChange={mockOnChange} />);
    });

    // Wait for effects to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        providers: ['env'],
        variables: expect.any(Object),
        providerSettings: expect.objectContaining({
          agents_md: expect.any(Object),
        }),
      })
    );
  });

  it('should handle agent with no dynamicPrompt gracefully', async () => {
    const mockOnChange = vi.fn();
    const agentWithoutDynamic: AgentDefinition = {
      id: 'test-agent-2',
      name: 'Test Agent 2',
      modelType: ModelType.MAIN,
      systemPrompt: 'Test prompt',
      tools: {},
    };

    await act(async () => {
      render(<DynamicContextPanel agent={agentWithoutDynamic} onChange={mockOnChange} />);
    });

    expect(screen.getByText('Dynamic Context')).toBeInTheDocument();
  });
});
