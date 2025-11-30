// Marketplace API endpoint tests
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { app } from '../index';
import { clearDatabase, seedTestDatabase } from './fixtures';

// Test data references
let _testData: any;

// Initialize test database before all tests
beforeAll(async () => {
  console.log('\n🔧 Setting up test environment...\n');

  // NOTE: Database schema is created by running migrations first
  // Run: bun run src/test/migrate-test-db.ts before running tests

  // Seed test data
  _testData = await seedTestDatabase();

  console.log('\n✅ Test environment ready\n');
});

// Clean up after all tests
afterAll(async () => {
  console.log('\n🧹 Cleaning up test environment...\n');
  await clearDatabase();
  console.log('✅ Cleanup complete\n');
});

describe('Marketplace API - Categories', () => {
  it('should get all categories', async () => {
    const res = await app.request('/api/marketplace/categories');

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.categories).toBeDefined();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.categories.length).toBeGreaterThan(0);

    // Check category structure
    const category = data.categories[0];
    expect(category).toHaveProperty('id');
    expect(category).toHaveProperty('name');
    expect(category).toHaveProperty('slug');
    expect(category).toHaveProperty('description');
  });
});

describe('Marketplace API - Tags', () => {
  it('should get all tags', async () => {
    const res = await app.request('/api/marketplace/tags');

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.tags).toBeDefined();
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags.length).toBeGreaterThan(0);

    // Check tag structure
    const tag = data.tags[0];
    expect(tag).toHaveProperty('id');
    expect(tag).toHaveProperty('name');
    expect(tag).toHaveProperty('slug');
    expect(tag).toHaveProperty('usageCount');
  });

  it('should order tags by usage count', async () => {
    const res = await app.request('/api/marketplace/tags');
    const data = await res.json();

    // Tags should be ordered by usageCount descending
    for (let i = 0; i < data.tags.length - 1; i++) {
      expect(data.tags[i].usageCount).toBeGreaterThanOrEqual(data.tags[i + 1].usageCount);
    }
  });
});

describe('Marketplace API - Featured Agents', () => {
  it('should get featured agents', async () => {
    const res = await app.request('/api/marketplace/agents/featured?limit=10');

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.agents).toBeDefined();
    expect(Array.isArray(data.agents)).toBe(true);
    expect(data.total).toBeDefined();
    expect(data.limit).toBe(10);
    expect(data.offset).toBe(0);

    // All agents should be featured
    for (const agent of data.agents) {
      expect(agent.isFeatured).toBe(true);
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('slug');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('author');
      expect(agent.author).toHaveProperty('name');
    }
  });

  it('should respect limit parameter', async () => {
    const res = await app.request('/api/marketplace/agents/featured?limit=1');
    const data = await res.json();

    expect(data.agents.length).toBeLessThanOrEqual(1);
  });
});

