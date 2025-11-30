import type { ModelMessage } from 'ai';
import { logger } from '@/lib/logger';
import { GEMINI_25_FLASH_LITE } from '@/lib/models';
import type {
  AgentLoopCallbacks,
  AgentLoopOptions,
  CompressionConfig,
  CompressionResult,
  CompressionSection,
  MessageCompactionOptions,
  UIMessage,
} from '@/types/agent';

export class MessageCompactor {
  private compressionCache = new Map<string, CompressionResult>();
  private readonly MAX_CACHE_SIZE = 10;
  private readonly COMPRESSION_TIMEOUT_MS = 30000; // 30 seconds timeout
  private compressionStats = {
    totalCompressions: 0,
    totalTimeSaved: 0,
    averageCompressionRatio: 0,
  };

  private static readonly COMPRESSION_PROMPT =
    `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points.

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent.
7. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request.

Please be comprehensive and technical in your summary. Include specific file paths, function names, error messages, and code patterns that would be essential for maintaining context.`;

  constructor(
    private chatService: {
      runAgentLoop: (
        options: AgentLoopOptions,
        callbacks: AgentLoopCallbacks,
        abortController?: AbortController
      ) => Promise<void>;
    }
  ) {}

  public async compactMessages(
    options: MessageCompactionOptions,
    abortController?: AbortController
  ): Promise<CompressionResult> {
    const { messages, config, systemPrompt } = options;

    logger.info('Starting message compaction', {
      originalMessageCount: messages.length,
      preserveRecentMessages: config.preserveRecentMessages,
    });

    // Check cache first
    const cacheKey = this.generateCacheKey(messages);
    const cachedResult = this.compressionCache.get(cacheKey);
    if (cachedResult) {
      logger.info('Using cached compression result');
      return cachedResult;
    }

    // Determine which messages to compress and which to preserve
    const preserveCount = Math.min(config.preserveRecentMessages, messages.length);
    const preservedMessages = messages.slice(-preserveCount);
    const messagesToCompress = messages.slice(0, messages.length - preserveCount);

    if (messagesToCompress.length === 0) {
      logger.info('No messages to compress, returning original messages');
      return {
        compressedSummary: '',
        sections: [],
        preservedMessages: messages,
        originalMessageCount: messages.length,
        compressedMessageCount: messages.length,
        compressionRatio: 1.0,
      };
    }

    // Convert messages to text for compression
    const conversationHistory = this.messagesToText(messagesToCompress);

    // Perform compression using the configured model
    const compressedSummary = await this.performCompression(
      conversationHistory,
      config.compressionModel,
      systemPrompt,
      abortController
    );

    // Parse sections from the compressed summary
    const sections = this.parseSections(compressedSummary);

    // Create the final result
    const result: CompressionResult = {
      compressedSummary,
      sections,
      preservedMessages,
      originalMessageCount: messages.length,
      compressedMessageCount: 1 + preservedMessages.length, // 1 for summary + preserved
      compressionRatio: (1 + preservedMessages.length) / messages.length,
    };

    // Update statistics
    this.updateStats(result);

    // Cache the result
    this.manageCacheSize();
    this.compressionCache.set(cacheKey, result);

    logger.info('Message compaction completed', {
      originalCount: result.originalMessageCount,
      compressedCount: result.compressedMessageCount,
      ratio: result.compressionRatio,
      cacheSize: this.compressionCache.size,
    });

    return result;
  }

