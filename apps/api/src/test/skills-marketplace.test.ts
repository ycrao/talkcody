// Skills Marketplace API endpoint tests
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { app } from '../index';
import { clearDatabase, seedTestDatabase } from './fixtures';

// Test data references
let _testData: any;

// Initialize test database before all tests
beforeAll(async () => {
  console.log('\n🔧 Setting up test environment for skills...\n');

  // NOTE: Database schema is created by running migrations first
  // Run: bun run src/test/migrate-test-db.ts before running tests

  // Seed test data
  _testData = await seedTestDatabase();

  console.log('\n✅ Test environment ready for skills\n');
});

// Clean up after all tests
afterAll(async () => {
  console.log('\n🧹 Cleaning up skills test environment...\n');
  await clearDatabase();
  console.log('✅ Cleanup complete\n');
});

describe('Skills Marketplace API - Categories', () => {
  it('should get all categories', async () => {
    const res = await app.request('/api/skills-marketplace/categories');

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

describe('Skills Marketplace API - Tags', () => {
  it('should get all tags', async () => {
    const res = await app.request('/api/skills-marketplace/tags');

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
    const res = await app.request('/api/skills-marketplace/tags');
    const data = await res.json();

    // Tags should be ordered by usageCount descending
    for (let i = 0; i < data.tags.length - 1; i++) {
      expect(data.tags[i].usageCount).toBeGreaterThanOrEqual(data.tags[i + 1].usageCount);
    }
  });
});

describe('Skills Marketplace API - Featured Skills', () => {
  it('should get featured skills', async () => {
    const res = await app.request('/api/skills-marketplace/skills/featured?limit=10');

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.skills).toBeDefined();
    expect(Array.isArray(data.skills)).toBe(true);
    expect(data.total).toBeDefined();
    expect(data.limit).toBe(10);
    expect(data.offset).toBe(0);

    // All skills should be featured
    for (const skill of data.skills) {
      expect(skill.isFeatured).toBe(true);
      expect(skill).toHaveProperty('id');
      expect(skill).toHaveProperty('slug');
      expect(skill).toHaveProperty('name');
      expect(skill).toHaveProperty('description');
      expect(skill).toHaveProperty('author');
      expect(skill.author).toHaveProperty('name');
    }
  });

  it('should respect limit parameter', async () => {
    const res = await app.request('/api/skills-marketplace/skills/featured?limit=1');
    const data = await res.json();

    expect(data.skills.length).toBeLessThanOrEqual(1);
  });
});

describe('Skills Marketplace API - List Skills', () => {
  it('should list all published skills', async () => {
    const res = await app.request('/api/skills-marketplace/skills?limit=20');

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.skills).toBeDefined();
    expect(Array.isArray(data.skills)).toBe(true);
    expect(data.total).toBeGreaterThan(0);

    // Should only show published skills
    for (const skill of data.skills) {
      expect(skill).toHaveProperty('slug');
      expect(skill).toHaveProperty('name');
      expect(skill).toHaveProperty('description');
      expect(skill).toHaveProperty('author');
      expect(skill).toHaveProperty('categories');
      expect(skill).toHaveProperty('tags');
      expect(skill).toHaveProperty('installCount');
      expect(skill.isPublished).toBe(true);
    }

    // Should not include unpublished skills
    const draftSkill = data.skills.find((s: any) => s.slug === 'draft-skill');
    expect(draftSkill).toBeUndefined();
  });

  it('should sort by popular (default)', async () => {
    const res = await app.request('/api/skills-marketplace/skills?sortBy=popular');
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);

    // Should be sorted by install count descending
    for (let i = 0; i < data.skills.length - 1; i++) {
      expect(data.skills[i].installCount).toBeGreaterThanOrEqual(data.skills[i + 1].installCount);
    }
  });

  it('should sort by recent', async () => {
    const res = await app.request('/api/skills-marketplace/skills?sortBy=recent');
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);
  });

  it('should sort by downloads', async () => {
    const res = await app.request('/api/skills-marketplace/skills?sortBy=downloads');
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);

    // Should be sorted by install count descending
    for (let i = 0; i < data.skills.length - 1; i++) {
      expect(data.skills[i].installCount).toBeGreaterThanOrEqual(data.skills[i + 1].installCount);
    }
  });

  it('should sort by rating', async () => {
    const res = await app.request('/api/skills-marketplace/skills?sortBy=rating');
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);

    // Should be sorted by rating descending
    for (let i = 0; i < data.skills.length - 1; i++) {
      expect(data.skills[i].rating).toBeGreaterThanOrEqual(data.skills[i + 1].rating);
    }
  });

  it('should sort by name', async () => {
    const res = await app.request('/api/skills-marketplace/skills?sortBy=name');
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);

    // Should be sorted alphabetically
    for (let i = 0; i < data.skills.length - 1; i++) {
      expect(data.skills[i].name.localeCompare(data.skills[i + 1].name)).toBeLessThanOrEqual(0);
    }
  });

  it('should sort by updated', async () => {
    const res = await app.request('/api/skills-marketplace/skills?sortBy=updated');
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);
  });

  it('should search skills by name', async () => {
    const res = await app.request('/api/skills-marketplace/skills?search=ClickHouse');
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);

    // Should contain the search term
    const hasMatch = data.skills.some((skill: any) =>
      skill.name.toLowerCase().includes('clickhouse')
    );
    expect(hasMatch).toBe(true);
  });

  it('should search skills by description', async () => {
    const res = await app.request('/api/skills-marketplace/skills?search=database');
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);
  });

  it('should filter by category', async () => {
    // Get Data Analysis category ID
    const categoriesRes = await app.request('/api/skills-marketplace/categories');
    const categoriesData = await categoriesRes.json();
    const dataCategory = categoriesData.categories.find((c: any) => c.slug === 'data-analysis');

    const res = await app.request(`/api/skills-marketplace/skills?categoryIds=${dataCategory.id}`);
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);

    // All skills should have the data analysis category
    for (const skill of data.skills) {
      const hasCategory = skill.categories.some((c: any) => c.id === dataCategory.id);
      expect(hasCategory).toBe(true);
    }
  });

  it('should filter by tag', async () => {
    // Get Python tag ID (used for ClickHouse in our test data)
    const tagsRes = await app.request('/api/skills-marketplace/tags');
    const tagsData = await tagsRes.json();
    const pythonTag = tagsData.tags.find((t: any) => t.slug === 'python');

    const res = await app.request(`/api/skills-marketplace/skills?tagIds=${pythonTag.id}`);
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);

    // All skills should have the python tag
    for (const skill of data.skills) {
      const hasTag = skill.tags.some((t: any) => t.id === pythonTag.id);
      expect(hasTag).toBe(true);
    }
  });

  it('should filter featured skills', async () => {
    const res = await app.request('/api/skills-marketplace/skills?isFeatured=true');
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);

    // All should be featured
    for (const skill of data.skills) {
      expect(skill.isFeatured).toBe(true);
    }
  });

  it('should support pagination', async () => {
    const res1 = await app.request('/api/skills-marketplace/skills?limit=1&offset=0');
    const data1 = await res1.json();

    const res2 = await app.request('/api/skills-marketplace/skills?limit=1&offset=1');
    const data2 = await res2.json();

    expect(data1.skills.length).toBe(1);
    expect(data2.skills.length).toBeLessThanOrEqual(1);

    // Should be different skills
    if (data2.skills.length > 0) {
      expect(data1.skills[0].id).not.toBe(data2.skills[0].id);
    }
  });
});

