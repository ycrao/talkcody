import { logger } from '@/lib/logger';
import type { ConvertMessagesOptions, UIMessage } from '@/types/agent';

const MAX_LINES = 2000;

function isContentTooLong(content: string | undefined): { tooLong: boolean; lineCount: number } {
  const lineCount = content?.split('\n').length ?? 0;
  return { tooLong: lineCount > MAX_LINES, lineCount };
}

export function formatReasoningText(text: string, isFirstReasoning: boolean): string {
  let lines = '';
  if (isFirstReasoning) {
    lines = '> Reasoning:\n> \n';
    lines += '> ';
  }
  lines += text.replace(/\n/g, '\n> ');
  return lines;
}

export async function convertMessages(
  messages: UIMessage[],
  options: ConvertMessagesOptions
): Promise<any[]> {
  const systemMessage = {
    role: 'system' as const,
    content: options.systemPrompt,
    providerOptions: {
      anthropic: { cacheControl: { type: 'ephemeral' } },
    },
  };

  const userMessages = messages
    .filter((msg) => msg.role !== 'system' && msg.role !== 'tool')
    .map((msg) => {
      const contentStr = typeof msg.content === 'string' ? msg.content : '';

      if (msg.attachments && msg.attachments.length > 0) {
        const content = [];

        if (contentStr.trim()) {
          content.push({
            type: 'text',
            text: contentStr,
          });
        }

        for (const attachment of msg.attachments) {
          if (attachment.type === 'image' && attachment.content) {
            content.push({
              type: 'image',
              image: attachment.content,
            });
          } else if (attachment.type === 'file' || attachment.type === 'code') {
            const { tooLong, lineCount } = isContentTooLong(attachment.content);
            const filePath = attachment.filePath ?? attachment.filename;

            if (tooLong) {
              content.push({
                type: 'text',
                text: `The file path is ${filePath}.\nThe file name is ${attachment.filename}.\nThis file is too long (${lineCount} lines), please use the code search tool and read file tool to read the file content you really need.`,
              });
            } else {
              content.push({
                type: 'text',
                text: `The file path is ${filePath}.\nThe file name is ${attachment.filename}.\nThe content in ${attachment.filename} is:\n<code>\n${attachment.content}\n</code>`,
              });
            }
          }
        }

        return {
          role: msg.role,
          content,
        };
      }
      return {
        role: msg.role,
        content: contentStr,
      };
    });

  return [systemMessage, ...userMessages];
}
