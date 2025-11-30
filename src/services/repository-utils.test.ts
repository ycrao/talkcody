import { beforeEach, describe, expect, it, vi } from 'vitest';

// Override the global mock from setup.ts for this specific test
vi.mock('@tauri-apps/api/path', () => ({
  join: vi.fn(),
  normalize: vi.fn(),
}));

// Since we need to test the actual implementation, not the global mock, we need to unmock it
vi.unmock('./repository-utils');

import { join, normalize } from '@tauri-apps/api/path';
import { normalizeFilePath } from './repository-utils';

const mockJoin = vi.mocked(join);
const mockNormalize = vi.mocked(normalize);

describe('normalizeFilePath', () => {
  const rootPath = '/root/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return normalized path for absolute Unix paths', async () => {
    const filePath = '/Users/test/file.txt';
    mockNormalize.mockResolvedValueOnce('/Users/test/file.txt');

    const result = await normalizeFilePath(rootPath, filePath);

    expect(result).toBe('/Users/test/file.txt');
    expect(mockNormalize).toHaveBeenCalledWith(filePath);
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it('should return normalized path for absolute Windows paths', async () => {
    const filePath = 'C:\\Users\\test\\file.txt';
    mockNormalize.mockResolvedValueOnce('C:\\Users\\test\\file.txt');

    const result = await normalizeFilePath(rootPath, filePath);

    expect(result).toBe('C:\\Users\\test\\file.txt');
    expect(mockNormalize).toHaveBeenCalledWith(filePath);
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it('should join root path when receiving relative paths', async () => {
    const relativePath = 'src/file.ts';
    const joinedPath = `${rootPath}/${relativePath}`;

    mockJoin.mockResolvedValueOnce(joinedPath);
    mockNormalize.mockResolvedValueOnce(joinedPath);

    const result = await normalizeFilePath(rootPath, relativePath);

    expect(mockJoin).toHaveBeenCalledWith(rootPath, relativePath);
    expect(mockNormalize).toHaveBeenCalledWith(joinedPath);
    expect(result).toBe(joinedPath);
  });

  it('should normalize dot segments within paths', async () => {
    const relativePath = './src/../file.ts';
    const joinedPath = `${rootPath}/./src/../file.ts`;
    const normalizedPath = `${rootPath}/file.ts`;

    mockJoin.mockResolvedValueOnce(joinedPath);
    mockNormalize.mockResolvedValueOnce(normalizedPath);

    const result = await normalizeFilePath(rootPath, relativePath);

    expect(mockJoin).toHaveBeenCalledWith(rootPath, relativePath);
    expect(mockNormalize).toHaveBeenCalledWith(joinedPath);
    expect(result).toBe(normalizedPath);
  });
});
