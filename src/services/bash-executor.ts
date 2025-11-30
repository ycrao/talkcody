import { invoke } from '@tauri-apps/api/core';
import { logger } from '@/lib/logger';
import { getValidatedWorkspaceRoot } from '@/services/workspace-root-service';

// Result from Rust backend execute_user_shell command
interface TauriShellResult {
  stdout: string;
  stderr: string;
  code: number;
  timed_out: boolean;
  idle_timed_out: boolean;
  pid: number | null;
}

export interface BashResult {
  success: boolean;
  message: string;
  command: string;
  output?: string;
  error?: string;
  exit_code?: number;
  timed_out?: boolean;
  idle_timed_out?: boolean;
  pid?: number | null;
}

// List of dangerous command patterns that should be blocked
const DANGEROUS_PATTERNS = [
  // File system destruction
  /rm\s+.*-[rf]+.*\//, // rm with recursive or force flags on directories
  /rm\s+.*--recursive/,
  /rm\s+.*--force/,
  /rm\s+-[rf]{2}/, // rm -rf or rm -fr
  /rmdir\s+.*-.*r/, // rmdir with recursive

  // Format commands
  /mkfs\./,
  /format\s+/,
  /fdisk/,
  /parted/,
  /gparted/,

  // System control
  /shutdown/,
  /reboot/,
  /halt/,
  /poweroff/,
  /init\s+[016]/,

  // Dangerous dd operations
  /dd\s+.*of=\/dev/,

  // Permission changes that could be dangerous
  /chmod\s+.*777\s+\//,
  /chmod\s+.*-R.*777/,
  /chown\s+.*-R.*root/,

  // Network and system modification
  /iptables/,
  /ufw\s+.*disable/,
  /systemctl\s+.*stop/,
  /service\s+.*stop/,

  // Package managers with dangerous operations
  /apt\s+.*purge/,
  /yum\s+.*remove/,
  /brew\s+.*uninstall.*--force/,

  // Disk operations
  /mount\s+.*\/dev/,
  /umount\s+.*-f/,
  /fsck\s+.*-y/,

  // Process killing
  /killall\s+.*-9/,
  /pkill\s+.*-9.*init/,

  // Cron modifications
  /crontab\s+.*-r/,

  // History manipulation
  /history\s+.*-c/,
  />\s*~\/\.bash_history/,

  // Dangerous redirections
  />\s*\/dev\/sd[a-z]/,
  />\s*\/dev\/nvme/,
  />\s*\/etc\//,

  // Kernel and system files
  /modprobe\s+.*-r/,
  /insmod/,
  /rmmod/,

  // Dangerous curl/wget operations
  /curl\s+.*\|\s*(sh|bash|zsh)/,
  /wget\s+.*-O.*\|\s*(sh|bash|zsh)/,
];

// Additional dangerous commands (exact matches)
const DANGEROUS_COMMANDS = [
  'dd',
  'mkfs',
  'format',
  'fdisk',
  'parted',
  'gparted',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'su',
  'sudo su',
];

/**
 * BashExecutor - handles bash command execution with safety checks
 */
export class BashExecutor {
  private readonly logger = logger;

  /**
   * Check if a command is dangerous
   */
  private isDangerousCommand(command: string): {
    dangerous: boolean;
    reason?: string;
  } {
    const trimmedCommand = command.trim().toLowerCase();

    // Check for exact dangerous commands
    for (const dangerousCmd of DANGEROUS_COMMANDS) {
      if (trimmedCommand.startsWith(`${dangerousCmd} `) || trimmedCommand === dangerousCmd) {
        return {
          dangerous: true,
          reason: `Command "${dangerousCmd}" is not allowed for security reasons`,
        };
      }
    }

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return {
          dangerous: true,
          reason: 'Command matches dangerous pattern and is not allowed for security reasons',
        };
      }
    }

    // Check for multiple command chaining with dangerous commands
    if (command.includes('&&') || command.includes('||') || command.includes(';')) {
      const parts = command.split(/[;&|]+/);
      for (const part of parts) {
        const partCheck = this.isDangerousCommand(part.trim());
        if (partCheck.dangerous) {
          return partCheck;
        }
      }
    }

    return { dangerous: false };
  }

  /**
   * Execute a bash command safely
   */
  async execute(command: string): Promise<BashResult> {
    try {
      // Safety check
      const dangerCheck = this.isDangerousCommand(command);
      if (dangerCheck.dangerous) {
        this.logger.warn('Blocked dangerous command:', command);
        return {
          success: false,
          command,
          message: `Command blocked: ${dangerCheck.reason}`,
          error: dangerCheck.reason,
        };
      }

      this.logger.info('Executing bash command:', command);
      const rootPath = await getValidatedWorkspaceRoot();
      if (rootPath) {
        this.logger.info('rootPath:', rootPath);
      } else {
        this.logger.info('No rootPath set, executing in default directory');
      }

      // Execute command
      const result = await this.executeCommand(command, rootPath || null);
      this.logger.info('Command result:', result);

      return this.formatResult(result, command);
    } catch (error) {
      return this.handleError(error, command);
    }
  }

  /**
   * Execute command via Tauri backend
   * @param command - The command to execute
   * @param cwd - Working directory
   * @param timeoutMs - Maximum timeout in milliseconds (default: 120000 = 2 minutes)
   * @param idleTimeoutMs - Idle timeout in milliseconds (default: 5000 = 5 seconds)
   */
  private async executeCommand(
    command: string,
    cwd: string | null,
    timeoutMs?: number,
    idleTimeoutMs?: number
  ): Promise<TauriShellResult> {
    return await invoke<TauriShellResult>('execute_user_shell', {
      command,
      cwd,
      timeoutMs,
      idleTimeoutMs,
    });
  }

  /**
   * Format execution result
   */
  private formatResult(result: TauriShellResult, command: string): BashResult {
    // Success determination:
    // - If idle_timed_out, we consider it a success (process is still running in background)
    // - If timed_out (max timeout), it's a warning but could still be considered success
    // - Otherwise, command is successful only if exit code is 0
    const isSuccess = result.idle_timed_out || result.timed_out || result.code === 0;

    let message: string;
    if (result.idle_timed_out) {
      message = `Command running in background (idle timeout after 5s). PID: ${result.pid ?? 'unknown'}`;
    } else if (result.timed_out) {
      message = `Command timed out after max timeout. PID: ${result.pid ?? 'unknown'}`;
    } else if (result.code === 0) {
      message = 'Command executed successfully';
    } else {
      message = `Command failed with exit code ${result.code}`;
    }

    return {
      success: isSuccess,
      command,
      message,
      output: result.stdout,
      error: result.stderr || undefined,
      exit_code: result.code,
      timed_out: result.timed_out,
      idle_timed_out: result.idle_timed_out,
      pid: result.pid,
    };
  }

  /**
   * Handle execution errors
   */
  private handleError(error: unknown, command: string): BashResult {
    this.logger.error('Error executing bash command:', error);
    return {
      success: false,
      command,
      message: 'Error executing bash command',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Export singleton instance for convenience
export const bashExecutor = new BashExecutor();
