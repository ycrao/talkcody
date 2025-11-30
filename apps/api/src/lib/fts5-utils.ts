// FTS5 Full-Text Search Utilities
// Provides reusable functions for FTS5 search operations

import type { Client } from '@libsql/client';

// ============================================
// Types
// ============================================

export interface FtsSearchOptions {
  /** Search query string */
  query: string;
  /** Maximum number of results to return (default: 1000) */
  limit?: number;
  /** Ranking weights for [name, description, longDescription] (default: [10.0, 5.0, 1.0]) */
  weights?: [number, number, number];
  /** Whether to include snippets in results (default: false) */
  includeSnippets?: boolean;
  /** Snippet options */
  snippetOptions?: {
    /** Column index to generate snippet from (0=name, 1=description, 2=longDescription) */
    column?: number;
    /** Start tag for highlighting (default: '<mark>') */
    startTag?: string;
    /** End tag for highlighting (default: '</mark>') */
    endTag?: string;
    /** Ellipsis for truncated text (default: '...') */
    ellipsis?: string;
    /** Maximum tokens in snippet (default: 32) */
    maxTokens?: number;
  };
}

export interface FtsSearchResult {
  /** Entity ID */
  id: string;
  /** Relevance rank (lower is better, negative values indicate higher relevance) */
  rank: number;
  /** Highlighted snippet (if requested) */
  snippet?: string;
}

// ============================================
// Query Escaping
// ============================================

/**
 * Escape FTS5 special characters in user input
 *
 * FTS5 treats certain characters as special:
 * - Double quotes (") for phrase search
 * - Single quotes (') can cause SQL injection
 * - Asterisk (*) for prefix search
 *
 * This function escapes these characters to prevent syntax errors.
 *
 * @param query - Raw user search query
 * @returns Escaped query safe for FTS5
 *
 * @example
 * escapeFts5Query('test"ing') // => 'test""ing'
 * escapeFts5Query("user's query") // => "user''s query"
 */