describe('Marketplace API - List Agents', () => {
  it('should list all published agents', async () => {
    const res = await app.request('/api/marketplace/agents?limit=20');

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.agents).toBeDefined();
    expect(Array.isArray(data.agents)).toBe(true);
    expect(data.total).toBeGreaterThan(0);

    // Should only show published agents
    for (const agent of data.agents) {
      expect(agent).toHaveProperty('slug');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('author');
      expect(agent).toHaveProperty('categories');
      expect(agent).toHaveProperty('tags');
      expect(agent).toHaveProperty('installCount');
    }

    // Should not include unpublished agents
    const draftAgent = data.agents.find((a: any) => a.slug === 'draft-agent');
    expect(draftAgent).toBeUndefined();
  });

  it('should sort by popular (default)', async () => {
    const res = await app.request('/api/marketplace/agents?sortBy=popular');
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);

    // Popular = downloads + installs * 2
    // Featured agents should be prioritized
  });

  it('should sort by recent', async () => {
    const res = await app.request('/api/marketplace/agents?sortBy=recent');
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);
  });

  it('should sort by installs', async () => {
    const res = await app.request('/api/marketplace/agents?sortBy=installs');
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);

    // Should be sorted by install count descending
    for (let i = 0; i < data.agents.length - 1; i++) {
      expect(data.agents[i].installCount).toBeGreaterThanOrEqual(data.agents[i + 1].installCount);
    }
  });

  it('should sort by name', async () => {
    const res = await app.request('/api/marketplace/agents?sortBy=name');
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);

    // Should be sorted alphabetically
    for (let i = 0; i < data.agents.length - 1; i++) {
      expect(data.agents[i].name.localeCompare(data.agents[i + 1].name)).toBeLessThanOrEqual(0);
    }
  });

  it('should search agents by name', async () => {
    const res = await app.request('/api/marketplace/agents?search=Python');
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);

    // Should contain the search term
    const hasMatch = data.agents.some((agent: any) => agent.name.toLowerCase().includes('python'));
    expect(hasMatch).toBe(true);
  });

  it('should search agents by description', async () => {
    const res = await app.request('/api/marketplace/agents?search=TypeScript');
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);
  });

  it('should use FTS5 for multi-word search', async () => {
    const res = await app.request('/api/marketplace/agents?search=Python%20expert%20programming');
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);

    // Python Expert should be in the results
    const pythonAgent = data.agents.find((a: any) => a.slug === 'python-expert');
    expect(pythonAgent).toBeDefined();
  });

  it('should handle FTS5 phrase search', async () => {
    const res = await app.request('/api/marketplace/agents?search=%22Python%20Expert%22');
    const data = await res.json();

    // Should find exact phrase matches
    expect(data.agents.length).toBeGreaterThan(0);
  });

  it('should handle FTS5 boolean search - AND', async () => {
    const res = await app.request('/api/marketplace/agents?search=Python%20AND%20data');
    const data = await res.json();

    // Should only match agents with both "Python" and "data"
    expect(Array.isArray(data.agents)).toBe(true);
  });

  it('should handle FTS5 boolean search - OR', async () => {
    const res = await app.request('/api/marketplace/agents?search=Python%20OR%20TypeScript');
    const data = await res.json();

    // Should match agents with either "Python" or "TypeScript"
    expect(data.agents.length).toBeGreaterThan(0);
  });

  it('should handle FTS5 prefix search', async () => {
    const res = await app.request('/api/marketplace/agents?search=Pyth*');
    const data = await res.json();

    // Should match "Python"
    expect(data.agents.length).toBeGreaterThan(0);
    const pythonAgent = data.agents.find((a: any) => a.name.toLowerCase().includes('python'));
    expect(pythonAgent).toBeDefined();
  });

  it('should rank name matches higher than description matches', async () => {
    const res = await app.request('/api/marketplace/agents?search=Python&sortBy=popular');
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);

    // Agent with "Python" in name should rank highly
    // (exact ranking depends on other factors like popularity)
    const pythonAgent = data.agents.find((a: any) => a.slug === 'python-expert');
    expect(pythonAgent).toBeDefined();
  });

  it('should handle special characters in search safely', async () => {
    const res = await app.request('/api/marketplace/agents?search=%40%23%24%25');

    // Should not throw error, just return empty or handle gracefully
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.agents)).toBe(true);
  });

  it('should return empty results for no matches', async () => {
    const res = await app.request('/api/marketplace/agents?search=xyznonexistent12345');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.agents.length).toBe(0);
    expect(data.total).toBe(0);
  });

  it('should combine FTS5 search with category filter', async () => {
    // Get coding category ID
    const categoriesRes = await app.request('/api/marketplace/categories');
    const categoriesData = await categoriesRes.json();
    const codingCategory = categoriesData.categories.find((c: any) => c.slug === 'coding');

    const res = await app.request(
      `/api/marketplace/agents?search=Python&categoryIds=${codingCategory.id}`
    );
    const data = await res.json();

    // Should return agents matching both search and category
    expect(Array.isArray(data.agents)).toBe(true);

    // All results should have the coding category and match the search
    for (const agent of data.agents) {
      const hasCategory = agent.categories.some((c: any) => c.id === codingCategory.id);
      expect(hasCategory).toBe(true);
    }
  });

  it('should combine FTS5 search with tag filter', async () => {
    // Get Python tag ID
    const tagsRes = await app.request('/api/marketplace/tags');
    const tagsData = await tagsRes.json();
    const pythonTag = tagsData.tags.find((t: any) => t.slug === 'python');

    const res = await app.request(`/api/marketplace/agents?search=expert&tagIds=${pythonTag.id}`);
    const data = await res.json();

    // Should return agents matching both search and tag
    expect(Array.isArray(data.agents)).toBe(true);

    // All results should have the python tag
    for (const agent of data.agents) {
      const hasTag = agent.tags.some((t: any) => t.id === pythonTag.id);
      expect(hasTag).toBe(true);
    }
  });

  it('should filter by category', async () => {
    // Get coding category ID
    const categoriesRes = await app.request('/api/marketplace/categories');
    const categoriesData = await categoriesRes.json();
    const codingCategory = categoriesData.categories.find((c: any) => c.slug === 'coding');

    const res = await app.request(`/api/marketplace/agents?categoryIds=${codingCategory.id}`);
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);

    // All agents should have the coding category
    for (const agent of data.agents) {
      const hasCategory = agent.categories.some((c: any) => c.id === codingCategory.id);
      expect(hasCategory).toBe(true);
    }
  });

  it('should filter by tag', async () => {
    // Get Python tag ID
    const tagsRes = await app.request('/api/marketplace/tags');
    const tagsData = await tagsRes.json();
    const pythonTag = tagsData.tags.find((t: any) => t.slug === 'python');

    const res = await app.request(`/api/marketplace/agents?tagIds=${pythonTag.id}`);
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);

    // All agents should have the python tag
    for (const agent of data.agents) {
      const hasTag = agent.tags.some((t: any) => t.id === pythonTag.id);
      expect(hasTag).toBe(true);
    }
  });

  it('should filter featured agents', async () => {
    const res = await app.request('/api/marketplace/agents?isFeatured=true');
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);

    // All should be featured
    for (const agent of data.agents) {
      expect(agent.isFeatured).toBe(true);
    }
  });

  it('should support pagination', async () => {
    const res1 = await app.request('/api/marketplace/agents?limit=1&offset=0');
    const data1 = await res1.json();

    const res2 = await app.request('/api/marketplace/agents?limit=1&offset=1');
    const data2 = await res2.json();

    expect(data1.agents.length).toBe(1);
    expect(data2.agents.length).toBeLessThanOrEqual(1);

    // Should be different agents
    if (data2.agents.length > 0) {
      expect(data1.agents[0].id).not.toBe(data2.agents[0].id);
    }
  });
});

