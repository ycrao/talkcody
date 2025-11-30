import { invoke } from '@tauri-apps/api/core';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { logger } from '@/lib/logger';
import { useRepositoryStore } from '@/stores/repository-store';
import type { IndexingProgress } from '@/types/file-system';
import {
  clearAllIndex,
  clearFileIndex,
  getIndexedFiles,
  getIndexMetadata,
  indexFile,
  indexFilesBatch,
  loadIndex,
  saveIndex,
} from './code-navigation-service';
import { getLanguageFromExtension } from './repository-utils';

// Languages supported by Tree-sitter backend
const SUPPORTED_LANGUAGES = [
  'python',
  'rust',
  'go',
  'c',
  'cpp',
  'java',
  'typescript',
  'javascript',
];

// File extensions for supported languages (used for glob patterns)
const SUPPORTED_EXTENSIONS = ['py', 'rs', 'go', 'c', 'cpp', 'h', 'java', 'ts', 'tsx', 'js', 'jsx'];

// Batch size for indexing files
const BATCH_SIZE = 50;

interface GlobResult {
  path: string;
  is_directory: boolean;
  modified_time: number;
}

class ProjectIndexer {
  private indexingInProgress = false;
  private progressCallback?: (progress: IndexingProgress) => void;

  // Helper to get store methods (avoid calling hooks directly)
  private getStore() {
    return useRepositoryStore.getState();
  }

