// useSkills hook mutations tests

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as skillDatabaseServiceModule from '@/services/database/skill-database-service';
import * as databaseServiceModule from '@/services/database-service';
import * as forkSkillModule from '@/services/skills/fork-skill';
import { useSkillMutations } from './use-skills';

// Mock the file-based skills service
vi.mock('@/services/skills/file-based-skill-service', () => ({
  getFileBasedSkillService: vi.fn(),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock database service
vi.mock('@/services/database-service', () => ({
  databaseService: {
    getDb: vi.fn(),
  },
}));

// Mock skill database service
vi.mock('@/services/database/skill-database-service', () => ({
  SkillDatabaseService: vi.fn(),
}));

// Mock fork skill service
vi.mock('@/services/skills/fork-skill', () => ({
  forkSkill: vi.fn(),
}));

describe('useSkillMutations', () => {
  let mockFileBasedSkillService: any;
  let getFileBasedSkillServiceMock: any;

  beforeEach(async () => {
    mockFileBasedSkillService = {
      createSkill: vi.fn(),
      updateSkill: vi.fn(),
      deleteSkill: vi.fn(),
      getSkillById: vi.fn(),
      listSkills: vi.fn(),
    };

    const fileBasedSkillServiceModule = await import('@/services/skills/file-based-skill-service');
    getFileBasedSkillServiceMock = vi.mocked(fileBasedSkillServiceModule.getFileBasedSkillService);
    getFileBasedSkillServiceMock.mockResolvedValue(mockFileBasedSkillService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createSkill', () => {
    it('should create a skill successfully', async () => {
      const mockFileBasedSkill = {
        id: 'new-skill-1',
        name: 'New Skill',
        description: 'A new skill',
        localPath: '/path/to/skill',
        directoryName: 'new-skill-1',
        frontmatter: {
          name: 'New Skill',
          description: 'A new skill',
          category: 'Development',
        },
        content: '# New Skill\n\nA new skill',
        metadata: {
          tags: [],
          installedAt: '2025-01-01T00:00:00.000Z',
          lastUpdatedAt: '2025-01-01T00:00:00.000Z',
        },
        hasScripts: false,
      };

      mockFileBasedSkillService.createSkill.mockResolvedValue(mockFileBasedSkill);

      const { result } = renderHook(() => useSkillMutations());

      const skillData = {
        name: 'New Skill',
        description: 'A new skill',
        category: 'Development',
        content: {},
        tags: [],
      };

      let createdSkill;
      await waitFor(async () => {
        createdSkill = await result.current.createSkill(skillData);
      });

      expect(mockFileBasedSkillService.createSkill).toHaveBeenCalledWith({
        name: 'New Skill',
        description: 'A new skill',
        category: 'Development',
        tags: [],
        content: {},
      });
      expect(createdSkill).toEqual({
        id: 'new-skill-1',
        name: 'New Skill',
        description: 'A new skill',
        category: 'Development',
        metadata: {
          tags: [],
          isBuiltIn: false,
          sourceType: 'local',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle skill creation with null category (marketplace skill install)', async () => {
      // This tests the bug fix where marketplace skills might not have a category
      const mockFileBasedSkill = {
        id: 'marketplace-skill-1',
        name: 'Marketplace Skill',
        description: 'A skill from marketplace',
        localPath: '/path/to/skill',
        directoryName: 'marketplace-skill-1',
        frontmatter: {
          name: 'Marketplace Skill',
          description: 'A skill from marketplace',
          category: 'other', // Default category
        },
        content: '# Marketplace Skill\n\nA skill from marketplace',
        metadata: {
          tags: [],
          installedAt: '2025-01-01T00:00:00.000Z',
          lastUpdatedAt: '2025-01-01T00:00:00.000Z',
        },
        hasScripts: false,
      };

      mockFileBasedSkillService.createSkill.mockResolvedValue(mockFileBasedSkill);

      const { result } = renderHook(() => useSkillMutations());

      // Simulate marketplace skill data with missing category
      const skillData = {
        name: 'Marketplace Skill',
        description: 'A skill from marketplace',
        category: null, // This should be handled gracefully
        content: {},
        tags: [],
      };

      let createdSkill;
      await waitFor(async () => {
        createdSkill = await result.current.createSkill(skillData);
      });

      expect(mockFileBasedSkillService.createSkill).toHaveBeenCalled();
      expect(createdSkill).toEqual({
        id: 'marketplace-skill-1',
        name: 'Marketplace Skill',
        description: 'A skill from marketplace',
        category: 'other',
        metadata: {
          tags: [],
          isBuiltIn: false,
          sourceType: 'local',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle create skill errors', async () => {
      const error = new Error('Failed to create skill');
      mockFileBasedSkillService.createSkill.mockRejectedValue(error);

      const { result } = renderHook(() => useSkillMutations());

      try {
        await result.current.createSkill({ name: 'Test' } as any);
        expect(true).toBe(false); // Should not reach here
      } catch (err) {
        expect(err).toBe(error);
      }

      await waitFor(() => {
        expect(result.current.error).toBe(error);
        expect(result.current.loading).toBe(false);
      });
    });

    it('should set loading state during creation', async () => {
      const mockFileBasedSkill = {
        id: 'test-skill',
        name: 'Test',
        description: 'Test skill',
        localPath: '/path/to/skill',
        directoryName: 'test-skill',
        frontmatter: {
          name: 'Test',
          description: 'Test skill',
          category: 'other',
        },
        content: '# Test',
        metadata: {
          tags: [],
          installedAt: '2025-01-01T00:00:00.000Z',
          lastUpdatedAt: '2025-01-01T00:00:00.000Z',
        },
        hasScripts: false,
      };

      mockFileBasedSkillService.createSkill.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockFileBasedSkill), 100))
      );

      const { result } = renderHook(() => useSkillMutations());

      const createPromise = result.current.createSkill({ name: 'Test' } as any);

      // Should be loading - wait for state update
      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });

      await createPromise;

      // Should not be loading after completion
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('updateSkill', () => {
    it('should update a skill successfully', async () => {
      const existingFileBasedSkill = {
        id: 'skill-1',
        name: 'Original Skill',
        description: 'Original description',
        localPath: '/path/to/skill',
        directoryName: 'skill-1',
        frontmatter: {
          name: 'Original Skill',
          description: 'Original description',
          category: 'Development',
        },
        content: '# Original Skill',
        metadata: {
          tags: [],
          installedAt: '2025-01-01T00:00:00.000Z',
          lastUpdatedAt: '2025-01-01T00:00:00.000Z',
        },
        hasScripts: false,
      };

      const updatedFileBasedSkill = {
        ...existingFileBasedSkill,
        name: 'Updated Skill',
        description: 'Updated description',
        frontmatter: {
          ...existingFileBasedSkill.frontmatter,
          name: 'Updated Skill',
          description: 'Updated description',
        },
      };

      mockFileBasedSkillService.getSkillById.mockResolvedValue(existingFileBasedSkill);
      mockFileBasedSkillService.updateSkill.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSkillMutations());

      const updates = {
        name: 'Updated Skill',
        description: 'Updated description',
      };

      let updatedSkill;
      await waitFor(async () => {
        updatedSkill = await result.current.updateSkill('skill-1', updates);
      });

      expect(mockFileBasedSkillService.getSkillById).toHaveBeenCalledWith('skill-1');
      expect(mockFileBasedSkillService.updateSkill).toHaveBeenCalled();
      expect(updatedSkill).toEqual({
        id: 'skill-1',
        name: 'Updated Skill',
        description: 'Updated description',
        category: 'Development',
        metadata: {
          tags: [],
          isBuiltIn: false,
          sourceType: 'local',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      });
      expect(result.current.error).toBeNull();
    });

    it('should handle update skill errors', async () => {
      const error = new Error('Skill not found');
      mockFileBasedSkillService.getSkillById.mockResolvedValue(null);

      const { result } = renderHook(() => useSkillMutations());

      try {
        await result.current.updateSkill('non-existent', {});
        expect(true).toBe(false);
      } catch (err) {
        expect((err as Error).message).toContain('not found');
      }

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
    });
  });

  describe('deleteSkill', () => {
    it('should delete a skill successfully', async () => {
      const mockSkill = {
        id: 'skill-1',
        name: 'Test Skill',
        description: 'Test',
        localPath: '/path/to/skill',
        directoryName: 'test-skill',
        frontmatter: {
          name: 'Test Skill',
          description: 'Test',
          category: 'other',
        },
        content: '# Test',
        metadata: {
          tags: [],
          installedAt: '2025-01-01T00:00:00.000Z',
          lastUpdatedAt: '2025-01-01T00:00:00.000Z',
        },
        hasScripts: false,
      };

      mockFileBasedSkillService.getSkillById.mockResolvedValue(mockSkill);
      mockFileBasedSkillService.deleteSkill.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSkillMutations());

      await waitFor(async () => {
        await result.current.deleteSkill('skill-1');
      });

      expect(mockFileBasedSkillService.getSkillById).toHaveBeenCalledWith('skill-1');
      expect(mockFileBasedSkillService.deleteSkill).toHaveBeenCalledWith('test-skill');
      expect(result.current.error).toBeNull();
    });

    it('should handle delete skill errors', async () => {
      const mockSkill = {
        id: 'system-skill',
        name: 'System Skill',
        description: 'Test',
        localPath: '/path/to/skill',
        directoryName: 'system-skill',
        frontmatter: {
          name: 'System Skill',
          description: 'Test',
          category: 'other',
        },
        content: '# System Skill',
        metadata: {
          tags: [],
          installedAt: '2025-01-01T00:00:00.000Z',
          lastUpdatedAt: '2025-01-01T00:00:00.000Z',
        },
        hasScripts: false,
      };

      const error = new Error('Cannot delete system skill');
      mockFileBasedSkillService.getSkillById.mockResolvedValue(mockSkill);
      mockFileBasedSkillService.deleteSkill.mockRejectedValue(error);

      const { result } = renderHook(() => useSkillMutations());

      try {
        await result.current.deleteSkill('system-skill');
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBe(error);
      }

      await waitFor(() => {
        expect(result.current.error).toBe(error);
      });
    });
  });

  describe('forkSkill', () => {
    it('should fork a skill successfully', async () => {
      const mockDb = {};
      const mockDbService = {};

      vi.mocked(databaseServiceModule.databaseService.getDb).mockResolvedValue(mockDb as any);
      vi.mocked(skillDatabaseServiceModule.SkillDatabaseService).mockImplementation(
        () => mockDbService as any
      );
      vi.mocked(forkSkillModule.forkSkill).mockResolvedValue('forked-skill-id');

      const { result } = renderHook(() => useSkillMutations());

      const forkedSkillId = await result.current.forkSkill('source-skill-1');

      expect(forkedSkillId).toBe('forked-skill-id');
      expect(result.current.error).toBeNull();
      expect(databaseServiceModule.databaseService.getDb).toHaveBeenCalled();
      expect(forkSkillModule.forkSkill).toHaveBeenCalledWith('source-skill-1', mockDbService);
    });

    it('should handle fork skill errors', async () => {
      const mockDb = {};
      const mockDbService = {};

      vi.mocked(databaseServiceModule.databaseService.getDb).mockResolvedValue(mockDb as any);
      vi.mocked(skillDatabaseServiceModule.SkillDatabaseService).mockImplementation(
        () => mockDbService as any
      );
      vi.mocked(forkSkillModule.forkSkill).mockResolvedValue(null);

      const { result } = renderHook(() => useSkillMutations());

      try {
        await result.current.forkSkill('non-existent-skill');
        expect(true).toBe(false);
      } catch (err) {
        expect((err as Error).message).toContain('Failed to fork skill');
      }

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
    });
  });

  describe('loading and error states', () => {
    it('should reset error when starting new mutation', async () => {
      const error = new Error('Previous error');
      const mockFileBasedSkill = {
        id: 'success',
        name: 'Test 2',
        description: 'Test skill',
        localPath: '/path/to/skill',
        directoryName: 'success',
        frontmatter: {
          name: 'Test 2',
          description: 'Test skill',
          category: 'other',
        },
        content: '# Test 2',
        metadata: {
          tags: [],
          installedAt: '2025-01-01T00:00:00.000Z',
          lastUpdatedAt: '2025-01-01T00:00:00.000Z',
        },
        hasScripts: false,
      };

      mockFileBasedSkillService.createSkill.mockRejectedValueOnce(error);
      mockFileBasedSkillService.createSkill.mockResolvedValueOnce(mockFileBasedSkill);

      const { result } = renderHook(() => useSkillMutations());

      // First call fails
      try {
        await result.current.createSkill({ name: 'Test' } as any);
      } catch (_err) {
        // Expected
      }

      await waitFor(() => {
        expect(result.current.error).toBe(error);
      });

      // Second call succeeds
      await waitFor(async () => {
        await result.current.createSkill({ name: 'Test 2' } as any);
      });

      // Error should be reset
      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });

    it('should not be loading initially', () => {
      const { result } = renderHook(() => useSkillMutations());

      expect(result.current.loading).toBe(false);
    });

    it('should have no error initially', () => {
      const { result } = renderHook(() => useSkillMutations());

      expect(result.current.error).toBeNull();
    });
  });

  describe('concurrent mutations', () => {
    it('should handle multiple sequential mutations correctly', async () => {
      const mockSkill1 = {
        id: 'skill-Skill1',
        name: 'Skill1',
        description: '',
        localPath: '/path/to/Skill1',
        directoryName: 'skill-Skill1',
        frontmatter: {
          name: 'Skill1',
          description: '',
          category: 'other',
        },
        content: '# Skill1',
        metadata: {
          tags: [],
          installedAt: '2025-01-01T00:00:00.000Z',
          lastUpdatedAt: '2025-01-01T00:00:00.000Z',
        },
        hasScripts: false,
      };

      const mockSkill2 = {
        id: 'skill-Skill2',
        name: 'Skill2',
        description: '',
        localPath: '/path/to/Skill2',
        directoryName: 'skill-Skill2',
        frontmatter: {
          name: 'Skill2',
          description: '',
          category: 'other',
        },
        content: '# Skill2',
        metadata: {
          tags: [],
          installedAt: '2025-01-01T00:00:00.000Z',
          lastUpdatedAt: '2025-01-01T00:00:00.000Z',
        },
        hasScripts: false,
      };

      mockFileBasedSkillService.createSkill
        .mockResolvedValueOnce(mockSkill1)
        .mockResolvedValueOnce(mockSkill2);

      const { result } = renderHook(() => useSkillMutations());

      // Test multiple sequential calls work correctly
      const skill1 = await result.current.createSkill({ name: 'Skill1' } as any);
      expect(skill1.id).toBe('skill-Skill1');

      const skill2 = await result.current.createSkill({ name: 'Skill2' } as any);
      expect(skill2.id).toBe('skill-Skill2');
    });
  });
});
