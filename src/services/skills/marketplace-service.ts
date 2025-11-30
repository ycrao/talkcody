/**
 * Marketplace Service
 *
 * Orchestrates skill publishing and installation from marketplace
 */

import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, remove } from '@tauri-apps/plugin-fs';
import { logger } from '@/lib/logger';
import type { FileBasedSkill } from '@/types/file-based-skill';
import type { MarketplaceSkillMetadata, SkillInstallResult } from '@/types/marketplace-skill';
import { r2StorageService } from '../r2-storage-service';
import { getFileBasedSkillService } from './file-based-skill-service';
import { type PackageSkillRequest, skillPackager } from './skill-packager';

/**
 * Publish skill request
 */
export interface PublishSkillRequest {
  /** Skill to publish */
  skill: FileBasedSkill;

  /** Slug from database (for R2 path) */
  slug: string;

  /** Marketplace metadata */
  marketplaceMetadata: {
    author: {
      name: string;
      email?: string;
      url?: string;
    };
    license: string;
    tags?: string[];
    longDescription?: string;
    repositoryUrl?: string;
    homepageUrl?: string;
  };
}

/**
 * Publish skill result
 */
export interface PublishSkillResult {
  /** Published skill metadata */
  metadata: MarketplaceSkillMetadata;

  /** R2 storage URL */
  storageUrl: string;

  /** Success status */
  success: boolean;

  /** Error message if failed */
  error?: string;
}

/**
 * Install skill request
 */
export interface InstallSkillRequest {
  /** Skill ID to install */
  skillId: string;

  /** Version to install (default: latest) */
  version?: string;

  /** Marketplace metadata */
  metadata: MarketplaceSkillMetadata;

  /** Callback for checksum mismatch - return true to continue installation */
  onChecksumMismatch?: (expectedChecksum: string, actualChecksum: string) => Promise<boolean>;
}

/**
 * Marketplace Service
 */
