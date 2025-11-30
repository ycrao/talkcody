// src/hooks/use-skills.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@/lib/logger';
import {
  type ConversationSkill,
  getSkillService,
  type Skill,
  type SkillFilter,
  type SkillSortOption,
} from '@/services/skills';
import { useSkillsStore } from '@/stores/skills-store';

/**
 * Apply local filters and sorting to skills
 */
function applyLocalFilters(skills: Skill[], filter?: SkillFilter, sort?: SkillSortOption): Skill[] {
  if (!skills || !Array.isArray(skills)) {
    return [];
  }
  let result = [...skills];

  // Apply category filter
  if (filter?.category) {
    result = result.filter((skill) => skill.category === filter.category);
  }

  // Apply tags filter
  if (filter?.tags && filter.tags.length > 0) {
    result = result.filter((skill) =>
      filter.tags?.some((tag) => skill.metadata.tags.includes(tag))
    );
  }

  // Apply search filter
  if (filter?.search) {
    const searchLower = filter.search.toLowerCase();
    result = result.filter(
      (skill) =>
        skill.name.toLowerCase().includes(searchLower) ||
        skill.description.toLowerCase().includes(searchLower) ||
        skill.category.toLowerCase().includes(searchLower) ||
        skill.metadata.tags.some((tag) => tag.toLowerCase().includes(searchLower))
    );
  }

  // Apply isBuiltIn filter
  if (filter?.isBuiltIn !== undefined) {
    result = result.filter((skill) => skill.metadata.isBuiltIn === filter.isBuiltIn);
  }

  // Apply sorting
  if (sort) {
    switch (sort) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'updated':
        result.sort((a, b) => b.metadata.updatedAt - a.metadata.updatedAt);
        break;
      case 'recent':
        result.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
        break;
      case 'downloads':
        result.sort((a, b) => (b.marketplace?.downloads || 0) - (a.marketplace?.downloads || 0));
        break;
      case 'rating':
        result.sort((a, b) => (b.marketplace?.rating || 0) - (a.marketplace?.rating || 0));
        break;
      default:
        break;
    }
  }

  return result;
}

/**
 * Hook for managing skills
 * Now uses global store to prevent duplicate loading
 * Applies local filtering and sorting for better performance
 */
export function useSkills(filter?: SkillFilter, sort?: SkillSortOption) {
  const { skills: allSkills, isLoading, error, loadSkills, refreshSkills } = useSkillsStore();

  useEffect(() => {
    // Load all skills without filter (only once)
    loadSkills();
  }, [loadSkills]);

  // Apply local filtering and sorting
  const filteredSkills = useMemo(() => {
    return applyLocalFilters(allSkills, filter, sort);
  }, [allSkills, filter, sort]);

  const refresh = useCallback(() => {
    refreshSkills();
  }, [refreshSkills]);

  return {
    skills: filteredSkills,
    loading: isLoading,
    error: error ? new Error(error) : null,
    refresh,
  };
}

/**
 * Hook for managing a single skill
 */
export function useSkill(skillId: string | null) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadSkill = useCallback(async () => {
    if (!skillId) {
      setSkill(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const service = await getSkillService();
      const result = await service.getSkill(skillId);
      setSkill(result);
    } catch (err) {
      logger.error('Failed to load skill:', err);
      setError(err instanceof Error ? err : new Error('Failed to load skill'));
    } finally {
      setLoading(false);
    }
  }, [skillId]);

  useEffect(() => {
    loadSkill();
  }, [loadSkill]);

  const refresh = useCallback(() => {
    loadSkill();
  }, [loadSkill]);

  return {
    skill,
    loading,
    error,
    refresh,
  };
}

/**
 * Hook for managing conversation skills
 */
