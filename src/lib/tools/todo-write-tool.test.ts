import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todoWriteTool } from './todo-write-tool';

// Mock dependencies
vi.mock('@/services/file-todo-service', () => ({
  fileTodoService: {
    getTodosByConversation: vi.fn(),
    saveTodos: vi.fn(),
  },
}));

vi.mock('@/stores/settings-store', () => ({
  settingsManager: {
    getCurrentConversationId: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '@/lib/logger';
import { settingsManager } from '@/stores/settings-store';
import { fileTodoService } from '@/services/file-todo-service';

const mockFileTodoService = fileTodoService as any;
const mockSettingsManager = settingsManager as any;
const mockLogger = logger as any;

describe('todoWriteTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsManager.getCurrentConversationId.mockReturnValue('test-conversation-id');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic tool properties', () => {
    it('should have correct name', () => {
      expect(todoWriteTool.name).toBe('TodoWrite');
    });

    it('should have description', () => {
      expect(todoWriteTool.description).toBeTruthy();
      expect(typeof todoWriteTool.description).toBe('string');
    });

    it('should have inputSchema', () => {
      expect(todoWriteTool.inputSchema).toBeTruthy();
    });

    it('should have execute function', () => {
      expect(todoWriteTool.execute).toBeTruthy();
      expect(typeof todoWriteTool.execute).toBe('function');
    });
  });

  describe('input validation', () => {
    it('should validate input schema correctly for valid todos', () => {
      const validInput = {
        todos: [
          {
            content: 'Test todo',
            status: 'pending' as const,
            id: 'test-id-1',
          },
        ],
      };

      const result = todoWriteTool.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status values', () => {
      const invalidInput = {
        todos: [
          {
            content: 'Test todo',
            status: 'invalid-status' as any,
            id: 'test-id-1',
          },
        ],
      };

      const result = todoWriteTool.inputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject empty content', () => {
      const invalidInput = {
        todos: [
          {
            content: '',
            status: 'pending' as const,
            id: 'test-id-1',
          },
        ],
      };

      const result = todoWriteTool.inputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject empty id', () => {
      const invalidInput = {
        todos: [
          {
            content: 'Test todo',
            status: 'pending' as const,
            id: '',
          },
        ],
      };

      const result = todoWriteTool.inputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('execution validation', () => {
    it('should reject duplicate IDs', async () => {
      const input = {
        todos: [
          {
            content: 'First todo',
            status: 'pending' as const,
            id: 'duplicate-id',
          },
          {
            content: 'Second todo',
            status: 'completed' as const,
            id: 'duplicate-id',
          },
        ],
      };

      await expect(todoWriteTool.execute?.(input)).rejects.toThrow('Duplicate todo IDs found');
    });

    it('should reject multiple in_progress tasks', async () => {
      const input = {
        todos: [
          {
            content: 'First task',
            status: 'in_progress' as const,
            id: 'task-1',
          },
          {
            content: 'Second task',
            status: 'in_progress' as const,
            id: 'task-2',
          },
        ],
      };

      await expect(todoWriteTool.execute?.(input)).rejects.toThrow(
        'Only one task can be in_progress at a time'
      );
    });

    it('should reject empty content after trim', async () => {
      const input = {
        todos: [
          {
            content: '   ',
            status: 'pending' as const,
            id: 'test-id',
          },
        ],
      };

      await expect(todoWriteTool.execute?.(input)).rejects.toThrow(
        'Todo with ID "test-id" has empty content'
      );
    });
  });

  describe('successful execution', () => {
    it('should save valid todos successfully', async () => {
      mockFileTodoService.saveTodos.mockResolvedValue(undefined);

      const input = {
        todos: [
          {
            content: 'Test todo',
            status: 'pending' as const,
            id: 'test-id-1',
          },
          {
            content: 'Completed todo',
            status: 'completed' as const,
            id: 'test-id-2',
          },
        ],
      };

      const result = await todoWriteTool.execute?.(input);

      expect(mockFileTodoService.saveTodos).toHaveBeenCalledWith('test-conversation-id', [
        {
          content: 'Test todo',
          status: 'pending',
          id: 'test-id-1',
        },
        {
          content: 'Completed todo',
          status: 'completed',
          id: 'test-id-2',
        },
      ]);

      expect(result).toEqual(input.todos);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Saved 2 todos for conversation test-conversation-id'
      );
    });

    it('should handle empty todos list', async () => {
      mockFileTodoService.saveTodos.mockResolvedValue(undefined);

      const input = { todos: [] };
      const result = await todoWriteTool.execute?.(input);

      expect(mockFileTodoService.saveTodos).toHaveBeenCalledWith('test-conversation-id', []);
      expect(result).toEqual([]);
    });

    it('should handle one task in progress correctly', async () => {
      mockFileTodoService.saveTodos.mockResolvedValue(undefined);

      const input = {
        todos: [
          {
            content: 'Active task',
            status: 'in_progress' as const,
            id: 'active-task',
          },
        ],
      };

      const result = await todoWriteTool.execute?.(input);

      expect(result).toEqual(input.todos);
    });
  });

  describe('error handling', () => {
    it('should handle missing conversation ID', async () => {
      mockSettingsManager.getCurrentConversationId.mockReturnValue(null);

      const input = {
        todos: [
          {
            content: 'Test todo',
            status: 'pending' as const,
            id: 'test-id',
          },
        ],
      };

      await expect(todoWriteTool.execute?.(input)).rejects.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith('No current conversation ID found');
    });

    it('should handle file save errors', async () => {
      const fileError = new Error('File error');
      mockFileTodoService.saveTodos.mockRejectedValue(fileError);

      const input = {
        todos: [
          {
            content: 'Test todo',
            status: 'pending' as const,
            id: 'test-id',
          },
        ],
      };

      await expect(todoWriteTool.execute?.(input)).rejects.toThrow('File error');
      expect(mockLogger.error).toHaveBeenCalledWith('Error setting todos:', fileError);
    });
  });

  describe('React component rendering', () => {
    it('should render TodoWriteToolDoing component', () => {
      const params = {
        todos: [
          {
            content: 'Test todo',
            status: 'pending' as const,
            id: 'test-id',
          },
        ],
      };

      const component = todoWriteTool.renderToolDoing?.(params);
      render(component);

      expect(screen.getByText('Updating')).toBeInTheDocument();
      expect(screen.getByText(/1 todo\(s\)/)).toBeInTheDocument();
    });

    it('should render TodoWriteToolResult component for success', () => {
      const params = {
        todos: [
          {
            content: 'Test todo',
            status: 'pending' as const,
            id: 'test-id-1',
          },
          {
            content: 'Completed todo',
            status: 'completed' as const,
            id: 'test-id-2',
          },
        ],
      };

      const result = params.todos;

      const component = todoWriteTool.renderToolResult?.(result, params);
      render(component);

      // Verify the todo list is rendered
      expect(screen.getByText('Todo List')).toBeInTheDocument();
      expect(screen.getByText('Test todo')).toBeInTheDocument();
      expect(screen.getByText('Completed todo')).toBeInTheDocument();

      // Verify summary information
      expect(screen.getByText(/1 pending/i)).toBeInTheDocument();
      expect(screen.getByText(/0 in progress/i)).toBeInTheDocument();
      expect(screen.getByText(/1 completed/i)).toBeInTheDocument();
    });

    it('should render TodoWriteToolResult component for error', () => {
      const error = new Error('Test error message');
      const params = { todos: [] };

      const component = todoWriteTool.renderToolResult?.(error, params);
      render(component);

      // Verify the failure message
      expect(screen.getByText('Update failed')).toBeInTheDocument();
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('should render TodoWriteToolResult for empty todos list', () => {
      const result: any[] = [];
      const params = { todos: [] };

      const component = todoWriteTool.renderToolResult?.(result, params);
      render(component);

      // Verify that no todo list is rendered for empty todos
      expect(screen.queryByText('Todo List')).not.toBeInTheDocument();
    });
  });

  describe('status handling', () => {
    it('should accept all valid status values', async () => {
      mockFileTodoService.saveTodos.mockResolvedValue(undefined);

      const input = {
        todos: [
          {
            content: 'Pending task',
            status: 'pending' as const,
            id: 'pending-1',
          },
          {
            content: 'In progress task',
            status: 'in_progress' as const,
            id: 'in-progress-1',
          },
          {
            content: 'Completed task',
            status: 'completed' as const,
            id: 'completed-1',
          },
        ],
      };

      const result = await todoWriteTool.execute?.(input);
      expect(result).toEqual(input.todos);
      expect(mockFileTodoService.saveTodos).toHaveBeenCalledTimes(1);
    });
  });

  describe('file service integration', () => {
    it('should convert tool todos to file format correctly', async () => {
      mockFileTodoService.saveTodos.mockResolvedValue(undefined);

      const input = {
        todos: [
          {
            content: 'Test todo',
            status: 'in_progress' as const,
            id: 'test-id',
          },
        ],
      };

      await todoWriteTool.execute?.(input);

      expect(mockFileTodoService.saveTodos).toHaveBeenCalledWith('test-conversation-id', [
        {
          content: 'Test todo',
          status: 'in_progress',
          id: 'test-id',
        },
      ]);
    });

    it('should log appropriate messages on success', async () => {
      mockFileTodoService.saveTodos.mockResolvedValue(undefined);

      const input = {
        todos: [
          {
            content: 'Test todo',
            status: 'pending' as const,
            id: 'test-id',
          },
        ],
      };

      await todoWriteTool.execute?.(input);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Saved 1 todos for conversation test-conversation-id'
      );
    });
  });
});
