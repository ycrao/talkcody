// src/services/openai-codex-transformer.ts
// Transforms request body for ChatGPT Codex API
// Reference: opencode-openai-codex-auth/lib/request/request-transformer.ts

import { logger } from '@/lib/logger';
import { getCodexInstructions } from './codex-instructions-service';

/**
 * Input item type for Codex API
 */
export interface InputItem {
  type?: string;
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
  id?: string;
  call_id?: string;
  name?: string;
  output?: unknown;
}

/**
 * Reasoning configuration
 */
export interface ReasoningConfig {
  effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  summary: 'auto' | 'detailed' | 'none';
}

/**
 * Request body for Codex API
 */
export interface CodexRequestBody {
  model?: string;
  instructions?: string;
  input?: InputItem[];
  tools?: unknown[];
  store?: boolean;
  stream?: boolean;
  reasoning?: ReasoningConfig;
  text?: { verbosity?: string };
  include?: string[];
  max_output_tokens?: number;
  max_completion_tokens?: number;
  prompt_cache_key?: string;
}

/**
 * Normalize model name to Codex-supported variants
 *
 * For OpenAI OAuth (ChatGPT Plus/Pro), all models are mapped to their Codex variants
 * to ensure proper tool usage and code task handling.
 *
 * Mapping:
 * - gpt-5.2 → gpt-5.2-codex
 * - gpt-5.1 → gpt-5.1-codex
 * - gpt-5 → gpt-5.1-codex
 */
export function normalizeModel(model: string | undefined): string {
  if (!model) return 'gpt-5.1-codex';

  // Strip provider prefix if present (e.g., "openai/gpt-5-codex" → "gpt-5-codex")
  const modelId = model.includes('/') ? (model.split('/').pop() ?? model) : model;
  const normalized = modelId.toLowerCase();

  // Priority order for pattern matching (most specific first):
  // Codex variants - keep as-is
  if (normalized.includes('gpt-5.2-codex') || normalized.includes('gpt 5.2 codex')) {
    return 'gpt-5.2-codex';
  }
  if (normalized.includes('gpt-5.1-codex-max') || normalized.includes('gpt 5.1 codex max')) {
    return 'gpt-5.1-codex-max';
  }
  if (normalized.includes('gpt-5.1-codex-mini') || normalized.includes('gpt 5.1 codex mini')) {
    return 'gpt-5.1-codex-mini';
  }
  if (
    normalized.includes('codex-mini-latest') ||
    normalized.includes('gpt-5-codex-mini') ||
    normalized.includes('gpt 5 codex mini')
  ) {
    return 'codex-mini-latest';
  }
  if (normalized.includes('gpt-5.1-codex') || normalized.includes('gpt 5.1 codex')) {
    return 'gpt-5.1-codex';
  }

  // Non-Codex variants - map to Codex for better tool usage
  if (normalized.includes('gpt-5.2') || normalized.includes('gpt 5.2')) {
    return 'gpt-5.2-codex'; // Map gpt-5.2 → gpt-5.2-codex
  }
  if (normalized.includes('gpt-5.1') || normalized.includes('gpt 5.1')) {
    return 'gpt-5.1-codex'; // Map gpt-5.1 → gpt-5.1-codex
  }
  if (normalized.includes('codex')) {
    return 'gpt-5.1-codex';
  }
  if (normalized.includes('gpt-5') || normalized.includes('gpt 5')) {
    return 'gpt-5.1-codex'; // Map gpt-5 → gpt-5.1-codex
  }

  // Default fallback - use Codex for best tool support
  return 'gpt-5.1-codex';
}

/**
 * Configure reasoning parameters based on model variant
 */
export function getReasoningConfig(modelName: string | undefined): ReasoningConfig {
  const normalizedName = modelName?.toLowerCase() ?? '';

  // Model capability checks
  const isGpt52Codex =
    normalizedName.includes('gpt-5.2-codex') || normalizedName.includes('gpt 5.2 codex');
  const isGpt52General =
    (normalizedName.includes('gpt-5.2') || normalizedName.includes('gpt 5.2')) && !isGpt52Codex;
  const isCodexMax = normalizedName.includes('codex-max') || normalizedName.includes('codex max');
  const isCodexMini =
    normalizedName.includes('codex-mini') ||
    normalizedName.includes('codex mini') ||
    normalizedName.includes('codex-mini-latest');
  const _isCodex = normalizedName.includes('codex') && !isCodexMini;

  // GPT 5.2, GPT 5.2 Codex, and Codex Max support xhigh reasoning
  const supportsXhigh = isGpt52General || isGpt52Codex || isCodexMax;

  // Default based on model type
  const defaultEffort: ReasoningConfig['effort'] = isCodexMini
    ? 'medium'
    : supportsXhigh
      ? 'high'
      : 'medium';

  // Use default effort (user config not supported in this simplified version)
  const effort = defaultEffort;

  return {
    effort,
    summary: 'auto',
  };
}

/**
 * Filter input array for stateless Codex API
 * - Remove AI SDK-specific items (item_reference)
 * - Strip IDs from all remaining items
 */
export function filterInput(input: InputItem[] | undefined): InputItem[] | undefined {
  if (!Array.isArray(input)) return input;

  return input
    .filter((item) => {
      // Remove AI SDK constructs not supported by Codex API
      if (item.type === 'item_reference') {
        return false;
      }
      return true;
    })
    .map((item) => {
      // Strip IDs from all items (Codex API stateless mode)
      if (item.id) {
        const { id: _id, ...itemWithoutId } = item;
        return itemWithoutId as InputItem;
      }
      return item;
    });
}

/**
 * TalkCody-Codex Bridge prompt
 * Tells Codex it's running in TalkCody environment with specific tool mappings
 */
