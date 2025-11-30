// Marketplace browsing routes
import { Hono } from 'hono';
import { getOptionalAuth, optionalAuthMiddleware } from '../middlewares/auth';
import { marketplaceService } from '../services/marketplace-service';

const marketplace = new Hono();

/**
 * List agents with filtering and sorting
 * GET /api/marketplace/agents?limit=20&offset=0&sortBy=popular&search=coding&categoryIds=cat1,cat2&tagIds=tag1,tag2&isFeatured=true
 */
marketplace.get('/agents', optionalAuthMiddleware, async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const sortBy = (c.req.query('sortBy') || 'popular') as
      | 'popular'
      | 'recent'
      | 'installs'
      | 'name';
    const search = c.req.query('search');
    const categoryIds = c.req.query('categoryIds')?.split(',').filter(Boolean);
    const tagIds = c.req.query('tagIds')?.split(',').filter(Boolean);
    const isFeatured = c.req.query('isFeatured') ? c.req.query('isFeatured') === 'true' : undefined;

    const result = await marketplaceService.listAgents({
      limit,
      offset,
      sortBy,
      search,
      categoryIds,
      tagIds,
      isFeatured,
    });

    return c.json(result);
  } catch (error) {
    console.error('List agents error:', error);
    return c.json({ error: 'Failed to list agents' }, 500);
  }
});

/**
 * Get featured agents
 * GET /api/marketplace/agents/featured?limit=10
 */
marketplace.get('/agents/featured', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10', 10);

    const result = await marketplaceService.getFeaturedAgents(limit);

    return c.json(result);
  } catch (error) {
    console.error('Get featured agents error:', error);
    return c.json({ error: 'Failed to get featured agents' }, 500);
  }
});

/**
 * Get agent by slug
 * GET /api/marketplace/agents/:slug
 */
marketplace.get('/agents/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');

    const agent = await marketplaceService.getAgentBySlug(slug);

    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    return c.json({ agent });
  } catch (error) {
    console.error('Get agent error:', error);
    return c.json({ error: 'Failed to get agent' }, 500);
  }
});

/**
 * Download agent (track statistics)
 * POST /api/marketplace/agents/:slug/download
 */
marketplace.post('/agents/:slug/download', optionalAuthMiddleware, async (c) => {
  try {
    const slug = c.req.param('slug');
    const auth = getOptionalAuth(c);

    // Get agent to get its ID
    const agent = await marketplaceService.getAgentBySlug(slug);

    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    // Track download
    await marketplaceService.trackDownload(agent.id, auth?.userId || null);

    return c.json({
      message: 'Download tracked successfully',
      agent,
    });
  } catch (error) {
    console.error('Track download error:', error);
    return c.json({ error: 'Failed to track download' }, 500);
  }
});

/**
 * Install agent (track installation)
 * POST /api/marketplace/agents/:slug/install
 * Body: { version: "1.0.0" }
 */
marketplace.post('/agents/:slug/install', optionalAuthMiddleware, async (c) => {
  try {
    const slug = c.req.param('slug');
    const auth = getOptionalAuth(c);

    // Allow anonymous installs - auth is optional
    const body = await c.req.json();
    const version = body.version;

    if (!version) {
      return c.json({ error: 'Version is required' }, 400);
    }

    // Get agent to get its ID
    const agent = await marketplaceService.getAgentBySlug(slug);

    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    // Track install (userId can be null for anonymous users)
    await marketplaceService.trackInstall(agent.id, auth?.userId || null, version);

    return c.json({
      message: 'Installation tracked successfully',
    });
  } catch (error) {
    console.error('Track install error:', error);
    return c.json({ error: 'Failed to track installation' }, 500);
  }
});

/**
 * Get all categories
 * GET /api/marketplace/categories
 */
marketplace.get('/categories', async (c) => {
  try {
    const categories = await marketplaceService.getAllCategories();

    return c.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    return c.json({ error: 'Failed to get categories' }, 500);
  }
});

/**
 * Get all tags
 * GET /api/marketplace/tags
 */
marketplace.get('/tags', async (c) => {
  try {
    const tags = await marketplaceService.getAllTags();

    return c.json({ tags });
  } catch (error) {
    console.error('Get tags error:', error);
    return c.json({ error: 'Failed to get tags' }, 500);
  }
});

export default marketplace;
