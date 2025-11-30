export interface ModelConfig {
  name: string;
  imageInput?: boolean;
  audioInput?: boolean;
  imageOutput?: boolean;
  providers: string[]; // Will be validated against ProviderIds at runtime
  providerMappings?: Record<string, string>;
  pricing?: { input: string; output: string };
}

/**
 * Complete models configuration with version info
 */
export interface ModelsConfiguration {
  version: string; // ISO 8601 timestamp
  models: Record<string, ModelConfig>;
}

/**
 * Model version response from API
 */
export interface ModelVersionResponse {
  version: string; // ISO 8601 timestamp
}

/**
 * Type for model keys
 */
export type ModelKey = string;
