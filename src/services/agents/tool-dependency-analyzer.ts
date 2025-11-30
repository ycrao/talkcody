// src/services/agents/tool-dependency-analyzer.ts

import type { ToolSet } from 'ai';
import { logger } from '@/lib/logger';
import { getToolMetadata, type ToolCategory } from '@/lib/tools';
import type { ToolCallInfo } from './tool-executor';

/**
 * Execution group - a set of tools that can be executed together
 */
export interface ExecutionGroup {
  /** Unique identifier for this group */
  id: string;
  /** Whether tools in this group can run concurrently */
  concurrent: boolean;
  /** Tool calls in this group */
  tools: ToolCallInfo[];
  /** Target files for file operations (if applicable) */
  targetFiles?: string[];
  /** Reason for this grouping (for logging/debugging) */
  reason: string;
}

/**
 * Execution stage - a logical phase in the execution plan
 */
export interface ExecutionStage {
  /** Stage name (e.g., 'read-stage', 'write-stage') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Groups within this stage */
  groups: ExecutionGroup[];
}

/**
 * Complete execution plan with multiple stages
 */
export interface ExecutionPlan {
  /** All execution stages */
  stages: ExecutionStage[];
  /** Summary statistics */
  summary: {
    totalTools: number;
    totalStages: number;
    totalGroups: number;
    concurrentGroups: number;
  };
}

/**
 * ToolDependencyAnalyzer analyzes tool calls and creates an optimized execution plan
 * that maximizes parallelism while respecting dependencies
 */
export class ToolDependencyAnalyzer {
  /**
   * Analyze tool calls and generate an optimized execution plan
   *
   * Strategy:
   * 1. Group tools by category (read, write, edit, other)
   * 2. Create execution stages based on dependencies
   * 3. Within each stage, maximize parallelism where appropriate:
   *    - All read operations run in parallel
   *    - Write/edit operations run sequentially (require user review)
   *    - Other operations run based on their canConcurrent flag
   */
  // TODO: Write/edit operations to different files run in parallel
  analyzeDependencies(toolCalls: ToolCallInfo[], tools: ToolSet): ExecutionPlan {
    if (toolCalls.length === 0) {
      return {
        stages: [],
        summary: {
          totalTools: 0,
          totalStages: 0,
          totalGroups: 0,
          concurrentGroups: 0,
        },
      };
    }

    // Step 1: Categorize all tool calls
    const categorized = this.categorizeToolCalls(toolCalls);

    // Step 2: Build execution stages
    const stages: ExecutionStage[] = [];

    // Stage 1: Read operations (all parallel)
    if (categorized.read.length > 0) {
      stages.push(this.createReadStage(categorized.read));
    }

    // Stage 2: Write and Edit operations (parallel by file)
    const writeEditTools = [...categorized.write, ...categorized.edit];
    if (writeEditTools.length > 0) {
      stages.push(this.createWriteEditStage(writeEditTools));
    }

    // Stage 3: Other operations (based on canConcurrent)
    if (categorized.other.length > 0) {
      stages.push(this.createOtherStage(categorized.other, tools));
    }

    // Calculate summary statistics
    const totalGroups = stages.reduce((sum, stage) => sum + stage.groups.length, 0);
    const concurrentGroups = stages.reduce(
      (sum, stage) => sum + stage.groups.filter((g) => g.concurrent).length,
      0
    );

    const plan: ExecutionPlan = {
      stages,
      summary: {
        totalTools: toolCalls.length,
        totalStages: stages.length,
        totalGroups,
        concurrentGroups,
      },
    };

    this.logExecutionPlan(plan);

    return plan;
  }

  /**
   * Categorize tool calls by their category
   */
  private categorizeToolCalls(
    toolCalls: ToolCallInfo[]
  ): Record<ToolCategory | 'read', ToolCallInfo[]> {
    const categorized: Record<string, ToolCallInfo[]> = {
      read: [],
      write: [],
      edit: [],
      other: [],
    };

    for (const toolCall of toolCalls) {
      const metadata = getToolMetadata(toolCall.toolName);
      const category = categorized[metadata.category];
      if (category) {
        category.push(toolCall);
      }
    }

    return categorized as Record<ToolCategory | 'read', ToolCallInfo[]>;
  }

