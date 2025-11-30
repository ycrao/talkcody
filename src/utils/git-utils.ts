import { Command } from '@tauri-apps/plugin-shell';
import { logger } from '@/lib/logger';

export interface GitResult {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
}

export async function gitAdd(basePath: string): Promise<GitResult> {
  try {
    const command = `cd "${basePath}" && git add .`;
    logger.info('gitAdd command:', command);
    const result = await Command.create('exec-sh', ['-c', command]).execute();

    if (result.code === 0) {
      return {
        success: true,
        message: 'Successfully added all changes to staging area',
        output: result.stdout,
      };
    }
    return {
      success: false,
      message: 'Failed to add changes to staging area',
      error: result.stderr,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error executing git add command',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function gitCommit(commitMessage: string): Promise<GitResult> {
  if (!commitMessage.trim()) {
    return {
      success: false,
      message: 'Commit message cannot be empty',
      error: 'Empty commit message',
    };
  }

  try {
    const result = await Command.create('exec-sh', [
      '-c',
      `git commit -m "${commitMessage}"`,
    ]).execute();

    if (result.code === 0) {
      return {
        success: true,
        message: 'Successfully committed changes',
        output: result.stdout,
      };
    }
    return {
      success: false,
      message: 'Failed to commit changes',
      error: result.stderr,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error executing git commit command',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Add all changes and commit with a message
 */
export async function gitAddAndCommit(commitMessage: string, basePath: string): Promise<GitResult> {
  // First, add all changes
  const addResult = await gitAdd(basePath);

  if (!addResult.success) {
    return addResult;
  }

  // Then commit the changes
  const commitResult = await gitCommit(commitMessage);
  if (commitResult.success) {
    return {
      success: true,
      message: `Successfully added and committed changes: "${commitMessage}"`,
      output: `Add output: ${addResult.output}\nCommit output: ${commitResult.output}`,
    };
  }
  return commitResult;
}

export async function isGitRepository(): Promise<boolean> {
  try {
    const result = await Command.create('exec-sh', ['-c', 'git status']).execute();
    logger.info('git status result', result);
    return result.code === 0;
  } catch (error) {
    logger.info('git status error', error);
    return false;
  }
}

export async function getGitStatus(): Promise<GitResult> {
  try {
    const result = await Command.create('exec-sh', ['-c', 'git status --porcelain']).execute();

    if (result.code === 0) {
      return {
        success: true,
        message: 'Successfully retrieved git status',
        output: result.stdout,
      };
    }
    return {
      success: false,
      message: 'Failed to get git status',
      error: result.stderr,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error executing git status command',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if there are changes to commit
 */
export async function hasChangesToCommit(): Promise<boolean> {
  const statusResult = await getGitStatus();
  if (!statusResult.success) {
    return false;
  }

  return statusResult.output?.trim() !== '';
}
