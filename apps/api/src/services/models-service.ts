import modelsConfig from '@talkcody/shared/data/models-config.json';

export interface ModelConfig {
  name: string;
  imageInput?: boolean;
  audioInput?: boolean;
  imageOutput?: boolean;
  providers: string[]; // Will be validated against ProviderIds at runtime
  providerMappings?: Record<string, string>;
  pricing?: { input: string; output: string };
}

export interface ModelsConfiguration {
  version: string;
  models: Record<string, ModelConfig>;
}

export interface ModelVersionResponse {
  version: string;
}

/**
 * ModelsService handles model configuration data on the API side
 */
export class ModelsService {
  /**
   * Get the current version timestamp
   */
  getVersion(): ModelVersionResponse {
    return {
      version: (modelsConfig as ModelsConfiguration).version,
    };
  }

  /**
   * Get the complete models configuration
   */
  getConfigs(): ModelsConfiguration {
    return modelsConfig as ModelsConfiguration;
  }

  /**
   * Get a specific model configuration by key
   */
  getModel(modelKey: string): ModelConfig | null {
    const config = modelsConfig as ModelsConfiguration;
    return config.models[modelKey] || null;
  }

  /**
   * Get all model keys
   */
  getModelKeys(): string[] {
    const config = modelsConfig as ModelsConfiguration;
    return Object.keys(config.models);
  }

  /**
   * Get models count
   */
  getModelsCount(): number {
    const config = modelsConfig as ModelsConfiguration;
    return Object.keys(config.models).length;
  }
}

// Export singleton instance
export const modelsService = new ModelsService();
