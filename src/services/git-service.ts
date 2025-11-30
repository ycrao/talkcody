import { invoke } from '@tauri-apps/api/core';
import type { FileStatusMap, GitStatus, LineChange } from '../types/git';

/**
 * Service layer for Git operations using Tauri commands
 */
export class GitService {
  /**
   * Gets the full Git status for a repository
   */
  async getStatus(repoPath: string): Promise<GitStatus> {
    return invoke<GitStatus>('git_get_status', { repoPath });
  }

  /**
   * Checks if a path is a Git repository
   */
  async isRepository(repoPath: string): Promise<boolean> {
    return invoke<boolean>('git_is_repository', { repoPath });
  }

  /**
   * Gets all file statuses as a map
   */
  async getAllFileStatuses(repoPath: string): Promise<FileStatusMap> {
    return invoke<FileStatusMap>('git_get_all_file_statuses', { repoPath });
  }

  /**
   * Gets line-level changes for a file (for editor gutter indicators)
   */
  async getLineChanges(repoPath: string, filePath: string): Promise<LineChange[]> {
    return invoke<LineChange[]>('git_get_line_changes', {
      repoPath,
      filePath,
    });
  }
}

// Export a singleton instance
export const gitService = new GitService();
