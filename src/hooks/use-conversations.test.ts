import { ask } from '@tauri-apps/plugin-dialog';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsManager } from '@/stores/settings-store';
import { generateConversationTitle, generateId } from '@/lib/utils';
import type { Conversation, StoredMessage } from '@/services/database-service';
import { databaseService } from '@/services/database-service';
import { useConversations } from './use-conversations';

// Mock dependencies
vi.mock('@/stores/settings-store', () => ({
  settingsManager: {
    getProject: vi.fn(),
    setCurrentConversationId: vi.fn(),
    getCurrentConversationId: vi.fn(),
  },
}));

vi.mock('@/lib/utils', () => ({
  generateConversationTitle: vi.fn(),
  generateId: vi.fn(),
}));

vi.mock('@/services/database-service', () => ({
  databaseService: {
    createConversation: vi.fn(),
    getConversations: vi.fn(),
    getMessagesForPosition: vi.fn(),
    getMessages: vi.fn(),
    getConversationDetails: vi.fn(),
    deleteConversation: vi.fn(),
    updateConversationTitle: vi.fn(),
    saveMessage: vi.fn(),
    updateMessage: vi.fn(),
    getLatestUserMessageContent: vi.fn(),
    updateConversationUsage: vi.fn(),
  },
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

describe('useConversations', () => {
  const mockConversations: Conversation[] = [
    {
      id: 'conv1',
      title: 'Test Conversation 1',
      created_at: Date.now(),
      updated_at: Date.now(),
      project_id: 'project1',
      message_count: 2,
      cost: 0,
      input_token: 0,
      output_token: 0,
    },
    {
      id: 'conv2',
      title: 'Test Conversation 2',
      created_at: Date.now(),
      updated_at: Date.now(),
      project_id: 'project1',
      message_count: 0,
      cost: 0,
      input_token: 0,
      output_token: 0,
    },
  ];

  const mockMessages: StoredMessage[] = [
    {
      id: 'msg1',
      conversation_id: 'conv1',
      role: 'user',
      content: 'Hello',
      timestamp: Date.now(),
      position_index: 0,
      assistant_id: undefined,
      attachments: [],
    },
    {
      id: 'msg2',
      conversation_id: 'conv1',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: Date.now(),
      position_index: 0,
      assistant_id: undefined,
      attachments: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with correct default values', () => {
    const { result } = renderHook(() => useConversations());

    expect(result.current.conversations).toEqual([]);
    expect(result.current.currentConversationId).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.editingId).toBeNull();
    expect(result.current.editingTitle).toBe('');
  });

  it('should create a new conversation with generated title and id', async () => {
    const mockTitle = 'Generated Title';
    const mockId = 'generated-id';
    const mockProject = 'test-project';

    (generateConversationTitle as any).mockReturnValue(mockTitle);
    (generateId as any).mockReturnValue(mockId);
    (settingsManager.getProject as any).mockResolvedValue(mockProject);

    const { result } = renderHook(() => useConversations());
    const conversationId = await act(async () => {
      return await result.current.createConversation('Hello world', mockProject);
    });

    expect(generateConversationTitle).toHaveBeenCalledWith('Hello world');
    expect(generateId).toHaveBeenCalled();
    expect(databaseService.createConversation).toHaveBeenCalledWith(mockTitle, mockId, mockProject);
    expect(result.current.currentConversationId).toBe(mockId);
    expect(conversationId).toBe(mockId);
  });

  it('should load conversations for a specific project', async () => {
    (databaseService.getConversations as any).mockResolvedValue(mockConversations);

    const { result } = renderHook(() => useConversations());
    await act(async () => {
      await result.current.loadConversations('project1');
    });

    expect(databaseService.getConversations).toHaveBeenCalledWith('project1');
    expect(result.current.conversations).toEqual(mockConversations);
    expect(result.current.loading).toBe(false);
  });

  it('should handle load conversations error', async () => {
    const { logger } = await import('@/lib/logger');
    const loggerErrorSpy = vi.spyOn(logger, 'error');
    (databaseService.getConversations as any).mockRejectedValue(new Error('Database error'));

    const { result } = renderHook(() => useConversations());
    await act(async () => {
      await result.current.loadConversations();
    });

    expect(result.current.error).toBe('Failed to load conversations');
    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to load conversations:', expect.any(Error));
    expect(result.current.loading).toBe(false);

    loggerErrorSpy.mockRestore();
  });

  it('should load conversation messages', async () => {
    (databaseService.getMessagesForPosition as any).mockResolvedValue(mockMessages);

    const { result } = renderHook(() => useConversations());
    const setMessagesMock = vi.fn();

    await act(async () => {
      await result.current.loadConversation('conv1', 0, setMessagesMock);
    });

    expect(databaseService.getMessagesForPosition).toHaveBeenCalledWith('conv1', 0);
    expect(setMessagesMock).toHaveBeenCalledWith([
      {
        id: 'msg1',
        role: 'user',
        content: 'Hello',
        timestamp: expect.any(Date),
        isStreaming: false,
        assistantId: undefined,
        attachments: [],
      },
      {
        id: 'msg2',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: expect.any(Date),
        isStreaming: false,
        assistantId: undefined,
        attachments: [],
      },
    ]);
    expect(result.current.currentConversationId).toBe('conv1');
  });

  it('should get conversation history', async () => {
    (databaseService.getMessages as any).mockResolvedValue(mockMessages);

    const { result } = renderHook(() => useConversations());
    const history = await act(async () => {
      return await result.current.getConversationHistory('conv1');
    });

    expect(databaseService.getMessages).toHaveBeenCalledWith('conv1');
    expect(history).toEqual([
      {
        id: 'msg1',
        role: 'user',
        content: 'Hello',
        timestamp: expect.any(Date),
        isStreaming: false,
        assistantId: undefined,
        attachments: [],
      },
      {
        id: 'msg2',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: expect.any(Date),
        isStreaming: false,
        assistantId: undefined,
        attachments: [],
      },
    ]);
  });

  it('should handle get conversation history error', async () => {
    const { logger } = await import('@/lib/logger');
    const loggerErrorSpy = vi.spyOn(logger, 'error');
    (databaseService.getMessages as any).mockRejectedValue(new Error('Database error'));

    const { result } = renderHook(() => useConversations());
    const history = await act(async () => {
      return await result.current.getConversationHistory('conv1');
    });

    expect(result.current.error).toBe('Failed to get conversation history');
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Failed to get conversation history:',
      expect.any(Error)
    );
    expect(history).toEqual([]);

    loggerErrorSpy.mockRestore();
  });

  it('should get conversation details', async () => {
    (databaseService.getConversationDetails as any).mockResolvedValue(mockConversations[0]);

    const { result } = renderHook(() => useConversations());
    const details = await result.current.getConversationDetails('conv1');

    expect(databaseService.getConversationDetails).toHaveBeenCalledWith('conv1');
    expect(details).toEqual(mockConversations[0]);
  });

  it('should delete conversation with user confirmation', async () => {
    (ask as any).mockResolvedValue(true);
    (databaseService.deleteConversation as any).mockResolvedValue(undefined);
    (databaseService.getConversations as any).mockResolvedValue([]);

    const { result } = renderHook(() => useConversations());

    act(() => {
      result.current.setCurrentConversationId('conv1');
    });

    await act(async () => {
      await result.current.deleteConversation('conv1');
    });

    expect(ask).toHaveBeenCalledWith('Are you sure you want to delete this conversation?', {
      title: 'Delete Conversation',
      kind: 'warning',
    });
    expect(databaseService.deleteConversation).toHaveBeenCalledWith('conv1');
    expect(result.current.currentConversationId).toBeUndefined();
  });

  it('should not delete conversation if user cancels', async () => {
    (ask as any).mockResolvedValue(false);

    const { result } = renderHook(() => useConversations());
    await act(async () => {
      await result.current.deleteConversation('conv1');
    });

    expect(databaseService.deleteConversation).not.toHaveBeenCalled();
  });

  it('should update conversation title', async () => {
    (databaseService.updateConversationTitle as any).mockResolvedValue(undefined);
    (databaseService.getConversations as any).mockResolvedValue(mockConversations);

    const { result } = renderHook(() => useConversations());
    await act(async () => {
      await result.current.updateConversationTitle('conv1', 'New Title');
    });

    expect(databaseService.updateConversationTitle).toHaveBeenCalledWith('conv1', 'New Title');
    expect(databaseService.getConversations).toHaveBeenCalled();
  });

  it('should save message without messageId', async () => {
    const mockMessageId = 'new-message-id';
    (databaseService.saveMessage as any).mockResolvedValue(mockMessageId);

    const { result } = renderHook(() => useConversations());
    let messageId: string;
    await act(async () => {
      messageId = await result.current.saveMessage('conv1', 'user', 'Hello', 0);
    });

    expect(databaseService.saveMessage).toHaveBeenCalledWith(
      'conv1',
      'user',
      'Hello',
      0,
      undefined,
      undefined,
      undefined
    );
    expect(messageId!).toBe(mockMessageId);
  });

  it('should save message with provided messageId', async () => {
    const providedMessageId = 'provided-message-id';
    (databaseService.saveMessage as any).mockResolvedValue(providedMessageId);

    const { result } = renderHook(() => useConversations());
    let messageId: string;
    await act(async () => {
      messageId = await result.current.saveMessage(
        'conv1',
        'assistant',
        'Response',
        0,
        'agent-1',
        [],
        providedMessageId
      );
    });

    expect(databaseService.saveMessage).toHaveBeenCalledWith(
      'conv1',
      'assistant',
      'Response',
      0,
      'agent-1',
      [],
      providedMessageId
    );
    expect(messageId!).toBe(providedMessageId);
  });

  it('should update message content', async () => {
    (databaseService.updateMessage as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useConversations());
    await act(async () => {
      await result.current.updateMessage('msg-123', 'Updated content');
    });

    expect(databaseService.updateMessage).toHaveBeenCalledWith('msg-123', 'Updated content');
  });

  it('should get latest user message content', async () => {
    const mockContent = 'Latest message';
    (settingsManager.getCurrentConversationId as any).mockReturnValue('conv1');
    (databaseService.getLatestUserMessageContent as any).mockResolvedValue(mockContent);

    const { result } = renderHook(() => useConversations());
    let content: string | null;
    await act(async () => {
      content = await result.current.getLatestUserMessageContent();
    });

    expect(settingsManager.getCurrentConversationId).toHaveBeenCalled();
    expect(databaseService.getLatestUserMessageContent).toHaveBeenCalledWith('conv1');
    expect(content!).toBe(mockContent);
  });

  it('should update conversation usage', async () => {
    (databaseService.updateConversationUsage as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useConversations());
    await act(async () => {
      await result.current.updateConversationUsage('conv1', 1.5, 100, 50);
    });

    expect(databaseService.updateConversationUsage).toHaveBeenCalledWith('conv1', 1.5, 100, 50);
  });

  it('should select conversation', () => {
    const { result } = renderHook(() => useConversations());
    act(() => {
      result.current.selectConversation('conv1');
    });

    expect(settingsManager.setCurrentConversationId).toHaveBeenCalledWith('conv1');
    expect(result.current.currentConversationId).toBe('conv1');
  });

  it('should start new chat', () => {
    const { result } = renderHook(() => useConversations());
    act(() => {
      result.current.setCurrentConversationId('conv1');
    });
    act(() => {
      result.current.startNewChat();
    });

    expect(result.current.currentConversationId).toBeUndefined();
  });

  it('should start editing conversation title', () => {
    const { result } = renderHook(() => useConversations());
    const mockConversation = mockConversations[0];
    const mockEvent = { stopPropagation: vi.fn() };

    act(() => {
      result.current.startEditing(mockConversation, mockEvent as any);
    });

    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(result.current.editingId).toBe(mockConversation.id);
    expect(result.current.editingTitle).toBe(mockConversation.title);
  });

  it('should finish editing conversation title', async () => {
    (databaseService.updateConversationTitle as any).mockResolvedValue(undefined);
    (databaseService.getConversations as any).mockResolvedValue(mockConversations);

    const { result } = renderHook(() => useConversations());
    const mockConversation = mockConversations[0];

    act(() => {
      result.current.startEditing(mockConversation);
      result.current.setEditingTitle('Updated Title');
    });

    await act(async () => {
      await result.current.finishEditing();
    });

    expect(databaseService.updateConversationTitle).toHaveBeenCalledWith('conv1', 'Updated Title');
    expect(databaseService.getConversations).toHaveBeenCalled();
    expect(result.current.editingId).toBeNull();
    expect(result.current.editingTitle).toBe('');
  });

  it('should cancel editing', () => {
    const { result } = renderHook(() => useConversations());
    const mockConversation = mockConversations[0];

    act(() => {
      result.current.startEditing(mockConversation);
      result.current.setEditingTitle('Some Title');
    });

    act(() => {
      result.current.cancelEditing();
    });

    expect(result.current.editingId).toBeNull();
    expect(result.current.editingTitle).toBe('');
  });
});
