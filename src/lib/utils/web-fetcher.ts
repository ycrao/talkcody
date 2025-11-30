import { logger } from '@/lib/logger';
import { fetchWithTimeout } from '../utils';

/**
 * Web content fetch result interface
 */
export interface WebFetchResult {
  title?: string;
  url: string;
  content: string;
  publishedDate?: string | null;
}

/**
 * Fetch web content using Jina AI Reader API
 * @param url - The URL to fetch
 * @returns Web fetch result
 * @throws Error if fetch fails
 */
export async function fetchWithJina(url: string): Promise<WebFetchResult> {
  const accessUrl = `https://r.jina.ai/${url}`;
  logger.info('fetchWithJina:', accessUrl);

  const response = await fetchWithTimeout(accessUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    logger.error('Jina fetch error details', errorDetails);
    throw new Error(
      `Jina fetch failed with status code: ${response.status}, Details: ${errorDetails}`
    );
  }

  const json = await response.json();
  logger.info('fetchWithJina response:', json);

  return {
    title: json.data.title,
    url: json.data.url,
    content: json.data.content,
    publishedDate: json.data.publishedDate || null,
  };
}

/**
 * Fetch web content using Tavily Extract API
 * @param url - The URL to fetch
 * @returns Web fetch result
 * @throws Error if fetch fails
 */
export async function fetchWithTavily(url: string): Promise<WebFetchResult> {
  const tavilyExtractUrl = 'https://api.tavily.com/extract';
  logger.info('fetchWithTavily:', url);

  const requestBody = {
    urls: [url],
    include_images: false,
  };

  const response = await fetchWithTimeout(tavilyExtractUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_TAVILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    logger.error('Tavily fetch error details', errorDetails);
    throw new Error(
      `Tavily fetch failed with status code: ${response.status}, Details: ${errorDetails}`
    );
  }

  const jsonResponse = await response.json();
  logger.info('fetchWithTavily response:', jsonResponse);

  // Process the first result from the results array
  if (
    jsonResponse.results &&
    Array.isArray(jsonResponse.results) &&
    jsonResponse.results.length > 0
  ) {
    const result = jsonResponse.results[0];
    return {
      url: result.url || url,
      content: result.raw_content || '',
      title: undefined, // Tavily doesn't provide title
      publishedDate: null,
    };
  }

  throw new Error('No results returned from Tavily API');
}

/**
 * Validate URL format
 * @param url - The URL to validate
 * @throws Error if URL is invalid
 */
function validateUrl(url: string): void {
  if (!url?.startsWith('http')) {
    throw new Error('Invalid URL provided. URL must start with http or https');
  }
}

export async function fetchWebContent(url: string): Promise<WebFetchResult> {
  // Validate URL
  validateUrl(url);

  // Try Jina AI first
  try {
    logger.info('Attempting to fetch with Jina AI:', url);
    const result = await fetchWithJina(url);
    logger.info('Successfully fetched with Jina AI');
    return result;
  } catch (jinaError) {
    logger.warn('Jina AI fetch failed, falling back to Tavily:', jinaError);

    // Fallback to Tavily
    try {
      logger.info('Attempting to fetch with Tavily:', url);
      const result = await fetchWithTavily(url);
      logger.info('Successfully fetched with Tavily (fallback)');
      return result;
    } catch (tavilyError) {
      logger.error('Both Jina and Tavily fetch failed:', {
        jinaError,
        tavilyError,
      });

      // Both methods failed
      throw new Error(
        `Failed to fetch web content. Jina error: ${jinaError instanceof Error ? jinaError.message : 'Unknown error'}. Tavily error: ${tavilyError instanceof Error ? tavilyError.message : 'Unknown error'}`
      );
    }
  }
}
