// src/lib/tools/tool-metadata.ts

/**
 * Tool metadata for dependency analysis and smart concurrency
 */

export type ToolCategory = 'read' | 'write' | 'edit' | 'other';

export interface ToolMetadata {
  /** Category of the tool: read, write, edit, or other */
  category: ToolCategory;
  /** Whether this tool can run concurrently with tools of the same type */
  canConcurrent: boolean;
  /** Whether this tool operates on files */
  fileOperation: boolean;
  /** Extract target file path from tool input (for file operations) */
  getTargetFile?: (input: any) => string | null;
  /** Whether to render "doing" UI for this tool. Set to false for fast operations to avoid UI flash. Default: true */
  renderDoingUI?: boolean;
}

/**
 * Metadata registry for all tools
 * Used by ToolDependencyAnalyzer to determine execution strategy
 */
export const TOOL_METADATA: Record<string, ToolMetadata> = {
  // Read-only tools - can all run in parallel
  readFile: {
    category: 'read',
    canConcurrent: true,
    fileOperation: true,
    getTargetFile: (input) => input?.file_path || null,
  },
  globTool: {
    category: 'read',
    canConcurrent: true,
    fileOperation: false,
  },
  codeSearch: {
    category: 'read',
    canConcurrent: true,
    fileOperation: false,
  },
  listFiles: {
    category: 'read',
    canConcurrent: true,
    fileOperation: false,
  },

  // Write tools - can run in parallel for different files
  writeFile: {
    category: 'write',
    canConcurrent: false, // Global flag, but same category can be parallelized by file
    fileOperation: true,
    getTargetFile: (input) => input?.file_path || null,
  },

  // Edit tools - can run in parallel for different files
  editFile: {
    category: 'edit',
    canConcurrent: false, // Global flag, but same category can be parallelized by file
    fileOperation: true,
    getTargetFile: (input) => input?.file_path || null,
  },

  editFileMulti: {
    category: 'edit',
    canConcurrent: false, // Global flag, but same category can be parallelized by file
    fileOperation: true,
    getTargetFile: (input) => input?.file_path || null,
  },

  // Other tools - run based on their individual canConcurrent flag
  callAgent: {
    category: 'other',
    canConcurrent: false,
    fileOperation: false,
  },
  bashTool: {
    category: 'other',
    canConcurrent: false,
    fileOperation: false,
  },
  todoWriteTool: {
    category: 'other',
    canConcurrent: false,
    fileOperation: false,
  },
  webSearchTool: {
    category: 'other',
    canConcurrent: true,
    fileOperation: false,
  },
  webFetchTool: {
    category: 'other',
    canConcurrent: true,
    fileOperation: false,
  },
};

/**
 * Get metadata for a tool by name
 * Returns default metadata if tool not found in registry
 */
export function getToolMetadata(toolName: string): ToolMetadata {
  return (
    TOOL_METADATA[toolName] || {
      category: 'other',
      canConcurrent: false,
      fileOperation: false,
    }
  );
}
