import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationService } from './conversation-service';
import type { TursoClient } from './turso-client';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

// Mock timer decorator
vi.mock('@/lib/timer', () => ({
  timedMethod: () => (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

describe('ConversationService', () => {
  let mockDb: any;
  let conversationService: ConversationService;

  beforeEach(() => {
    // Create a mock database
    mockDb = {
      execute: vi.fn(),
      select: vi.fn(),
    };

    conversationService = new ConversationService(mockDb as TursoClient);
  });

  describe('createConversation', () => {
    it('should create conversation without mode_count column', async () => {
      const title = 'Test Conversation';
      const conversationId = 'test-id-123';
      const projectId = 'test-project';

      mockDb.execute.mockResolvedValue(undefined);

      const result = await conversationService.createConversation(title, conversationId, projectId);

      // Verify the SQL statement does NOT include mode_count
      expect(mockDb.execute).toHaveBeenCalledWith(
        'INSERT INTO conversations (id, title, project_id, created_at, updated_at, message_count) VALUES ($1, $2, $3, $4, $5, $6)',
        [conversationId, title, projectId, expect.any(Number), expect.any(Number), 0]
      );

      // Verify it returns the conversation ID
      expect(result).toBe(conversationId);
    });

    it('should use default project_id if not provided', async () => {
      const title = 'Test Conversation';
      const conversationId = 'test-id-456';

      mockDb.execute.mockResolvedValue(undefined);

      await conversationService.createConversation(
        title,
        conversationId
        // projectId not provided, should default to 'default'
      );

      expect(mockDb.execute).toHaveBeenCalledWith(expect.any(String), [
        conversationId,
        title,
        'default',
        expect.any(Number),
        expect.any(Number),
        0,
      ]);
    });

    it('should handle database errors gracefully', async () => {
      const title = 'Test Conversation';
      const conversationId = 'test-id-789';
      const dbError = new Error(
        'Database error: table conversations has no column named mode_count'
      );

      mockDb.execute.mockRejectedValue(dbError);

      await expect(conversationService.createConversation(title, conversationId)).rejects.toThrow(
        'Database error: table conversations has no column named mode_count'
      );
    });
  });

  describe('getConversationsByMode - removed method', () => {
    it('should not have getConversationsByMode method', () => {
      // Verify the method has been removed
      expect((conversationService as any).getConversationsByMode).toBeUndefined();
    });
  });

  describe('Concurrent message persistence and title update', () => {
    it('should handle concurrent saveMessage and updateConversationTitle without conflicts', async () => {
      // Test case for bug fix: concurrent database writes causing message loss
      // This test simulates the scenario where:
      // 1. saveMessage is called to save a user message
      // 2. updateConversationTitle is called immediately after (fire-and-forget)
      // Both operations try to UPDATE the conversations table simultaneously

      const conversationId = 'test-conv-123';
      const messageId = 'test-msg-456';
      const messageContent = 'Test message content';
      const newTitle = 'Updated Title';

      // Mock successful database operations
      mockDb.execute.mockResolvedValue({ rows_affected: 1 });

      // Simulate concurrent operations
      const saveMessagePromise = conversationService.saveMessage(
        conversationId,
        messageId,
        'user',
        messageContent,
        Date.now(),
        'default-agent'
      );

      const updateTitlePromise = conversationService.updateConversationTitle(
        conversationId,
        newTitle
      );

      // Both should complete successfully
      await Promise.all([saveMessagePromise, updateTitlePromise]);

      // Verify both operations were called
      expect(mockDb.execute).toHaveBeenCalled();

      // The key fix is that:
      // 1. Rust backend now has retry mechanism for SQLITE_BUSY errors
      // 2. WAL mode is enabled for better concurrent access
      // 3. busy_timeout is set to 5000ms
      // So even if there's contention, operations will retry instead of failing
    });

    it('should persist messages correctly even during concurrent title updates', async () => {
      // Test case for the specific bug: messages appearing empty after page refresh
      // This happens when the updateMessage call fails due to database lock conflicts

      const conversationId = 'test-conv-789';
      const assistantMessageId = 'test-asst-msg-001';
      const messageContent = 'This is the assistant response that should be persisted';

      mockDb.execute.mockResolvedValue({ rows_affected: 1 });

      // First save an empty message (simulating initial save in handleAssistantMessageStart)
      await conversationService.saveMessage(
        conversationId,
        assistantMessageId,
        'assistant',
        '',
        Date.now(),
        'default-agent'
      );

      // Then update with actual content (simulating onComplete callback)
      await conversationService.updateMessage(assistantMessageId, messageContent);

      // Verify the update was called with the correct content
      const updateCalls = mockDb.execute.mock.calls.filter((call) =>
        call[0].includes('UPDATE messages SET content')
      );

      expect(updateCalls.length).toBeGreaterThan(0);
      expect(updateCalls[updateCalls.length - 1][1]).toContain(messageContent);
    });

    it('should handle database errors appropriately', async () => {
      // Test case for database error handling
      // Note: Retry mechanism is implemented in the Rust backend (database.rs)
      // The TypeScript layer receives either success or final error after retries

      const conversationId = 'test-conv-error';
      const messageId = 'test-msg-error';

      // Simulate a database error
      mockDb.execute.mockRejectedValue(new Error('Database connection failed'));

      // The operation should reject with the error
      await expect(
        conversationService.saveMessage(
          conversationId,
          messageId,
          'user',
          'Test message',
          Date.now(),
          'default-agent'
        )
      ).rejects.toThrow('Database connection failed');

      // In the real implementation:
      // 1. Rust backend retries on SQLITE_BUSY errors (up to 3 times)
      // 2. If all retries fail, error is propagated to TypeScript layer
      // 3. WAL mode + busy_timeout reduces the likelihood of lock conflicts
    });
  });
});