  /**
   * Set a callback to receive indexing progress updates
   */
  setProgressCallback(callback: (progress: IndexingProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Clear the progress callback
   */
  clearProgressCallback(): void {
    this.progressCallback = undefined;
  }

  /**
   * Report progress to the callback if set
   */
  private reportProgress(progress: IndexingProgress): void {
    this.progressCallback?.(progress);
  }

  /**
   * Check if a language is supported for indexing
   */
  isSupported(langId: string): boolean {
    return SUPPORTED_LANGUAGES.includes(langId);
  }

  /**
   * Index all supported files in a project using glob patterns
   * This method uses the Rust backend to efficiently find all files
   * Optimized with parallel glob search, batch indexing, and persistence
   */
  async indexProjectByPath(rootPath: string): Promise<void> {
    if (this.indexingInProgress) {
      logger.info('Indexing already in progress, skipping...');
      return;
    }

    this.indexingInProgress = true;
    const startTime = Date.now();
    logger.info(`Starting project indexing for: ${rootPath}`);

    try {
      // Report searching phase
      this.reportProgress({ phase: 'searching', current: 0, total: SUPPORTED_EXTENSIONS.length });

      // Search for all extensions in PARALLEL instead of sequentially
      const globPromises = SUPPORTED_EXTENSIONS.map((ext) =>
        invoke<GlobResult[]>('search_files_by_glob', {
          pattern: `**/*.${ext}`,
          path: rootPath,
        }).catch((error) => {
          logger.error(`Failed to search for *.${ext} files:`, error);
          return [] as GlobResult[];
        })
      );

      const results = await Promise.all(globPromises);

      // Flatten results and filter directories, keep timestamps
      const allFilesWithTimestamps = results.flat().filter((r) => !r.is_directory);

      // Build current file timestamps map
      const currentTimestamps: Record<string, number> = {};
      for (const file of allFilesWithTimestamps) {
        currentTimestamps[file.path] = file.modified_time;
      }

      const allFiles = allFilesWithTimestamps.map((r) => r.path);
      const totalFiles = allFiles.length;
      logger.info(`Found ${totalFiles} files (glob took ${Date.now() - startTime}ms)`);

      if (totalFiles === 0) {
        this.reportProgress({ phase: 'complete', current: 0, total: 0 });
        return;
      }

      // Try to load persisted index
      const metadata = await getIndexMetadata(rootPath);
      let filesToIndex: string[] = [];
      const filesToRemove: string[] = [];

      if (metadata) {
        // Report loading phase
        this.reportProgress({ phase: 'loading', current: 0, total: 1 });
        logger.info(
          `Found persisted index with ${metadata.file_count} files, checking for changes...`
        );

        // Load the persisted index into memory
        const loaded = await loadIndex(rootPath);
        if (loaded) {
          // Calculate changed files
          const persistedTimestamps = metadata.file_timestamps;

          // Find new or modified files
          for (const filePath of allFiles) {
            const currentTime = currentTimestamps[filePath] ?? 0;
            const persistedTime = persistedTimestamps[filePath] ?? 0;

            if (persistedTime === 0 || currentTime > persistedTime) {
              filesToIndex.push(filePath);
            }
          }

          // Find deleted files
          for (const filePath of Object.keys(persistedTimestamps)) {
            if (!currentTimestamps[filePath]) {
              filesToRemove.push(filePath);
            }
          }

          logger.info(
            `Incremental update: ${filesToIndex.length} changed, ${filesToRemove.length} deleted, ${allFiles.length - filesToIndex.length} unchanged`
          );

          // Update store with loaded indexed files
          const indexedFiles = await getIndexedFiles();
          this.getStore().setIndexedFiles(new Set(indexedFiles));

          // Remove deleted files from index
          for (const filePath of filesToRemove) {
            await clearFileIndex(filePath);
            this.getStore().removeIndexedFile(filePath);
          }
        } else {
          // Index load failed, fall back to full index
          logger.warn('Failed to load persisted index, performing full index');
          filesToIndex = allFiles;
        }
      } else {
        // No persisted index, index all files
        logger.info('No persisted index found, performing full index');
        filesToIndex = allFiles;
      }

      // Index the files that need updating
      if (filesToIndex.length > 0) {
        const indexStartTime = Date.now();
        let processedCount = 0;

        for (let i = 0; i < filesToIndex.length; i += BATCH_SIZE) {
          const batch = filesToIndex.slice(i, i + BATCH_SIZE);

          // Report progress
          this.reportProgress({
            phase: 'indexing',
            current: processedCount,
            total: filesToIndex.length,
            currentFile: batch[0],
          });

          // Clear existing index for files being re-indexed
          for (const filePath of batch) {
            if (this.getStore().isFileIndexed(filePath)) {
              await clearFileIndex(filePath);
              this.getStore().removeIndexedFile(filePath);
            }
          }

          // Read all files in the batch in parallel
          const filesWithContent = await Promise.all(
            batch.map(async (filePath) => {
              const lang = getLanguageFromExtension(filePath);
              if (!SUPPORTED_LANGUAGES.includes(lang)) {
                return null;
              }

              try {
                const content = await readTextFile(filePath);
                return [filePath, content, lang] as [string, string, string];
              } catch (error) {
                logger.debug(`Failed to read file: ${filePath}`, error);
                return null;
              }
            })
          );

          // Filter out null values and index the batch
          const validFiles = filesWithContent.filter(
            (f): f is [string, string, string] => f !== null
          );

          if (validFiles.length > 0) {
            try {
              await indexFilesBatch(validFiles);
              // Mark files as indexed in store (triggers UI update)
              const indexedPaths = validFiles.map(([filePath]) => filePath);
              this.getStore().addIndexedFiles(indexedPaths);
            } catch (error) {
              logger.error('Batch indexing failed, falling back to individual indexing:', error);
              // Fallback to individual indexing if batch fails
              for (const [filePath, content, lang] of validFiles) {
                try {
                  await indexFile(filePath, content, lang);
                  this.getStore().addIndexedFile(filePath);
                } catch (e) {
                  logger.debug(`Failed to index file: ${filePath}`, e);
                }
              }
            }
          }

          processedCount += batch.length;
        }

        const indexTime = Date.now() - indexStartTime;
        logger.info(`Indexed ${filesToIndex.length} files in ${indexTime}ms`);
      }

      // Save the index with current timestamps
      this.reportProgress({ phase: 'saving', current: 0, total: 1 });
      await saveIndex(rootPath, currentTimestamps);

      const totalTime = Date.now() - startTime;
      const indexedCount = this.getStore().indexedFiles.size;
      logger.info(`Project indexing complete: ${indexedCount} files (total: ${totalTime}ms)`);

      // Report completion
      this.reportProgress({ phase: 'complete', current: totalFiles, total: totalFiles });
    } finally {
      this.indexingInProgress = false;
    }
  }

  /**
   * Index all supported files in a project (legacy method, kept for compatibility)
   */
  async indexProject(files: string[]): Promise<void> {
    if (this.indexingInProgress) {
      logger.info('Indexing already in progress, skipping...');
      return;
    }

    this.indexingInProgress = true;
    logger.info(`Starting project indexing for ${files.length} files...`);

    try {
      const filesToIndex = files.filter((f) => {
        const lang = getLanguageFromExtension(f);
        return SUPPORTED_LANGUAGES.includes(lang);
      });

      logger.info(`Found ${filesToIndex.length} files to index`);

      // Index files sequentially to avoid overwhelming the backend
      for (const filePath of filesToIndex) {
        await this.indexSingleFile(filePath);
      }

      logger.info(`Indexed ${this.getStore().indexedFiles.size} files`);
    } finally {
      this.indexingInProgress = false;
    }
  }

  /**
   * Index a single file (internal method)
   */
  private async indexSingleFile(filePath: string): Promise<void> {
    if (this.getStore().isFileIndexed(filePath)) {
      return;
    }

    const lang = getLanguageFromExtension(filePath);
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      return;
    }

    try {
      const content = await readTextFile(filePath);
      await indexFile(filePath, content, lang);
      this.getStore().addIndexedFile(filePath);
    } catch (error) {
      logger.error(`Failed to index file: ${filePath}`, error);
    }
  }

  /**
   * Index a single file (public method for external use)
   */
  async indexFile(filePath: string): Promise<void> {
    await this.indexSingleFile(filePath);
  }

  /**
   * Re-index a file (when it changes)
   */
  async reindexFile(filePath: string): Promise<void> {
    const lang = getLanguageFromExtension(filePath);
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      return;
    }

    try {
      await clearFileIndex(filePath);
      this.getStore().removeIndexedFile(filePath);
      await this.indexSingleFile(filePath);
    } catch (error) {
      logger.error(`Failed to reindex file: ${filePath}`, error);
    }
  }

  /**
   * Remove a file from the index
   */
  async removeFile(filePath: string): Promise<void> {
    try {
      await clearFileIndex(filePath);
      this.getStore().removeIndexedFile(filePath);
    } catch (error) {
      logger.error(`Failed to remove file from index: ${filePath}`, error);
    }
  }

  /**
   * Clear all indexed files
   */
  async clearAll(): Promise<void> {
    try {
      await clearAllIndex();
      this.getStore().clearIndexedFiles();
    } catch (error) {
      logger.error('Failed to clear index:', error);
    }
  }

  /**
   * Get count of indexed files
   */
  getIndexedCount(): number {
    return this.getStore().indexedFiles.size;
  }

  /**
   * Check if a file is indexed
   */
  isIndexed(filePath: string): boolean {
    return this.getStore().isFileIndexed(filePath);
  }

  /**
   * Check if indexing is currently in progress
   */
  isIndexing(): boolean {
    return this.indexingInProgress;
  }
}

// Export singleton instance
export const projectIndexer = new ProjectIndexer();
