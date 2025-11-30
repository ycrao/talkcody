/**
 * Skill Script Executor with Permission Management
 *
 * Wraps the script executor with permission checks and requests
 */

import { logger } from '@/lib/logger';
import { useSkillPermissionStore } from '@/stores/skill-permission-store';
import type { SkillPermissionRequest, SkillScriptPermissionLevel } from '@/types/skill-permission';
import {
  type ScriptExecutionRequest,
  type ScriptExecutionResult,
  scriptExecutor,
} from './script-executor';

/**
 * Extended script execution request with skill info
 */
export interface SkillScriptExecutionRequest extends ScriptExecutionRequest {
  /** Skill ID */
  skillId: string;

  /** Skill name */
  skillName: string;

  /** Required permission level */
  requiredPermissionLevel: SkillScriptPermissionLevel;

  /** Reason for execution (optional) */
  reason?: string;
}

/**
 * Permission request callback type
 */
export type PermissionRequestCallback = (
  request: SkillPermissionRequest
) => Promise<{ granted: boolean; level: SkillScriptPermissionLevel; remember: boolean }>;

/**
 * Skill Script Executor
 *
 * Handles script execution with permission management
 */
export class SkillScriptExecutor {
  private permissionRequestCallback: PermissionRequestCallback | null = null;

  /**
   * Set the callback for permission requests
   */
  setPermissionRequestCallback(callback: PermissionRequestCallback) {
    this.permissionRequestCallback = callback;
  }

  /**
   * Execute a skill script with permission checks
   */
  async execute(request: SkillScriptExecutionRequest): Promise<ScriptExecutionResult> {
    const permissionStore = useSkillPermissionStore.getState();

    // Check if permission is already granted
    const hasPermission = permissionStore.hasPermission(
      request.skillId,
      request.script_path,
      request.requiredPermissionLevel
    );

    if (!hasPermission) {
      logger.info('Permission not granted, requesting permission', {
        skillId: request.skillId,
        scriptPath: request.script_path,
        level: request.requiredPermissionLevel,
      });

      // Request permission
      const permissionRequest: SkillPermissionRequest = {
        requestId: crypto.randomUUID(),
        skillId: request.skillId,
        skillName: request.skillName,
        scriptPath: request.script_path,
        scriptType: request.script_type,
        requestedLevel: request.requiredPermissionLevel,
        reason: request.reason,
        requestedAt: Date.now(),
      };

      if (!this.permissionRequestCallback) {
        throw new Error('Permission request callback not set');
      }

      const decision = await this.permissionRequestCallback(permissionRequest);

      if (!decision.granted) {
        logger.warn('Permission denied by user', {
          skillId: request.skillId,
          scriptPath: request.script_path,
        });

        return {
          stdout: '',
          stderr: 'Permission denied by user',
          exit_code: -1,
          execution_time_ms: 0,
          success: false,
          error: 'Permission denied by user',
        };
      }

      // Permission granted, record the decision
      permissionStore.decidePermission({
        requestId: permissionRequest.requestId,
        granted: true,
        level: decision.level,
        remember: decision.remember,
        decidedAt: Date.now(),
      });
    }

    // Execute the script
    logger.info('Executing script with permission', {
      skillId: request.skillId,
      scriptPath: request.script_path,
    });

    return await scriptExecutor.execute({
      script_path: request.script_path,
      script_type: request.script_type,
      args: request.args,
      working_dir: request.working_dir,
      timeout_ms: request.timeout_ms,
      environment: request.environment,
    });
  }

  /**
   * Check if a skill has permission without executing
   */
  checkPermission(skillId: string, scriptPath: string, level: SkillScriptPermissionLevel): boolean {
    const permissionStore = useSkillPermissionStore.getState();
    return permissionStore.hasPermission(skillId, scriptPath, level);
  }
}

// Singleton instance
export const skillScriptExecutor = new SkillScriptExecutor();
