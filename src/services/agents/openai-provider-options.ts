/**
 * OpenAI Provider Options for AI SDK
 *
 * IMPORTANT: When using OpenAI OAuth (ChatGPT Plus/Pro), the `instructions` and
 * `reasoningEffort` fields set here will be OVERRIDDEN by the Codex transformer
 * in `src/services/openai-codex-transformer.ts`.
 *
 * For OAuth requests:
 * - `instructions` → Replaced with official Codex instructions from GitHub
 * - `reasoningEffort` → Configured based on model family (e.g., 'high' for Codex Max)
 *
 * For standard OpenAI API (with API key):
 * - These options are used as-is
 */

export const OPENAI_FALLBACK_INSTRUCTIONS =
  'You are TalkCody, a cross-platform coding assistant. Always follow the latest user request carefully.';

export interface OpenAIProviderOptionsConfig {
  enableReasoning: boolean;
  systemPrompt?: string;
}

export interface OpenAIProviderOptions {
  instructions: string;
  reasoningEffort?: 'medium';
}

/**
 * Build OpenAI provider options for AI SDK.
 *
 * Note: When using OpenAI OAuth, these options will be overridden by the Codex
 * transformer to use official Codex instructions and model-specific reasoning config.
 */
export function buildOpenAIProviderOptions({
  enableReasoning,
  systemPrompt,
}: OpenAIProviderOptionsConfig): OpenAIProviderOptions {
  const instructions = systemPrompt?.trim() || OPENAI_FALLBACK_INSTRUCTIONS;
  const options: OpenAIProviderOptions = {
    instructions,
  };

  if (enableReasoning) {
    options.reasoningEffort = 'medium';
  }

  return options;
}
