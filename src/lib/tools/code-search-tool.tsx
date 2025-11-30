import { invoke } from '@tauri-apps/api/core';
import { Search } from 'lucide-react';
import { z } from 'zod';
import { GenericToolDoing } from '@/components/tools/generic-tool-doing';
import { GenericToolResult } from '@/components/tools/generic-tool-result';
import { createTool } from '@/lib/create-tool';
import { logger } from '@/lib/logger';

export interface CodeSearchResult {
  success: boolean;
  result: string;
  error?: string;
}

export const codeSearch = createTool({
  name: 'GrepTool',
  description: `Use this tool when you need to find files containing specific patterns.

Use this to find code patterns, function definitions, variable usage, or any text in the codebase.`,

  inputSchema: z.object({
    pattern: z.string().describe('The regular expression pattern to search for in file contents'),
    path: z.string().describe('The absolute path to the directory to search in.'),
    file_types: z
      .array(z.string())
      .optional()
      .describe('File extensions to search (e.g., ["ts", "tsx", "js"])'),
  }),
  canConcurrent: true,
  execute: async ({ pattern, path, file_types }): Promise<CodeSearchResult> => {
    try {
      // Validate required parameters before calling Rust command
      if (!path || path.trim() === '') {
        return {
          success: false,
          result: 'Error: Missing required parameter',
          error:
            'The "path" parameter is required. Please provide the absolute path to the directory to search in.',
        };
      }

      logger.info('Executing Rust RipgrepSearch with:', {
        pattern,
        path,
        file_types,
      });

      // Use Rust RipgrepSearch via Tauri command with new optional parameters
      const searchResults: Array<{
        file_path: string;
        matches: Array<{
          line_number: number;
          line_content: string;
          byte_offset: number;
        }>;
      }> = await invoke('search_file_content', {
        query: pattern,
        rootPath: path,
        fileTypes: file_types || null,
      });

      if (searchResults && searchResults.length > 0) {
        // Format results for better readability
        let formattedResults = '';
        let totalMatches = 0;

        for (const fileResult of searchResults) {
          formattedResults += `\nFile: ${fileResult.file_path}\n`;
          for (const match of fileResult.matches) {
            formattedResults += `  ${match.line_number}: ${match.line_content.trim()}\n`;
            totalMatches++;
          }
        }

        logger.info(`Total matches found: ${totalMatches}`);
        logger.info(`Search results:\n${formattedResults.trim()}`);

        return {
          success: true,
          result: `Found ${totalMatches} matches:\n${formattedResults.trim()}`,
        };
      }

      return {
        success: true,
        result: 'No matches found',
      };
    } catch (error) {
      logger.error('Error executing Rust code search:', error);

      return {
        success: false,
        result: 'Error executing code search',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
  renderToolDoing: ({ pattern, path, file_types }) => {
    // Format file types for display
    const fileTypesText = file_types && file_types.length > 0 ? file_types.join(', ') : 'All files';

    const details = `Pattern: ${pattern}\nPath: ${path}\nFile Types: ${fileTypesText}`;

    return (
      <GenericToolDoing
        type="search"
        operation="search"
        target={pattern || 'Unknown pattern'}
        details={details}
      />
    );
  },
  renderToolResult: (
    output: CodeSearchResult,
    {
      pattern = 'Unknown pattern',
      path: _path = 'Unknown path',
      file_types: _file_types = [],
    }: { pattern?: string; path?: string; file_types?: string[] } = {}
  ) => {
    if (!output.success) {
      return (
        <GenericToolResult
          type="search"
          operation="search"
          success={false}
          target={pattern}
          error={output.error}
        />
      );
    }

    // Check if "No matches found" to show appropriate message
    const isNoMatches = output.result === 'No matches found';
    const targetName = pattern;

    if (isNoMatches) {
      return (
        <GenericToolResult
          type="search"
          operation="search"
          success={true}
          target={targetName}
          message="No matches found"
        />
      );
    }

    // For successful searches, show the generic result first, then detailed results
    return (
      <div className="space-y-3">
        <div className="border rounded-lg p-3 bg-white dark:bg-gray-900 dark:border-gray-700 w-full overflow-hidden">
          <div className="flex items-center gap-2 text-gray-700 border-b pb-2 dark:text-gray-300 dark:border-gray-600">
            <Search className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium">Search Results</span>
          </div>

          <pre className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm overflow-y-auto overflow-x-hidden max-h-96 mt-3 text-gray-800 dark:text-gray-200 font-mono border border-gray-200 dark:border-gray-700 whitespace-pre-wrap break-words">
            {output.result}
          </pre>
        </div>
      </div>
    );
  },
});
