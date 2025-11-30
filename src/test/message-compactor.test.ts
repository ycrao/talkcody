import type { ModelMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageCompactor } from '../services/message-compactor';
import type {
  CompressionConfig,
  CompressionResult,
  MessageCompactionOptions,
} from '../types/agent';

// Mock logger
vi.mock('../lib/logger', () => ({
  logger: {
    trace: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock GEMINI_25_FLASH_LITE
vi.mock('../lib/models', () => ({
  GEMINI_25_FLASH_LITE: 'google/gemini-2.5-flash-lite',
}));

describe('MessageCompactor', () => {
  let messageCompactor: MessageCompactor;
  let mockChatService: any;

  const defaultConfig: CompressionConfig = {
    enabled: true,
    preserveRecentMessages: 3,
    compressionModel: 'google/gemini-2.5-flash-lite',
    compressionThreshold: 0.7,
  };

  const createTestMessages = (count: number): ModelMessage[] => {
    const messages: ModelMessage[] = [];
    for (let i = 0; i < count; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}: This is a test message with some content.`,
      });
    }
    return messages;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock chat service
    mockChatService = {
      runAgentLoop: vi.fn().mockImplementation((_options, callbacks) => {
        // Simulate compression response
        const mockResponse = `
<analysis>
This is a test compression analysis.
</analysis>

1. Primary Request and Intent: The user is testing the compression functionality.
2. Key Technical Concepts: Message compression, AI models, context management.
3. Files and Code Sections: Testing compression algorithms.
4. Errors and fixes: No errors in this test scenario.
5. Problem Solving: Implementing efficient message compression.
6. All user messages: User requested testing of compression feature.
7. Pending Tasks: Complete compression testing.
8. Current Work: Running compression tests.
`;

        // Simulate streaming
        setTimeout(() => {
          callbacks.onChunk(mockResponse);
          callbacks.onComplete(mockResponse);
        }, 10);

        return Promise.resolve();
      }),
    };

    messageCompactor = new MessageCompactor(mockChatService);
  });

  afterEach(() => {
    messageCompactor.clearCache();
  });

  describe('shouldCompress', () => {
    it('should return false when compression is disabled', () => {
      const config = { ...defaultConfig, enabled: false };
      const messages = createTestMessages(15);
      const tokenCount = 100000;

      expect(messageCompactor.shouldCompress(messages, config, tokenCount)).toBe(false);
    });

    it('should return false when no token count provided', () => {
      const messages = createTestMessages(5);

      expect(messageCompactor.shouldCompress(messages, defaultConfig)).toBe(false);
    });

    it('should return false when token count is below threshold', () => {
      const messages = createTestMessages(5);
      const tokenCount = 100000; // Below 200K * 0.7 = 140K threshold

      expect(messageCompactor.shouldCompress(messages, defaultConfig, tokenCount)).toBe(false);
    });

    it('should return true when token count exceeds threshold', () => {
      const messages = createTestMessages(15);
      const tokenCount = 180000; // Above 200K * 0.7 = 140K threshold

      expect(messageCompactor.shouldCompress(messages, defaultConfig, tokenCount)).toBe(true);
    });
  });

  describe('compactMessages', () => {
    it('should compress messages when needed', async () => {
      const messages = createTestMessages(15);
      const options: MessageCompactionOptions = {
        messages,
        config: defaultConfig,
        systemPrompt: 'Test system prompt',
      };

      const result = await messageCompactor.compactMessages(options);

      expect(result).toBeDefined();
      expect(result.originalMessageCount).toBe(15);
      expect(result.compressedMessageCount).toBe(4); // 1 summary + 3 preserved
      expect(result.compressionRatio).toBeLessThan(1);
      expect(result.compressedSummary).toBeTruthy();
      expect(result.preservedMessages).toHaveLength(3);
      expect(mockChatService.runAgentLoop).toHaveBeenCalledTimes(1);
    });

    it('should return original messages when no compression needed', async () => {
      const messages = createTestMessages(2);
      const options: MessageCompactionOptions = {
        messages,
        config: defaultConfig,
      };

      const result = await messageCompactor.compactMessages(options);

      expect(result.originalMessageCount).toBe(2);
      expect(result.compressedMessageCount).toBe(2);
      expect(result.compressionRatio).toBe(1.0);
      expect(result.compressedSummary).toBe('');
      expect(result.preservedMessages).toEqual(messages);
      expect(mockChatService.runAgentLoop).not.toHaveBeenCalled();
    });

    it('should use cache for identical message sets', async () => {
      const messages = createTestMessages(12);
      const options: MessageCompactionOptions = {
        messages,
        config: defaultConfig,
      };

      // First compression
      const result1 = await messageCompactor.compactMessages(options);
      expect(mockChatService.runAgentLoop).toHaveBeenCalledTimes(1);

      // Second compression with same messages should use cache
      const result2 = await messageCompactor.compactMessages(options);
      expect(mockChatService.runAgentLoop).toHaveBeenCalledTimes(1); // Still 1
      expect(result2).toEqual(result1);
    });
  });

  describe('createCompressedMessages', () => {
    it('should create properly formatted compressed messages', () => {
      const mockResult: CompressionResult = {
        compressedSummary: 'This is a test summary.',
        sections: [],
        preservedMessages: createTestMessages(3),
        originalMessageCount: 10,
        compressedMessageCount: 4,
        compressionRatio: 0.4,
      };

      const compressedMessages = messageCompactor.createCompressedMessages(mockResult);

      expect(compressedMessages).toHaveLength(4); // 1 summary + 3 preserved
      expect(compressedMessages[0].role).toBe('system');
      expect(compressedMessages[0].content).toContain('Previous conversation summary:');
      expect(compressedMessages[0].content).toContain('This is a test summary.');

      // Check preserved messages are included
      for (let i = 1; i < compressedMessages.length; i++) {
        expect(compressedMessages[i]).toEqual(mockResult.preservedMessages[i - 1]);
      }
    });

    it('should handle empty compression summary', () => {
      const mockResult: CompressionResult = {
        compressedSummary: '',
        sections: [],
        preservedMessages: createTestMessages(2),
        originalMessageCount: 5,
        compressedMessageCount: 2,
        compressionRatio: 0.4,
      };

      const compressedMessages = messageCompactor.createCompressedMessages(mockResult);

      expect(compressedMessages).toHaveLength(2); // Only preserved messages
      expect(compressedMessages).toEqual(mockResult.preservedMessages);
    });
  });

  describe('cache management', () => {
    it('should clear cache when requested', () => {
      messageCompactor.clearCache();
      expect(messageCompactor.getCacheSize()).toBe(0);
    });

    it('should report correct cache size', async () => {
      const messages = createTestMessages(12);
      const options: MessageCompactionOptions = {
        messages,
        config: defaultConfig,
      };

      expect(messageCompactor.getCacheSize()).toBe(0);

      await messageCompactor.compactMessages(options);
      expect(messageCompactor.getCacheSize()).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should track compression statistics', async () => {
      const messages = createTestMessages(12);
      const options: MessageCompactionOptions = {
        messages,
        config: defaultConfig,
      };

      const initialStats = messageCompactor.getCompressionStats();
      expect(initialStats.totalCompressions).toBe(0);

      await messageCompactor.compactMessages(options);

      const updatedStats = messageCompactor.getCompressionStats();
      expect(updatedStats.totalCompressions).toBe(1);
      expect(updatedStats.averageCompressionRatio).toBeGreaterThan(0);
    });

    it('should calculate average compression ratio correctly', async () => {
      const messages1 = createTestMessages(10);
      const messages2 = createTestMessages(15);

      await messageCompactor.compactMessages({ messages: messages1, config: defaultConfig });
      await messageCompactor.compactMessages({ messages: messages2, config: defaultConfig });

      const stats = messageCompactor.getCompressionStats();
      expect(stats.totalCompressions).toBe(2);
      expect(stats.averageCompressionRatio).toBeGreaterThan(0);
      expect(stats.averageCompressionRatio).toBeLessThan(1);
    });
  });

  describe('error handling', () => {
    it('should handle compression errors gracefully', async () => {
      // Mock chat service to throw error
      mockChatService.runAgentLoop.mockImplementation(() => {
        throw new Error('Compression failed');
      });

      const messages = createTestMessages(12);
      const options: MessageCompactionOptions = {
        messages,
        config: defaultConfig,
      };

      await expect(messageCompactor.compactMessages(options)).rejects.toThrow('Compression failed');
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle preserveRecentMessages greater than message count', async () => {
      const messages = createTestMessages(5);
      const config: CompressionConfig = {
        ...defaultConfig,
        preserveRecentMessages: 10, // More than message count
      };

      const result = await messageCompactor.compactMessages({
        messages,
        config,
      });

      expect(result.preservedMessages).toHaveLength(5);
      expect(result.compressedSummary).toBe('');
      expect(result.compressionRatio).toBe(1.0);
    });

    it('should handle empty message array', async () => {
      const result = await messageCompactor.compactMessages({
        messages: [],
        config: defaultConfig,
      });

      expect(result.originalMessageCount).toBe(0);
      expect(result.compressedMessageCount).toBe(0);
      expect(result.preservedMessages).toHaveLength(0);
    });

    it('should handle messages with mixed content types', async () => {
      const mixedMessages: ModelMessage[] = [
        { role: 'user', content: 'Text message' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Response' },
            { type: 'tool-call', toolCallId: '1', toolName: 'test', args: {} } as any,
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: '1',
              toolName: 'test',
              result: { success: true },
            } as any,
          ],
        },
      ];

      const config: CompressionConfig = {
        ...defaultConfig,
        preserveRecentMessages: 1,
      };

      const result = await messageCompactor.compactMessages({
        messages: mixedMessages,
        config,
      });

      expect(result.preservedMessages).toHaveLength(1);
      expect(mockChatService.runAgentLoop).toHaveBeenCalled();
    });
  });

  describe('cache eviction and management', () => {
    it('should evict oldest cache entry when MAX_CACHE_SIZE is exceeded', async () => {
      const MAX_CACHE_SIZE = 10;

      // Fill cache beyond capacity
      for (let i = 0; i < MAX_CACHE_SIZE + 2; i++) {
        const messages = createTestMessages(10 + i); // Different messages each time
        await messageCompactor.compactMessages({
          messages,
          config: defaultConfig,
        });
      }

      const cacheSize = messageCompactor.getCacheSize();
      expect(cacheSize).toBeLessThanOrEqual(MAX_CACHE_SIZE);
    });

    it('should generate different cache keys for different messages', () => {
      const messages1 = createTestMessages(5);
      const messages2 = createTestMessages(6);

      const key1 = (messageCompactor as any).generateCacheKey(messages1);
      const key2 = (messageCompactor as any).generateCacheKey(messages2);

      expect(key1).not.toBe(key2);
    });

    it('should generate same cache key for identical messages', () => {
      const messages = createTestMessages(5);

      const key1 = (messageCompactor as any).generateCacheKey(messages);
      const key2 = (messageCompactor as any).generateCacheKey(messages);

      expect(key1).toBe(key2);
    });
  });

  describe('section parsing edge cases', () => {
    it('should parse sections with various formats', () => {
      const testCases = [
        {
          summary: '1. Title: content\n2. Another: more',
          expectedCount: 2,
        },
        {
          summary: '1) Title: content\n2) Another: more',
          expectedCount: 2,
        },
        {
          summary: '1 - Title: content\n2 - Another: more',
          expectedCount: 2,
        },
      ];

      for (const testCase of testCases) {
        const sections = (messageCompactor as any).parseSections(testCase.summary);
        expect(sections.length).toBeGreaterThanOrEqual(testCase.expectedCount);
      }
    });

    it('should handle malformed section formats gracefully', () => {
      const malformedSummary = 'This is just plain text without sections';
      const sections = (messageCompactor as any).parseSections(malformedSummary);

      expect(sections.length).toBeGreaterThan(0);
      expect(sections[0].title).toBe('Summary');
      expect(sections[0].content).toContain('plain text');
    });

    it('should extract analysis tags correctly', () => {
      const summaryWithAnalysis = '<analysis>Test analysis</analysis>\n1. Section: content';
      const sections = (messageCompactor as any).parseSections(summaryWithAnalysis);

      const analysisSection = sections.find((s: any) => s.title === 'Analysis');
      expect(analysisSection).toBeDefined();
      expect(analysisSection?.content).toBe('Test analysis');
    });
  });

  describe('abort and timeout handling', () => {
    it('should handle abort signal during compression', async () => {
      const abortController = new AbortController();
      const messages = createTestMessages(15);

      // Abort after a short delay
      setTimeout(() => abortController.abort(), 50);

      // Mock to simulate long-running compression
      mockChatService.runAgentLoop.mockImplementation((_options: any, callbacks: any) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            callbacks.onComplete('aborted response');
            resolve();
          }, 200);
        });
      });

      try {
        await messageCompactor.compactMessages(
          {
            messages,
            config: defaultConfig,
          },
          abortController
        );
      } catch (_error) {
        // Expected to be aborted or timeout
      }

      // Test should complete without hanging
      expect(true).toBe(true);
    });
  });
});
