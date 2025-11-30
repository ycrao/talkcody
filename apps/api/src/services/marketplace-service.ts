// Marketplace service for browsing and searching agents

import type { Category, MarketplaceAgent, Tag } from '@talkcody/shared';
import { and, asc, count, desc, eq, inArray, like, or, type SQL, sql } from 'drizzle-orm';
import { db, getDb } from '../db/client';
import {
  agentCategories,
  agentStats,
  agentTags,
  agentVersions,
  categories,
  marketplaceAgents,
  tags,
  users,
} from '../db/schema';
import { searchAgentsFts5 } from '../lib/fts5-utils';
import type { DbCategory, DbMarketplaceAgent, DbTag } from '../types/database';

export interface ListAgentsOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'popular' | 'recent' | 'installs' | 'name';
  search?: string;
  categoryIds?: string[];
  tagIds?: string[];
  isFeatured?: boolean;
  authorId?: string;
}

export interface AgentWithDetails extends MarketplaceAgent {
  versions: Array<{
    version: string;
    isLatest: boolean;
    createdAt: string;
  }>;
}

export class MarketplaceService {
  /**
   * List agents with filtering and sorting
   */
  async listAgents(options: ListAgentsOptions = {}) {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'popular',
      search,
      categoryIds,
      tagIds,
      isFeatured,
      authorId,
    } = options;

    // Build where conditions
    const conditions: SQL[] = [eq(marketplaceAgents.isPublished, true)];

    // Handle FTS5 full-text search
    let agentIdsFromSearch: string[] | undefined;

    if (search) {
      try {
        // Use FTS5 for fast, relevance-ranked search
        // Weights: name=10.0, description=5.0, longDescription=1.0
        const { client } = getDb();
        const ftsResults = await searchAgentsFts5(client, {
          query: search,
          limit: 1000, // Get top 1000 matches for further filtering
          weights: [10.0, 5.0, 1.0],
        });

        agentIdsFromSearch = ftsResults.map((result) => result.id);

        // If no FTS5 matches found, return empty result early
        if (agentIdsFromSearch.length === 0) {
          return { agents: [], total: 0, limit, offset };
        }
      } catch (error) {
        // Fallback to LIKE search if FTS5 fails
        console.warn('[Marketplace] FTS5 search failed, falling back to LIKE:', error);
        conditions.push(
          or(
            like(marketplaceAgents.name, `%${search}%`),
            like(marketplaceAgents.description, `%${search}%`),
            like(marketplaceAgents.longDescription, `%${search}%`)
          )
        );
      }
    }

    if (isFeatured !== undefined) {
      conditions.push(eq(marketplaceAgents.isFeatured, isFeatured));
    }

    if (authorId) {
      conditions.push(eq(marketplaceAgents.authorId, authorId));
    }

    // Handle category and tag filtering
    let agentIds: string[] | undefined;

    // Start with FTS5 search results if available
    if (agentIdsFromSearch) {
      agentIds = agentIdsFromSearch;
    }

    if (categoryIds && categoryIds.length > 0) {
      const categoryAgents = await db
        .select({ agentId: agentCategories.agentId })
        .from(agentCategories)
        .where(inArray(agentCategories.categoryId, categoryIds));

      const categoryAgentIds = categoryAgents.map((a) => a.agentId);

      if (agentIds) {
        // Intersect with existing filter (from FTS5 or previous filters)
        agentIds = agentIds.filter((id) => categoryAgentIds.includes(id));
      } else {
        agentIds = categoryAgentIds;
      }

      if (agentIds.length === 0) {
        // No agents match the categories
        return { agents: [], total: 0, limit, offset };
      }
    }

    if (tagIds && tagIds.length > 0) {
      const tagAgents = await db
        .select({ agentId: agentTags.agentId })
        .from(agentTags)
        .where(inArray(agentTags.tagId, tagIds));

      const tagAgentIds = tagAgents.map((a) => a.agentId);
      if (agentIds) {
        // Intersect with existing filter
        agentIds = agentIds.filter((id) => tagAgentIds.includes(id));
      } else {
        agentIds = tagAgentIds;
      }

      if (agentIds.length === 0) {
        return { agents: [], total: 0, limit, offset };
      }
    }

    if (agentIds) {
      conditions.push(inArray(marketplaceAgents.id, agentIds));
    }

    // Build order by
    let orderBy: SQL;
    switch (sortBy) {
      case 'recent':
        orderBy = desc(marketplaceAgents.createdAt);
        break;
      case 'installs':
        orderBy = desc(marketplaceAgents.installCount);
        break;
      case 'name':
        orderBy = asc(marketplaceAgents.name);
        break;
      default:
        // Popular = by install count
        orderBy = desc(marketplaceAgents.installCount);
        break;
    }

    // Execute query
    const agentsQuery = db
      .select()
      .from(marketplaceAgents)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const agentsResult = await agentsQuery;

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(marketplaceAgents)
      .where(and(...conditions));

    // Enrich with author and relations
    const enrichedAgents = await this.enrichAgents(agentsResult);

