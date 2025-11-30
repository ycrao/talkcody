import { z } from 'zod';
import { BashToolDoing } from '@/components/tools/bash-tool-doing';
import { BashToolResult } from '@/components/tools/bash-tool-result';
import { createTool } from '@/lib/create-tool';
import type { BashResult } from '@/services/bash-executor';
import { bashExecutor } from '@/services/bash-executor';

export const bashTool = createTool({
  name: 'bash',
  description: `Execute bash commands safely on the system.

This tool allows you to run bash/shell commands with built-in safety restrictions to prevent dangerous operations.

Use this tool for:
- File operations (ls, cat, grep, find, etc.)
- Process monitoring (ps, top, etc.)
- Git operations
- Build commands (npm, yarn, make, etc.)
- Safe system information (whoami, pwd, date, etc.)

The command will be executed in the current working directory.`,
  inputSchema: z.object({
    command: z.string().describe('The bash command to execute'),
  }),
  canConcurrent: false,
  execute: async ({ command }): Promise<BashResult> => {
    // Delegate execution to the BashExecutor service
    return await bashExecutor.execute(command);
  },
  renderToolDoing: ({ command }) => <BashToolDoing command={command} />,
  renderToolResult: (result, { command } = {}) => (
    <BashToolResult
      output={result.output || result.error || ''}
      success={result.success}
      exitCode={result.exit_code}
      idleTimedOut={result.idle_timed_out}
      timedOut={result.timed_out}
      pid={result.pid}
    />
  ),
});
