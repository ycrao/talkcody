import { create } from 'zustand';
import { logger } from '@/lib/logger';
import { MODEL_CONFIGS } from '@/lib/models';
import { modelService } from '@/services/model-service';
import type { AvailableModel } from '@/types/api-keys';

interface ModelState {
  availableModels: AvailableModel[];
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
}

interface ModelStore extends ModelState {
  // Actions
  loadModels: () => Promise<void>;
  refreshModels: () => Promise<void>;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  // Initial state
  availableModels: [],
  isLoading: false,
  error: null,
  isInitialized: false,

  /**
   * Load available models from model service
   * Only loads once unless explicitly refreshed
   */
  loadModels: async () => {
    const { isInitialized, isLoading } = get();

    // Prevent duplicate loading
    if (isInitialized || isLoading) {
      return;
    }

    try {
      set({ isLoading: true, error: null });
      const models = await modelService.getAvailableModels();
      logger.info('Loaded available models', {
        count: models.length,
        models: models.map((m) => m.name),
      });
      set({
        availableModels: models,
        isLoading: false,
        isInitialized: true,
      });
      logger.info(`Loaded ${models.length} available models`);
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error('Failed to load available models:', errorMessage);

      // Fallback to all models if service fails
      const fallbackModels = Object.keys(MODEL_CONFIGS).map((key) => {
        const config = MODEL_CONFIGS[key as keyof typeof MODEL_CONFIGS];
        return {
          key,
          name: config?.name ?? key,
          provider: 'unknown',
          providerName: 'Unknown',
          imageInput: config?.imageInput ?? false,
          imageOutput: config?.imageOutput ?? false,
          audioInput: config?.audioInput ?? false,
          priority: 999,
        };
      });

      set({
        availableModels: fallbackModels,
        error: errorMessage,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  /**
   * Force refresh models from model service
   * Used when API keys are updated
   */
  refreshModels: async () => {
    try {
      set({ isLoading: true, error: null });
      const models = await modelService.getAvailableModels();
      set({
        availableModels: models,
        isLoading: false,
      });
      logger.info(`Refreshed ${models.length} available models`);
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error('Failed to refresh available models:', errorMessage);
      set({
        error: errorMessage,
        isLoading: false,
      });
    }
  },
}));
