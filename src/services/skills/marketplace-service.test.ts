/**
 * Marketplace Service Tests
 *
 * Tests for skill installation, cleanup, and temp directory management
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceService } from './marketplace-service';
import type { InstallSkillRequest, SkillInstallResult } from './marketplace-service';
import type { MarketplaceSkillMetadata } from '@/types/marketplace-skill';

// Mock dependencies
vi.mock('@tauri-apps/api/path', () => ({
	appDataDir: vi.fn().mockResolvedValue('/test/app-data'),
	join: vi.fn().mockImplementation(async (...paths: string[]) => paths.join('/')),
	dirname: vi.fn().mockImplementation(async (path: string) => {
		const parts = path.split('/');
		parts.pop();
		return parts.join('/') || '/';
	}),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
	exists: vi.fn().mockResolvedValue(false),
	mkdir: vi.fn().mockResolvedValue(undefined),
	remove: vi.fn().mockResolvedValue(undefined),
	readFile: vi.fn().mockResolvedValue(new Uint8Array()),
	writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	},
}));

vi.mock('../r2-storage-service', () => ({
	r2StorageService: {
		downloadSkillPackage: vi.fn().mockResolvedValue(undefined),
		uploadSkillPackage: vi.fn().mockResolvedValue({
			key: 'test-key',
			url: 'https://test.com/package.tar.gz',
			size: 1024,
			uploadedAt: Date.now(),
		}),
	},
}));

vi.mock('./file-based-skill-service', () => ({
	getFileBasedSkillService: vi.fn().mockResolvedValue({
		getSkillsDirPath: vi.fn().mockResolvedValue('/test/skills'),
	}),
}));

vi.mock('./skill-packager', () => ({
	skillPackager: {
		unpack: vi.fn().mockResolvedValue({
			id: 'test-skill',
			name: 'Test Skill',
			description: 'A test skill',
		}),
	},
}));

describe('MarketplaceService', () => {
	let service: MarketplaceService;
	let mockRemove: any;
	let mockMkdir: any;
	let mockExists: any;

	beforeEach(async () => {
		service = new MarketplaceService();

		// Get mocked functions
		const fs = await import('@tauri-apps/plugin-fs');
		mockRemove = vi.mocked(fs.remove);
		mockMkdir = vi.mocked(fs.mkdir);
		mockExists = vi.mocked(fs.exists);

		// Reset mocks
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('installSkill', () => {
		it('should install a skill and clean up temp directory', async () => {
			const request: InstallSkillRequest = {
				skillId: 'test-skill-id',
				version: '1.0.0',
				metadata: {
					skillId: 'test-skill-id',
					name: 'Test Skill',
					description: 'A test skill',
					version: '1.0.0',
					author: {
						name: 'Test Author',
					},
					checksum: 'abc123',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				} as MarketplaceSkillMetadata,
			};

			const result: SkillInstallResult = await service.installSkill(request);

			// Verify installation succeeded
			expect(result.success).toBe(true);
			expect(result.skillId).toBe('test-skill-id');
			expect(result.name).toBe('Test Skill');

			// Verify temp directory was created
			expect(mockMkdir).toHaveBeenCalled();

			// Verify temp directory was cleaned up (removed with recursive option)
			expect(mockRemove).toHaveBeenCalledWith(
				expect.stringContaining('/test/app-data/tmp/talkcody-skills-'),
				{ recursive: true }
			);
		});

		it('should clean up temp directory even on error', async () => {
			const r2Service = await import('../r2-storage-service');
			const mockDownload = vi.mocked(r2Service.r2StorageService.downloadSkillPackage);

			// Simulate download error
			mockDownload.mockRejectedValueOnce(new Error('Download failed'));

			const request: InstallSkillRequest = {
				skillId: 'test-skill-id',
				version: '1.0.0',
				metadata: {
					skillId: 'test-skill-id',
					name: 'Test Skill',
					description: 'A test skill',
					version: '1.0.0',
					author: {
						name: 'Test Author',
					},
					checksum: 'abc123',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				} as MarketplaceSkillMetadata,
			};

			const result: SkillInstallResult = await service.installSkill(request);

			// Verify installation failed
			expect(result.success).toBe(false);
			expect(result.error).toContain('Download failed');

			// Verify temp directory was still cleaned up
			expect(mockRemove).toHaveBeenCalledWith(
				expect.stringContaining('/test/app-data/tmp/talkcody-skills-'),
				{ recursive: true }
			);
		});

		it('should create unique temp directory for each installation', async () => {
			const request: InstallSkillRequest = {
				skillId: 'test-skill-id',
				version: '1.0.0',
				metadata: {
					skillId: 'test-skill-id',
					name: 'Test Skill',
					description: 'A test skill',
					version: '1.0.0',
					author: {
						name: 'Test Author',
					},
					checksum: 'abc123',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				} as MarketplaceSkillMetadata,
			};

			// Install first time
			await service.installSkill(request);
			const firstTempDir = mockMkdir.mock.calls.find((call: any[]) =>
				call[0].includes('talkcody-skills-')
			)?.[0];

			// Wait a bit to ensure different timestamp
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Clear mocks but keep the first temp dir reference
			vi.clearAllMocks();

			// Install second time
			await service.installSkill(request);
			const secondTempDir = mockMkdir.mock.calls.find((call: any[]) =>
				call[0].includes('talkcody-skills-')
			)?.[0];

			// Verify different temp directories were created
			expect(firstTempDir).toBeDefined();
			expect(secondTempDir).toBeDefined();
			expect(firstTempDir).not.toBe(secondTempDir);
		});

		it('should use appDataDir instead of /tmp/', async () => {
			const request: InstallSkillRequest = {
				skillId: 'test-skill-id',
				version: '1.0.0',
				metadata: {
					skillId: 'test-skill-id',
					name: 'Test Skill',
					description: 'A test skill',
					version: '1.0.0',
					author: {
						name: 'Test Author',
					},
					checksum: 'abc123',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				} as MarketplaceSkillMetadata,
			};

			await service.installSkill(request);

			// Verify temp directory path includes app data dir
			const mkdirCalls = mockMkdir.mock.calls;
			const tempDirCall = mkdirCalls.find((call: any[]) =>
				call[0].includes('talkcody-skills-')
			);

			expect(tempDirCall).toBeDefined();
			expect(tempDirCall?.[0]).toContain('/test/app-data/tmp');
			// Verify it's not using plain /tmp/ at the start
			expect(tempDirCall?.[0]).not.toMatch(/^\/tmp\//);
		});

		it('should handle cleanup errors gracefully', async () => {
			// Simulate cleanup error
			mockRemove.mockRejectedValueOnce(new Error('Permission denied'));

			const request: InstallSkillRequest = {
				skillId: 'test-skill-id',
				version: '1.0.0',
				metadata: {
					skillId: 'test-skill-id',
					name: 'Test Skill',
					description: 'A test skill',
					version: '1.0.0',
					author: {
						name: 'Test Author',
					},
					checksum: 'abc123',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				} as MarketplaceSkillMetadata,
			};

			const result: SkillInstallResult = await service.installSkill(request);

			// Installation should still succeed even if cleanup fails
			expect(result.success).toBe(true);
			expect(result.skillId).toBe('test-skill-id');
		});
	});

	describe('temp directory management', () => {
		it('should create temp directory with timestamp', async () => {
			const request: InstallSkillRequest = {
				skillId: 'test-skill-id',
				version: '1.0.0',
				metadata: {
					skillId: 'test-skill-id',
					name: 'Test Skill',
					description: 'A test skill',
					version: '1.0.0',
					author: {
						name: 'Test Author',
					},
					checksum: 'abc123',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				} as MarketplaceSkillMetadata,
			};

			await service.installSkill(request);

			// Verify temp directory contains timestamp
			const tempDirCall = mockMkdir.mock.calls.find((call: any[]) =>
				call[0].includes('talkcody-skills-')
			);

			expect(tempDirCall?.[0]).toMatch(/talkcody-skills-\d+$/);
		});

		it('should create parent tmp directory if not exists', async () => {
			const request: InstallSkillRequest = {
				skillId: 'test-skill-id',
				version: '1.0.0',
				metadata: {
					skillId: 'test-skill-id',
					name: 'Test Skill',
					description: 'A test skill',
					version: '1.0.0',
					author: {
						name: 'Test Author',
					},
					checksum: 'abc123',
					createdAt: Date.now(),
					updatedAt: Date.now(),
				} as MarketplaceSkillMetadata,
			};

			await service.installSkill(request);

			// Verify parent tmp directory was created with recursive option
			const tmpBaseDirCall = mockMkdir.mock.calls.find(
				(call: any[]) => call[0] === '/test/app-data/tmp'
			);

			expect(tmpBaseDirCall).toBeDefined();
			expect(tmpBaseDirCall?.[1]).toEqual({ recursive: true });
		});
	});
});