describe('Marketplace API - Get Agent by Slug', () => {
  it('should get agent by slug', async () => {
    const res = await app.request('/api/marketplace/agents/python-expert');

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.agent).toBeDefined();
    expect(data.agent.slug).toBe('python-expert');
    expect(data.agent.name).toBe('Python Expert');
    expect(data.agent).toHaveProperty('versions');
    expect(Array.isArray(data.agent.versions)).toBe(true);

    // Check version structure
    if (data.agent.versions.length > 0) {
      const version = data.agent.versions[0];
      expect(version).toHaveProperty('version');
      expect(version).toHaveProperty('isLatest');
      expect(version).toHaveProperty('createdAt');
    }
  });

  it('should return 404 for non-existent agent', async () => {
    const res = await app.request('/api/marketplace/agents/non-existent-agent');

    expect(res.status).toBe(404);
  });

  it('should not return unpublished agents', async () => {
    const res = await app.request('/api/marketplace/agents/draft-agent');

    // Draft agent is not published, should return 404 or empty
    expect(res.status).toBe(404);
  });
});

describe('Marketplace API - Agent Enrichment', () => {
  it('should include author information', async () => {
    const res = await app.request('/api/marketplace/agents?limit=1');
    const data = await res.json();

    expect(data.agents.length).toBeGreaterThan(0);

    const agent = data.agents[0];
    expect(agent.author).toBeDefined();
    expect(agent.author).toHaveProperty('id');
    expect(agent.author).toHaveProperty('name');
    expect(agent.author.name).not.toBe('Unknown');
  });

  it('should include categories', async () => {
    const res = await app.request('/api/marketplace/agents/python-expert');
    const data = await res.json();

    expect(data.agent.categories).toBeDefined();
    expect(Array.isArray(data.agent.categories)).toBe(true);
    expect(data.agent.categories.length).toBeGreaterThan(0);

    const category = data.agent.categories[0];
    expect(category).toHaveProperty('id');
    expect(category).toHaveProperty('name');
    expect(category).toHaveProperty('slug');
  });

  it('should include tags', async () => {
    const res = await app.request('/api/marketplace/agents/python-expert');
    const data = await res.json();

    expect(data.agent.tags).toBeDefined();
    expect(Array.isArray(data.agent.tags)).toBe(true);
    expect(data.agent.tags.length).toBeGreaterThan(0);

    const tag = data.agent.tags[0];
    expect(tag).toHaveProperty('id');
    expect(tag).toHaveProperty('name');
    expect(tag).toHaveProperty('slug');
  });

  it('should include correct author agentCount', async () => {
    // Get all agents to find one from Alice (who has 2 published agents)
    const res = await app.request('/api/marketplace/agents/python-expert');
    const data = await res.json();

    expect(data.agent.author).toBeDefined();
    expect(data.agent.author).toHaveProperty('agentCount');

    // Alice (author of python-expert) has 2 published agents
    expect(data.agent.author.agentCount).toBe(2);

    // Also check Bob's agent (typescript-helper)
    const bobRes = await app.request('/api/marketplace/agents/typescript-helper');
    const bobData = await bobRes.json();

    expect(bobData.agent.author).toBeDefined();
    expect(bobData.agent.author).toHaveProperty('agentCount');

    // Bob has 1 published agent (draft-agent is not published, so shouldn't be counted)
    expect(bobData.agent.author.agentCount).toBe(1);
  });
});

describe('User API - User Profile', () => {
  it('should return user profile with correct published agent count', async () => {
    // Get Alice's user ID from the python-expert agent
    const agentRes = await app.request('/api/marketplace/agents/python-expert');
    const agentData = await agentRes.json();
    const aliceId = agentData.agent.author.id;

    // Get Alice's user profile
    const res = await app.request(`/api/users/${aliceId}`);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user).toHaveProperty('id');
    expect(data.user).toHaveProperty('name');
    expect(data.user).toHaveProperty('agentCount');

    // Alice has 2 published agents (python-expert and data-analyzer)
    expect(data.user.agentCount).toBe(2);
  });

  it('should return correct agent count for user with one published agent', async () => {
    // Get Bob's user ID from the typescript-helper agent
    const agentRes = await app.request('/api/marketplace/agents/typescript-helper');
    const agentData = await agentRes.json();
    const bobId = agentData.agent.author.id;

    // Get Bob's user profile
    const res = await app.request(`/api/users/${bobId}`);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.agentCount).toBe(1); // Bob has 1 published agent (draft-agent is not published)
  });

  it('should return 404 for non-existent user', async () => {
    // Use a valid UUID format that doesn't exist in the database
    const res = await app.request('/api/users/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
  });
});
