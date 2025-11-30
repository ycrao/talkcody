// Skills Marketplace browsing routes
import { Hono } from 'hono';
import { getOptionalAuth, optionalAuthMiddleware } from '../middlewares/auth';
import { skillsMarketplaceService } from '../services/skills-marketplace-service';

const skillsMarketplace = new Hono();

/**
 * List skills with filtering and sorting
 * GET /api/skills-marketplace/skills?limit=20&offset=0&sortBy=popular&search=xxxx&categoryIds=cat1,cat2&tagIds=tag1,tag2&isFeatured=true
 */
skillsMarketplace.get('/skills', optionalAuthMiddleware, async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const sortBy = (c.req.query('sortBy') || 'popular') as
      | 'popular'
      | 'recent'
      | 'downloads'
      | 'installs'
      | 'name'
      | 'rating'
      | 'updated';
    const search = c.req.query('search');
    const categoryIds = c.req.query('categoryIds')?.split(',').filter(Boolean);
    const tagIds = c.req.query('tagIds')?.split(',').filter(Boolean);
    const isFeatured = c.req.query('isFeatured') ? c.req.query('isFeatured') === 'true' : undefined;

    const result = await skillsMarketplaceService.listSkills({
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
    console.error('List skills error:', error);
    return c.json({ error: 'Failed to list skills' }, 500);
  }
});

/**
 * Get featured skills
 * GET /api/skills-marketplace/skills/featured?limit=10
 */
skillsMarketplace.get('/skills/featured', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10', 10);

    const result = await skillsMarketplaceService.getFeaturedSkills(limit);

    return c.json(result);
  } catch (error) {
    console.error('Get featured skills error:', error);
    return c.json({ error: 'Failed to get featured skills' }, 500);
  }
});

/**
 * Get skill by slug
 * GET /api/skills-marketplace/skills/:slug
 */
skillsMarketplace.get('/skills/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');

    const skill = await skillsMarketplaceService.getSkillBySlug(slug);

    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404);
    }

    return c.json({ skill });
  } catch (error) {
    console.error('Get skill error:', error);
    return c.json({ error: 'Failed to get skill' }, 500);
  }
});

/**
 * Download skill (track statistics)
 * POST /api/skills-marketplace/skills/:slug/download
 */
skillsMarketplace.post('/skills/:slug/download', optionalAuthMiddleware, async (c) => {
  try {
    const slug = c.req.param('slug');
    const auth = getOptionalAuth(c);

    // Get skill to get its ID
    const skill = await skillsMarketplaceService.getSkillBySlug(slug);

    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404);
    }

    // Track download
    await skillsMarketplaceService.trackDownload(skill.id, auth?.userId || null);

    return c.json({
      message: 'Download tracked successfully',
      skill,
    });
  } catch (error) {
    console.error('Track download error:', error);
    return c.json({ error: 'Failed to track download' }, 500);
  }
});

/**
 * Install skill (track installation)
 * POST /api/skills-marketplace/skills/:slug/install
 * Body: { version: "1.0.0" }
 */
skillsMarketplace.post('/skills/:slug/install', optionalAuthMiddleware, async (c) => {
  try {
    const slug = c.req.param('slug');
    const auth = getOptionalAuth(c);

    // Allow anonymous installs - auth is optional
    const body = await c.req.json();
    const version = body.version;

    if (!version) {
      return c.json({ error: 'Version is required' }, 400);
    }

    // Get skill to get its ID
    const skill = await skillsMarketplaceService.getSkillBySlug(slug);

    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404);
    }

    // Track install (userId can be null for anonymous users)
    await skillsMarketplaceService.trackInstall(skill.id, auth?.userId || null, version);

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
 * GET /api/skills-marketplace/categories
 */
skillsMarketplace.get('/categories', async (c) => {
  try {
    const categories = await skillsMarketplaceService.getAllCategories();

    return c.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    return c.json({ error: 'Failed to get categories' }, 500);
  }
});

/**
 * Get all tags
 * GET /api/skills-marketplace/tags
 */
skillsMarketplace.get('/tags', async (c) => {
  try {
    const tags = await skillsMarketplaceService.getAllTags();

    return c.json({ tags });
  } catch (error) {
    console.error('Get tags error:', error);
    return c.json({ error: 'Failed to get tags' }, 500);
  }
});

export default skillsMarketplace;
