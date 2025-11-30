// src/services/skills/index.ts

import { SkillDatabaseService } from '../database/skill-database-service';
import { databaseService } from '../database-service';
import { SkillService } from './skill-service';

// Re-export types
export type {
  ConversationSkill,
  CreateSkillRequest,
  DocumentationItem,
  DocumentationType,
  MarketplaceSkill,
  Skill,
  SkillCategory,
  SkillContent,
  SkillFilter,
  SkillSortOption,
  SkillStats,
  SkillTag,
  UpdateSkillRequest,
} from '@/types/skill';

// Re-export service class
export { SkillService } from './skill-service';

/**
 * Get the SkillService singleton instance
 */
let skillServiceInstance: SkillService | null = null;

export async function getSkillService(): Promise<SkillService> {
  if (!skillServiceInstance) {
    // Ensure database is initialized
    const db = await databaseService.getDb();

    // Create database service
    const dbService = new SkillDatabaseService(db);

    // Create skill service
    skillServiceInstance = new SkillService(dbService);
  }

  return skillServiceInstance;
}

/**
 * Convenience function to get a skill by ID
 */
export async function getSkill(id: string) {
  const service = await getSkillService();
  return service.getSkill(id);
}

/**
 * Convenience function to list skills
 */
export async function listSkills(filter?: any, sort?: any) {
  const service = await getSkillService();
  return service.listSkills(filter, sort);
}

/**
 * Convenience function to get conversation skills
 */
export async function getConversationSkills(conversationId: string) {
  const service = await getSkillService();
  return service.getConversationSkills(conversationId);
}

/**
 * Convenience function to get active skills for a conversation
 */
export async function getActiveSkillsForConversation(conversationId: string) {
  const service = await getSkillService();
  return service.getActiveSkillsForConversation(conversationId);
}
