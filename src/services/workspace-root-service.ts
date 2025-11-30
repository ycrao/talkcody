// src/services/workspace-root-service.ts

import { databaseService } from '@/services/database-service';
import { settingsManager } from '@/stores/settings-store';

/**
 * Returns the workspace root path after validating it against the current project.
 * Throws if the value stored in settings does not match the project's recorded root path.
 */
export async function getValidatedWorkspaceRoot(): Promise<string> {
  const rootPath = settingsManager.getCurrentRootPath();
  const projectId = await settingsManager.getProject();

  if (!projectId) {
    return rootPath;
  }

  const project = await databaseService.getProject(projectId);
  const projectRoot = project?.root_path || '';

  if (!projectRoot) {
    return rootPath;
  }

  if (!rootPath || projectRoot !== rootPath) {
    throw new Error(
      `Workspace root path mismatch: settings="${rootPath || ''}", project="${projectRoot}"`
    );
  }

  return rootPath;
}
