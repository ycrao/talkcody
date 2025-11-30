/**
 * File-Based Skill Service
 *
 * Manages skills stored as files in the filesystem, compatible with Claude Code format.
 * Skills are stored in ~/.talkcody/skills/ directory structure.
 */

import { appDataDir, join } from '@tauri-apps/api/path';
import {
  exists,
  mkdir,
  readDir,
  readFile,
  readTextFile,
  remove,
  writeFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
import type {
  CreateSkillRequest,
  FileBasedSkill,
  SkillDirectoryScan,
  TalkCodySkillMetadata,
} from '@/types/file-based-skill';
import { activeSkillsConfigService } from '../active-skills-config-service';
import { SkillMdParser } from './skill-md-parser';

/**
 * FileBasedSkillService
 *
 * Handles CRUD operations for file-system based skills
 */
export class FileBasedSkillService {
  private skillsDir: string | null = null;

  /**
   * Initialize the service and ensure skills directory exists
   */
  async initialize(): Promise<void> {
    const appData = await appDataDir();
    this.skillsDir = await join(appData, 'skills');

    // Ensure directory exists
    if (!(await exists(this.skillsDir))) {
      await mkdir(this.skillsDir, { recursive: true });
      logger.info(`Created skills directory: ${this.skillsDir}`);
    }

    // Initialize built-in system skills
    await this.deployBuiltInSkills();
  }

  /**
   * Get the skills directory path
   */
  private async getSkillsDir(): Promise<string> {
    if (!this.skillsDir) {
      await this.initialize();
    }
    if (!this.skillsDir) {
      throw new Error('Skills directory not initialized');
    }
    return this.skillsDir;
  }

  /**
   * Get the skills directory path (public)
   */
  async getSkillsDirPath(): Promise<string> {
    return await this.getSkillsDir();
  }

  /**
   * List all skills in the skills directory
   */
  async listSkills(): Promise<FileBasedSkill[]> {
    const skillsDir = await this.getSkillsDir();
    const entries = await readDir(skillsDir);

    const skills: FileBasedSkill[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory) {
        continue;
      }

      try {
        const skill = await this.loadSkill(entry.name);
        if (skill) {
          skills.push(skill);
        }
      } catch (error) {
        logger.warn(`Failed to load skill from directory ${entry.name}:`, error);
      }
    }

    return skills;
  }

  /**
   * Load a single skill by directory name
   */
  async loadSkill(directoryName: string): Promise<FileBasedSkill | null> {
    const skillsDir = await this.getSkillsDir();
    const skillPath = await join(skillsDir, directoryName);

    // Check if directory exists
    if (!(await exists(skillPath))) {
      return null;
    }

    // Read SKILL.md
    const skillMdPath = await join(skillPath, 'SKILL.md');
    if (!(await exists(skillMdPath))) {
      logger.warn(`Skill directory ${directoryName} missing SKILL.md`);
      return null;
    }

    const skillMdContent = await readTextFile(skillMdPath);
    const parsed = SkillMdParser.parse(skillMdContent);

    // Read metadata
    const metadata = await this.loadMetadata(skillPath);

    // Read REFERENCE.md if exists
    let referenceContent: string | undefined;
    const referenceMdPath = await join(skillPath, 'REFERENCE.md');
    if (await exists(referenceMdPath)) {
      referenceContent = await readTextFile(referenceMdPath);
    }

    // Scan for scripts
    const scriptsScan = await this.scanScripts(skillPath);

    const skill: FileBasedSkill = {
      id: metadata.skillId,
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      localPath: skillPath,
      directoryName,
      frontmatter: parsed.frontmatter,
      content: parsed.content,
      referenceContent,
      hasScripts: scriptsScan.length > 0,
      scriptFiles: scriptsScan,
      metadata,
      category: this.inferCategory(parsed.frontmatter, parsed.content),
      isSystem: metadata.source === 'system',
    };

    return skill;
  }

  /**
   * Get skill by ID
   */
  async getSkillById(id: string): Promise<FileBasedSkill | null> {
    const skills = await this.listSkills();
    return skills.find((s) => s.id === id) || null;
  }

  /**
   * Get skill by name (searches frontmatter name)
   */
  async getSkillByName(name: string): Promise<FileBasedSkill | null> {
    const skills = await this.listSkills();
    return skills.find((s) => s.name.toLowerCase() === name.toLowerCase()) || null;
  }

  /**
   * Create a new skill
   */
  async createSkill(request: CreateSkillRequest): Promise<FileBasedSkill> {
    const skillsDir = await this.getSkillsDir();

    // Generate directory name (slugify)
    const directoryName = this.slugify(request.name);
    const skillPath = await join(skillsDir, directoryName);

    // Check if already exists
    if (await exists(skillPath)) {
      throw new Error(`Skill directory ${directoryName} already exists`);
    }

    // Create directory
    await mkdir(skillPath, { recursive: true });

    // Copy documentation files to references/ directory
    if (request.content?.documentation && request.content.documentation.length > 0) {
      const referencesDir = await join(skillPath, 'references');
      await mkdir(referencesDir, { recursive: true });

      for (const doc of request.content.documentation) {
        if (doc.originalPath && doc.filename) {
          try {
            const targetPath = await join(referencesDir, doc.filename);
            const fileData = await readFile(doc.originalPath);
            await writeFile(targetPath, fileData);
            logger.info(`Copied documentation file: ${doc.filename}`);
          } catch (error) {
            logger.error(`Failed to copy documentation file ${doc.filename}:`, error);
            throw new Error(`Failed to copy documentation file: ${doc.filename}`);
          }
        }
      }
    }

    // Copy script files to scripts/ directory
    if (request.content?.scriptFiles && request.content.scriptFiles.length > 0) {
      const scriptsDir = await join(skillPath, 'scripts');
      await mkdir(scriptsDir, { recursive: true });

      const scriptContents = request.content.scriptContents;
      for (const scriptFile of request.content.scriptFiles) {
        try {
          const targetPath = await join(scriptsDir, scriptFile);
          const content = scriptContents?.get(scriptFile) || '';
          await writeTextFile(targetPath, content);
          logger.info(`Created script file: ${scriptFile}`);
        } catch (error) {
          logger.error(`Failed to create script file ${scriptFile}:`, error);
          throw new Error(`Failed to create script file: ${scriptFile}`);
        }
      }
    }

    // Create SKILL.md using user content if provided
    const skillMdContent = SkillMdParser.createSkillMdFromContent(
      request.name,
      request.description,
      request.content,
      request.category
    );
    const skillMdPath = await join(skillPath, 'SKILL.md');
    await writeTextFile(skillMdPath, skillMdContent);

    // Create metadata
    const metadata: TalkCodySkillMetadata = {
      skillId: uuidv4(),
      source: 'local',
      installedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      tags: request.tags || [],
    };

    await this.saveMetadata(skillPath, metadata);

    logger.info(`Created skill: ${request.name} at ${skillPath}`);

    // Load and return
    const skill = await this.loadSkill(directoryName);
    if (!skill) {
      throw new Error('Failed to load newly created skill');
    }

    return skill;
  }

  /**
   * Update a skill's SKILL.md content
   */
  async updateSkill(skill: FileBasedSkill): Promise<void> {
    const skillMdPath = await join(skill.localPath, 'SKILL.md');

    // Generate SKILL.md content
    const skillMdContent = SkillMdParser.generate({
      frontmatter: skill.frontmatter,
      content: skill.content,
    });

    // Write SKILL.md
    await writeTextFile(skillMdPath, skillMdContent);

    // Update metadata timestamp
    skill.metadata.lastUpdatedAt = Date.now();
    await this.saveMetadata(skill.localPath, skill.metadata);

    logger.info(`Updated skill: ${skill.name}`);
  }

  /**
   * Delete a skill
   */
  async deleteSkill(directoryName: string): Promise<void> {
    const skillsDir = await this.getSkillsDir();
    const skillPath = await join(skillsDir, directoryName);

    if (!(await exists(skillPath))) {
      throw new Error(`Skill directory ${directoryName} not found`);
    }

    // Read skill metadata to get the skill ID before deleting
    let skillId: string | null = null;
    try {
      const metadataPath = await join(skillPath, '.talkcody-metadata.json');
      if (await exists(metadataPath)) {
        const metadataContent = await readTextFile(metadataPath);
        const metadata: TalkCodySkillMetadata = JSON.parse(metadataContent);
        skillId = metadata.skillId;
      }
    } catch (error) {
      logger.warn(`Failed to read metadata for skill ${directoryName}:`, error);
    }

    // Delete the skill directory
    await remove(skillPath, { recursive: true });
    logger.info(`Deleted skill: ${directoryName}`);

    // Remove from active skills if it was active
    if (skillId) {
      try {
        await activeSkillsConfigService.removeActiveSkill(skillId);
        logger.info(`Removed skill ${skillId} from active skills`);
      } catch (error) {
        logger.warn(`Failed to remove skill ${skillId} from active skills:`, error);
      }
    }
  }

  /**
   * Deploy built-in system skills
   * This is called during initialization to ensure system skills are always available
   */
  private async deployBuiltInSkills(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { TALKCODY_KNOWLEDGE_BASE_SKILL } = await import('./builtin-skills-definitions');

      // Check if skill already exists
      const existingSkill = await this.loadSkill('talkcody-knowledge-base');

      // Deploy if doesn't exist or version is different
      if (
        !existingSkill ||
        existingSkill.metadata.version !== TALKCODY_KNOWLEDGE_BASE_SKILL.metadata.version
      ) {
        await this.deploySkill('talkcody-knowledge-base', TALKCODY_KNOWLEDGE_BASE_SKILL);
      }
    } catch (error) {
      logger.error('Failed to deploy built-in skills:', error);
      // Don't throw - allow service to continue if skill deployment fails
    }
  }

  /**
   * Deploy a built-in skill to the file system
   */
  private async deploySkill(
    directoryName: string,
    skillDef: {
      name: string;
      skillMdContent: string;
      referenceMdContent?: string;
      metadata: {
        skillId: string;
        version: string;
        source: string;
        isBuiltIn: boolean;
      };
    }
  ): Promise<void> {
    const skillsDir = await this.getSkillsDir();
    const skillPath = await join(skillsDir, directoryName);

    // Create directory if it doesn't exist
    if (!(await exists(skillPath))) {
      await mkdir(skillPath, { recursive: true });
    }

    // Write SKILL.md
    const skillMdPath = await join(skillPath, 'SKILL.md');
    await writeTextFile(skillMdPath, skillDef.skillMdContent);

    // Write REFERENCE.md if provided
    if (skillDef.referenceMdContent) {
      const referenceMdPath = await join(skillPath, 'REFERENCE.md');
      await writeTextFile(referenceMdPath, skillDef.referenceMdContent);
    }

    // Write metadata
    const metadata: TalkCodySkillMetadata = {
      skillId: skillDef.metadata.skillId,
      source: 'system',
      isBuiltIn: true,
      installedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      tags: ['builtin', 'system'],
      version: skillDef.metadata.version,
    };

    await this.saveMetadata(skillPath, metadata);

    logger.info(`Deployed built-in skill: ${directoryName} at ${skillPath}`);
  }

  /**
   * Scan a skill directory for information
   */
  async scanSkillDirectory(skillPath: string): Promise<SkillDirectoryScan> {
    const skillMdPath = await join(skillPath, 'SKILL.md');
    const referenceMdPath = await join(skillPath, 'REFERENCE.md');
    const scriptsDir = await join(skillPath, 'scripts');

    const directoryName = skillPath.split('/').pop() || '';

    const result: SkillDirectoryScan = {
      directoryName,
      hasSkillMd: await exists(skillMdPath),
      hasReferenceMd: await exists(referenceMdPath),
      hasScriptsDir: await exists(scriptsDir),
      scriptFiles: [],
      estimatedSize: 0,
    };

    // Scan scripts if directory exists
    if (result.hasScriptsDir) {
      result.scriptFiles = await this.scanScripts(skillPath);
    }

    return result;
  }

  // ==================== Private Helper Methods ====================

  /**
   * Load metadata from .talkcody-metadata.json
   */
  private async loadMetadata(skillPath: string): Promise<TalkCodySkillMetadata> {
    const metadataPath = await join(skillPath, '.talkcody-metadata.json');

    if (await exists(metadataPath)) {
      const content = await readTextFile(metadataPath);
      return JSON.parse(content);
    }

    // Create default metadata if not exists
    const metadata: TalkCodySkillMetadata = {
      skillId: uuidv4(),
      source: 'local',
      installedAt: Date.now(),
      lastUpdatedAt: Date.now(),
    };

    await this.saveMetadata(skillPath, metadata);
    return metadata;
  }

  /**
   * Save metadata to .talkcody-metadata.json
   */
  private async saveMetadata(skillPath: string, metadata: TalkCodySkillMetadata): Promise<void> {
    const metadataPath = await join(skillPath, '.talkcody-metadata.json');
    await writeTextFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Scan scripts directory
   */
  private async scanScripts(skillPath: string): Promise<string[]> {
    const scriptsDir = await join(skillPath, 'scripts');

    if (!(await exists(scriptsDir))) {
      return [];
    }

    const entries = await readDir(scriptsDir);
    return entries.filter((entry) => entry.isFile).map((entry) => entry.name);
  }

  /**
   * Infer category from skill content
   */
  private inferCategory(frontmatter: Record<string, unknown>, content: string): string {
    // If category is already in frontmatter, use it
    if (frontmatter.category && typeof frontmatter.category === 'string') {
      return frontmatter.category;
    }

    // Simple keyword-based inference
    const text = `${frontmatter.description || ''} ${content}`.toLowerCase();

    const categoryKeywords: Record<string, string[]> = {
      databases: ['database', 'sql', 'query', 'postgres', 'mysql', 'mongodb'],
      languages: ['python', 'javascript', 'typescript', 'java', 'rust', 'go'],
      frameworks: ['react', 'vue', 'angular', 'django', 'rails', 'express'],
      devops: ['docker', 'kubernetes', 'ci/cd', 'deployment', 'terraform'],
      testing: ['test', 'jest', 'pytest', 'testing', 'qa'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Slugify a string (convert to URL-safe format)
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }
}

// Singleton instance
let instance: FileBasedSkillService | null = null;

/**
 * Get the FileBasedSkillService singleton instance
 */
export async function getFileBasedSkillService(): Promise<FileBasedSkillService> {
  if (!instance) {
    instance = new FileBasedSkillService();
    await instance.initialize();
  }
  return instance;
}
