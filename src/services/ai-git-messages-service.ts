// src/services/ai-git-messages-service.ts
import { streamText } from 'ai';
import { logger } from '@/lib/logger';
import { GEMINI_25_FLASH_LITE } from '@/lib/models';
import { aiProviderService } from './ai-provider-service';

export interface GitFileDiff {
  filename: string;
  action: 'create' | 'update' | 'update_full' | 'delete';
}

export interface GitMessageContext {
  userInput?: string;
  fileDiffs: GitFileDiff[];
}

export interface GitMessageResult {
  message: string;
  suggestions?: string[];
}

class AIGitMessagesService {
  async generateCommitMessage(context: GitMessageContext): Promise<GitMessageResult | null> {
    try {
      logger.info('generateCommitMessage context', context);
      const startTime = performance.now();
      let firstDeltaTime: number | null = null;
      let isFirstDelta = true;
      let deltaCount = 0;

      const { userInput, fileDiffs } = context;

      if (!fileDiffs || fileDiffs.length === 0) {
        logger.error('No file diffs provided for commit message generation');
        return null;
      }

      // Categorize files by action
      const createFiles = fileDiffs.filter((f) => f.action === 'create');
      const updateFiles = fileDiffs.filter(
        (f) => f.action === 'update' || f.action === 'update_full'
      );
      const deleteFiles = fileDiffs.filter((f) => f.action === 'delete');

      // Build file summary
      let fileSummary = '';
      if (createFiles.length > 0) {
        fileSummary += `Created files (${createFiles.length}): ${createFiles.map((f) => f.filename).join(', ')}\n`;
      }
      if (updateFiles.length > 0) {
        fileSummary += `Modified files (${updateFiles.length}): ${updateFiles.map((f) => f.filename).join(', ')}\n`;
      }
      if (deleteFiles.length > 0) {
        fileSummary += `Deleted files (${deleteFiles.length}): ${deleteFiles.map((f) => f.filename).join(', ')}\n`;
      }

      const prompt = `You are an AI assistant that generates concise and meaningful git commit messages following conventional commit format.

${userInput ? `User description: "${userInput}"\n` : ''}
File changes:
${fileSummary}

Generate a concise git commit message that follows these guidelines:
1. Use conventional commit format: type(scope): description
2. Types: feat, fix, docs, style, refactor, test, chore
3. Keep the message under 72 characters for the subject line
4. Be specific about what was changed
5. Use imperative mood (e.g., "add", "fix", "update")

Examples:
- feat(auth): add user authentication system
- fix(api): resolve data validation error
- docs: update installation instructions
- refactor: simplify user service logic

Provide ONLY the commit message without any explanations or formatting.`;

      const { textStream } = await streamText({
        model: aiProviderService.getProviderModel(GEMINI_25_FLASH_LITE),
        prompt,
      });

      let fullText = '';
      for await (const delta of textStream) {
        deltaCount++;

        if (isFirstDelta) {
          firstDeltaTime = performance.now();
          const timeToFirstDelta = firstDeltaTime - startTime;
          logger.info(
            `Git message generation time to first delta: ${timeToFirstDelta.toFixed(2)}ms`
          );
          isFirstDelta = false;
        }

        fullText += delta;
      }

      const endTime = performance.now();
      const totalStreamTime = endTime - startTime;

      logger.info(
        `Git message generation completed - Total time: ${totalStreamTime.toFixed(2)}ms, Deltas: ${deltaCount}`
      );

      const message = fullText.trim();
      logger.info('AI Git Message result:', message);

      if (message) {
        return {
          message,
        };
      }

      return null;
    } catch (error) {
      logger.error('AI git message generation error:', error);
      return null;
    }
  }
}

export const aiGitMessagesService = new AIGitMessagesService();
