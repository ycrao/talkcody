// Agent management routes (CRUD operations)

import type { CreateAgentRequest, UpdateAgentRequest } from '@talkcody/shared';
import { Hono } from 'hono';
import { authMiddleware, getAuth } from '../middlewares/auth';
import { agentService } from '../services/agent-service';

const agents = new Hono();

/**
 * Create new agent (requires authentication)
 * POST /api/agents
 * Body: CreateAgentRequest
 */
agents.post('/', authMiddleware, async (c) => {
  try {
    const { userId } = getAuth(c);
    const data = await c.req.json<CreateAgentRequest>();

    // Validate required fields
    if (!data.name || !data.description || !data.model || !data.systemPrompt) {
      return c.json(
        { error: 'Missing required fields: name, description, model, systemPrompt' },
        400
      );
    }

    const agent = await agentService.createAgent(userId, data);

    return c.json({ agent }, 201);
  } catch (error) {
    console.error('Create agent error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create agent';
    return c.json({ error: message }, 500);
  }
});

/**
 * Update agent (requires authentication and ownership)
 * PATCH /api/agents/:agentId
 * Body: UpdateAgentRequest
 */
agents.patch('/:agentId', authMiddleware, async (c) => {
  try {
    const { userId } = getAuth(c);
    const agentId = c.req.param('agentId');
    const data = await c.req.json<UpdateAgentRequest>();

    const agent = await agentService.updateAgent(userId, agentId, data);

    return c.json({ agent });
  } catch (error) {
    console.error('Update agent error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update agent';

    if (message.includes('not found') || message.includes('unauthorized')) {
      return c.json({ error: message }, 404);
    }

    return c.json({ error: message }, 500);
  }
});

/**
 * Publish agent (make it public)
 * POST /api/agents/:agentId/publish
 */
agents.post('/:agentId/publish', authMiddleware, async (c) => {
  try {
    const { userId } = getAuth(c);
    const agentId = c.req.param('agentId');

    const agent = await agentService.publishAgent(userId, agentId);

    return c.json({ agent });
  } catch (error) {
    console.error('Publish agent error:', error);
    const message = error instanceof Error ? error.message : 'Failed to publish agent';

    if (message.includes('not found') || message.includes('unauthorized')) {
      return c.json({ error: message }, 404);
    }

    return c.json({ error: message }, 500);
  }
});

/**
 * Unpublish agent
 * POST /api/agents/:agentId/unpublish
 */
agents.post('/:agentId/unpublish', authMiddleware, async (c) => {
  try {
    const { userId } = getAuth(c);
    const agentId = c.req.param('agentId');

    const agent = await agentService.unpublishAgent(userId, agentId);

    return c.json({ agent });
  } catch (error) {
    console.error('Unpublish agent error:', error);
    const message = error instanceof Error ? error.message : 'Failed to unpublish agent';

    if (message.includes('not found') || message.includes('unauthorized')) {
      return c.json({ error: message }, 404);
    }

    return c.json({ error: message }, 500);
  }
});

/**
 * Delete agent (requires authentication and ownership)
 * DELETE /api/agents/:agentId
 */
agents.delete('/:agentId', authMiddleware, async (c) => {
  try {
    const { userId } = getAuth(c);
    const agentId = c.req.param('agentId');

    await agentService.deleteAgent(userId, agentId);

    return c.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Delete agent error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete agent';

    if (message.includes('not found') || message.includes('unauthorized')) {
      return c.json({ error: message }, 404);
    }

    return c.json({ error: message }, 500);
  }
});

/**
 * Create new version for agent
 * POST /api/agents/:agentId/versions
 * Body: { version, systemPrompt?, toolsConfig?, rules?, outputFormat?, dynamicPromptConfig?, changeLog }
 */
agents.post('/:agentId/versions', authMiddleware, async (c) => {
  try {
    const { userId } = getAuth(c);
    const agentId = c.req.param('agentId');
    const data = await c.req.json();

    // Validate required fields
    if (!data.version || !data.changeLog) {
      return c.json({ error: 'Missing required fields: version, changeLog' }, 400);
    }

    const version = await agentService.createVersion(userId, agentId, data);

    return c.json({ version }, 201);
  } catch (error) {
    console.error('Create version error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create version';

    if (message.includes('not found') || message.includes('unauthorized')) {
      return c.json({ error: message }, 404);
    }

    if (message.includes('already exists')) {
      return c.json({ error: message }, 409);
    }

    return c.json({ error: message }, 500);
  }
});

export default agents;
