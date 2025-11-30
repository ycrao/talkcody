// src/services/ai-pricing-service.ts

import { logger } from '@/lib/logger';
import { MODEL_CONFIGS } from '@/lib/models';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
}

class AIPricingService {
  private getModel(modelId: string) {
    return MODEL_CONFIGS[modelId];
  }

  calculateCost(modelId: string, usage: TokenUsage): number {
    const model = this.getModel(modelId);
    logger.info('model', model);
    logger.info('TokenUsage', usage);
    if (!model?.pricing) {
      logger.error(`Pricing information not available for model: ${modelId}`);
      return 0;
    }

    let cost = 0;
    cost += usage.inputTokens * (Number.parseFloat(model.pricing.input) || 0);
    cost += usage.outputTokens * (Number.parseFloat(model.pricing.output) || 0);
    logger.info('cost', cost);

    return cost;
  }
}

export const aiPricingService = new AIPricingService();
