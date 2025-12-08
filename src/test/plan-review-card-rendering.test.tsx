/**
 * Tests for PlanReviewCard rendering
 *
 * This test file verifies the fix for the bug where PlanReviewCard was not showing
 * because renderDoingUI property was lost during message passing.
 *
 * Root cause: handleToolMessage in chat-box.tsx called addMessage without passing
 * the renderDoingUI property, causing it to be undefined when message-item.tsx
 * checked the condition: `if (item.type === 'tool-call' && message.renderDoingUI)`
 *
 * Fix: Added renderDoingUI parameter to addMessage function in use-messages.ts
 * and passed message.renderDoingUI in chat-box.tsx
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageItem } from '@/components/chat/message-item';
import type { UIMessage } from '@/types/agent';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/stores/repository-store', () => ({
  useRepositoryStore: vi.fn(() => '/test/path'),
}));

// Mock tool-adapter to return renderers for exitPlanMode
vi.mock('@/lib/tool-adapter', () => ({
  getToolUIRenderers: vi.fn((toolName: string) => {
    if (toolName === 'exitPlanMode') {
      return {
        renderToolDoing: vi.fn((input: { plan: string }) => (
          <div data-testid="plan-review-card">
            <h3>Plan Review Card</h3>
            <p>{input.plan?.substring(0, 50)}...</p>
          </div>
        )),
        renderToolResult: vi.fn((result: { action: string }) => (
          <div data-testid="plan-result">
            {result.action === 'approve this plan, please implement it' ? 'Approved' : 'Rejected'}
          </div>
        )),
      };
    }
    if (toolName === 'askUserQuestions') {
      return {
        renderToolDoing: vi.fn(() => <div data-testid="ask-questions-card">Ask Questions UI</div>),
        renderToolResult: vi.fn(() => <div data-testid="ask-questions-result">Questions Answered</div>),
      };
    }
    return null;
  }),
}));

describe('PlanReviewCard Rendering', () => {
  describe('renderDoingUI flag handling', () => {
    it('should render PlanReviewCard when tool-call message has renderDoingUI=true', () => {
      const message: UIMessage = {
        id: 'msg-exit-plan-001',
        role: 'tool',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'exit-plan-001',
            toolName: 'exitPlanMode',
            input: {
              plan: '# Implementation Plan\n\n## Overview\nThis is a test plan...',
            },
          },
        ],
        timestamp: new Date(),
        toolCallId: 'exit-plan-001',
        toolName: 'exitPlanMode',
        renderDoingUI: true, // Critical: This must be true for PlanReviewCard to render
      };

      render(<MessageItem message={message} />);

      // PlanReviewCard should be rendered
      expect(screen.getByTestId('plan-review-card')).toBeInTheDocument();
      expect(screen.getByText('Plan Review Card')).toBeInTheDocument();
    });

    it('should NOT render PlanReviewCard when renderDoingUI is undefined', () => {
      const message: UIMessage = {
        id: 'msg-exit-plan-002',
        role: 'tool',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'exit-plan-002',
            toolName: 'exitPlanMode',
            input: {
              plan: '# Implementation Plan\n\n## Overview\nThis is a test plan...',
            },
          },
        ],
        timestamp: new Date(),
        toolCallId: 'exit-plan-002',
        toolName: 'exitPlanMode',
        // renderDoingUI is undefined - this was the bug!
      };

      render(<MessageItem message={message} />);

      // PlanReviewCard should NOT be rendered when renderDoingUI is undefined
      expect(screen.queryByTestId('plan-review-card')).not.toBeInTheDocument();
      // When toolRenderers exist but renderDoingUI is undefined, nothing is rendered (returns null)
      // This is the actual behavior - the bug caused the UI to not show at all
    });

    it('should NOT render PlanReviewCard when renderDoingUI is false', () => {
      const message: UIMessage = {
        id: 'msg-exit-plan-003',
        role: 'tool',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'exit-plan-003',
            toolName: 'exitPlanMode',
            input: {
              plan: '# Implementation Plan',
            },
          },
        ],
        timestamp: new Date(),
        toolCallId: 'exit-plan-003',
        toolName: 'exitPlanMode',
        renderDoingUI: false,
      };

      render(<MessageItem message={message} />);

      // PlanReviewCard should NOT be rendered when renderDoingUI is false
      expect(screen.queryByTestId('plan-review-card')).not.toBeInTheDocument();
      // When toolRenderers exist but renderDoingUI is false, nothing is rendered (returns null)
    });

    it('should render tool-result correctly (not affected by renderDoingUI)', () => {
      const message: UIMessage = {
        id: 'msg-exit-plan-result-001',
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'exit-plan-001',
            toolName: 'exitPlanMode',
            input: {
              plan: '# Implementation Plan',
            },
            output: {
              action: 'approve this plan, please implement it',
            },
          },
        ],
        timestamp: new Date(),
        toolCallId: 'exit-plan-001',
        toolName: 'exitPlanMode',
        // renderDoingUI doesn't matter for tool-result
      };

      render(<MessageItem message={message} />);

      // Tool result should be rendered wrapped in UnifiedToolResult
      // UnifiedToolResult shows the tool name in the header
      expect(screen.getByText('exitPlanMode')).toBeInTheDocument();
      // UnifiedToolResult shows output.action for exitPlanMode (the user's action)
      expect(screen.getByText('approve this plan, please implement it')).toBeInTheDocument();
      // Check for the success indicator (green check mark)
      expect(document.querySelector('.text-green-500')).toBeInTheDocument();
    });
  });

  describe('askUserQuestions tool rendering', () => {
    it('should render askUserQuestions doing UI when renderDoingUI=true', () => {
      const message: UIMessage = {
        id: 'msg-ask-001',
        role: 'tool',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'ask-001',
            toolName: 'askUserQuestions',
            input: {
              questions: [{ question: 'Which approach?', options: ['A', 'B'] }],
            },
          },
        ],
        timestamp: new Date(),
        toolCallId: 'ask-001',
        toolName: 'askUserQuestions',
        renderDoingUI: true,
      };

      render(<MessageItem message={message} />);

      expect(screen.getByTestId('ask-questions-card')).toBeInTheDocument();
    });
  });

  describe('message flow simulation', () => {
    it('should correctly handle the complete exitPlanMode message flow', () => {
      // Step 1: tool-call message with renderDoingUI=true (shows PlanReviewCard)
      const toolCallMessage: UIMessage = {
        id: 'msg-flow-call',
        role: 'tool',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'flow-001',
            toolName: 'exitPlanMode',
            input: { plan: '# Plan Content' },
          },
        ],
        timestamp: new Date(),
        toolCallId: 'flow-001',
        toolName: 'exitPlanMode',
        renderDoingUI: true,
      };

      const { unmount } = render(<MessageItem message={toolCallMessage} />);

      // Verify PlanReviewCard is shown during tool execution
      expect(screen.getByTestId('plan-review-card')).toBeInTheDocument();

      // Clean up first render
      unmount();

      // Step 2: tool-result message (shows approval result)
      const toolResultMessage: UIMessage = {
        id: 'msg-flow-result',
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'flow-001',
            toolName: 'exitPlanMode',
            input: { plan: '# Plan Content' },
            output: { action: 'approve this plan, please implement it' },
          },
        ],
        timestamp: new Date(),
        toolCallId: 'flow-001',
        toolName: 'exitPlanMode',
      };

      render(<MessageItem message={toolResultMessage} />);

      // Verify result is shown after approval - wrapped in UnifiedToolResult
      expect(screen.getByText('exitPlanMode')).toBeInTheDocument();
      // UnifiedToolResult shows output.action for exitPlanMode (the user's action)
      expect(screen.getByText('approve this plan, please implement it')).toBeInTheDocument();
      // Check for success indicator
      expect(document.querySelector('.text-green-500')).toBeInTheDocument();
    });
  });
});

describe('Integration: useMessages addMessage with renderDoingUI', () => {
  const TEST_CONVERSATION_ID = 'test-integration-conversation';

  it('validates that addMessage preserves renderDoingUI in the message', async () => {
    // This test validates the fix works at the hook level
    const { renderHook, act } = await import('@testing-library/react');
    const { useMessages } = await import('@/hooks/use-messages');
    const { useMessagesStore } = await import('@/stores/messages-store');

    // Reset messages store before test
    useMessagesStore.getState().messagesByConversation.clear();

    // useMessages now requires conversationId for per-conversation message caching
    const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

    act(() => {
      result.current.addMessage(
        'tool',
        [
          {
            type: 'tool-call',
            toolCallId: 'integration-001',
            toolName: 'exitPlanMode',
            input: { plan: '# Test Plan' },
          },
        ],
        false,
        undefined,
        undefined,
        'msg-integration-001',
        'integration-001',
        'exitPlanMode',
        undefined,
        true // renderDoingUI - the key parameter
      );
    });

    const addedMessage = result.current.messages[0];

    // Verify renderDoingUI is preserved
    expect(addedMessage.renderDoingUI).toBe(true);
    expect(addedMessage.toolName).toBe('exitPlanMode');
    expect(addedMessage.role).toBe('tool');
  });
});
