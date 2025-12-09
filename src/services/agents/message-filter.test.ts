import type { ModelMessage, ToolCallPart, ToolResultPart } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageFilter } from './message-filter';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create a tool-call message
function createToolCallMessage(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>
): ModelMessage {
  return {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId,
        toolName,
        input,
      } as ToolCallPart,
    ],
  };
}

// Helper to create a tool-result message
function createToolResultMessage(
  toolCallId: string,
  toolName: string,
  output: string
): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId,
        toolName,
        output: { type: 'text', value: output },
      } as ToolResultPart,
    ],
  };
}

// Helper to create a readFile tool-call/result pair
function createReadFilePair(
  callId: string,
  filePath: string,
  options?: { start_line?: number; line_count?: number }
): [ModelMessage, ModelMessage] {
  return [
    createToolCallMessage(callId, 'readFile', { file_path: filePath, ...options }),
    createToolResultMessage(callId, 'readFile', `Content of ${filePath}`),
  ];
}

describe('MessageFilter', () => {
  let messageFilter: MessageFilter;

  beforeEach(() => {
    vi.clearAllMocks();
    messageFilter = new MessageFilter();
  });

  describe('filterMessages', () => {
    it('should return empty array for empty input', () => {
      const result = messageFilter.filterMessages([]);
      expect(result).toEqual([]);
    });

    it('should return messages unchanged when nothing to filter', () => {
      const messages: ModelMessage[] = [
        { role: 'user', content: 'Hello' },
        createToolCallMessage('call-1', 'readFile', { file_path: '/file1.ts' }),
        createToolResultMessage('call-1', 'readFile', 'content'),
        { role: 'assistant', content: 'Done' },
      ];

      const result = messageFilter.filterMessages(messages);
      expect(result).toEqual(messages);
    });

    it('should filter duplicate file reads and their corresponding tool-results', () => {
      const [call1, result1] = createReadFilePair('call-1', '/file.ts');
      const [call2, result2] = createReadFilePair('call-2', '/file.ts');

      const messages: ModelMessage[] = [call1, result1, call2, result2];

      const result = messageFilter.filterMessages(messages);

      // Should keep only the second pair (most recent)
      expect(result.length).toBe(2);
      expect(result[0]).toEqual(call2);
      expect(result[1]).toEqual(result2);
    });

    it('should filter tool-call and tool-result together for exploratory tools', () => {
      // Create 25 messages to exceed protection window (20)
      const messages: ModelMessage[] = [];

      // Add an exploratory tool at the beginning (outside protection window)
      messages.push(createToolCallMessage('call-glob', 'glob', { pattern: '*.ts' }));
      messages.push(createToolResultMessage('call-glob', 'glob', 'file1.ts\nfile2.ts'));

      // Add filler messages to push glob outside protection window
      for (let i = 0; i < 23; i++) {
        messages.push({ role: 'user', content: `Message ${i}` });
      }

      const result = messageFilter.filterMessages(messages);

      // The glob tool-call and tool-result should be filtered
      expect(result.length).toBe(23);
      expect(result.every((m) => m.role === 'user')).toBe(true);
    });

    it('should preserve exploratory tools within protection window', () => {
      const messages: ModelMessage[] = [
        { role: 'user', content: 'Hello' },
        createToolCallMessage('call-glob', 'glob', { pattern: '*.ts' }),
        createToolResultMessage('call-glob', 'glob', 'file1.ts'),
      ];

      const result = messageFilter.filterMessages(messages);

      // All messages should be preserved (within protection window)
      expect(result.length).toBe(3);
    });
  });

  describe('filterDuplicateFileReads', () => {
    it('should not filter file reads with different line ranges', () => {
      const messages: ModelMessage[] = [
        ...createReadFilePair('call-1', '/file.ts', { start_line: 100, line_count: 50 }),
        ...createReadFilePair('call-2', '/file.ts', { start_line: 150, line_count: 100 }),
      ];

      const filtered = messageFilter.filterDuplicateFileReads(messages);

      // Both reads should be preserved since they have different line ranges
      expect(filtered.length).toBe(4);
      expect(filtered).toEqual(messages);
    });

    it('should filter truly duplicate file reads (same file, same line range)', () => {
      const messages: ModelMessage[] = [
        ...createReadFilePair('call-1', '/file.ts', { start_line: 100, line_count: 50 }),
        ...createReadFilePair('call-2', '/file.ts', { start_line: 100, line_count: 50 }),
      ];

      const filtered = messageFilter.filterDuplicateFileReads(messages);

      // Only the second read should be kept (first read is removed)
      expect(filtered.length).toBe(2);
      // Verify it's the second pair
      const toolCall = filtered[0];
      expect(toolCall.role).toBe('assistant');
      if (toolCall.role === 'assistant' && Array.isArray(toolCall.content)) {
        const part = toolCall.content[0] as ToolCallPart;
        expect(part.toolCallId).toBe('call-2');
      }
    });

    it('should filter duplicate full file reads (no line range specified)', () => {
      const messages: ModelMessage[] = [
        ...createReadFilePair('call-1', '/file.ts'),
        ...createReadFilePair('call-2', '/file.ts'),
      ];

      const filtered = messageFilter.filterDuplicateFileReads(messages);

      // Only the second read should be kept
      expect(filtered.length).toBe(2);
    });

    it('should not filter full file read vs partial file read as duplicates', () => {
      const messages: ModelMessage[] = [
        ...createReadFilePair('call-1', '/file.ts'),
        ...createReadFilePair('call-2', '/file.ts', { start_line: 100, line_count: 50 }),
      ];

      const filtered = messageFilter.filterDuplicateFileReads(messages);

      // Both reads should be preserved
      expect(filtered.length).toBe(4);
      expect(filtered).toEqual(messages);
    });
  });

  describe('tool-call and tool-result pairing', () => {
    it('should filter both tool-call and tool-result when filtering duplicates', () => {
      const messages: ModelMessage[] = [
        ...createReadFilePair('call-1', '/file.ts'),
        { role: 'user', content: 'What is in the file?' },
        ...createReadFilePair('call-2', '/file.ts'),
      ];

      const result = messageFilter.filterMessages(messages);

      // Should have: user message + second pair
      expect(result.length).toBe(3);

      // Verify no orphaned tool-results
      const toolCallIds = new Set<string>();
      const toolResultIds = new Set<string>();

      for (const msg of result) {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'tool-call') {
              toolCallIds.add((part as ToolCallPart).toolCallId);
            }
          }
        }
        if (msg.role === 'tool' && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'tool-result') {
              toolResultIds.add((part as ToolResultPart).toolCallId);
            }
          }
        }
      }

      // Every tool-call should have a matching tool-result and vice versa
      expect(toolCallIds).toEqual(toolResultIds);
    });

    it('should handle assistant message with multiple tool-calls', () => {
      const messages: ModelMessage[] = [
        // First read of file1 and file2
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'readFile',
              input: { file_path: '/file1.ts' },
            } as ToolCallPart,
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'readFile',
              input: { file_path: '/file2.ts' },
            } as ToolCallPart,
          ],
        },
        createToolResultMessage('call-1', 'readFile', 'content1'),
        createToolResultMessage('call-2', 'readFile', 'content2'),
        // Second read of file1 only
        ...createReadFilePair('call-3', '/file1.ts'),
      ];

      const result = messageFilter.filterMessages(messages);

      // call-1 should be filtered (duplicate of call-3)
      // call-2 should remain (file2 is unique)
      // call-3 should remain (most recent file1)
      expect(result.length).toBe(4);

      // Verify call-1 is removed but call-2 remains in first assistant message
      const firstAssistant = result[0];
      expect(firstAssistant.role).toBe('assistant');
      if (firstAssistant.role === 'assistant' && Array.isArray(firstAssistant.content)) {
        expect(firstAssistant.content.length).toBe(1);
        const part = firstAssistant.content[0] as ToolCallPart;
        expect(part.toolCallId).toBe('call-2');
      }
    });

    it('should remove empty messages after filtering all parts', () => {
      const messages: ModelMessage[] = [
        // Single tool-call that will be filtered
        createToolCallMessage('call-1', 'readFile', { file_path: '/file.ts' }),
        createToolResultMessage('call-1', 'readFile', 'content'),
        // Duplicate that keeps
        createToolCallMessage('call-2', 'readFile', { file_path: '/file.ts' }),
        createToolResultMessage('call-2', 'readFile', 'content'),
      ];

      const result = messageFilter.filterMessages(messages);

      // Only the second pair should remain
      expect(result.length).toBe(2);
      // No empty messages
      for (const msg of result) {
        if (Array.isArray(msg.content)) {
          expect(msg.content.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('mixed content handling', () => {
    it('should preserve text parts when filtering tool-calls from assistant message', () => {
      const messages: ModelMessage[] = [
        // Assistant message with text + tool-call
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me read the file for you.' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'readFile',
              input: { file_path: '/file.ts' },
            } as ToolCallPart,
          ],
        },
        createToolResultMessage('call-1', 'readFile', 'content'),
        // Duplicate read
        ...createReadFilePair('call-2', '/file.ts'),
      ];

      const result = messageFilter.filterMessages(messages);

      // After filtering:
      // - First assistant message loses tool-call (duplicate), keeps text
      // - First tool-result is removed (orphaned - no matching tool-call)
      // - Second assistant message with tool-call remains
      // - Second tool-result remains
      // MessageFilter now delegates consecutive assistant merging to message-convert module,
      // which is called separately by llm-service. So we get 3 messages here.
      expect(result.length).toBe(3);

      // First assistant should only have text (tool-call was filtered)
      const firstAssistant = result[0];
      expect(firstAssistant?.role).toBe('assistant');
      if (firstAssistant?.role === 'assistant' && Array.isArray(firstAssistant.content)) {
        expect(firstAssistant.content.length).toBe(1);
        expect(firstAssistant.content[0]?.type).toBe('text');
      }

      // Second assistant should have tool-call
      const secondAssistant = result[1];
      expect(secondAssistant?.role).toBe('assistant');
      if (secondAssistant?.role === 'assistant' && Array.isArray(secondAssistant.content)) {
        expect(secondAssistant.content[0]?.type).toBe('tool-call');
      }
    });
  });

  describe('schema validation', () => {
    it('should return valid messages that pass schema validation', () => {
      const messages: ModelMessage[] = [
        { role: 'user', content: 'Hello' },
        createToolCallMessage('call-1', 'readFile', { file_path: '/file.ts' }),
        createToolResultMessage('call-1', 'readFile', 'content'),
      ];

      const result = messageFilter.filterMessages(messages);

      // Should pass validation
      expect(result).toEqual(messages);
    });

    it('should ensure no orphaned tool-calls after filtering', () => {
      const messages: ModelMessage[] = [
        ...createReadFilePair('call-1', '/file.ts'),
        ...createReadFilePair('call-2', '/file.ts'),
      ];

      const result = messageFilter.filterMessages(messages);

      // Collect tool-call and tool-result IDs
      const toolCallIds = new Set<string>();
      const toolResultIds = new Set<string>();

      for (const msg of result) {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'tool-call') {
              toolCallIds.add((part as ToolCallPart).toolCallId);
            }
          }
        }
        if (msg.role === 'tool' && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'tool-result') {
              toolResultIds.add((part as ToolResultPart).toolCallId);
            }
          }
        }
      }

      // No orphans
      expect(toolCallIds).toEqual(toolResultIds);
    });

    it('should ensure no orphaned tool-results after filtering', () => {
      // Same test as above but explicitly checking tool-results
      const messages: ModelMessage[] = [
        ...createReadFilePair('call-1', '/file.ts'),
        { role: 'user', content: 'Middle message' },
        ...createReadFilePair('call-2', '/file.ts'),
      ];

      const result = messageFilter.filterMessages(messages);

      const toolCallIds = new Set<string>();
      const toolResultIds = new Set<string>();

      for (const msg of result) {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'tool-call') {
              toolCallIds.add((part as ToolCallPart).toolCallId);
            }
          }
        }
        if (msg.role === 'tool' && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'tool-result') {
              toolResultIds.add((part as ToolResultPart).toolCallId);
            }
          }
        }
      }

      // All tool-results should have matching tool-calls
      for (const resultId of toolResultIds) {
        expect(toolCallIds.has(resultId)).toBe(true);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle messages with no tool-calls', () => {
      const messages: ModelMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      const result = messageFilter.filterMessages(messages);
      expect(result).toEqual(messages);
    });

    it('should handle system messages', () => {
      const messages: ModelMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
        ...createReadFilePair('call-1', '/file.ts'),
      ];

      const result = messageFilter.filterMessages(messages);
      expect(result).toEqual(messages);
    });

    it('should handle multiple different files without filtering', () => {
      const messages: ModelMessage[] = [
        ...createReadFilePair('call-1', '/file1.ts'),
        ...createReadFilePair('call-2', '/file2.ts'),
        ...createReadFilePair('call-3', '/file3.ts'),
      ];

      const result = messageFilter.filterMessages(messages);
      expect(result).toEqual(messages);
    });

    it('should handle three reads of same file, keeping only the last', () => {
      const messages: ModelMessage[] = [
        ...createReadFilePair('call-1', '/file.ts'),
        ...createReadFilePair('call-2', '/file.ts'),
        ...createReadFilePair('call-3', '/file.ts'),
      ];

      const result = messageFilter.filterMessages(messages);

      // Only the last pair should remain
      expect(result.length).toBe(2);

      const toolCall = result[0];
      if (toolCall.role === 'assistant' && Array.isArray(toolCall.content)) {
        const part = toolCall.content[0] as ToolCallPart;
        expect(part.toolCallId).toBe('call-3');
      }
    });
  });

  describe('filterExploratoryTools', () => {
    it('should filter glob tool outside protection window', () => {
      const messages: ModelMessage[] = [];

      // Add glob at the beginning
      messages.push(createToolCallMessage('call-glob', 'glob', { pattern: '*.ts' }));
      messages.push(createToolResultMessage('call-glob', 'glob', 'files'));

      // Add enough messages to push glob outside protection window
      for (let i = 0; i < 25; i++) {
        messages.push({ role: 'user', content: `msg ${i}` });
      }

      const result = messageFilter.filterExploratoryTools(messages);

      // Glob should be filtered
      expect(result.length).toBe(25);
    });

    it('should filter listFiles tool outside protection window', () => {
      const messages: ModelMessage[] = [];

      messages.push(createToolCallMessage('call-list', 'listFiles', { path: '/src' }));
      messages.push(createToolResultMessage('call-list', 'listFiles', 'files'));

      for (let i = 0; i < 25; i++) {
        messages.push({ role: 'user', content: `msg ${i}` });
      }

      const result = messageFilter.filterExploratoryTools(messages);
      expect(result.length).toBe(25);
    });

    it('should filter codeSearch tool outside protection window', () => {
      const messages: ModelMessage[] = [];

      messages.push(createToolCallMessage('call-search', 'codeSearch', { query: 'function' }));
      messages.push(createToolResultMessage('call-search', 'codeSearch', 'results'));

      for (let i = 0; i < 25; i++) {
        messages.push({ role: 'user', content: `msg ${i}` });
      }

      const result = messageFilter.filterExploratoryTools(messages);
      expect(result.length).toBe(25);
    });

    it('should not filter non-exploratory tools', () => {
      const messages: ModelMessage[] = [];

      messages.push(createToolCallMessage('call-edit', 'editFile', { file_path: '/file.ts' }));
      messages.push(createToolResultMessage('call-edit', 'editFile', 'edited'));

      for (let i = 0; i < 25; i++) {
        messages.push({ role: 'user', content: `msg ${i}` });
      }

      const result = messageFilter.filterExploratoryTools(messages);

      // editFile should NOT be filtered (not exploratory)
      expect(result.length).toBe(27);
    });
  });
});
