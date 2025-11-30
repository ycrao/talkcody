// src/types/prompt.ts
// Types for dynamic system prompt composition and provider-based context injection

import type { AgentDefinition } from './agent';

export type PromptTemplate = {
  baseSystem: string;
  rules: string[];
  outputFormat: string;
};

export type PromptBuildOptions = {
  agent: AgentDefinition;
  extraVariables?: Record<string, string>;
  // The current opened repository root path
  workspaceRoot: string;
  // Optional: current working directory for context-aware providers
  currentWorkingDirectory?: string;
  // Optional: recently accessed file paths for context-aware providers
  recentFilePaths?: string[];
  // Optional: conversation ID for conversation-scoped providers
  conversationId?: string;
};

export type PromptBuildResult = {
  finalSystemPrompt: string;
  unresolvedPlaceholders: string[];
};

export type InjectionPlacement = 'append' | 'prepend' | { anchorToken: string };

export type ProviderInjection = {
  enabledByDefault: boolean;
  placement: InjectionPlacement;
  sectionTitle: string;
  // Render a standard auto-injected section; values contains resolved token values
  sectionTemplate: (values: Record<string, string>) => string;
};

export type ResolveContext = {
  workspaceRoot: string;
  // Optional: current working directory for hierarchical AGENTS.md lookup
  currentWorkingDirectory?: string;
  // Optional: recently accessed file paths for context-aware lookup
  recentFilePaths?: string[];
  // Optional: conversation ID for conversation-scoped providers (e.g., skills)
  conversationId?: string;
  // Optional: agent ID for agent-scoped providers (e.g., skills)
  agentId?: string;
  cache: Map<string, unknown>;
  readFile: (rootPath: string, filePath: string) => Promise<string>;
};

export interface PromptContextProvider {
  id: string;
  label: string;
  description: string;
  badges?: string[];
  providedTokens(): string[];
  canResolve(token: string): boolean;
  resolve(token: string, ctx: ResolveContext): Promise<string | undefined>;
  // Auto-injection description; if absent, provider only resolves explicit placeholders
  injection?: ProviderInjection;
}