  private messagesToText(messages: ModelMessage[]): string {
    return messages
      .map((msg) => {
        const role = msg.role.toUpperCase();
        let content = '';

        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          content = msg.content
            .map(
              (part: {
                type: string;
                text?: string;
                value?: string;
                toolName?: string;
                input?: unknown;
                output?: unknown;
              }) => {
                if (part.type === 'text') {
                  return part.text || part.value || '';
                } else if (part.type === 'tool-call') {
                  return `[TOOL CALL: ${part.toolName}(${JSON.stringify(part.input)})]`;
                } else if (part.type === 'tool-result') {
                  return `[TOOL RESULT: ${part.toolName} -> ${JSON.stringify(part.output)}]`;
                }
                return '';
              }
            )
            .join('\n');
        }

        return `${role}: ${content}`;
      })
      .join('\n\n');
  }

  private async performCompression(
    conversationHistory: string,
    model: string,
    systemPrompt?: string,
    abortController?: AbortController
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let compressedText = '';
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      // Set up timeout
      timeoutId = setTimeout(() => {
        const timeoutError = new Error(
          `Compression timeout after ${this.COMPRESSION_TIMEOUT_MS}ms`
        );
        logger.error('Compression timeout', timeoutError);
        reject(timeoutError);
      }, this.COMPRESSION_TIMEOUT_MS);

      // Prepare compression prompt
      const compressionPrompt = `${MessageCompactor.COMPRESSION_PROMPT}

CONVERSATION HISTORY TO SUMMARIZE:
${conversationHistory}

Please provide a comprehensive structured summary following the 8-section format above.`;

      const compressionMessages: UIMessage[] = [
        {
          id: 'compression-request',
          role: 'user',
          content: compressionPrompt,
          timestamp: new Date(),
        },
      ];

      this.chatService.runAgentLoop(
        {
          messages: compressionMessages,
          model: model || GEMINI_25_FLASH_LITE,
          systemPrompt:
            systemPrompt ||
            'You are an expert at creating detailed technical summaries that preserve all essential context for software development work.',
          tools: {}, // No tools needed for compression
          maxIterations: 1, // Single response for compression
        },
        {
          onChunk: (chunk: string) => {
            compressedText += chunk;
          },
          onComplete: (fullText: string) => {
            if (timeoutId) clearTimeout(timeoutId);
            resolve(fullText || compressedText);
          },
          onError: (error: Error) => {
            if (timeoutId) clearTimeout(timeoutId);
            logger.error('Message compression failed:', error);
            reject(error);
          },
          onStatus: (status: string) => {
            logger.debug('Compression status:', status);
          },
        },
        abortController
      );
    });
  }

  private parseSections(compressedSummary: string): CompressionSection[] {
    const sections: CompressionSection[] = [];

    try {
      // Try to extract analysis section first
      const analysisMatch = compressedSummary.match(/<analysis>([\s\S]*?)<\/analysis>/);
      if (analysisMatch?.[1]) {
        sections.push({
          title: 'Analysis',
          content: analysisMatch[1].trim(),
        });
      }

      // Extract numbered sections with more robust pattern matching
      // Support various formats: "1. Title:", "1) Title:", "1 - Title:", etc.
      const sectionPatterns = [
        /(\d+)\.\s+([^:\n]+):([\s\S]*?)(?=\n\d+\.|$)/g, // "1. Title: content"
        /(\d+)\)\s+([^:\n]+):([\s\S]*?)(?=\n\d+\)|$)/g, // "1) Title: content"
        /(\d+)\s+-\s+([^:\n]+):([\s\S]*?)(?=\n\d+\s+-|$)/g, // "1 - Title: content"
        /(\d+)\.\s+([^\n]+)\n([\s\S]*?)(?=\n\d+\.|$)/g, // "1. Title\ncontent"
      ];

      let matched = false;
      for (const pattern of sectionPatterns) {
        pattern.lastIndex = 0; // Reset regex state
        const matches = [...compressedSummary.matchAll(pattern)];

        if (matches.length > 0) {
          for (const match of matches) {
            const sectionNumber = match[1];
            const title = match[2];
            const content = match[3];
            if (!sectionNumber || !title) continue;

            sections.push({
              title: `${sectionNumber}. ${title.trim()}`,
              content: (content || '').trim() || 'No content provided',
            });
          }
          matched = true;
          break; // Use first pattern that matches
        }
      }

      // Fallback: if no structured sections found, treat entire summary as one section
      if (!matched && compressedSummary.trim()) {
        logger.warn('Could not parse structured sections, using full summary');
        sections.push({
          title: 'Summary',
          content: compressedSummary.replace(/<analysis>[\s\S]*?<\/analysis>/, '').trim(),
        });
      }
    } catch (error) {
      logger.error('Error parsing compression sections', error);
      // Return the full summary as a fallback
      sections.push({
        title: 'Summary',
        content: compressedSummary,
      });
    }

    return sections;
  }

  public shouldCompress(
    _messages: ModelMessage[],
    config: CompressionConfig,
    lastTokenCount?: number
  ): boolean {
    if (!config.enabled) {
      return false;
    }

    // Use actual token count from last AI request if available
    if (!lastTokenCount) {
      logger.info('No token count available, skipping compression check');
      return false;
    }

    logger.info('Actual token count for messages', { lastTokenCount });
    const maxContextTokens = 200000; // Conservative estimate for most models
    const thresholdTokens = maxContextTokens * config.compressionThreshold;

    if (lastTokenCount > thresholdTokens) {
      logger.info('Compression triggered by token count', {
        actualTokens: lastTokenCount,
        threshold: thresholdTokens,
        ratio: lastTokenCount / maxContextTokens,
      });
      return true;
    }

    return false;
  }

  public createCompressedMessages(result: CompressionResult): ModelMessage[] {
    const compressedMessages: ModelMessage[] = [];

    if (result.compressedSummary) {
      // Add the compressed summary as a system message
      compressedMessages.push({
        role: 'system',
        content: `Previous conversation summary:\n\n${result.compressedSummary}`,
      });
    }

    // Add preserved recent messages
    compressedMessages.push(...result.preservedMessages);

    return compressedMessages;
  }

  public getCompressionStats() {
    return { ...this.compressionStats };
  }

  public clearCache(): void {
    this.compressionCache.clear();
    logger.info('Compression cache cleared');
  }

  public getCacheSize(): number {
    return this.compressionCache.size;
  }

  private updateStats(result: CompressionResult): void {
    this.compressionStats.totalCompressions++;

    // Update average compression ratio
    const currentAvg = this.compressionStats.averageCompressionRatio;
    const newRatio = result.compressionRatio;
    this.compressionStats.averageCompressionRatio =
      (currentAvg * (this.compressionStats.totalCompressions - 1) + newRatio) /
      this.compressionStats.totalCompressions;
  }

  private generateCacheKey(messages: ModelMessage[]): string {
    // Generate a more robust hash based on message content, roles, and count
    const content = messages
      .map((m) => {
        const role = m.role || '';
        const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `${role}:${contentStr}`;
      })
      .join('||');

    // Use a better hash function (DJB2 algorithm)
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) + hash + char; // hash * 33 + char
    }

    // Convert to unsigned 32-bit integer and then to hex
    const hashHex = (hash >>> 0).toString(16).padStart(8, '0');

    // Include message count and first/last message snippet for better uniqueness
    const firstMessage = messages[0];
    const firstSnippet =
      messages.length > 0 && firstMessage
        ? String(typeof firstMessage.content === 'string' ? firstMessage.content : '').slice(0, 20)
        : '';
    const lastMessage = messages[messages.length - 1];
    const lastSnippet =
      messages.length > 0 && lastMessage
        ? String(typeof lastMessage.content === 'string' ? lastMessage.content : '').slice(0, 20)
        : '';

    const snippetHash = this.simpleHash(firstSnippet + lastSnippet);

    return `${messages.length}_${hashHex}_${snippetHash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  private manageCacheSize(): void {
    if (this.compressionCache.size >= this.MAX_CACHE_SIZE) {
      // Remove the oldest entry (first key)
      const firstKey = this.compressionCache.keys().next().value;
      if (firstKey) {
        this.compressionCache.delete(firstKey);
      }
    }
  }
}
