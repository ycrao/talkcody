// src/lib/provider-utils.ts
// Pure utility functions for provider/model operations - no state management

import { logger } from '@/lib/logger';
import { getProvidersForModel, MODEL_CONFIGS } from '@/lib/models';
import { createCustomProvider } from '@/providers/custom-provider-factory';
import { PROVIDER_CONFIGS } from '@/providers/provider_config';
import { isLocalProvider } from '@/services/custom-model-service';
import type { ProviderDefinition } from '@/types';
import type { AvailableModel } from '@/types/api-keys';
import type { CustomProviderConfig } from '@/types/custom-provider';
import type { ModelConfig } from '@/types/models';

// Type for provider factory function (returns a function that creates model instances)
export type ProviderFactory = (modelName: string) => any;

/**
 * Parse model identifier into modelKey and provider
 * Supports both formats:
 * - "modelKey@provider" (new format with explicit provider)
 * - "modelKey" (legacy format)
 */
export function parseModelIdentifier(modelIdentifier: string): {
  modelKey: string;
  providerId: string | null;
} {
  const parts = modelIdentifier.split('@');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { modelKey: parts[0], providerId: parts[1] };
  }
  return { modelKey: modelIdentifier, providerId: null };
}

/**
 * Resolve the provider-specific model name
 * Some providers use different model names (e.g., "gpt-4" vs "gpt-4-turbo")
 */
export function resolveProviderModelName(modelKey: string, providerId: string): string {
  const config = MODEL_CONFIGS[modelKey as keyof typeof MODEL_CONFIGS];
  return config?.providerMappings?.[providerId] || modelKey;
}

/**
 * Check if API key is configured for a provider
 */
export function hasApiKeyForProvider(
  providerId: string,
  apiKeys: Record<string, string | undefined>
): boolean {
  // TalkCody Free is always available - auth check happens at usage time
  if (providerId === 'talkcody') {
    return true;
  }

  // Local providers (Ollama, LM Studio) use 'enabled' instead of API key
  if (isLocalProvider(providerId)) {
    return apiKeys[providerId] === 'enabled';
  }

  const apiKey = apiKeys[providerId];
  return !!(apiKey && typeof apiKey === 'string' && apiKey.trim());
}

/**
 * Get the best available provider for a model based on API key availability
 */
export function getBestProvider(
  modelKey: string,
  apiKeys: Record<string, string | undefined>,
  customProviders: CustomProviderConfig[]
): string | null {
  const providers = getProvidersForModel(modelKey);

  for (const provider of providers) {
    // Check built-in provider
    if (hasApiKeyForProvider(provider.id, apiKeys)) {
      return provider.id;
    }

    // Check custom provider
    const customProvider = customProviders.find((cp) => cp.id === provider.id && cp.enabled);
    if (customProvider) {
      return provider.id;
    }
  }

  return null;
}

/**
 * Create provider definition from custom provider config
 */
export function createProviderDefinitionFromCustomConfig(
  config: CustomProviderConfig
): ProviderDefinition {
  const apiKeyName = `custom_${config.id}`;

  return {
    id: config.id,
    name: config.name,
    apiKeyName,
    baseUrl: config.baseUrl,
    required: true,
    type: config.type === 'anthropic' ? 'custom' : 'openai-compatible',
    isCustom: true,
    customConfig: config,
    createProvider: (apiKey: string, baseUrl?: string) => {
      return createCustomProvider(config, apiKey, baseUrl);
    },
  };
}

/**
 * Create all provider factory instances based on API keys and configs
 */
export function createProviders(
  apiKeys: Record<string, string | undefined>,
  providerConfigs: Map<string, ProviderDefinition>,
  baseUrls: Map<string, string>,
  useCodingPlanSettings: Map<string, boolean>
): Map<string, ProviderFactory> {
  const providers = new Map<string, ProviderFactory>();

  for (const [providerId, providerDef] of providerConfigs) {
    let apiKey = apiKeys[providerId];

    // For custom providers, get API key from custom provider config
    if (providerDef.isCustom && providerDef.customConfig) {
      apiKey = providerDef.customConfig.apiKey;
    }

    // TalkCody Free uses JWT auth, not API key - always create it
    const isTalkCody = providerId === 'talkcody';

    // Skip if no API key (except for special providers)
    if (!apiKey && !isTalkCody) {
      logger.debug(`Skipping provider ${providerId}: no API key configured`);
      continue;
    }

    // For ollama/lmstudio, check if enabled
    if ((providerId === 'ollama' || providerId === 'lmstudio') && apiKey !== 'enabled') {
      continue;
    }

    // Create provider using the definition's factory function
    if (providerDef.createProvider) {
      // Use custom base URL if set, otherwise use the default from provider definition
      let customBaseUrl = baseUrls.get(providerId);

      // Special handling for providers with Coding Plan: determine base URL based on useCodingPlan setting
      if (!customBaseUrl) {
        const useCodingPlan = useCodingPlanSettings.get(providerId);
        if (useCodingPlan && providerDef.codingPlanBaseUrl) {
          customBaseUrl = providerDef.codingPlanBaseUrl;
        }
      }

      const baseUrl = customBaseUrl || providerDef.baseUrl;
      try {
        // For talkcody, apiKey is not used (uses JWT auth), pass empty string
        const createdProvider = providerDef.createProvider(apiKey || '', baseUrl);
        providers.set(providerId, createdProvider);
      } catch (error) {
        logger.error(`Failed to create provider ${providerId}:`, error);
      }
    } else {
      logger.warn(`Provider ${providerId} has no createProvider function`);
    }
  }

  logger.info(`Created ${providers.size} providers`);
  return providers;
}

