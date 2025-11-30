import type { ToolSet } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AgentLoopState } from '@/types/agent';
import { ToolExecutor } from './tool-executor';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

describe('tool-executor - callAgent toolCallId passing', () => {
  let mockCallAgentExecute: any;
  let mockTools: ToolSet;
  let mockOnToolMessage: any;
  let toolExecutor: ToolExecutor;
  let mockLoopState: AgentLoopState;

  beforeEach(() => {
    // Create a mock execute function that captures the arguments
    mockCallAgentExecute = vi.fn().mockResolvedValue({
      success: true,
      task_result: 'Task completed',
    });

    // Setup mock tools registry
    mockTools = {
      callAgent: {
        description: 'Call a sub-agent',
        inputSchema: z.object({}),
        execute: mockCallAgentExecute,
      },
    };

    mockOnToolMessage = vi.fn();

    // Create mock loop state
    mockLoopState = {
      messages: [],
      currentIteration: 0,
      isComplete: false,
    };

    // Create ToolExecutor instance
    toolExecutor = new ToolExecutor();
  });

  it('should pass _toolCallId to callAgent tool', async () => {
    const toolCall = {
      toolCallId: 'call_test_123456',
      toolName: 'callAgent',
      input: {
        agentId: 'test-agent',
        task: 'test task',
        context: 'test context',
      },
    };

    await toolExecutor.executeToolCall(toolCall, {
      tools: mockTools,
      loopState: mockLoopState,
      model: 'test-model',
      onToolMessage: mockOnToolMessage,
    });

    // Verify that callAgent's execute was called
    expect(mockCallAgentExecute).toHaveBeenCalledTimes(1);

    // Get the arguments passed to execute
    const executeArgs = mockCallAgentExecute.mock.calls[0][0];

    // Verify _toolCallId was passed correctly
    expect(executeArgs._toolCallId).toBe('call_test_123456');

    // Verify other input parameters are still there
    expect(executeArgs.agentId).toBe('test-agent');
    expect(executeArgs.task).toBe('test task');
    expect(executeArgs.context).toBe('test context');
  });

  it('should pass _abortController to callAgent tool when provided', async () => {
    const abortController = new AbortController();

    const toolCall = {
      toolCallId: 'call_test_abortable',
      toolName: 'callAgent',
      input: {
        agentId: 'test-agent',
        task: 'test task',
      },
    };

    await toolExecutor.executeToolCall(toolCall, {
      tools: mockTools,
      loopState: mockLoopState,
      model: 'test-model',
      onToolMessage: mockOnToolMessage,
      abortController,
    });

    expect(mockCallAgentExecute).toHaveBeenCalledTimes(1);

    const executeArgs = mockCallAgentExecute.mock.calls[0][0];

    // Verify both _toolCallId and _abortController are passed
    expect(executeArgs._toolCallId).toBe('call_test_abortable');
    expect(executeArgs._abortController).toBe(abortController);
  });

  it('should pass _toolCallId even when abortController is not provided', async () => {
    const toolCall = {
      toolCallId: 'call_test_no_abort',
      toolName: 'callAgent',
      input: {
        agentId: 'test-agent',
        task: 'test task',
      },
    };

    await toolExecutor.executeToolCall(toolCall, {
      tools: mockTools,
      loopState: mockLoopState,
      model: 'test-model',
      onToolMessage: mockOnToolMessage,
      // No abortController provided
    });

    expect(mockCallAgentExecute).toHaveBeenCalledTimes(1);

    const executeArgs = mockCallAgentExecute.mock.calls[0][0];

    // Verify _toolCallId is passed even without abortController
    expect(executeArgs._toolCallId).toBe('call_test_no_abort');
    expect(executeArgs._abortController).toBeUndefined();
  });

  it('should not add _toolCallId to other tools', async () => {
    const mockBashExecute = vi.fn().mockResolvedValue('command output');

    const bashTools: ToolSet = {
      bash: {
        description: 'Execute bash command',
        inputSchema: z.object({}),
        execute: mockBashExecute,
      },
    };

    const toolCall = {
      toolCallId: 'call_bash_123',
      toolName: 'bash',
      input: {
        command: 'ls -la',
      },
    };

    await toolExecutor.executeToolCall(toolCall, {
      tools: bashTools,
      loopState: mockLoopState,
      model: 'test-model',
      onToolMessage: mockOnToolMessage,
    });

    expect(mockBashExecute).toHaveBeenCalledTimes(1);

    const executeArgs = mockBashExecute.mock.calls[0][0];

    // Verify _toolCallId is NOT added to bash tool
    expect(executeArgs._toolCallId).toBeUndefined();
    expect(executeArgs.command).toBe('ls -la');
  });

  it('should send tool-call message with correct toolCallId before execution', async () => {
    const toolCall = {
      toolCallId: 'call_message_test',
      toolName: 'callAgent',
      input: {
        agentId: 'test-agent',
        task: 'test task',
      },
    };

    await toolExecutor.executeToolCall(toolCall, {
      tools: mockTools,
      loopState: mockLoopState,
      model: 'test-model',
      onToolMessage: mockOnToolMessage,
    });

    // Verify onToolMessage was called twice (tool-call and tool-result)
    expect(mockOnToolMessage).toHaveBeenCalledTimes(2);

    // Check the first call is the tool-call message
    const toolCallMessage = mockOnToolMessage.mock.calls[0][0];
    expect(toolCallMessage.role).toBe('tool');
    expect(toolCallMessage.toolCallId).toBe('call_message_test');
    expect(toolCallMessage.toolName).toBe('callAgent');

    // Verify the message content includes tool-call type
    const toolCallContent = toolCallMessage.content.find((c: any) => c.type === 'tool-call');
    expect(toolCallContent).toBeDefined();
    expect(toolCallContent.toolCallId).toBe('call_message_test');
  });

  it('should parse stringified arrays in tool input fields', async () => {
    const mockCodeSearchExecute = vi.fn().mockResolvedValue({
      success: true,
      result: 'Search completed',
    });

    const codeSearchTools: ToolSet = {
      codeSearch: {
        description: 'Search code files',
        inputSchema: z.object({}),
        execute: mockCodeSearchExecute,
      },
    };

    const toolCall = {
      toolCallId: 'call_codesearch_123',
      toolName: 'codeSearch',
      input: {
        pattern: 'fragment.*pipeline.*driver',
        path: '/Users/test/starrocks',
        file_types: '["cpp", "h"]', // Stringified array
      },
    };

    await toolExecutor.executeToolCall(toolCall, {
      tools: codeSearchTools,
      loopState: mockLoopState,
      model: 'test-model',
      onToolMessage: mockOnToolMessage,
    });

    expect(mockCodeSearchExecute).toHaveBeenCalledTimes(1);

    const executeArgs = mockCodeSearchExecute.mock.calls[0][0];

    // Verify file_types was parsed from string to array
    expect(Array.isArray(executeArgs.file_types)).toBe(true);
    expect(executeArgs.file_types).toEqual(['cpp', 'h']);
    expect(executeArgs.pattern).toBe('fragment.*pipeline.*driver');
    expect(executeArgs.path).toBe('/Users/test/starrocks');
  });

  it('should parse stringified objects in tool input fields', async () => {
    const mockToolExecute = vi.fn().mockResolvedValue({ success: true });

    const testTools: ToolSet = {
      testTool: {
        description: 'Test tool',
        inputSchema: z.object({}),
        execute: mockToolExecute,
      },
    };

    const toolCall = {
      toolCallId: 'call_test_obj',
      toolName: 'testTool',
      input: {
        name: 'test',
        config: '{"key": "value", "nested": {"foo": "bar"}}', // Stringified object
      },
    };

    await toolExecutor.executeToolCall(toolCall, {
      tools: testTools,
      loopState: mockLoopState,
      model: 'test-model',
      onToolMessage: mockOnToolMessage,
    });

    expect(mockToolExecute).toHaveBeenCalledTimes(1);

    const executeArgs = mockToolExecute.mock.calls[0][0];

    // Verify config was parsed from string to object
    expect(typeof executeArgs.config).toBe('object');
    expect(executeArgs.config).toEqual({ key: 'value', nested: { foo: 'bar' } });
    expect(executeArgs.name).toBe('test');
  });

  it('should keep regular strings unchanged', async () => {
    const mockToolExecute = vi.fn().mockResolvedValue({ success: true });

    const testTools: ToolSet = {
      testTool: {
        description: 'Test tool',
        inputSchema: z.object({}),
        execute: mockToolExecute,
      },
    };

    const toolCall = {
      toolCallId: 'call_test_str',
      toolName: 'testTool',
      input: {
        message: 'This is a regular string',
        path: '/some/path/file.txt',
      },
    };

    await toolExecutor.executeToolCall(toolCall, {
      tools: testTools,
      loopState: mockLoopState,
      model: 'test-model',
      onToolMessage: mockOnToolMessage,
    });

    expect(mockToolExecute).toHaveBeenCalledTimes(1);

    const executeArgs = mockToolExecute.mock.calls[0][0];

    // Verify strings are kept unchanged
    expect(executeArgs.message).toBe('This is a regular string');
    expect(executeArgs.path).toBe('/some/path/file.txt');
  });

  it('should handle invalid JSON strings gracefully', async () => {
    const mockToolExecute = vi.fn().mockResolvedValue({ success: true });

    const testTools: ToolSet = {
      testTool: {
        description: 'Test tool',
        inputSchema: z.object({}),
        execute: mockToolExecute,
      },
    };

    const toolCall = {
      toolCallId: 'call_test_invalid',
      toolName: 'testTool',
      input: {
        data: '[invalid json', // Invalid JSON that looks like array
      },
    };

    await toolExecutor.executeToolCall(toolCall, {
      tools: testTools,
      loopState: mockLoopState,
      model: 'test-model',
      onToolMessage: mockOnToolMessage,
    });

    expect(mockToolExecute).toHaveBeenCalledTimes(1);

    const executeArgs = mockToolExecute.mock.calls[0][0];

    // Verify invalid JSON is kept as string
    expect(executeArgs.data).toBe('[invalid json');
  });
});