describe('Skills Marketplace API - Get Skill by Slug', () => {
  it('should get skill by slug', async () => {
    const res = await app.request('/api/skills-marketplace/skills/clickhouse-expert');

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.skill).toBeDefined();
    expect(data.skill.slug).toBe('clickhouse-expert');
    expect(data.skill.name).toBe('ClickHouse Expert');
    expect(data.skill).toHaveProperty('versions');
    expect(Array.isArray(data.skill.versions)).toBe(true);

    // Check version structure
    if (data.skill.versions.length > 0) {
      const version = data.skill.versions[0];
      expect(version).toHaveProperty('version');
      expect(version).toHaveProperty('isLatest');
      expect(version).toHaveProperty('createdAt');
    }

    // Check skill content
    expect(data.skill).toHaveProperty('systemPromptFragment');
    expect(data.skill).toHaveProperty('workflowRules');
    expect(data.skill).toHaveProperty('documentation');
  });

  it('should return 404 for non-existent skill', async () => {
    const res = await app.request('/api/skills-marketplace/skills/non-existent-skill');

    expect(res.status).toBe(404);
  });

  it('should not return unpublished skills', async () => {
    const res = await app.request('/api/skills-marketplace/skills/draft-skill');

    // Draft skill is not published, should return 404
    expect(res.status).toBe(404);
  });
});

