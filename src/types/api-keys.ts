// src/types/api-keys.ts
import type { ProviderDefinition, ProviderIds } from '@/providers';

// Re-export ProviderDefinition as ProviderConfig for backward compatibility
export type ProviderConfig = ProviderDefinition;

// Generate ApiKeySettings from provider definitions
export type ApiKeySettings = {
  [K in ProviderIds]?: string;
};

export interface ModelProviderMapping {
  model: string;
  providers: ProviderConfig[];
}

export interface AvailableModel {
  key: string;
  name: string;
  provider: string;
  providerName: string;
  imageInput: boolean;
  imageOutput: boolean;
  audioInput: boolean;
  priority: number;
}
