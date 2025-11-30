// src/services/prompt/provider-registry.ts
import type { PromptContextProvider } from '@/types/prompt';
import { AgentsMdProvider } from './providers/agents-md-provider';
import { EnvProvider } from './providers/env-provider';
import { SkillsProvider } from './providers/skills-provider';

export class ProviderRegistry {
  private providers: Map<string, PromptContextProvider> = new Map();

  constructor() {
    this.register(EnvProvider);
    this.register(AgentsMdProvider());
    this.register(SkillsProvider);
  }

  register(provider: PromptContextProvider) {
    this.providers.set(provider.id, provider);
  }

  getAll(): PromptContextProvider[] {
    return Array.from(this.providers.values());
  }

  getByIds(ids: string[]): PromptContextProvider[] {
    const idSet = new Set(ids);
    return this.getAll().filter((p) => idSet.has(p.id));
  }

  // Build providers using optional per-provider settings
  buildProviders(ids: string[], providerSettings?: Record<string, any>): PromptContextProvider[] {
    const result: PromptContextProvider[] = [];
    const idSet = new Set(ids);
    if (idSet.has('env')) result.push(EnvProvider);
    if (idSet.has('agents_md')) result.push(AgentsMdProvider(providerSettings?.agents_md));
    if (idSet.has('skills')) result.push(SkillsProvider);
    return result;
  }
}

export const defaultProviderRegistry = new ProviderRegistry();
