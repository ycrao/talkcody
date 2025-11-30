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

describe('MessageFilter', () => {
  let messageFilter: MessageFilter;

  beforeEach(() => {
    vi.clearAllMocks();
    messageFilter = new MessageFilter();
  });

  describe('filterDuplicateFileReads', () => {
    it('should not filter file reads with different line ranges', () => {
      // Test case: Reading same file but different line ranges should NOT be considered duplicates
      const messages: ModelMessage[] = [
        // First read: lines 100-150 (50 lines)
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'readFile',
              input: {
                file_path: '/project/src/lib/tools/read-file-tool.tsx',
                start_line: 100,
                line_count: 50,
              },
            } as ToolCallPart,
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'readFile',
              output: { type: 'text', value: 'Lines 100-150 content' },
            } as ToolResultPart,
          ],
        },
        // Second read: lines 150-250 (100 lines)
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'readFile',
              input: {
                file_path: '/project/src/lib/tools/read-file-tool.tsx',
                start_line: 150,
                line_count: 100,
              },
            } as ToolCallPart,
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-2',
              toolName: 'readFile',
              output: { type: 'text', value: 'Lines 150-250 content' },
            } as ToolResultPart,
          ],
        },
      ];

      const filtered = messageFilter.filterDuplicateFileReads(messages);

      // Both reads should be preserved since they have different line ranges
      expect(filtered.length).toBe(4);
      expect(filtered).toEqual(messages);
    });

    it('should filter truly duplicate file reads (same file, same line range)', () => {
      // Test case: Reading same file with same line range should be considered duplicates
      const messages: ModelMessage[] = [
        // First read: lines 100-150
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'readFile',
              input: {
                file_path: '/project/src/lib/tools/read-file-tool.tsx',
                start_line: 100,
                line_count: 50,
              },
            } as ToolCallPart,
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'readFile',
              output: { type: 'text', value: 'Lines 100-150 content' },
            } as ToolResultPart,
          ],
        },
        // Second read: same file, same line range (duplicate)
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'readFile',
              input: {
                file_path: '/project/src/lib/tools/read-file-tool.tsx',
                start_line: 100,
                line_count: 50,
              },
            } as ToolCallPart,
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-2',
              toolName: 'readFile',
              output: { type: 'text', value: 'Lines 100-150 content' },
            } as ToolResultPart,
          ],
        },
      ];

      const filtered = messageFilter.filterDuplicateFileReads(messages);

      // Only the second read should be kept (first read is removed)
      expect(filtered.length).toBe(2);
      expect(filtered[0]).toEqual(messages[2]); // Second tool call
      expect(filtered[1]).toEqual(messages[3]); // Second tool result
    });

    it('should filter duplicate full file reads (no line range specified)', () => {
      // Test case: Reading same file without line range should be considered duplicates
      const messages: ModelMessage[] = [
        // First full read
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'readFile',
              input: {
                file_path: '/project/src/lib/tools/read-file-tool.tsx',
              },
            } as ToolCallPart,
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'readFile',
              output: { type: 'text', value: 'Full file content' },
            } as ToolResultPart,
          ],
        },
        // Second full read (duplicate)
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'readFile',
              input: {
                file_path: '/project/src/lib/tools/read-file-tool.tsx',
              },
            } as ToolCallPart,
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-2',
              toolName: 'readFile',
              output: { type: 'text', value: 'Full file content' },
            } as ToolResultPart,
          ],
        },
      ];

      const filtered = messageFilter.filterDuplicateFileReads(messages);

      // Only the second read should be kept
      expect(filtered.length).toBe(2);
      expect(filtered[0]).toEqual(messages[2]);
      expect(filtered[1]).toEqual(messages[3]);
    });

    it('should not filter full file read vs partial file read as duplicates', () => {
      // Test case: Full file read and partial read should not be considered duplicates
      const messages: ModelMessage[] = [
        // Full file read
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'readFile',
              input: {
                file_path: '/project/src/lib/tools/read-file-tool.tsx',
              },
            } as ToolCallPart,
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'readFile',
              output: { type: 'text', value: 'Full file content' },
            } as ToolResultPart,
          ],
        },
        // Partial file read
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'readFile',
              input: {
                file_path: '/project/src/lib/tools/read-file-tool.tsx',
                start_line: 100,
                line_count: 50,
              },
            } as ToolCallPart,
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-2',
              toolName: 'readFile',
              output: { type: 'text', value: 'Partial content' },
            } as ToolResultPart,
          ],
        },
      ];

      const filtered = messageFilter.filterDuplicateFileReads(messages);

      // Both reads should be preserved
      expect(filtered.length).toBe(4);
      expect(filtered).toEqual(messages);
    });
  });
});
