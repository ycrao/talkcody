// src/test/mocks/task-manager.ts
// Centralized mock for ../services/task-manager

import { vi } from 'vitest';

export const createMockTaskManager = (
  overrides: { getTaskSettings?: unknown; updateTaskSettings?: unknown } = {}
) => ({
  getTaskSettings: vi.fn().mockResolvedValue(overrides.getTaskSettings ?? null),
  updateTaskSettings: vi.fn().mockResolvedValue(overrides.updateTaskSettings ?? undefined),
});

export const mockTaskManager = {
  TaskManager: createMockTaskManager(),
};

/**
 * Mock module for vi.mock('../services/task-manager', ...)
 */
export default mockTaskManager;
