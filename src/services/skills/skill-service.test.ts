// Test for SkillService - specifically for file-based skill deletion
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillService } from './skill-service';
import type { SkillDatabaseService } from '../database/skill-database-service';
import type { Skill } from '@/types/skill';

// Mock the file-based skill service
vi.mock('./file-based-skill-service', () => ({
  getFileBasedSkillService: vi.fn(),
}));

describe('SkillService - Delete Operations', () => {
  let skillService: SkillService;
  let mockDbService: SkillDatabaseService;
  let mockFileService: any;

  beforeEach(() => {
    // Create mock database service
    mockDbService = {
      getSkill: vi.fn(),
      deleteSkill: vi.fn(),
    } as any;

    // Create mock file-based service
    mockFileService = {
      getSkillById: vi.fn(),
      deleteSkill: vi.fn(),
    };

    // Create skill service
    skillService = new SkillService(mockDbService);
  });

  describe('deleteSkill', () => {
    it('should delete a database skill', async () => {
      const mockSkill: Skill = {
        id: 'db-skill-1',
        name: 'Database Skill',
        description: 'A skill stored in database',
        category: 'general',
        content: {},
        metadata: {
          isBuiltIn: false,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      mockDbService.getSkill = vi.fn().mockResolvedValue(mockSkill);
      mockDbService.deleteSkill = vi.fn().mockResolvedValue(undefined);

      await skillService.deleteSkill('db-skill-1');

      expect(mockDbService.getSkill).toHaveBeenCalledWith('db-skill-1');
      expect(mockDbService.deleteSkill).toHaveBeenCalledWith('db-skill-1');
    });

    it('should delete a file-based skill when not found in database', async () => {
      const mockFileSkill = {
        id: 'file-skill-1',
        name: 'File Skill',
        description: 'A file-based skill',
        directoryName: 'check-chinese-local-001',
        localPath: '/path/to/skills/check-chinese-local-001',
      };

      // Not in database
      mockDbService.getSkill = vi.fn().mockResolvedValue(null);

      // Setup file service mock
      const { getFileBasedSkillService } = await import('./file-based-skill-service');
      vi.mocked(getFileBasedSkillService).mockResolvedValue(mockFileService);
      mockFileService.getSkillById.mockResolvedValue(mockFileSkill);
      mockFileService.deleteSkill.mockResolvedValue(undefined);

      await skillService.deleteSkill('file-skill-1');

      expect(mockDbService.getSkill).toHaveBeenCalledWith('file-skill-1');
      expect(mockFileService.getSkillById).toHaveBeenCalledWith('file-skill-1');
      expect(mockFileService.deleteSkill).toHaveBeenCalledWith('check-chinese-local-001');
    });

    it('should throw error when skill not found in database or file system', async () => {
      // Not in database
      mockDbService.getSkill = vi.fn().mockResolvedValue(null);

      // Not in file system
      const { getFileBasedSkillService } = await import('./file-based-skill-service');
      vi.mocked(getFileBasedSkillService).mockResolvedValue(mockFileService);
      mockFileService.getSkillById.mockResolvedValue(null);

      await expect(skillService.deleteSkill('non-existent-skill')).rejects.toThrow(
        'Skill non-existent-skill not found in database or file system'
      );

      expect(mockDbService.getSkill).toHaveBeenCalledWith('non-existent-skill');
      expect(mockFileService.getSkillById).toHaveBeenCalledWith('non-existent-skill');
    });

    it('should handle database delete errors', async () => {
      const mockSkill: Skill = {
        id: 'db-skill-1',
        name: 'Database Skill',
        description: 'A skill stored in database',
        category: 'general',
        content: {},
        metadata: {
          isBuiltIn: false,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      const error = new Error('Database deletion failed');
      mockDbService.getSkill = vi.fn().mockResolvedValue(mockSkill);
      mockDbService.deleteSkill = vi.fn().mockRejectedValue(error);

      await expect(skillService.deleteSkill('db-skill-1')).rejects.toThrow(
        'Database deletion failed'
      );
    });

    it('should handle file system delete errors', async () => {
      const mockFileSkill = {
        id: 'file-skill-1',
        name: 'File Skill',
        description: 'A file-based skill',
        directoryName: 'test-skill',
        localPath: '/path/to/skills/test-skill',
      };

      const error = new Error('File deletion failed');
      mockDbService.getSkill = vi.fn().mockResolvedValue(null);

      const { getFileBasedSkillService } = await import('./file-based-skill-service');
      vi.mocked(getFileBasedSkillService).mockResolvedValue(mockFileService);
      mockFileService.getSkillById.mockResolvedValue(mockFileSkill);
      mockFileService.deleteSkill.mockRejectedValue(error);

      await expect(skillService.deleteSkill('file-skill-1')).rejects.toThrow(
        'File deletion failed'
      );
    });
  });
});
