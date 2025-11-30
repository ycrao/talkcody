/**
 * Skill Packager
 *
 * Package skills into .tar.gz for marketplace distribution
 */

import { invoke } from '@tauri-apps/api/core';
import { appDataDir, dirname, join } from '@tauri-apps/api/path';
import {
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { logger } from '@/lib/logger';
import type { FileBasedSkill } from '@/types/file-based-skill';
import type { MarketplaceSkillMetadata, SkillPackageManifest } from '@/types/marketplace-skill';
import { SkillMdParser } from './skill-md-parser';

/**
 * Package request
 */
export interface PackageSkillRequest {
  /** Skill to package */
  skill: FileBasedSkill;

  /** Additional metadata for marketplace */
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
 * Package result
 */
export interface PackageSkillResult {
  /** Path to created .tar.gz file */
  packagePath: string;

  /** Package manifest */
  manifest: SkillPackageManifest;

  /** Package size in bytes */
  size: number;
}

/**
 * Skill Packager Service
 */
export class SkillPackager {
  /**
   * Package a skill into .tar.gz
   */
  async package(request: PackageSkillRequest): Promise<PackageSkillResult> {
    const { skill, marketplaceMetadata } = request;

    logger.info('Packaging skill:', {
      skillId: skill.id,
      name: skill.name,
      directory: skill.directoryName,
    });

    // Collect files to include
    const files = await this.collectFiles(skill.localPath);

    // Calculate checksum
    const checksum = await this.calculateChecksum(skill.localPath, files);

    // Create manifest
    const manifest: SkillPackageManifest = {
      metadata: {
        skillId: skill.id,
        name: skill.name,
        description: skill.description,
        longDescription: marketplaceMetadata.longDescription,
        author: marketplaceMetadata.author,
        version: skill.frontmatter.version || '1.0.0',
        tags: marketplaceMetadata.tags || skill.metadata.tags || [],
        license: marketplaceMetadata.license,
        requiredPermission: this.inferPermissionLevel(skill),
        publishedAt: Date.now(),
        updatedAt: Date.now(),
        repositoryUrl: marketplaceMetadata.repositoryUrl,
        homepageUrl: marketplaceMetadata.homepageUrl,
      },
      files,
      checksum,
      packagedAt: Date.now(),
    };

    // Create package using Tauri command
    const packagePath = await this.createTarGz(skill.localPath, manifest);

    // Get package size
    const size = await this.getFileSize(packagePath);

    logger.info('Skill packaged successfully:', {
      skillId: skill.id,
      packagePath,
      size,
    });

    return {
      packagePath,
      manifest,
      size,
    };
  }

  /**
   * Collect all files in skill directory
   */
  private async collectFiles(skillPath: string): Promise<string[]> {
    const files: string[] = [];

    // Always include SKILL.md
    files.push('SKILL.md');

    // Check for REFERENCE.md
    if (await exists(await join(skillPath, 'REFERENCE.md'))) {
      files.push('REFERENCE.md');
    }

    // Check for scripts directory
    const scriptsPath = await join(skillPath, 'scripts');
    if (await exists(scriptsPath)) {
      const scriptEntries = await readDir(scriptsPath);
      for (const entry of scriptEntries) {
        if (entry.isFile) {
          files.push(`scripts/${entry.name}`);
        }
      }
    }

    // Include TalkCody metadata
    files.push('.talkcody-metadata.json');

    return files;
  }

  /**
   * Calculate checksum for skill files
   */
  private async calculateChecksum(skillPath: string, files: string[]): Promise<string> {
    // Simple checksum: concatenate file contents and hash
    let combined = '';

    for (const file of files) {
      try {
        const filePath = await join(skillPath, file);
        const content = await readTextFile(filePath);
        combined += content;
      } catch (error) {
        logger.warn(`Failed to read file for checksum: ${file}`, error);
      }
    }

    // Use crypto.subtle to create SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
  }

  /**
   * Infer required permission level from skill
   */
  private inferPermissionLevel(
    skill: FileBasedSkill
  ): 'read-only' | 'write-project' | 'write-all' | 'network' | 'full' {
    // If skill has scripts, default to write-project
    if (skill.hasScripts) {
      return 'write-project';
    }

    // Otherwise, read-only
    return 'read-only';
  }

  /**
   * Create .tar.gz package using Tauri command
   */
  private async createTarGz(skillPath: string, manifest: SkillPackageManifest): Promise<string> {
    // Create temp directory for package in app data directory
    const appData = await appDataDir();
    const tmpBaseDir = await join(appData, 'tmp');

    // Ensure tmp directory exists
    if (!(await exists(tmpBaseDir))) {
      await mkdir(tmpBaseDir, { recursive: true });
    }

    const tmpDir = await join(tmpBaseDir, `talkcody-packages-${Date.now()}`);

    // Create a staging directory to include manifest
    const stagingDir = await join(tmpDir, 'staging');
    await mkdir(stagingDir, { recursive: true });

    try {
      // Copy all skill files to staging directory
      const files = manifest.files;
      for (const file of files) {
        const sourcePath = await join(skillPath, file);
        const destPath = await join(stagingDir, file);

        // Create parent directory if needed
        const parentDir = await dirname(destPath);
        if (!(await exists(parentDir))) {
          await mkdir(parentDir, { recursive: true });
        }

        // Copy file
        await copyFile(sourcePath, destPath);
      }

      // Write manifest to skill.json in staging directory
      const manifestPath = await join(stagingDir, 'skill.json');
      await writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));

      // Create output path
      const packagePath = await join(
        tmpDir,
        `${manifest.metadata.skillId}-${manifest.metadata.version}.tar.gz`
      );

      // Call Rust command to create tarball from staging directory
      const result = await invoke<{
        success: boolean;
        output_path: string;
        size_bytes: number;
        error?: string;
      }>('create_skill_tarball', {
        request: {
          source_dir: stagingDir,
          output_path: packagePath,
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create tarball');
      }

      logger.info('Package created successfully:', {
        path: result.output_path,
        size: result.size_bytes,
      });

      // Clean up staging directory
      await remove(stagingDir, { recursive: true });

      return result.output_path;
    } catch (error) {
      logger.error('Failed to create tarball:', error);
      // Clean up staging directory on error
      try {
        await remove(stagingDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Get file size using Tauri fs plugin
   */
  private async getFileSize(filePath: string): Promise<number> {
    try {
      const { size } = await invoke<{ size: number }>('plugin:fs|stat', {
        path: filePath,
      });
      return size;
    } catch (error) {
      logger.error('Failed to get file size:', error);
      return 0;
    }
  }

  /**
   * Unpack a skill from .tar.gz
   */
  async unpack(
    packagePath: string,
    targetPath: string,
    options?: {
      skipChecksumVerification?: boolean;
      onChecksumMismatch?: (expectedChecksum: string, actualChecksum: string) => Promise<boolean>;
    }
  ): Promise<FileBasedSkill> {
    logger.info('Unpacking skill:', { packagePath, targetPath });

    try {
      // Call Rust command to extract tarball
      const result = await invoke<{
        success: boolean;
        dest_dir: string;
        files_extracted: number;
        error?: string;
      }>('extract_skill_tarball', {
        request: {
          tarball_path: packagePath,
          dest_dir: targetPath,
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to extract tarball');
      }

      logger.info('Skill unpacked successfully:', {
        destDir: result.dest_dir,
        filesExtracted: result.files_extracted,
      });

      // Verify checksum if not skipped
      if (!options?.skipChecksumVerification) {
        const manifestPath = await join(targetPath, 'skill.json');
        if (await exists(manifestPath)) {
          const manifestContent = await readTextFile(manifestPath);
          const manifest: SkillPackageManifest = JSON.parse(manifestContent);

          // Recalculate checksum
          const actualChecksum = await this.calculateChecksum(targetPath, manifest.files);

          // Compare checksums
          if (actualChecksum !== manifest.checksum) {
            logger.warn('Checksum mismatch detected:', {
              expected: manifest.checksum,
              actual: actualChecksum,
            });

            // Call the callback if provided
            if (options?.onChecksumMismatch) {
              const shouldContinue = await options.onChecksumMismatch(
                manifest.checksum,
                actualChecksum
              );

              if (!shouldContinue) {
                // Clean up extracted files
                await remove(targetPath, { recursive: true });
                throw new Error('Installation cancelled due to checksum mismatch');
              }

              logger.info('User chose to continue despite checksum mismatch');
            } else {
              // No callback provided, throw error by default
              await remove(targetPath, { recursive: true });
              throw new Error(
                `Checksum verification failed. Expected: ${manifest.checksum}, Got: ${actualChecksum}`
              );
            }
          } else {
            logger.info('Checksum verification passed');
          }
        } else {
          logger.warn('No skill.json found in package - skipping checksum verification');
        }
      }

      // Parse the extracted skill
      const skillMdPath = await join(targetPath, 'SKILL.md');
      const skillMdContent = await readTextFile(skillMdPath);
      const parsed = SkillMdParser.parse(skillMdContent);

      // Read metadata
      const metadataPath = await join(targetPath, '.talkcody-metadata.json');
      let metadata: {
        skillId: string;
        source: 'marketplace' | 'local' | 'claude-code';
        tags: string[];
        installedAt: number;
        lastUpdatedAt: number;
      } = {
        skillId: (parsed.frontmatter.id as string) || '',
        source: 'marketplace',
        tags: [],
        installedAt: Date.now(),
        lastUpdatedAt: Date.now(),
      };

      if (await exists(metadataPath)) {
        const metadataContent = await readTextFile(metadataPath);
        const loadedMetadata = JSON.parse(metadataContent);
        metadata = {
          ...metadata,
          ...loadedMetadata,
          lastUpdatedAt: loadedMetadata.lastUpdatedAt || Date.now(),
        };
      }

      // Check for reference content
      let referenceContent: string | undefined;
      const referencePath = await join(targetPath, 'REFERENCE.md');
      if (await exists(referencePath)) {
        referenceContent = await readTextFile(referencePath);
      }

      // Check for scripts
      const scriptsPath = await join(targetPath, 'scripts');
      let hasScripts = false;
      let scriptFiles: string[] = [];

      if (await exists(scriptsPath)) {
        const entries = await readDir(scriptsPath);
        scriptFiles = entries.filter((e) => e.isFile).map((e) => e.name);
        hasScripts = scriptFiles.length > 0;
      }

      // Create FileBasedSkill object
      const skill: FileBasedSkill = {
        id: metadata.skillId,
        name: (parsed.frontmatter.name as string) || '',
        description: (parsed.frontmatter.description as string) || '',
        localPath: targetPath,
        directoryName: targetPath.split('/').pop() || '',
        frontmatter: parsed.frontmatter,
        content: parsed.content,
        referenceContent,
        hasScripts,
        scriptFiles,
        metadata,
        category: (parsed.frontmatter.category as string) || 'general',
      };

      return skill;
    } catch (error) {
      logger.error('Failed to unpack skill:', error);
      throw error;
    }
  }
}

// Singleton instance
export const skillPackager = new SkillPackager();
