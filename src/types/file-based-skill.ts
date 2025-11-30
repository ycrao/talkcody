/**
 * File-based Skills System Type Definitions
 *
 * This implements a file-system based skill storage compatible with Claude Code.
 * Skills are stored as directories containing SKILL.md and optional scripts.
 */

import type { SkillContent } from './skill';

/**
 * Claude Code SKILL.md YAML frontmatter
 * Compatible with Claude Code skill format
 */
export interface SkillMdFrontmatter {
  name: string;
  description: string;
  system?: boolean; // Mark as system/built-in skill
  'allowed-tools'?: string[];
  license?: string;
  version?: string;
  mode?: boolean;
  model?: 'claude-opus' | 'claude-sonnet' | 'claude-haiku';
  [key: string]: unknown; // Allow custom metadata fields
}

/**
 * Parsed SKILL.md structure
 */
export interface ParsedSkillMd {
  frontmatter: SkillMdFrontmatter;
  content: string; // Markdown content after frontmatter
}

/**
 * TalkCody-specific metadata stored in .talkcody-metadata.json
 */
export interface TalkCodySkillMetadata {
  skillId: string; // UUID
  source: 'marketplace' | 'local' | 'claude-code' | 'system'; // Added 'system' for built-in skills
  isBuiltIn?: boolean; // Flag for built-in system skills

  // Marketplace info (if from marketplace)
  marketplaceId?: string;
  marketplaceSlug?: string;
  version?: string;
  author?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };

  // Installation info
  installedAt: number;
  lastUpdatedAt: number;

  // Stats (synced from marketplace)
  stats?: {
    installCount?: number;
    rating?: number;
  };

  // Permissions
  permissions?: {
    granted: SkillScriptPermissionLevel[];
    grantedAt: number;
    grantType: 'once' | 'always' | 'session';
  };

  // Tags
  tags?: string[];
}

/**
 * Script permission levels
 */
export type SkillScriptPermissionLevel =
  | 'read-only' // Can only read files
  | 'write-project' // Can write to project directory
  | 'write-all' // Can write anywhere
  | 'network' // Can access network
  | 'full'; // Full permissions

/**
 * File-based skill (loaded from filesystem)
 * Extends the existing Skill type with file-system specific fields
 */
export interface FileBasedSkill {
  // Core identification
  id: string;
  name: string;
  description: string;

  // File system location
  localPath: string; // Absolute path to skill directory
  directoryName: string; // Directory name (slug)

  // Content from SKILL.md
  frontmatter: SkillMdFrontmatter;
  content: string; // Full markdown content

  // Optional reference documentation
  referenceContent?: string; // Content from REFERENCE.md if exists

  // Scripts detection
  hasScripts: boolean;
  scriptFiles?: string[]; // List of script filenames in scripts/

  // Metadata
  metadata: TalkCodySkillMetadata;

  // Category inference
  category?: string;

  // System skill flag (derived from metadata.source)
  isSystem?: boolean;
}

/**
 * Skill creation request
 */
export interface CreateSkillRequest {
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  content?: SkillContent;
}

/**
 * Skill directory scan result
 */
export interface SkillDirectoryScan {
  directoryName: string;
  hasSkillMd: boolean;
  hasReferenceMd: boolean;
  hasScriptsDir: boolean;
  scriptFiles: string[];
  estimatedSize: number; // bytes
}
