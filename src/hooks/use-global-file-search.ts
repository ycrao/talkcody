// src/hooks/use-global-file-search.ts
import { useCallback, useState } from 'react';

export function useGlobalFileSearch(onFileSelect?: (filePath: string) => void) {
  const [isOpen, setIsOpen] = useState(false);

  const openSearch = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleFileSelect = useCallback(
    (filePath: string) => {
      onFileSelect?.(filePath);
      setIsOpen(false);
    },
    [onFileSelect]
  );

  return {
    isOpen,
    openSearch,
    closeSearch,
    handleFileSelect,
  };
}