    return {
      agents: enrichedAgents,
      total: totalResult[0]?.count || 0,
      limit,
      offset,
    };
  }

  /**
   * Get agent by slug
   */
  async getAgentBySlug(slug: string): Promise<AgentWithDetails | null> {
    const agentResult = await db
      .select()
      .from(marketplaceAgents)
      .where(and(eq(marketplaceAgents.slug, slug), eq(marketplaceAgents.isPublished, true)))
      .limit(1);

    if (agentResult.length === 0) {
      return null;
    }

    const agent = agentResult[0];

    // Get versions
    const versionsResult = await db
      .select()
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agent.id))
      .orderBy(desc(agentVersions.createdAt));

    // Enrich agent
    const enriched = await this.enrichAgents([agent]);

    return {
      ...enriched[0],
      versions: versionsResult.map((v) => ({
        version: v.version,
        isLatest: v.version === agent.latestVersion,
        createdAt: new Date(v.createdAt).toISOString(),
      })),
    } as AgentWithDetails;
  }

  /**
   * Get featured agents
   */
  async getFeaturedAgents(limit: number = 10) {
    return this.listAgents({ limit, isFeatured: true, sortBy: 'popular' });
  }

  /**
   * Track agent download (alias for trackInstall)
   */
  async trackDownload(agentId: string, userId: string | null, version?: string) {
    // Download and install are the same, so just track as install
    return this.trackInstall(agentId, userId, version || 'latest');
  }

  /**
   * Track agent install
   */
  async trackInstall(agentId: string, userId: string | null, version: string) {
    // Increment install count
    await db
      .update(marketplaceAgents)
      .set({
        installCount: sql`${marketplaceAgents.installCount} + 1`,
      })
      .where(eq(marketplaceAgents.id, agentId));

    // Record install event in stats (userId can be null for anonymous users)
    await db.insert(agentStats).values({
      agentId,
      userId,
      version,
      eventType: 'install',
    });
  }

  /**
   * Get all categories
   */
  async getAllCategories(): Promise<Category[]> {
    const results = await db.select().from(categories).orderBy(asc(categories.name));

    return results.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description || '',
      agentCount: 0, // Can be enriched if needed
    }));
  }

  /**
   * Get all tags
   */
  async getAllTags(): Promise<Tag[]> {
    const results = await db.select().from(tags).orderBy(desc(tags.usageCount)).limit(100);

    return results.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      usageCount: t.usageCount,
    }));
  }

  /**
   * Enrich agents with author and relation data
   */
  private async enrichAgents(agents: DbMarketplaceAgent[]): Promise<MarketplaceAgent[]> {
    if (agents.length === 0) {
      return [];
    }

    const agentIds = agents.map((a) => a.id);

    // Get authors
    const authorIds = [...new Set(agents.map((a) => a.authorId))];
    const authorsResult = await db.select().from(users).where(inArray(users.id, authorIds));

    const authorsMap = new Map(authorsResult.map((u) => [u.id, u]));

    // Get published agent counts for each author
    const agentCountsResult = await db
      .select({
        authorId: marketplaceAgents.authorId,
        count: count(),
      })
      .from(marketplaceAgents)
      .where(
        and(inArray(marketplaceAgents.authorId, authorIds), eq(marketplaceAgents.isPublished, true))
      )
      .groupBy(marketplaceAgents.authorId);

    const agentCountsMap = new Map(agentCountsResult.map((ac) => [ac.authorId, ac.count]));

    // Get categories for all agents
    const agentCategoriesResult = await db
      .select({
        agentId: agentCategories.agentId,
        category: categories,
      })
      .from(agentCategories)
      .innerJoin(categories, eq(agentCategories.categoryId, categories.id))
      .where(inArray(agentCategories.agentId, agentIds));

    const categoriesMap = new Map<string, DbCategory[]>();
    for (const ac of agentCategoriesResult) {
      if (!categoriesMap.has(ac.agentId)) {
        categoriesMap.set(ac.agentId, []);
      }
      categoriesMap.get(ac.agentId)?.push(ac.category);
    }

    // Get tags for all agents
    const agentTagsResult = await db
      .select({
        agentId: agentTags.agentId,
        tag: tags,
      })
      .from(agentTags)
      .innerJoin(tags, eq(agentTags.tagId, tags.id))
      .where(inArray(agentTags.agentId, agentIds));

    const tagsMap = new Map<string, DbTag[]>();
    for (const at of agentTagsResult) {
      if (!tagsMap.has(at.agentId)) {
        tagsMap.set(at.agentId, []);
      }
      tagsMap.get(at.agentId)?.push(at.tag);
    }

    // Map to MarketplaceAgent format
    return agents.map((agent) => {
      const author = authorsMap.get(agent.authorId);
      const agentCategories = categoriesMap.get(agent.id) || [];
      const agentTags = tagsMap.get(agent.id) || [];

      return {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        description: agent.description,
        author: {
          id: author?.id || '',
          name: author?.name || 'Unknown',
          avatarUrl: author?.avatarUrl || null,
          bio: author?.bio || null,
          website: author?.website || null,
          agentCount: agentCountsMap.get(agent.authorId) || 0,
        },
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        toolsConfig: agent.toolsConfig,
        rules: agent.rules,
        outputFormat: agent.outputFormat,
        dynamicPromptConfig: agent.dynamicPromptConfig,
        latestVersion: agent.latestVersion,
        installCount: agent.installCount,
        rating: agent.rating,
        ratingCount: agent.ratingCount,
        isFeatured: agent.isFeatured,
        iconUrl: agent.iconUrl,
        categories: agentCategories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description || '',
          agentCount: 0,
        })),
        tags: agentTags.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          usageCount: t.usageCount,
        })),
        createdAt: new Date(agent.createdAt).toISOString(),
        updatedAt: new Date(agent.updatedAt).toISOString(),
      } as MarketplaceAgent;
    });
  }
}

export const marketplaceService = new MarketplaceService();