export const TALKCODY_CODEX_BRIDGE = `# Codex Running in TalkCody

You are running Codex through TalkCody, a cross-platform coding assistant. TalkCody provides different tools but follows Codex operating principles.

## CRITICAL: Tool Replacements

<critical_rule priority="0">
❌ APPLY_PATCH DOES NOT EXIST → ✅ USE "edit" INSTEAD
- NEVER use: apply_patch, applyPatch
- ALWAYS use: edit tool for ALL file modifications
- Before modifying files: Verify you're using "edit", NOT "apply_patch"
</critical_rule>

<critical_rule priority="0">
❌ UPDATE_PLAN DOES NOT EXIST → ✅ USE "todowrite" INSTEAD
- NEVER use: update_plan, updatePlan, read_plan, readPlan
- ALWAYS use: todowrite for task/plan updates, todoread to read plans
- Before plan operations: Verify you're using "todowrite", NOT "update_plan"
</critical_rule>

## Available TalkCody Tools

**File Operations:**
- \`write\` - Create new files
- \`edit\` - Modify existing files (REPLACES apply_patch)
- \`read\` - Read file contents

**Search/Discovery:**
- \`grep\` - Search file contents
- \`glob\` - Find files by pattern
- \`list\` - List directories

**Execution:**
- \`bash\` - Run shell commands

**Network:**
- \`webfetch\` - Fetch web content

**Task Management:**
- \`todowrite\` - Manage tasks/plans (REPLACES update_plan)
- \`todoread\` - Read current plan

## Substitution Rules

Base instruction says:    You MUST use instead:
apply_patch           →   edit
update_plan           →   todowrite
read_plan             →   todoread

## Verification Checklist

Before file/plan modifications:
1. Am I using "edit" NOT "apply_patch"?
2. Am I using "todowrite" NOT "update_plan"?
3. Is this tool in the approved list above?

If ANY answer is NO → STOP and correct before proceeding.

## What Remains from Codex

Sandbox policies, approval mechanisms, and file reference formats all follow Codex instructions.`;

/**
 * Add TalkCody bridge message to input if tools are present
 */
export function addBridgeMessage(
  input: InputItem[] | undefined,
  hasTools: boolean
): InputItem[] | undefined {
  if (!hasTools || !Array.isArray(input)) return input;

  const bridgeMessage: InputItem = {
    type: 'message',
    role: 'developer',
    content: [
      {
        type: 'input_text',
        text: TALKCODY_CODEX_BRIDGE,
      },
    ],
  };

  return [bridgeMessage, ...input];
}

/**
 * Transform request body for Codex API
 *
 * @param body - Original request body
 * @param codexInstructions - Codex system instructions from GitHub
 * @returns Transformed request body
 */
export async function transformRequestBody(body: CodexRequestBody): Promise<CodexRequestBody> {
  const originalModel = body.model;
  const normalizedModel = normalizeModel(body.model);

  logger.debug(`[CodexTransformer] Transforming request: ${originalModel} → ${normalizedModel}`);

  // Get Codex instructions for this model family
  const codexInstructions = await getCodexInstructions(normalizedModel);

  // Normalize model name for API call
  body.model = normalizedModel;

  // Codex required fields
  body.store = false; // ChatGPT backend REQUIRES store=false
  body.stream = true; // Always stream
  body.instructions = codexInstructions; // Use Codex instructions, not custom system prompt

  // Filter and transform input
  if (body.input && Array.isArray(body.input)) {
    body.input = filterInput(body.input);

    // Add bridge message for tool awareness
    body.input = addBridgeMessage(body.input, !!body.tools);

    // Handle orphaned function_call_output items
    if (body.input) {
      const functionCallIds = new Set(
        body.input
          .filter((item) => item.type === 'function_call' && item.call_id)
          .map((item) => item.call_id)
      );

      body.input = body.input.map((item) => {
        if (item.type === 'function_call_output' && !functionCallIds.has(item.call_id)) {
          // Convert orphaned output to message to preserve context
          const toolName = typeof item.name === 'string' ? item.name : 'tool';
          const callId = item.call_id ?? '';
          let text: string;
          try {
            text = typeof item.output === 'string' ? item.output : JSON.stringify(item.output);
          } catch {
            text = String(item.output ?? '');
          }
          if (text.length > 16000) {
            text = `${text.slice(0, 16000)}\n...[truncated]`;
          }
          return {
            type: 'message',
            role: 'assistant',
            content: `[Previous ${toolName} result; call_id=${callId}]: ${text}`,
          } as InputItem;
        }
        return item;
      });
    }
  }

  // Configure reasoning
  const reasoningConfig = getReasoningConfig(normalizedModel);
  body.reasoning = {
    ...body.reasoning,
    ...reasoningConfig,
  };

  // Configure text verbosity
  body.text = {
    ...body.text,
    verbosity: 'medium',
  };

  // Add include for encrypted reasoning content
  body.include = ['reasoning.encrypted_content'];

  // Remove unsupported parameters
  body.max_output_tokens = undefined;
  body.max_completion_tokens = undefined;

  logger.debug('[CodexTransformer] Request transformed', {
    model: body.model,
    hasInstructions: !!body.instructions,
    inputCount: body.input?.length,
    toolsCount: body.tools?.length,
  });

  return body;
}

/**
 * Check if a model requires Codex transformation (ChatGPT OAuth models)
 */
export function isCodexModel(model: string | undefined): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  return (
    lower.includes('gpt-5') ||
    lower.includes('codex') ||
    lower.includes('gpt 5') ||
    lower.includes('gpt-5.1') ||
    lower.includes('gpt-5.2')
  );
}
