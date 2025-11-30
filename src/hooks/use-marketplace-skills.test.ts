// Tests for useMarketplaceSkills hook

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/services/api-client';
import { useMarketplaceSkills } from './use-marketplace-skills';

// Mock dependencies
vi.mock('@/services/api-client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useMarketplaceSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('installSkill', () => {
    it('should successfully track skill installation with version parameter', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ message: 'Installation tracked successfully' }),
      };

      vi.mocked(apiClient.post).mockResolvedValue(mockResponse as unknown as Response);

      const { result } = renderHook(() => useMarketplaceSkills());

      const slug = 'test-skill-slug';
      const version = '1.0.0';

      await result.current.installSkill(slug, version);

      // Verify API was called with correct parameters
      expect(apiClient.post).toHaveBeenCalledWith(
        `/api/skills-marketplace/skills/${slug}/install`,
        { version }
      );

      expect(apiClient.post).toHaveBeenCalledTimes(1);
    });

    it('should throw error when version parameter is missing (backend returns 400)', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: 'Version is required' }),
      };

      vi.mocked(apiClient.post).mockResolvedValue(mockResponse as unknown as Response);

      const { result } = renderHook(() => useMarketplaceSkills());

      const slug = 'test-skill-slug';
      const version = ''; // Empty version to simulate the bug

      await expect(result.current.installSkill(slug, version)).rejects.toThrow(
        'Failed to track skill installation'
      );
    });

    it('should handle API call failure gracefully', async () => {
      const mockError = new Error('Network error');

      vi.mocked(apiClient.post).mockRejectedValue(mockError);

      const { result } = renderHook(() => useMarketplaceSkills());

      const slug = 'test-skill-slug';
      const version = '1.0.0';

      await expect(result.current.installSkill(slug, version)).rejects.toThrow('Network error');

      expect(apiClient.post).toHaveBeenCalledWith(
        `/api/skills-marketplace/skills/${slug}/install`,
        { version }
      );
    });

    it('should handle non-ok response from API', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'Internal server error' }),
      };

      vi.mocked(apiClient.post).mockResolvedValue(mockResponse as unknown as Response);

      const { result } = renderHook(() => useMarketplaceSkills());

      const slug = 'test-skill-slug';
      const version = '1.0.0';

      await expect(result.current.installSkill(slug, version)).rejects.toThrow(
        'Failed to track skill installation'
      );
    });

    it('should correctly pass different version formats', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ message: 'Installation tracked successfully' }),
      };

      vi.mocked(apiClient.post).mockResolvedValue(mockResponse as unknown as Response);

      const { result } = renderHook(() => useMarketplaceSkills());

      const testCases = [
        { slug: 'skill-1', version: '1.0.0' },
        { slug: 'skill-2', version: '2.1.3' },
        { slug: 'skill-3', version: '0.0.1-beta' },
      ];

      for (const testCase of testCases) {
        await result.current.installSkill(testCase.slug, testCase.version);

        expect(apiClient.post).toHaveBeenCalledWith(
          `/api/skills-marketplace/skills/${testCase.slug}/install`,
          { version: testCase.version }
        );
      }

      expect(apiClient.post).toHaveBeenCalledTimes(testCases.length);
    });
  });
});