export class MarketplaceService {
  /**
   * Publish a skill to the marketplace
   */
  async publishSkill(request: PublishSkillRequest): Promise<PublishSkillResult> {
    logger.info('Publishing skill to marketplace:', {
      skillId: request.skill.id,
      name: request.skill.name,
    });

    try {
      // Step 1: Package the skill
      const packageResult = await skillPackager.package({
        skill: request.skill,
        marketplaceMetadata: request.marketplaceMetadata,
      });

      logger.info('Skill packaged:', {
        packagePath: packageResult.packagePath,
        size: packageResult.size,
      });

      // Step 2: Upload to R2 using slug (not skill.id)
      const uploadResult = await r2StorageService.uploadSkillPackage(
        request.slug,
        packageResult.manifest.metadata.version,
        packageResult.packagePath,
        packageResult.manifest.metadata
      );

      logger.info('Skill uploaded to R2:', uploadResult);

      // Step 3: Create marketplace metadata
      const metadata: MarketplaceSkillMetadata = {
        ...packageResult.manifest.metadata,
        storageUrl: uploadResult.url,
        packageSize: uploadResult.size,
        downloadCount: 0,
      };

      // Step 4: Save metadata to database (via API)
      await this.saveMarketplaceMetadata(metadata);

      logger.info('Skill published successfully:', {
        skillId: metadata.skillId,
        version: metadata.version,
      });

      return {
        metadata,
        storageUrl: uploadResult.url,
        success: true,
      };
    } catch (error) {
      logger.error('Failed to publish skill:', error);

      return {
        metadata: {} as MarketplaceSkillMetadata,
        storageUrl: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Install a skill from the marketplace
   */
  async installSkill(request: InstallSkillRequest): Promise<SkillInstallResult> {
    logger.info('Installing skill from marketplace:', {
      skillId: request.skillId,
      version: request.version,
    });

    let tmpDir = '';

    try {
      const version = request.version || request.metadata.version;

      // Step 1: Get temp directory
      tmpDir = await this.getTempDirectory();
      const packagePath = await join(tmpDir, `${request.skillId}-${version}.tar.gz`);

      // Step 2: Download from R2
      await r2StorageService.downloadSkillPackage(request.skillId, version, packagePath);

      logger.info('Skill package downloaded:', packagePath);

      // Step 3: Get skills directory
      const skillService = await getFileBasedSkillService();
      const skillsDir = await skillService.getSkillsDirPath();

      // Step 4: Unpack to skills directory
      const targetPath = await join(
        skillsDir,
        request.metadata.name.toLowerCase().replace(/\s+/g, '-')
      );
      const skill = await skillPackager.unpack(packagePath, targetPath, {
        onChecksumMismatch: request.onChecksumMismatch,
      });

      logger.info('Skill unpacked:', {
        targetPath,
        skillName: skill.name,
      });

      // Step 5: Clean up temp directory
      await this.cleanupTempFiles(tmpDir);

      // Step 6: Update download count (via API)
      await this.incrementDownloadCount(request.skillId);

      return {
        skillId: request.skillId,
        name: skill.name,
        localPath: targetPath,
        success: true,
      };
    } catch (error) {
      logger.error('Failed to install skill:', error);

      // Clean up temp directory on error
      if (tmpDir) {
        await this.cleanupTempFiles(tmpDir);
      }

      return {
        skillId: request.skillId,
        name: request.metadata.name,
        localPath: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Uninstall a skill (remove from local filesystem)
   */
  async uninstallSkill(skillId: string): Promise<void> {
    logger.info('Uninstalling skill:', skillId);

    const skillService = await getFileBasedSkillService();
    const skill = await skillService.getSkillById(skillId);

    if (!skill) {
      throw new Error(`Skill ${skillId} not found`);
    }

    await skillService.deleteSkill(skill.directoryName);

    logger.info('Skill uninstalled:', skillId);
  }

  /**
   * Update a skill to the latest version
   */
  async updateSkill(skillId: string): Promise<SkillInstallResult> {
    logger.info('Updating skill:', skillId);

    // Get latest metadata from marketplace
    const metadata = await this.getMarketplaceMetadata(skillId);

    // Uninstall current version
    await this.uninstallSkill(skillId);

    // Install latest version
    return await this.installSkill({
      skillId,
      metadata,
    });
  }

  /**
   * Search marketplace for skills
   */
  async searchSkills(query: string, tags?: string[]): Promise<MarketplaceSkillMetadata[]> {
    logger.info('Searching marketplace:', { query, tags });

    // Call marketplace API
    // This is a placeholder - actual implementation would use API client
    return [];
  }

  /**
   * Get skill metadata from marketplace
   */
  private async getMarketplaceMetadata(skillId: string): Promise<MarketplaceSkillMetadata> {
    logger.info('Fetching marketplace metadata:', skillId);

    // Call marketplace API
    // This is a placeholder - actual implementation would use API client
    throw new Error('Not implemented');
  }

  /**
   * Save skill metadata to marketplace database
   */
  private async saveMarketplaceMetadata(metadata: MarketplaceSkillMetadata): Promise<void> {
    logger.info('Saving marketplace metadata:', {
      skillId: metadata.skillId,
      version: metadata.version,
    });

    // Call marketplace API to save metadata
    // This is a placeholder - actual implementation would use API client
  }

  /**
   * Increment download count
   */
  private async incrementDownloadCount(skillId: string): Promise<void> {
    logger.info('Incrementing download count:', skillId);

    // Call marketplace API
    // This is a placeholder
  }

  /**
   * Get temporary directory for downloads
   */
  private async getTempDirectory(): Promise<string> {
    // Create temp directory in app data directory
    const appData = await appDataDir();
    const tmpBaseDir = await join(appData, 'tmp');

    // Ensure tmp directory exists
    if (!(await exists(tmpBaseDir))) {
      await mkdir(tmpBaseDir, { recursive: true });
    }

    // Create unique subdirectory for this download
    const tmpDir = await join(tmpBaseDir, `talkcody-skills-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });

    return tmpDir;
  }

  /**
   * Clean up temporary directory after installation
   */
  private async cleanupTempFiles(tmpDir: string): Promise<void> {
    try {
      logger.info('Cleaning up temporary directory:', tmpDir);
      await remove(tmpDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors, just log them
      logger.warn('Failed to cleanup temp directory:', error);
    }
  }
}

// Singleton instance
export const marketplaceService = new MarketplaceService();