  /**
   * Create read stage - all read operations run in parallel
   */
  private createReadStage(readTools: ToolCallInfo[]): ExecutionStage {
    return {
      name: 'read-stage',
      description: `Reading ${readTools.length} file(s) and gathering context`,
      groups: [
        {
          id: 'read-group-all',
          concurrent: true,
          tools: readTools,
          reason: 'All read operations can run in parallel',
        },
      ],
    };
  }

  /**
   * Create write/edit stage - all operations run sequentially
   * Edit/write tools require user review, so they must be executed one at a time
   */
  private createWriteEditStage(writeEditTools: ToolCallInfo[]): ExecutionStage {
    // Group by target file to maintain logical ordering
    const fileGroups = new Map<string, ToolCallInfo[]>();
    const noFileTools: ToolCallInfo[] = [];

    for (const toolCall of writeEditTools) {
      const metadata = getToolMetadata(toolCall.toolName);
      const targetFile = metadata.getTargetFile?.(toolCall.input);

      if (targetFile) {
        if (!fileGroups.has(targetFile)) {
          fileGroups.set(targetFile, []);
        }
        fileGroups.get(targetFile)?.push(toolCall);
      } else {
        noFileTools.push(toolCall);
      }
    }

    const groups: ExecutionGroup[] = [];

    // All write/edit operations must run sequentially because they require user review
    // Collect all file tools in order
    const allFileTools: ToolCallInfo[] = [];
    const targetFiles: string[] = [];

    for (const [file, tools] of fileGroups.entries()) {
      allFileTools.push(...tools);
      if (!targetFiles.includes(file)) {
        targetFiles.push(file);
      }
    }

    // Add all file tools as a single sequential group
    if (allFileTools.length > 0) {
      const fileCount = fileGroups.size;
      groups.push({
        id: 'write-edit-group-sequential',
        concurrent: false, // Must run sequentially for user review
        tools: allFileTools,
        targetFiles,
        reason:
          fileCount === 1
            ? `Operations on ${allFileTools.length} file(s) require sequential user review`
            : `Operations on ${fileCount} file(s) require sequential user review`,
      });
    }

    // Tools without file targets run serially
    if (noFileTools.length > 0) {
      groups.push({
        id: 'write-edit-group-no-file',
        concurrent: false,
        tools: noFileTools,
        reason: 'Write/edit operations without file targets run serially',
      });
    }

    return {
      name: 'write-edit-stage',
      description: `Writing/editing ${writeEditTools.length} file(s) sequentially`,
      groups,
    };
  }

  /**
   * Create other stage - based on canConcurrent flag
   */
  private createOtherStage(otherTools: ToolCallInfo[], tools: ToolSet): ExecutionStage {
    const groups: ExecutionGroup[] = [];
    let currentGroup: ExecutionGroup | null = null;
    let groupCounter = 0;

    // Group consecutive tools with same canConcurrent value
    for (const toolCall of otherTools) {
      const tool = tools[toolCall.toolName] as any;
      const canConcurrent = tool?.canConcurrent ?? false;

      if (!currentGroup || currentGroup.concurrent !== canConcurrent) {
        currentGroup = {
          id: `other-group-${++groupCounter}`,
          concurrent: canConcurrent,
          tools: [],
          reason: canConcurrent ? 'Tools marked as concurrent' : 'Tools must run sequentially',
        };
        groups.push(currentGroup);
      }

      currentGroup.tools.push(toolCall);
    }

    return {
      name: 'other-stage',
      description: `Executing ${otherTools.length} other operation(s)`,
      groups,
    };
  }

  /**
   * Log execution plan for debugging
   */
  private logExecutionPlan(plan: ExecutionPlan): void {
    logger.info('Generated execution plan', {
      summary: plan.summary,
      stages: plan.stages.map((stage) => ({
        name: stage.name,
        description: stage.description,
        groups: stage.groups.map((group) => ({
          id: group.id,
          concurrent: group.concurrent,
          toolCount: group.tools.length,
          tools: group.tools.map((t) => t.toolName),
          reason: group.reason,
          targetFiles: group.targetFiles,
        })),
      })),
    });
  }
}
