import { invoke } from '@tauri-apps/api/core';
import { logger } from '@/lib/logger';

/**
 * Script execution request parameters
 */
export interface ScriptExecutionRequest {
  script_path: string;
  script_type: 'python' | 'bash' | 'nodejs' | 'sh' | 'javascript';
  args: string[];
  working_dir?: string;
  timeout_ms?: number;
  environment?: Record<string, string>;
}

/**
 * Script execution result from Rust backend
 */
export interface ScriptExecutionResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  execution_time_ms: number;
  success: boolean;
  error?: string;
}

/**
 * ScriptExecutor - handles skill script execution
 */
export class ScriptExecutor {
  /**
   * Execute a skill script via Tauri backend
   */
  async execute(request: ScriptExecutionRequest): Promise<ScriptExecutionResult> {
    try {
      logger.info('Executing skill script:', {
        script_path: request.script_path,
        script_type: request.script_type,
        args: request.args,
      });

      const result = await invoke<ScriptExecutionResult>('execute_skill_script', {
        request: {
          script_path: request.script_path,
          script_type: request.script_type,
          args: request.args,
          working_dir: request.working_dir || null,
          timeout_ms: request.timeout_ms || null,
          environment: request.environment || null,
        },
      });

      logger.info('Script execution result:', {
        success: result.success,
        exit_code: result.exit_code,
        execution_time_ms: result.execution_time_ms,
      });

      return result;
    } catch (error) {
      logger.error('Failed to execute script:', error);
      throw error;
    }
  }
}

// Singleton instance
export const scriptExecutor = new ScriptExecutor();