export function escapeFts5Query(query: string): string {
  return query
    .replace(/"/g, '""') // Escape double quotes
    .replace(/'/g, "''"); // Escape single quotes for SQL safety
}

/**
 * Sanitize query for safe FTS5 usage
 *
 * This is more aggressive than escaping - it removes special
 * characters entirely if they might cause issues.
 *
 * FTS5 special characters that cause syntax errors:
 * - @ # $ % & ( ) + = [ ] { } | \ : ; " ' < > , . ? /
 *
 * FTS5 operators to preserve:
 * - * (prefix search)
 * - - (negation, but can cause issues so we remove it)
 *
 * @param query - Raw user search query
 * @returns Sanitized query
 */
export function sanitizeFts5Query(query: string): string {
  // Remove leading/trailing whitespace
  let sanitized = query.trim();

  // If query is empty after trimming, return it
  if (!sanitized) return sanitized;

  // Remove FTS5 special operator characters that cause syntax errors
  // Keep: letters, numbers, spaces, underscores, hyphens, asterisks (for prefix search)
  // Remove: @#$%&()+=[]{}\|:;"'<>,.?/!~`^-
  sanitized = sanitized.replace(/[@#$%&()+=[\]{}\\|:;"'<>,.?!~`^/-]/g, ' ');

  // Collapse multiple spaces into one
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // If query became empty after sanitization, return empty string
  if (!sanitized) return '';

  // Escape quotes in the remaining text
  sanitized = escapeFts5Query(sanitized);

  // Remove any control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

  return sanitized;
}

// ============================================
// Search Functions
// ============================================

/**
 * Search marketplace agents using FTS5
 *
 * @param client - Turso database client
 * @param options - Search options
 * @returns Array of search results with IDs and ranks
 *
 * @example
 * const results = await searchAgentsFts5(client, {
 *   query: 'python testing',
 *   limit: 20,
 *   weights: [10.0, 5.0, 1.0]  // Prioritize name matches
 * })
 */
export async function searchAgentsFts5(
  client: Client,
  options: FtsSearchOptions
): Promise<FtsSearchResult[]> {
  const {
    query,
    limit = 1000,
    weights = [10.0, 5.0, 1.0],
    includeSnippets = false,
    snippetOptions = {},
  } = options;

  // Sanitize input
  const sanitizedQuery = sanitizeFts5Query(query);

  if (!sanitizedQuery) {
    return [];
  }

  try {
    // Build SQL query
    let sql = 'SELECT id, bm25(marketplace_agents_fts, ?, ?, ?) as rank';

    // Add snippet if requested
    if (includeSnippets) {
      const {
        column = 1, // Default to description
        startTag = '<mark>',
        endTag = '</mark>',
        ellipsis = '...',
        maxTokens = 32,
      } = snippetOptions;

      sql += `, snippet(marketplace_agents_fts, ${column}, '${startTag}', '${endTag}', '${ellipsis}', ${maxTokens}) as snippet`;
    }

    sql += ` FROM marketplace_agents_fts WHERE marketplace_agents_fts MATCH ? ORDER BY rank LIMIT ?`;

    // Execute query
    const result = await client.execute({
      sql,
      args: [...weights, sanitizedQuery, limit],
    });

    // Map results
    return result.rows.map((row) => {
      const typedRow = row as unknown as { id: string | number; rank: number; snippet?: string };
      return {
        id: typedRow.id as string,
        rank: typedRow.rank as number,
        ...(includeSnippets && { snippet: typedRow.snippet as string }),
      };
    });
  } catch (error) {
    console.error('[FTS5] Agent search error:', error);
    throw new Error(
      `FTS5 search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Search marketplace skills using FTS5
 *
 * @param client - Turso database client
 * @param options - Search options
 * @returns Array of search results with IDs and ranks
 *
 * @example
 * const results = await searchSkillsFts5(client, {
 *   query: '"code review"',  // Phrase search
 *   limit: 50
 * })
 */
export async function searchSkillsFts5(
  client: Client,
  options: FtsSearchOptions
): Promise<FtsSearchResult[]> {
  const {
    query,
    limit = 1000,
    weights = [10.0, 5.0, 1.0],
    includeSnippets = false,
    snippetOptions = {},
  } = options;

  // Sanitize input
  const sanitizedQuery = sanitizeFts5Query(query);

  if (!sanitizedQuery) {
    return [];
  }

  try {
    // Build SQL query
    let sql = 'SELECT id, bm25(marketplace_skills_fts, ?, ?, ?) as rank';

    // Add snippet if requested
    if (includeSnippets) {
      const {
        column = 1,
        startTag = '<mark>',
        endTag = '</mark>',
        ellipsis = '...',
        maxTokens = 32,
      } = snippetOptions;

      sql += `, snippet(marketplace_skills_fts, ${column}, '${startTag}', '${endTag}', '${ellipsis}', ${maxTokens}) as snippet`;
    }

    sql += ` FROM marketplace_skills_fts WHERE marketplace_skills_fts MATCH ? ORDER BY rank LIMIT ?`;

    // Execute query
    const result = await client.execute({
      sql,
      args: [...weights, sanitizedQuery, limit],
    });

    // Map results
    return result.rows.map((row) => {
      const typedRow = row as unknown as { id: string | number; rank: number; snippet?: string };
      return {
        id: typedRow.id as string,
        rank: typedRow.rank as number,
        ...(includeSnippets && { snippet: typedRow.snippet as string }),
      };
    });
  } catch (error) {
    console.error('[FTS5] Skill search error:', error);
    throw new Error(
      `FTS5 search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================
// Maintenance Functions
// ============================================

/**
 * Optimize FTS5 indexes
 *
 * Merges segments and improves query performance.
 * Should be run periodically (e.g., daily via cron).
 *
 * @param client - Turso database client
 */
export async function optimizeFts5Indexes(client: Client): Promise<void> {
  try {
    await client.batch([
      {
        sql: "INSERT INTO marketplace_agents_fts(marketplace_agents_fts) VALUES('optimize')",
        args: [],
      },
      {
        sql: "INSERT INTO marketplace_skills_fts(marketplace_skills_fts) VALUES('optimize')",
        args: [],
      },
    ]);

    console.log('[FTS5] Indexes optimized successfully');
  } catch (error) {
    console.error('[FTS5] Index optimization failed:', error);
    throw error;
  }
}

/**
 * Rebuild FTS5 indexes from scratch
 *
 * Completely rebuilds the FTS5 indexes. Use this if:
 * - Indexes become corrupted
 * - After bulk data imports
 * - When changing tokenizer settings
 *
 * @param client - Turso database client
 */
export async function rebuildFts5Indexes(client: Client): Promise<void> {
  try {
    await client.batch([
      {
        sql: "INSERT INTO marketplace_agents_fts(marketplace_agents_fts) VALUES('rebuild')",
        args: [],
      },
      {
        sql: "INSERT INTO marketplace_skills_fts(marketplace_skills_fts) VALUES('rebuild')",
        args: [],
      },
    ]);

    console.log('[FTS5] Indexes rebuilt successfully');
  } catch (error) {
    console.error('[FTS5] Index rebuild failed:', error);
    throw error;
  }
}

/**
 * Check FTS5 index integrity
 *
 * Verifies that FTS5 indexes are not corrupted.
 *
 * @param client - Turso database client
 * @returns true if indexes are healthy
 */
export async function checkFts5Integrity(client: Client): Promise<boolean> {
  try {
    await client.batch([
      {
        sql: "INSERT INTO marketplace_agents_fts(marketplace_agents_fts) VALUES('integrity-check')",
        args: [],
      },
      {
        sql: "INSERT INTO marketplace_skills_fts(marketplace_skills_fts) VALUES('integrity-check')",
        args: [],
      },
    ]);

    console.log('[FTS5] Integrity check passed');
    return true;
  } catch (error) {
    console.error('[FTS5] Integrity check failed:', error);
    return false;
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if a query uses advanced FTS5 syntax
 *
 * @param query - Search query
 * @returns true if query contains FTS5 operators
 */
export function isAdvancedFts5Query(query: string): boolean {
  const advancedPatterns = [
    /"[^"]+"/, // Phrase search
    /\bAND\b/i, // Boolean AND
    /\bOR\b/i, // Boolean OR
    /\bNOT\b/i, // Boolean NOT
    /\bNEAR\b/i, // Proximity search
    /\*/, // Prefix search
  ];

  return advancedPatterns.some((pattern) => pattern.test(query));
}

/**
 * Get search query suggestions
 *
 * Provides helpful suggestions for improving search queries.
 *
 * @param query - Original search query
 * @returns Array of suggestion messages
 */
export function getFts5QuerySuggestions(query: string): string[] {
  const suggestions: string[] = [];

  if (query.length < 3) {
    suggestions.push('Try using at least 3 characters for better results');
  }

  if (!isAdvancedFts5Query(query)) {
    suggestions.push('Use quotes for phrase search: "exact phrase"');
    suggestions.push('Use AND/OR for boolean search: python AND testing');
    suggestions.push('Use * for prefix matching: java*');
  }

  return suggestions;
}
