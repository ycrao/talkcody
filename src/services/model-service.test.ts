import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelType } from '@/types/model-types';
import type { AgentDefinition } from '@/types/agent';
import { settingsManager } from '@/stores/settings-store';
import { agentRegistry } from './agents/agent-registry';
import { logger } from '@/lib/logger';
import { modelService } from '@/providers/models/model-service';

// Mock dependencies
vi.mock('@/providers/config/model-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/providers/config/model-config')>();
  return {
    ...actual,
  };
});

vi.mock('@/stores/settings-store', () => ({
  settingsManager: {
    getAgentId: vi.fn().mockResolvedValue('coding'),
    get: vi.fn(),
    getApiKeys: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('./agents/agent-registry', () => ({
  agentRegistry: {
    getWithResolvedTools: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./model-sync-service', () => ({
  modelSyncService: {
    initialize: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/providers/models/model-type-service', () => ({
  modelTypeService: {
    resolveModelType: vi.fn(),
  },
}));

describe('ModelService - getCurrentModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use modelTypeService.resolveModelType to get the model', async () => {
    const { modelTypeService } = await import('@/providers/models/model-type-service');

    const mockAgent: AgentDefinition = {
      id: 'coding',
      name: 'Coding Agent',
      modelType: ModelType.MAIN,
      systemPrompt: 'Test prompt',
      isDefault: true,
    };

    vi.mocked(settingsManager.getAgentId).mockResolvedValue('coding');
    vi.mocked(agentRegistry.getWithResolvedTools).mockResolvedValue(mockAgent);
    vi.mocked(modelTypeService.resolveModelType).mockResolvedValue('gpt-4@openai');

    const result = await modelService.getCurrentModel();

    expect(result).toBe('gpt-4@openai');
    expect(settingsManager.getAgentId).toHaveBeenCalled();
    expect(agentRegistry.getWithResolvedTools).toHaveBeenCalledWith('coding');
    expect(modelTypeService.resolveModelType).toHaveBeenCalledWith(ModelType.MAIN);
  });

  it('should fallback to planner agent if specified agent not found', async () => {
    const { modelTypeService } = await import('@/providers/models/model-type-service');

    const mockAgent: AgentDefinition = {
      id: 'planner',
      name: 'Planner Agent',
      modelType: ModelType.MAIN,
      systemPrompt: 'Test prompt',
      isDefault: true,
    };

    vi.mocked(settingsManager.getAgentId).mockResolvedValue('non-existent');
    vi.mocked(agentRegistry.getWithResolvedTools)
      .mockResolvedValueOnce(undefined) // First call returns undefined
      .mockResolvedValueOnce(mockAgent); // Second call returns planner
    vi.mocked(modelTypeService.resolveModelType).mockResolvedValue('claude-3@anthropic');

    const result = await modelService.getCurrentModel();

    expect(result).toBe('claude-3@anthropic');
    expect(logger.warn).toHaveBeenCalledWith(
      'Agent with ID "non-existent" not found, falling back to default \'planner\' agent',
    );
    expect(agentRegistry.getWithResolvedTools).toHaveBeenCalledWith('non-existent');
    expect(agentRegistry.getWithResolvedTools).toHaveBeenCalledWith('planner');
  });

  it('should return empty string if no agent found even after fallback', async () => {
    vi.mocked(settingsManager.getAgentId).mockResolvedValue('coding');
    vi.mocked(agentRegistry.getWithResolvedTools).mockResolvedValue(undefined);

    const result = await modelService.getCurrentModel();

    expect(result).toBe('');
    expect(logger.error).toHaveBeenCalledWith('Unable to resolve any agent, including fallback planner agent');
  });

  it('should return empty string if agent has no modelType', async () => {
    const mockAgent = {
      id: 'coding',
      name: 'Coding Agent',
      systemPrompt: 'Test prompt',
      isDefault: true,
      // modelType is missing
    } as AgentDefinition;

    vi.mocked(settingsManager.getAgentId).mockResolvedValue('coding');
    vi.mocked(agentRegistry.getWithResolvedTools).mockResolvedValue(mockAgent);

    const result = await modelService.getCurrentModel();

    expect(result).toBe('');
    expect(logger.warn).toHaveBeenCalledWith('Agent has no modelType defined');
  });

  // BUG FIX TEST: This test verifies the fix for the "No available provider for model" issue
  // where new users with empty model settings get the default model instead of empty string
  it('should return default model when settings are empty (bug fix for new users)', async () => {
    const { modelTypeService } = await import('@/providers/models/model-type-service');

    const mockAgent: AgentDefinition = {
      id: 'coding',
      name: 'Coding Agent',
      modelType: ModelType.MAIN,
      systemPrompt: 'Test prompt',
      isDefault: true,
    };

    vi.mocked(settingsManager.getAgentId).mockResolvedValue('coding');
    vi.mocked(agentRegistry.getWithResolvedTools).mockResolvedValue(mockAgent);
    // Simulate new user scenario: modelTypeService resolves to default GLM 4.6
    vi.mocked(modelTypeService.resolveModelType).mockResolvedValue('glm-4.6@aiGateway');

    const result = await modelService.getCurrentModel();

    // Should return the default model, not empty string
    expect(result).toBe('glm-4.6@aiGateway');
    expect(modelTypeService.resolveModelType).toHaveBeenCalledWith(ModelType.MAIN);
  });

  // Additional test to ensure resolveModelType is called for all model types
  it('should use resolveModelType for different model types', async () => {
    const { modelTypeService } = await import('@/providers/models/model-type-service');

    const testCases = [
      { modelType: ModelType.MAIN, expectedModel: 'glm-4.6@aiGateway' },
      { modelType: ModelType.SMALL, expectedModel: 'glm-4.6@aiGateway' },
      { modelType: ModelType.IMAGE_GENERATOR, expectedModel: 'nano-banana@aiGateway' },
      { modelType: ModelType.TRANSCRIPTION, expectedModel: 'whisper-1@openai' },
    ];

    for (const testCase of testCases) {
      vi.clearAllMocks();

      const mockAgent: AgentDefinition = {
        id: 'test-agent',
        name: 'Test Agent',
        modelType: testCase.modelType,
        systemPrompt: 'Test prompt',
        isDefault: true,
      };

      vi.mocked(settingsManager.getAgentId).mockResolvedValue('test-agent');
      vi.mocked(agentRegistry.getWithResolvedTools).mockResolvedValue(mockAgent);
      vi.mocked(modelTypeService.resolveModelType).mockResolvedValue(testCase.expectedModel);

      const result = await modelService.getCurrentModel();

      expect(result).toBe(testCase.expectedModel);
      expect(modelTypeService.resolveModelType).toHaveBeenCalledWith(testCase.modelType);
    }
  });
});
