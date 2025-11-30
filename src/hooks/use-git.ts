import { useState } from 'react';
import { toast } from 'sonner';
import {
  type GitResult,
  gitAddAndCommit,
  hasChangesToCommit,
  isGitRepository,
} from '@/utils/git-utils';

export function useGit() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<GitResult | null>(null);

  const commitChanges = async (commitMessage: string, basePath = '.') => {
    setIsLoading(true);
    try {
      // Check if we're in a git repository
      const isRepo = await isGitRepository();
      if (!isRepo) {
        toast.error('Not a git repository');
        return { success: false, message: 'Not a git repository' };
      }

      // Check if there are changes to commit
      const hasChanges = await hasChangesToCommit();
      if (!hasChanges) {
        toast.info('No changes to commit');
        return { success: true, message: 'No changes to commit' };
      }

      // Commit changes
      const result = await gitAddAndCommit(commitMessage, basePath);
      setLastResult(result);

      if (result.success) {
        toast.success('Changes committed successfully');
      } else {
        toast.error(`Failed to commit: ${result.error || result.message}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Error: ${errorMessage}`);
      return { success: false, message: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    commitChanges,
    isLoading,
    lastResult,
  };
}