describe('Skills Marketplace API - Skill Enrichment', () => {
  it('should include author information', async () => {
    const res = await app.request('/api/skills-marketplace/skills?limit=1');
    const data = await res.json();

    expect(data.skills.length).toBeGreaterThan(0);

    const skill = data.skills[0];
    expect(skill.author).toBeDefined();
    expect(skill.author).toHaveProperty('id');
    expect(skill.author).toHaveProperty('name');
    expect(skill.author.name).not.toBe('Unknown');
  });

  it('should include categories as array (bug fix test)', async () => {
    const res = await app.request('/api/skills-marketplace/skills/clickhouse-expert');
    const data = await res.json();

    // This test covers the bug where frontend expected category: string
    // but API returns categories: SkillCategory[]
    expect(data.skill.categories).toBeDefined();
    expect(Array.isArray(data.skill.categories)).toBe(true);
    expect(data.skill.categories.length).toBeGreaterThan(0);

    // Verify category structure
    const category = data.skill.categories[0];
    expect(category).toHaveProperty('id');
    expect(category).toHaveProperty('name');
    expect(category).toHaveProperty('slug');
    expect(category).toHaveProperty('description');
    expect(typeof category.name).toBe('string');
    expect(category.name.length).toBeGreaterThan(0);

    // Ensure the old 'category' field doesn't exist (should be 'categories')
    expect(data.skill).not.toHaveProperty('category');
  });

  it('should include categories', async () => {
    const res = await app.request('/api/skills-marketplace/skills/clickhouse-expert');
    const data = await res.json();

    expect(data.skill.categories).toBeDefined();
    expect(Array.isArray(data.skill.categories)).toBe(true);
    expect(data.skill.categories.length).toBeGreaterThan(0);

    const category = data.skill.categories[0];
    expect(category).toHaveProperty('id');
    expect(category).toHaveProperty('name');
    expect(category).toHaveProperty('slug');
  });

  it('should include tags', async () => {
    const res = await app.request('/api/skills-marketplace/skills/clickhouse-expert');
    const data = await res.json();

    expect(data.skill.tags).toBeDefined();
    expect(Array.isArray(data.skill.tags)).toBe(true);
    expect(data.skill.tags.length).toBeGreaterThan(0);

    const tag = data.skill.tags[0];
    expect(tag).toHaveProperty('id');
    expect(tag).toHaveProperty('name');
    expect(tag).toHaveProperty('slug');
  });

  it('should include documentation', async () => {
    const res = await app.request('/api/skills-marketplace/skills/clickhouse-expert');
    const data = await res.json();

    expect(data.skill.documentation).toBeDefined();
    expect(Array.isArray(data.skill.documentation)).toBe(true);
    expect(data.skill.documentation.length).toBeGreaterThan(0);

    const doc = data.skill.documentation[0];
    expect(doc).toHaveProperty('type');
    expect(doc).toHaveProperty('title');
  });

  it('should handle skills without documentation', async () => {
    const res = await app.request('/api/skills-marketplace/skills/duckdb-expert');
    const data = await res.json();

    expect(data.skill.documentation).toBeDefined();
    expect(Array.isArray(data.skill.documentation)).toBe(true);
    // DuckDB skill has empty documentation array
    expect(data.skill.documentation.length).toBe(0);
  });
});

describe('Skills Marketplace API - Download/Install Tracking', () => {
  it('should track skill download', async () => {
    const res = await app.request('/api/skills-marketplace/skills/clickhouse-expert/download', {
      method: 'POST',
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message).toBe('Download tracked successfully');
    expect(data.skill).toBeDefined();
  });

  it('should track skill install with version', async () => {
    const res = await app.request('/api/skills-marketplace/skills/clickhouse-expert/install', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version: '1.0.0' }),
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message).toBe('Installation tracked successfully');
  });

  it('should return 400 if version is missing', async () => {
    const res = await app.request('/api/skills-marketplace/skills/clickhouse-expert/install', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent skill download', async () => {
    const res = await app.request('/api/skills-marketplace/skills/non-existent/download', {
      method: 'POST',
    });

    expect(res.status).toBe(404);
  });
});