/**
 * Compute available models based on API keys and provider configs
 * Uses Map for O(1) deduplication to prevent duplicate entries when
 * the same model exists in both built-in MODEL_CONFIGS and customModels
 */
export function computeAvailableModels(
  apiKeys: Record<string, string | undefined>,
  providerConfigs: Map<string, ProviderDefinition>,
  customProviders: CustomProviderConfig[],
  customModels: Record<string, ModelConfig>
): AvailableModel[] {
  // Use Map for O(1) deduplication lookup - key is "${modelKey}-${providerId}"
  const modelMap = new Map<string, AvailableModel>();

  // Helper to add model only if not already exists (built-in models take priority)
  const addModel = (model: AvailableModel) => {
    const key = `${model.key}-${model.provider}`;
    if (!modelMap.has(key)) {
      modelMap.set(key, model);
    }
  };

  // 1. Iterate through all built-in models (added first, so they take priority)
  for (const [modelKey, modelConfig] of Object.entries(MODEL_CONFIGS)) {
    if (!modelConfig) continue;

    // Find all available providers for this model
    const providers = getProvidersForModel(modelKey);
    const availableProviders = providers.filter((provider) => {
      // Check built-in provider
      if (hasApiKeyForProvider(provider.id, apiKeys)) {
        return true;
      }
      // Check custom provider
      const customProvider = customProviders.find((cp) => cp.id === provider.id && cp.enabled);
      return !!customProvider;
    });

    // Create a model entry for each available provider
    for (const provider of availableProviders) {
      addModel({
        key: modelKey,
        name: modelConfig.name,
        provider: provider.id,
        providerName: provider.name,
        imageInput: modelConfig.imageInput ?? false,
        imageOutput: modelConfig.imageOutput ?? false,
        audioInput: modelConfig.audioInput ?? false,
      });
    }
  }

  // 2. Add custom models (skip if already exists from built-in)
  const customProviderIds = new Set(customProviders.filter((p) => p.enabled).map((p) => p.id));

  for (const [modelKey, modelConfig] of Object.entries(customModels)) {
    // Custom models have explicit providers, check if provider is available
    for (const providerId of modelConfig.providers) {
      // Check if it's a built-in provider with API key, or an enabled custom provider
      const isBuiltInWithKey = hasApiKeyForProvider(providerId, apiKeys);
      const isCustomProviderEnabled = customProviderIds.has(providerId);

      if (isBuiltInWithKey || isCustomProviderEnabled) {
        // Get provider name from built-in config or custom provider
        let providerName = providerId;
        const builtInConfig = PROVIDER_CONFIGS[providerId as keyof typeof PROVIDER_CONFIGS];
        if (builtInConfig) {
          providerName = builtInConfig.name;
        } else {
          const customProvider = customProviders.find((p) => p.id === providerId);
          if (customProvider) {
            providerName = customProvider.name;
          }
        }

        addModel({
          key: modelKey,
          name: modelConfig.name,
          provider: providerId,
          providerName,
          imageInput: modelConfig.imageInput ?? false,
          imageOutput: modelConfig.imageOutput ?? false,
          audioInput: modelConfig.audioInput ?? false,
        });
      }
    }
  }

  // Sort by name and return
  return Array.from(modelMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Check if a specific model is available
 */
export function isModelAvailable(
  modelIdentifier: string,
  apiKeys: Record<string, string | undefined>,
  customProviders: CustomProviderConfig[]
): boolean {
  const { modelKey, providerId } = parseModelIdentifier(modelIdentifier);

  if (providerId) {
    // Check specific provider
    if (hasApiKeyForProvider(providerId, apiKeys)) {
      return true;
    }
    // Check if it's an enabled custom provider
    const isCustomProviderEnabled = customProviders.some((p) => p.id === providerId && p.enabled);
    return isCustomProviderEnabled;
  }

  // Check if any provider is available
  const provider = getBestProvider(modelKey, apiKeys, customProviders);
  return provider !== null;
}

/**
 * Build provider configs map from built-in and custom providers
 */
export function buildProviderConfigs(
  customProviders: CustomProviderConfig[]
): Map<string, ProviderDefinition> {
  const configs = new Map<string, ProviderDefinition>();

  // Add built-in providers
  for (const [id, definition] of Object.entries(PROVIDER_CONFIGS)) {
    configs.set(id, definition);
  }

  // Add custom providers
  for (const customProvider of customProviders.filter((p) => p.enabled)) {
    const definition = createProviderDefinitionFromCustomConfig(customProvider);
    configs.set(customProvider.id, definition);
  }

  return configs;
}
