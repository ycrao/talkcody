// src/components/global-file-search.tsx

import { File, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import type { FileNode } from '@/types/file-system';

interface GlobalFileSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => Promise<FileNode[]>;
  onFileSelect: (filePath: string) => void;
  repositoryPath?: string | null;
}

export function GlobalFileSearch({
  isOpen,
  onClose,
  onSearch,
  onFileSelect,
  repositoryPath,
}: GlobalFileSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileNode[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Parse query into keywords for display purposes only
  // (Rust backend now handles all parsing and matching)
  const keywords = useMemo(() => {
    return query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((keyword) => keyword.length > 0);
  }, [query]);

  const handleFileSelect = useCallback(
    (file: FileNode) => {
      onFileSelect(file.path);
      onClose();
    },
    [onFileSelect, onClose]
  );

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      // Focus the input when dialog opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [isOpen]);

  // Note: Matching and scoring logic has been moved to Rust backend for better performance

  // Search files with debouncing
  useEffect(() => {
    const searchFiles = async () => {
      if (!query.trim()) {
        setResults([]);
        setSelectedIndex(0);
        return;
      }

      setIsSearching(true);
      try {
        // Get all search results from the high-performance Rust backend
        // The backend now handles all keyword matching, filtering, and scoring
        const searchResults = await onSearch(query);

        // Filter out directories if needed (most file searches should only show files)
        const fileResults = searchResults.filter((file) => !file.is_directory);

        setResults(fileResults);
        setSelectedIndex(0);
      } catch (error) {
        logger.error('Search error:', error);
        setResults([]);
        setSelectedIndex(0);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(searchFiles, 200); // Debounce
    return () => clearTimeout(timeoutId);
  }, [query, onSearch]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleFileSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose, handleFileSelect]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && results.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [selectedIndex, results]);

  const getRelativePath = (fullPath: string) => {
    if (!repositoryPath) return fullPath;
    return fullPath.replace(repositoryPath, '').replace(/^\//, '');
  };

  const highlightMultipleKeywords = (text: string, keywords: string[]) => {
    if (keywords.length === 0) return text;

    // Create a combined regex pattern for all keywords
    const escapedKeywords = keywords.map((keyword) =>
      keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const pattern = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');

    const parts = text.split(pattern);
    let keyCounter = 0;

    return (
      <>
        {parts.map((part) => {
          const isKeyword = keywords.some(
            (keyword) => part.toLowerCase() === keyword.toLowerCase()
          );
          const key = `${isKeyword ? 'match' : 'text'}-${keyCounter++}`;

          if (isKeyword) {
            return (
              <span className="bg-yellow-200 font-semibold dark:bg-yellow-700" key={key}>
                {part}
              </span>
            );
          }
          return <span key={key}>{part}</span>;
        })}
      </>
    );
  };

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[600px]" showCloseButton={false}>
        {/* Hidden title for accessibility */}
        <DialogTitle className="sr-only">Search Files</DialogTitle>

        <div className="flex h-[500px] flex-col">
          {/* Header */}
          <div className="flex items-center border-b bg-gray-50 px-4 py-3 dark:bg-gray-800">
            <div className="relative flex-1">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-gray-400" />
              <Input
                className="border-0 bg-transparent pl-10 shadow-none focus-visible:ring-0"
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files by name (use spaces for multiple keywords)..."
                ref={inputRef}
                type="text"
                value={query}
              />
            </div>
            <button
              type="button"
              className="ml-2 rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto" ref={listRef}>
            {query.trim() ? (
              isSearching ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-blue-600 border-b-2" />
                  <p>Searching files...</p>
                  {keywords.length > 1 && (
                    <p className="mt-2 text-xs">
                      Looking for: {keywords.map((k) => `"${k}"`).join(', ')}
                    </p>
                  )}
                </div>
              ) : results.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <File className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                  <p className="mb-2 font-medium text-lg">No files found</p>
                  <p className="text-sm">Try a different search term</p>
                  {keywords.length > 1 && (
                    <p className="mt-2 text-orange-600 text-xs dark:text-orange-400">
                      No files contain all keywords: {keywords.map((k) => `"${k}"`).join(', ')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-2">
                  {results.map((file, index) => (
                    <button
                      type="button"
                      className={cn(
                        'flex w-full cursor-pointer items-center border-0 px-4 py-3 text-left transition-colors',
                        index === selectedIndex
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      )}
                      key={file.path}
                      onClick={() => handleFileSelect(file)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleFileSelect(file);
                        }
                      }}
                    >
                      <File className="mr-3 h-4 w-4 flex-shrink-0 text-blue-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">
                          {highlightMultipleKeywords(file.name, keywords)}
                        </p>
                        <p className="truncate text-gray-500 text-xs">
                          {getRelativePath(file.path)}
                        </p>
                      </div>
                      {index === selectedIndex && (
                        <div className="ml-2 text-gray-400 text-xs">
                          <kbd className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-700">
                            Enter
                          </kbd>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="p-8 text-center text-gray-500">
                <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <p className="mb-2 font-medium text-lg">Search Files</p>
                <p className="text-sm">Type to search for files in your repository</p>
                <p className="mt-2 text-blue-600 text-sm dark:text-blue-400">
                  💡 Use spaces to search with multiple keywords
                </p>
                <div className="mt-4 space-y-1 text-xs">
                  <p>
                    <kbd className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-700">
                      ↑↓
                    </kbd>{' '}
                    Navigate
                  </p>
                  <p>
                    <kbd className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-700">
                      Enter
                    </kbd>{' '}
                    Open file
                  </p>
                  <p>
                    <kbd className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-700">
                      Esc
                    </kbd>{' '}
                    Cancel
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {results.length > 0 && (
            <div className="flex justify-between border-t bg-gray-50 px-4 py-2 text-gray-500 text-xs dark:bg-gray-800">
              <span>
                {results.length} files found
                {keywords.length > 1 && (
                  <span className="ml-2 text-blue-600 dark:text-blue-400">
                    (matching all: {keywords.map((k) => `"${k}"`).join(', ')})
                  </span>
                )}
              </span>
              <span>Use ↑↓ to navigate, Enter to select</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
