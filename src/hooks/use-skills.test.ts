// Tests for useSkills hooks

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSkillService } from '@/services/skills';
import { useSkillsStore } from '@/stores/skills-store';
import type { ConversationSkill, Skill } from '@/types/skill';
import { useConversationSkills, useSkill, useSkillMutations, useSkills } from './use-skills';

// Mock dependencies
vi.mock('@/services/skills', () => ({
  getSkillService: vi.fn(),
}));

vi.mock('@/services/skills/file-based-skill-service', () => ({
  getFileBasedSkillService: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('useSkills', () => {
  const mockSkills: Skill[] = [
    {
      id: 'skill1',
      name: 'ClickHouse Expert',
      description: 'Expert in ClickHouse database',
      category: 'Database',
      content: {
        systemPromptFragment: 'You are a ClickHouse expert',
        workflowRules: 'Follow best practices',
        documentation: [],
      },
      metadata: {
        isBuiltIn: false,
        tags: ['database', 'clickhouse'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
    {
      id: 'skill2',
      name: 'StarRocks Expert',
      description: 'Expert in StarRocks database',
      category: 'Database',
      content: {
        systemPromptFragment: 'You are a StarRocks expert',
      },
      metadata: {
        isBuiltIn: true,
        tags: ['database', 'starrocks'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  ];

  const mockSkillService = {
    listSkills: vi.fn(),
    getSkill: vi.fn(),
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: vi.fn(),
    getConversationSkills: vi.fn(),
    enableSkillForConversation: vi.fn(),
    disableSkillForConversation: vi.fn(),
    toggleSkillForConversation: vi.fn(),
    setConversationSkills: vi.fn(),
  };

  const mockFileBasedSkillService = {
    listSkills: vi.fn(),
    getSkillById: vi.fn(),
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    (getSkillService as any).mockResolvedValue(mockSkillService);

    const { getFileBasedSkillService } = await import('@/services/skills/file-based-skill-service');
    (getFileBasedSkillService as any).mockResolvedValue(mockFileBasedSkillService);
    mockFileBasedSkillService.listSkills.mockResolvedValue([]);

    // Reset the store state before each test
    useSkillsStore.setState({
      skills: [],
      isLoading: false,
      error: null,
      isInitialized: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset the store state after each test
    useSkillsStore.setState({
      skills: [],
      isLoading: false,
      error: null,
      isInitialized: false,
    });
  });

  describe('useSkills', () => {
    it('should initialize with empty skills array and loading state', async () => {
      const { result } = renderHook(() => useSkills());

      expect(result.current.skills).toEqual([]);
      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();

      // Wait for the async initialization to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should load skills successfully', async () => {
      mockSkillService.listSkills.mockResolvedValue(mockSkills);

      const { result } = renderHook(() => useSkills());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.skills).toEqual(mockSkills);
      expect(result.current.error).toBeNull();
      // Now loads without filter parameters (local filtering)
      expect(mockSkillService.listSkills).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should apply category filter locally', async () => {
      mockSkillService.listSkills.mockResolvedValue(mockSkills);

      const { result } = renderHook(() => useSkills({ category: 'Database' }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should load all skills once without filter
      expect(mockSkillService.listSkills).toHaveBeenCalledWith(undefined, undefined);
      // Then filter locally - both skills have 'Database' category
      expect(result.current.skills).toEqual(mockSkills);
    });

    it('should apply search filter locally', async () => {
      mockSkillService.listSkills.mockResolvedValue(mockSkills);

      const { result } = renderHook(() => useSkills({ search: 'clickhouse' }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should filter locally based on name/description/tags
      expect(result.current.skills).toHaveLength(1);
      expect(result.current.skills[0].id).toBe('skill1');
    });

    it('should apply sorting locally', async () => {
      mockSkillService.listSkills.mockResolvedValue(mockSkills);

      const { result } = renderHook(() => useSkills(undefined, 'name'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should sort by name
      expect(result.current.skills[0].name).toBe('ClickHouse Expert');
      expect(result.current.skills[1].name).toBe('StarRocks Expert');
    });

    it('should apply search and category filter together', async () => {
      mockSkillService.listSkills.mockResolvedValue(mockSkills);

      const { result } = renderHook(() =>
        useSkills({ category: 'Database', search: 'starrocks' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should find StarRocks skill
      expect(result.current.skills).toHaveLength(1);
      expect(result.current.skills[0].id).toBe('skill2');
    });

    it('should return empty array when no skills match filter', async () => {
      mockSkillService.listSkills.mockResolvedValue(mockSkills);

      const { result } = renderHook(() => useSkills({ search: 'nonexistent' }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.skills).toHaveLength(0);
    });

    it('should handle load error', async () => {
      const error = new Error('Failed to load');
      mockSkillService.listSkills.mockRejectedValue(error);

      const { result } = renderHook(() => useSkills());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.skills).toEqual([]);
    });

    it('should refresh skills', async () => {
      mockSkillService.listSkills.mockResolvedValue(mockSkills);

      const { result } = renderHook(() => useSkills());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockSkillService.listSkills.mockClear();
      mockSkillService.listSkills.mockResolvedValue([...mockSkills, mockSkills[0]]);

      await act(async () => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(mockSkillService.listSkills).toHaveBeenCalled();
      });
    });

    it('should sort by updated date', async () => {
      const skillsWithDates: Skill[] = [
        {
          ...mockSkills[0],
          metadata: {
            ...mockSkills[0].metadata,
            updatedAt: Date.now() - 10000, // older
          },
        },
        {
          ...mockSkills[1],
          metadata: {
            ...mockSkills[1].metadata,
            updatedAt: Date.now(), // newer
          },
        },
      ];
      mockSkillService.listSkills.mockResolvedValue(skillsWithDates);

      const { result } = renderHook(() => useSkills(undefined, 'updated'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should sort by updated date descending (newest first)
      expect(result.current.skills[0].id).toBe('skill2');
      expect(result.current.skills[1].id).toBe('skill1');
    });

    it('should filter by tags', async () => {
      mockSkillService.listSkills.mockResolvedValue(mockSkills);

      const { result } = renderHook(() => useSkills({ tags: ['starrocks'] }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.skills).toHaveLength(1);
      expect(result.current.skills[0].id).toBe('skill2');
    });

    it('should filter by isBuiltIn', async () => {
      mockSkillService.listSkills.mockResolvedValue(mockSkills);

      const { result } = renderHook(() => useSkills({ isBuiltIn: true }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.skills).toHaveLength(1);
      expect(result.current.skills[0].id).toBe('skill2');
      expect(result.current.skills[0].metadata.isBuiltIn).toBe(true);
    });
  });

  describe('useSkill', () => {
    it('should load single skill successfully', async () => {
      mockSkillService.getSkill.mockResolvedValue(mockSkills[0]);

      const { result } = renderHook(() => useSkill('skill1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.skill).toEqual(mockSkills[0]);
      expect(result.current.error).toBeNull();
      expect(mockSkillService.getSkill).toHaveBeenCalledWith('skill1');
    });

    it('should handle null skillId', async () => {
      const { result } = renderHook(() => useSkill(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.skill).toBeNull();
      expect(mockSkillService.getSkill).not.toHaveBeenCalled();
    });

    it('should handle load error', async () => {
      const error = new Error('Skill not found');
      mockSkillService.getSkill.mockRejectedValue(error);

      const { result } = renderHook(() => useSkill('skill1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.skill).toBeNull();
    });
  });

  describe('useConversationSkills', () => {
    const mockConversationSkills: ConversationSkill[] = [
      {
        conversationId: 'conv1',
        skillId: 'skill1',
        enabled: true,
        priority: 0,
        activatedAt: Date.now(),
      },
    ];

    it('should load conversation skills successfully', async () => {
      mockSkillService.getConversationSkills.mockResolvedValue(mockConversationSkills);
      mockSkillService.getSkill.mockResolvedValue(mockSkills[0]);

      const { result } = renderHook(() => useConversationSkills('conv1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.conversationSkills).toEqual(mockConversationSkills);
      expect(result.current.skills).toEqual([mockSkills[0]]);
      expect(mockSkillService.getConversationSkills).toHaveBeenCalledWith('conv1');
    });

    it('should handle null conversationId', async () => {
      const { result } = renderHook(() => useConversationSkills(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.conversationSkills).toEqual([]);
      expect(result.current.skills).toEqual([]);
      expect(mockSkillService.getConversationSkills).not.toHaveBeenCalled();
    });

    it('should enable skill for conversation', async () => {
      mockSkillService.getConversationSkills.mockResolvedValue([]);
      mockSkillService.enableSkillForConversation.mockResolvedValue(undefined);

      const { result } = renderHook(() => useConversationSkills('conv1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.enableSkill('skill1', 1);
      });

      expect(mockSkillService.enableSkillForConversation).toHaveBeenCalledWith(
        'conv1',
        'skill1',
        1
      );
    });

    it('should disable skill for conversation', async () => {
      mockSkillService.getConversationSkills.mockResolvedValue(mockConversationSkills);
      mockSkillService.getSkill.mockResolvedValue(mockSkills[0]);
      mockSkillService.disableSkillForConversation.mockResolvedValue(undefined);

      const { result } = renderHook(() => useConversationSkills('conv1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.disableSkill('skill1');
      });

      expect(mockSkillService.disableSkillForConversation).toHaveBeenCalledWith('conv1', 'skill1');
    });

    it('should toggle skill for conversation', async () => {
      mockSkillService.getConversationSkills.mockResolvedValue([]);
      mockSkillService.toggleSkillForConversation.mockResolvedValue(true);

      const { result } = renderHook(() => useConversationSkills('conv1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let enabled: boolean = false;
      await act(async () => {
        enabled = (await result.current.toggleSkill('skill1')) || false;
      });

      expect(enabled).toBe(true);
      expect(mockSkillService.toggleSkillForConversation).toHaveBeenCalledWith('conv1', 'skill1');
    });

    it('should set conversation skills list', async () => {
      mockSkillService.getConversationSkills.mockResolvedValue([]);
      mockSkillService.setConversationSkills.mockResolvedValue(undefined);

      const { result } = renderHook(() => useConversationSkills('conv1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.setSkills(['skill1', 'skill2']);
      });

      expect(mockSkillService.setConversationSkills).toHaveBeenCalledWith('conv1', [
        'skill1',
        'skill2',
      ]);
    });
  });

  describe('useSkillMutations', () => {
    it('should create skill successfully', async () => {
      const newSkill = {
        name: 'New Skill',
        description: 'A new skill',
        category: 'General',
        content: {},
        metadata: {
          isBuiltIn: false,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      const mockFileBasedSkill = {
        id: 'skill3',
        name: 'New Skill',
        description: 'A new skill',
        localPath: '/path/to/skill',
        directoryName: 'skill3',
        frontmatter: {
          name: 'New Skill',
          description: 'A new skill',
          category: 'General',
        },
        content: '# New Skill',
        metadata: {
          tags: [],
          installedAt: '2025-01-01T00:00:00.000Z',
          lastUpdatedAt: '2025-01-01T00:00:00.000Z',
        },
        hasScripts: false,
      };

      mockFileBasedSkillService.createSkill.mockResolvedValue(mockFileBasedSkill);

      const { result } = renderHook(() => useSkillMutations());

      let createdSkill: any;
      await act(async () => {
        createdSkill = await result.current.createSkill(newSkill);
      });

      expect(mockFileBasedSkillService.createSkill).toHaveBeenCalled();
      expect(createdSkill).toHaveProperty('id', 'skill3');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle create error', async () => {
      const error = new Error('Create failed');
      mockFileBasedSkillService.createSkill.mockRejectedValue(error);

      const { result } = renderHook(() => useSkillMutations());

      await expect(async () => {
        await act(async () => {
          await result.current.createSkill({});
        });
      }).rejects.toThrow('Create failed');
    });

    it('should update skill successfully', async () => {
      const updates = { name: 'Updated Name' };

      const existingFileBasedSkill = {
        id: 'skill1',
        name: 'Original Skill',
        description: 'Original description',
        localPath: '/path/to/skill',
        directoryName: 'skill1',
        frontmatter: {
          name: 'Original Skill',
          description: 'Original description',
          category: 'General',
        },
        content: '# Original Skill',
        metadata: {
          tags: [],
          installedAt: '2025-01-01T00:00:00.000Z',
          lastUpdatedAt: '2025-01-01T00:00:00.000Z',
        },
        hasScripts: false,
      };

      mockFileBasedSkillService.getSkillById.mockResolvedValue(existingFileBasedSkill);
      mockFileBasedSkillService.updateSkill.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSkillMutations());

      let updatedSkill: any;
      await act(async () => {
        updatedSkill = await result.current.updateSkill('skill1', updates);
      });

      expect(mockFileBasedSkillService.getSkillById).toHaveBeenCalledWith('skill1');
      expect(mockFileBasedSkillService.updateSkill).toHaveBeenCalled();
      expect(updatedSkill.name).toBe('Updated Name');
      expect(result.current.loading).toBe(false);
    });

    it('should delete skill successfully', async () => {
      mockFileBasedSkillService.deleteSkill.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSkillMutations());

      await act(async () => {
        await result.current.deleteSkill('skill1');
      });

      expect(mockFileBasedSkillService.deleteSkill).toHaveBeenCalledWith('skill1');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle delete error', async () => {
      const error = new Error('Delete failed');
      mockFileBasedSkillService.deleteSkill.mockRejectedValue(error);

      const { result } = renderHook(() => useSkillMutations());

      await expect(async () => {
        await act(async () => {
          await result.current.deleteSkill('skill1');
        });
      }).rejects.toThrow('Delete failed');
    });
  });
});
