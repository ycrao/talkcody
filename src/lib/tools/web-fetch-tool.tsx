import { z } from 'zod';
import { GenericToolDoing } from '@/components/tools/generic-tool-doing';
import { GenericToolResult } from '@/components/tools/generic-tool-result';
import { createTool } from '@/lib/create-tool';
import { logger } from '../logger';
import { fetchWebContent } from '../utils/web-fetcher';

export const webFetchTool = createTool({
  name: 'web-fetch',
  description: 'Fetch and extract content from a web url',
  inputSchema: z.object({
    url: z.string().describe('The URL of the web page to fetch'),
  }),
  canConcurrent: true,
  execute: async ({ url }) => {
    return await fetchWebContent(url);
  },
  renderToolDoing: ({ url }) => (
    <GenericToolDoing operation="fetch" target={url} details="Fetching web content" />
  ),
  renderToolResult: (result, params = {}) => {
    const success = !!(result.content || result.title);
    const url = (params as { url?: string }).url || result.url;
    logger.info('webFetchTool - renderToolResult', result.content);

    return (
      <GenericToolResult
        success={success}
        operation="fetch"
        target={url}
        message={result.content || undefined}
        error={!success ? 'No content extracted from the web page' : undefined}
      />
    );
  },
});
