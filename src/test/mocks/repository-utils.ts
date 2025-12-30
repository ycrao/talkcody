// src/test/mocks/repository-utils.ts
// Centralized mock for ../services/repository-utils

import { vi } from 'vitest';

export const createMockNormalizeFilePath = () =>
  vi.fn().mockImplementation(async (root: string, path: string) => {
    // If path is already absolute (starts with /), return it as-is
    if (path.startsWith('/')) {
      return path;
    }
    // Otherwise, join with root
    return `${root}/${path}`;
  });

export const mockRepositoryUtils = {
  normalizeFilePath: createMockNormalizeFilePath(),
};

/**
 * Mock module for vi.mock('../services/repository-utils', ...)
 */
export default mockRepositoryUtils;