export function useConversationSkills(conversationId: string | null) {
  const [conversationSkills, setConversationSkills] = useState<ConversationSkill[]>([]);
  const [skills, setActiveSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadConversationSkills = useCallback(async () => {
    if (!conversationId) {
      setConversationSkills([]);
      setActiveSkills([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const service = await getSkillService();

      // Load conversation-skill associations
      const cs = await service.getConversationSkills(conversationId);
      setConversationSkills(cs);

      // Load full skill data for active skills
      const activeSkillIds = cs.filter((c) => c.enabled).map((c) => c.skillId);
      const skillsData: Skill[] = [];
      for (const skillId of activeSkillIds) {
        const skill = await service.getSkill(skillId);
        if (skill) {
          skillsData.push(skill);
        }
      }
      setActiveSkills(skillsData);
    } catch (err) {
      logger.error('Failed to load conversation skills:', err);
      setError(err instanceof Error ? err : new Error('Failed to load conversation skills'));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    loadConversationSkills();
  }, [loadConversationSkills]);

  const enableSkill = useCallback(
    async (skillId: string, priority?: number) => {
      if (!conversationId) return;

      try {
        const service = await getSkillService();
        await service.enableSkillForConversation(conversationId, skillId, priority);
        await loadConversationSkills();
      } catch (err) {
        logger.error('Failed to enable skill:', err);
        throw err;
      }
    },
    [conversationId, loadConversationSkills]
  );

  const disableSkill = useCallback(
    async (skillId: string) => {
      if (!conversationId) return;

      try {
        const service = await getSkillService();
        await service.disableSkillForConversation(conversationId, skillId);
        await loadConversationSkills();
      } catch (err) {
        logger.error('Failed to disable skill:', err);
        throw err;
      }
    },
    [conversationId, loadConversationSkills]
  );

  const toggleSkill = useCallback(
    async (skillId: string) => {
      if (!conversationId) return false;

      try {
        const service = await getSkillService();
        const enabled = await service.toggleSkillForConversation(conversationId, skillId);
        await loadConversationSkills();
        return enabled;
      } catch (err) {
        logger.error('Failed to toggle skill:', err);
        throw err;
      }
    },
    [conversationId, loadConversationSkills]
  );

  const setConversationSkillsList = useCallback(
    async (skillIds: string[]) => {
      if (!conversationId) return;

      try {
        const service = await getSkillService();
        await service.setConversationSkills(conversationId, skillIds);
        await loadConversationSkills();
      } catch (err) {
        logger.error('Failed to set conversation skills:', err);
        throw err;
      }
    },
    [conversationId, loadConversationSkills]
  );

  const refresh = useCallback(() => {
    loadConversationSkills();
  }, [loadConversationSkills]);

  return {
    conversationSkills,
    skills,
    loading,
    error,
    enableSkill,
    disableSkill,
    toggleSkill,
    setSkills: setConversationSkillsList,
    refresh,
  };
}

/**
 * Hook for CRUD operations on skills
 */
export function useSkillMutations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createSkill = useCallback(async (data: any) => {
    try {
      setLoading(true);
      setError(null);

      // Use FileBasedSkillService to create file-based skills
      const { getFileBasedSkillService } = await import(
        '@/services/skills/file-based-skill-service'
      );
      const fileService = await getFileBasedSkillService();

      const fileSkill = await fileService.createSkill({
        name: data.name,
        description: data.description,
        category: data.category,
        tags: data.metadata?.tags || data.tags || [],
        content: data.content,
      });

      logger.info(`Created skill: ${data.name} (${fileSkill.id})`);

      // Convert FileBasedSkill to Skill format for return
      const skill = {
        id: fileSkill.id,
        name: fileSkill.name,
        description: fileSkill.description,
        category: fileSkill.frontmatter.category || 'other',
        metadata: {
          tags: fileSkill.metadata.tags,
          isBuiltIn: false,
          sourceType: 'local' as const,
          createdAt: fileSkill.metadata.installedAt,
          updatedAt: fileSkill.metadata.lastUpdatedAt,
        },
      };

      return skill;
    } catch (err) {
      logger.error('Failed to create skill:', err);
      const error = err instanceof Error ? err : new Error('Failed to create skill');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSkill = useCallback(async (id: string, data: any) => {
    try {
      setLoading(true);
      setError(null);

      // Use FileBasedSkillService to update file-based skills
      const { getFileBasedSkillService } = await import(
        '@/services/skills/file-based-skill-service'
      );
      const fileService = await getFileBasedSkillService();

      // Get the existing skill
      const existingSkill = await fileService.getSkillById(id);
      if (!existingSkill) {
        throw new Error(`Skill with ID ${id} not found`);
      }

      const updatedName = data.name ?? existingSkill.name;
      const updatedDescription = data.description ?? existingSkill.description;
      const updatedCategory = data.category ?? existingSkill.frontmatter.category;

      // If content is provided, regenerate SKILL.md content
      let updatedContent = existingSkill.content;
      if (data.content) {
        const { SkillMdParser } = await import('@/services/skills/skill-md-parser');
        const fullContent = SkillMdParser.createSkillMdFromContent(
          updatedName,
          updatedDescription,
          data.content,
          updatedCategory
        );
        // Parse the generated content to extract just the markdown part
        const parsed = SkillMdParser.parse(fullContent);
        updatedContent = parsed.content;
      }

      // Update the skill object
      const updatedSkill = {
        ...existingSkill,
        name: updatedName,
        description: updatedDescription,
        content: updatedContent,
        frontmatter: {
          ...existingSkill.frontmatter,
          name: updatedName,
          description: updatedDescription,
          category: updatedCategory,
        },
        metadata: {
          ...existingSkill.metadata,
          tags: data.metadata?.tags ?? data.tags ?? existingSkill.metadata.tags,
        },
      };

      // Save the updated skill
      await fileService.updateSkill(updatedSkill);

      logger.info(`Updated skill: ${updatedSkill.name} (${id})`);

      // Convert FileBasedSkill to Skill format for return
      const skill = {
        id: updatedSkill.id,
        name: updatedSkill.name,
        description: updatedSkill.description,
        category: updatedSkill.frontmatter.category || 'other',
        metadata: {
          tags: updatedSkill.metadata.tags,
          isBuiltIn: false,
          sourceType: 'local' as const,
          createdAt: updatedSkill.metadata.installedAt,
          updatedAt: updatedSkill.metadata.lastUpdatedAt,
        },
      };

      return skill;
    } catch (err) {
      logger.error('Failed to update skill:', err);
      const error = err instanceof Error ? err : new Error('Failed to update skill');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteSkill = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);

      // Use FileBasedSkillService to delete file-based skills
      const { getFileBasedSkillService } = await import(
        '@/services/skills/file-based-skill-service'
      );
      const fileService = await getFileBasedSkillService();

      // Get the skill to find its directory name
      const skill = await fileService.getSkillById(id);
      if (!skill) {
        throw new Error(`Skill with ID ${id} not found`);
      }

      // Delete the skill using its directory name
      await fileService.deleteSkill(skill.directoryName);
      logger.info(`Deleted skill: ${skill.name} (${id})`);
    } catch (err) {
      logger.error('Failed to delete skill:', err);
      const error = err instanceof Error ? err : new Error('Failed to delete skill');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const forkSkill = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const { forkSkill } = await import('@/services/skills/fork-skill');
      const { SkillDatabaseService } = await import('@/services/database/skill-database-service');
      const { databaseService } = await import('@/services/database-service');
      const db = await databaseService.getDb();
      const dbService = new SkillDatabaseService(db);
      const newSkillId = await forkSkill(id, dbService);
      if (!newSkillId) {
        throw new Error('Failed to fork skill');
      }
      return newSkillId;
    } catch (err) {
      logger.error('Failed to fork skill:', err);
      const error = err instanceof Error ? err : new Error('Failed to fork skill');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    createSkill,
    updateSkill,
    deleteSkill,
    forkSkill,
    loading,
    error,
  };
}
