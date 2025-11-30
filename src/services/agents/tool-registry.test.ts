import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAvailableToolNames,
  getAvailableToolsForUI,
  getToolByName,
  isValidToolName,
  restoreToolsFromConfig,
} from './tool-registry';

// Mock logger - needs to be inside vi.mock factory because vi.mock is hoisted
vi.mock('@/lib/logger', () => {
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  };
  return {
    logger,
    default: logger,
  };
});

vi.mock('@/lib/tool-adapter', () => ({
  convertToolsForAI: vi.fn((tools) => tools),
}));

vi.mock('@/lib/mcp/multi-mcp-adapter', () => ({
  multiMCPAdapter: {
    getAdaptedTool: vi.fn(),
  },
  isMCPTool: vi.fn((toolName: string) => toolName.startsWith('mcp__')),
}));

import { logger } from '@/lib/logger';
import { multiMCPAdapter } from '@/lib/mcp/multi-mcp-adapter';
import { convertToolsForAI } from '@/lib/tool-adapter';

const mockConvertToolsForAI = convertToolsForAI as any;
const mockMultiMCPAdapter = multiMCPAdapter as any;
const mockLogger = logger as unknown as {
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  trace: ReturnType<typeof vi.fn>;
};

describe('tool-registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConvertToolsForAI.mockImplementation((tools: any) => tools);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // TOOL_REGISTRY is no longer used - tools are dynamically loaded
  // Tests for tool availability are covered by getAvailableToolNames and getAvailableToolsForUI

  describe('restoreToolsFromConfig', () => {
    it('should restore todoWriteTool from array config', async () => {
      const config = ['todoWriteTool', 'readFile'];

      const result = await restoreToolsFromConfig(config);

      expect(result).toHaveProperty('todoWriteTool');
      expect(result).toHaveProperty('readFile');
      expect(mockConvertToolsForAI).toHaveBeenCalled();
    });

    it('should restore todoWriteTool from object config', async () => {
      const config = {
        todoWriteTool: {},
        readFile: {},
      };

      const result = await restoreToolsFromConfig(config);

      expect(result).toHaveProperty('todoWriteTool');
      expect(result).toHaveProperty('readFile');
      expect(mockConvertToolsForAI).toHaveBeenCalled();
    });

    it('should restore todoWriteTool from JSON string config', async () => {
      const config = JSON.stringify(['todoWriteTool', 'readFile']);

      const result = await restoreToolsFromConfig(config);

      expect(result).toHaveProperty('todoWriteTool');
      expect(result).toHaveProperty('readFile');
    });

    it('should warn when tool name is not in registry', async () => {
      const config = ['unknownTool', 'todoWriteTool'];

      await restoreToolsFromConfig(config);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown tool in array: unknownTool')
      );
    });

    it('should handle empty config', async () => {
      const result = await restoreToolsFromConfig(null);
      expect(result).toEqual({});
    });

    it('should handle MCP tools', async () => {
      const mcpTool = { name: 'mcp__test-tool', execute: vi.fn() };
      mockMultiMCPAdapter.getAdaptedTool.mockResolvedValue(mcpTool);

      const config = ['todoWriteTool', 'mcp__test-tool'];

      const result = await restoreToolsFromConfig(config);

      expect(mockMultiMCPAdapter.getAdaptedTool).toHaveBeenCalledWith('mcp__test-tool');
      expect(result).toHaveProperty('todoWriteTool');
      expect(result).toHaveProperty('mcp__test-tool');
    });

    it('should handle already formatted ToolSet', async () => {
      const toolSet = {
        todoWriteTool: {
          description: 'Test tool',
          execute: vi.fn(),
          inputSchema: {},
        },
      };

      const result = await restoreToolsFromConfig(toolSet);

      expect(mockConvertToolsForAI).toHaveBeenCalledWith(toolSet);
      expect(result).toBeDefined();
    });

    it('should handle invalid JSON string gracefully', async () => {
      const config = 'invalid json {';

      const result = await restoreToolsFromConfig(config);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse tools config JSON'),
        expect.any(Error)
      );
      expect(result).toEqual({});
    });
  });

  describe('getAvailableToolNames', () => {
    it('should include todoWriteTool in available tools', async () => {
      const toolNames = await getAvailableToolNames();

      expect(toolNames).toContain('todoWriteTool');
      expect(toolNames).toContain('readFile');
      expect(toolNames).toContain('writeFile');
    });
  });

  describe('isValidToolName', () => {
    it('should return true for todoWriteTool', () => {
      expect(isValidToolName('todoWriteTool')).toBe(true);
    });

    it('should return false for todoWrite (old key name)', () => {
      expect(isValidToolName('todoWrite')).toBe(false);
    });

    it('should return false for unknown tools', () => {
      expect(isValidToolName('unknownTool')).toBe(false);
    });
  });

  describe('getToolByName', () => {
    it('should return todoWriteTool by name', async () => {
      const tool = await getToolByName('todoWriteTool');

      expect(tool).toBeDefined();
    });

    it('should return undefined for todoWrite (old key name)', async () => {
      const tool = await getToolByName('todoWrite');

      expect(tool).toBeUndefined();
    });

    it('should return undefined for unknown tools', async () => {
      const tool = await getToolByName('unknownTool');

      expect(tool).toBeUndefined();
    });
  });

  describe('getAvailableToolsForUI', () => {
    it('should include todoWriteTool in UI tools list', async () => {
      const tools = await getAvailableToolsForUI();

      const todoWriteTool = tools.find((tool) => tool.id === 'todoWriteTool');
      expect(todoWriteTool).toBeDefined();
      expect(todoWriteTool?.label).toBe('Todo');
    });

    it('should not include todoWrite (old key name)', async () => {
      const tools = await getAvailableToolsForUI();

      const todoWrite = tools.find((tool) => tool.id === 'todoWrite');
      expect(todoWrite).toBeUndefined();
    });
  });

  describe('bug fix verification - todoWriteTool naming consistency', () => {
    it('should not produce warning when restoring todoWriteTool from database', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Simulate restoring from database with shorthand object syntax key
      const databaseConfig = {
        todoWriteTool: {},
        readFile: {},
        writeFile: {},
      };

      await restoreToolsFromConfig(databaseConfig);

      // Should not warn about unknown tool
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Unknown tool in config: todoWriteTool')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should produce warning for old todoWrite key name', async () => {
      // Old configuration with incorrect key name
      const oldConfig = {
        todoWrite: {},
        readFile: {},
      };

      await restoreToolsFromConfig(oldConfig);

      // Should warn about unknown tool for old key name
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown tool in config: todoWrite')
      );
    });
  });
});
