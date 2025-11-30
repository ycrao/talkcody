import { vi } from 'vitest';
import type { CodeSearchResult } from '@/lib/tools/code-search-tool';

// Mock the Tauri core API
const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { codeSearch } from '@/lib/tools/code-search-tool';

describe('codeSearch Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockClear();
  });

  // Helper function to normalize the result
  const normalizeResult = async (result: any): Promise<CodeSearchResult> => {
    if (result instanceof Promise) {
      return await result;
    }
    if (Symbol.asyncIterator in result) {
      const iterator = result[Symbol.asyncIterator]();
      const { value } = await iterator.next();
      return value;
    }
    return result;
  };

  it('should execute a basic search successfully', async () => {
    const mockResult = [
      {
        file_path: 'test.ts',
        matches: [
          {
            line_number: 1,
            line_content: 'console.log("hello");',
            byte_offset: 0,
          },
        ],
      },
    ];

    mockInvoke.mockResolvedValue(mockResult);

    const result = await codeSearch.execute?.({
      pattern: 'console.log',
      path: '/Users/test/project',
    });

    const actualResult = await normalizeResult(result);

    expect(actualResult.success).toBe(true);
    expect(actualResult.result).toContain('console.log');
    expect(mockInvoke).toHaveBeenCalledWith('search_file_content', {
      query: 'console.log',
      rootPath: '/Users/test/project',
      fileTypes: null,
    });
  });

  it('should handle search with file type filters', async () => {
    const mockResult = [
      {
        file_path: 'utils.ts',
        matches: [
          {
            line_number: 5,
            line_content: 'function getName() {',
            byte_offset: 100,
          },
        ],
      },
    ];

    mockInvoke.mockResolvedValue(mockResult);

    const result = await codeSearch.execute?.({
      pattern: 'function',
      path: '/Users/test/project',
      file_types: ['ts', 'tsx'],
    });

    const actualResult = await normalizeResult(result);

    expect(actualResult.success).toBe(true);
    expect(actualResult.result).toContain('function');
    expect(mockInvoke).toHaveBeenCalledWith('search_file_content', {
      query: 'function',
      rootPath: '/Users/test/project',
      fileTypes: ['ts', 'tsx'],
    });
  });

  it('should handle search with exclude directories', async () => {
    const mockResult = [
      {
        file_path: 'src/components/Button.tsx',
        matches: [
          {
            line_number: 1,
            line_content: "import React from 'react';",
            byte_offset: 0,
          },
        ],
      },
    ];

    mockInvoke.mockResolvedValue(mockResult);

    const result = await codeSearch.execute?.({
      pattern: 'import',
      path: '/Users/test/project',
    });

    const actualResult = await normalizeResult(result);

    expect(actualResult.success).toBe(true);
    expect(actualResult.result).toContain('import');
    expect(mockInvoke).toHaveBeenCalledWith('search_file_content', {
      query: 'import',
      rootPath: '/Users/test/project',
      fileTypes: null,
    });
  });

  it('should escape single quotes in pattern', async () => {
    const mockResult = [
      {
        file_path: 'test.ts',
        matches: [
          {
            line_number: 1,
            line_content: 'const message = "don\'t match";',
            byte_offset: 0,
          },
        ],
      },
    ];

    mockInvoke.mockResolvedValue(mockResult);

    const result = await codeSearch.execute?.({
      pattern: "don't match",
      path: '/Users/test/project',
    });

    const actualResult = await normalizeResult(result);

    expect(actualResult.success).toBe(true);
    expect(actualResult.result).toContain("don't");
    expect(mockInvoke).toHaveBeenCalledWith('search_file_content', {
      query: "don't match",
      rootPath: '/Users/test/project',
      fileTypes: null,
    });
  });

  it('should handle no matches found', async () => {
    const mockResult: Array<{
      file_path: string;
      matches: Array<{
        line_number: number;
        line_content: string;
        byte_offset: number;
      }>;
    }> = []; // Empty array when no matches found

    mockInvoke.mockResolvedValue(mockResult);

    const result = await codeSearch.execute?.({
      pattern: 'nonexistent',
      path: '/Users/test/project',
    });

    const actualResult = await normalizeResult(result);

    expect(actualResult.success).toBe(true);
    expect(actualResult.result).toBe('No matches found');
  });

  it('should handle ripgrep not installed', async () => {
    const error = new Error('command not found: rg');
    mockInvoke.mockRejectedValue(error);

    const result = await codeSearch.execute?.({
      pattern: 'test',
      path: '/Users/test/project',
    });

    const actualResult = await normalizeResult(result);

    expect(actualResult.success).toBe(false);
    expect(actualResult.result).toBe('Error executing code search');
    expect(actualResult.error).toBe('command not found: rg');
  });

  it('should handle generic execution error', async () => {
    const error = new Error('Permission denied');
    mockInvoke.mockRejectedValue(error);

    const result = await codeSearch.execute?.({
      pattern: 'test',
      path: '/Users/test/project',
    });

    const actualResult = await normalizeResult(result);

    expect(actualResult.success).toBe(false);
    expect(actualResult.result).toBe('Error executing code search');
    expect(actualResult.error).toBe('Permission denied');
  });

  it('should handle error with stderr', async () => {
    const error = new Error('Error: Invalid regex pattern');
    mockInvoke.mockRejectedValue(error);

    const result = await codeSearch.execute?.({
      pattern: '[invalid',
      path: '/Users/test/project',
    });

    const actualResult = await normalizeResult(result);

    expect(actualResult.success).toBe(false);
    expect(actualResult.result).toBe('Error executing code search');
    expect(actualResult.error).toBe('Error: Invalid regex pattern');
  });

  it('should handle cpp and h file types correctly without string serialization', async () => {
    const mockResult = [
      {
        file_path: 'test.cpp',
        matches: [
          {
            line_number: 10,
            line_content: 'void fragment_pipeline_driver() {',
            byte_offset: 200,
          },
        ],
      },
      {
        file_path: 'test.h',
        matches: [
          {
            line_number: 5,
            line_content: 'class FragmentPipelineDriver;',
            byte_offset: 100,
          },
        ],
      },
    ];

    mockInvoke.mockResolvedValue(mockResult);

    const result = await codeSearch.execute?.({
      pattern: 'fragment.*pipeline.*driver',
      path: '/Users/test/starrocks',
      file_types: ['cpp', 'h'],
    });

    const actualResult = await normalizeResult(result);

    expect(actualResult.success).toBe(true);
    expect(actualResult.result).toContain('fragment');
    expect(mockInvoke).toHaveBeenCalledWith('search_file_content', {
      query: 'fragment.*pipeline.*driver',
      rootPath: '/Users/test/starrocks',
      fileTypes: ['cpp', 'h'],
    });

    // Verify that fileTypes is passed as an array, not as a stringified array
    const callArgs = mockInvoke.mock.calls[0][1];
    expect(Array.isArray(callArgs.fileTypes)).toBe(true);
    expect(callArgs.fileTypes).toEqual(['cpp', 'h']);
  });

  it('should search in .log files even if they are in .gitignore', async () => {
    const mockResult = [
      {
        file_path: '/Users/test/starrocks/128_stack.log',
        matches: [
          {
            line_number: 42,
            line_content: '  at java.util.concurrent.ForkJoinTask.doExec(ForkJoinTask.java:289)',
            byte_offset: 1500,
          },
          {
            line_number: 48,
            line_content: '  at java.util.concurrent.ForkJoinTask.invoke(ForkJoinTask.java:734)',
            byte_offset: 1800,
          },
        ],
      },
    ];

    mockInvoke.mockResolvedValue(mockResult);

    const result = await codeSearch.execute?.({
      pattern: 'ForkJoinTask',
      path: '/Users/test/starrocks',
      file_types: ['log'],
    });

    const actualResult = await normalizeResult(result);

    expect(actualResult.success).toBe(true);
    expect(actualResult.result).toContain('ForkJoinTask');
    expect(actualResult.result).toContain('128_stack.log');
    expect(mockInvoke).toHaveBeenCalledWith('search_file_content', {
      query: 'ForkJoinTask',
      rootPath: '/Users/test/starrocks',
      fileTypes: ['log'],
    });
  });
});
