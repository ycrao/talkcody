// src/hooks/use-lsp.ts
// React hook for LSP (Language Server Protocol) integration

import type { editor } from 'monaco-editor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import { lspService } from '@/services/lsp';
import { lspConnectionManager } from '@/services/lsp/lsp-connection-manager';
import type { Hover, Location } from '@/services/lsp/lsp-protocol';
import {
  getLanguageIdForPath,
  getServerConfig,
  hasLspSupport,
  monacoToLspLanguage,
} from '@/services/lsp/lsp-servers';
import { type PendingDownload, useLspStore } from '@/stores/lsp-store';

// ============================================================================
// Types
// ============================================================================

interface UseLspOptions {
  editor: editor.IStandaloneCodeEditor | null;
  filePath: string | null;
  rootPath: string | null;
  enabled?: boolean;
}

interface UseLspResult {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  serverId: string | null;

  // Actions
  openDocument: (content: string) => Promise<void>;
  updateDocument: (content: string) => Promise<void>;
  closeDocument: () => Promise<void>;

  // Language features
  getHover: (line: number, character: number) => Promise<Hover | null>;
  getDefinition: (line: number, character: number) => Promise<Location[] | null>;
  getReferences: (line: number, character: number) => Promise<Location[] | null>;
}

// ============================================================================
// Helpers (defined before hook to ensure hoisting works)
// ============================================================================

// Map LSP severity (1=Error, 2=Warning, 3=Info, 4=Hint) to Monaco severity
function mapLspSeverity(
  severity: number | undefined,
  monaco: typeof import('monaco-editor')
): import('monaco-editor').MarkerSeverity {
  switch (severity) {
    case 1: // Error
      return monaco.MarkerSeverity.Error;
    case 2: // Warning
      return monaco.MarkerSeverity.Warning;
    case 3: // Information
      return monaco.MarkerSeverity.Info;
    case 4: // Hint
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Info;
  }
}

function getLanguageDisplayName(language: string): string {
  const names: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    typescriptreact: 'TypeScript React',
    javascriptreact: 'JavaScript React',
    rust: 'Rust',
    python: 'Python',
    go: 'Go',
    c: 'C',
    cpp: 'C++',
  };
  return names[language] || language;
}

// ============================================================================
// Hook
// ============================================================================

export function useLsp({
  editor,
  filePath,
  rootPath,
  enabled = true,
}: UseLspOptions): UseLspResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverId, setServerId] = useState<string | null>(null);

  const { enabled: storeEnabled, setDiagnostics, addPendingDownload } = useLspStore();
  const isEnabled = enabled && storeEnabled;

  const serverIdRef = useRef<string | null>(null);
  const filePathRef = useRef<string | null>(null);
  const languageRef = useRef<string | null>(null);
  const isDocumentOpenRef = useRef(false);

  // Get language for the current file
  const language = filePath ? getLanguageIdForPath(filePath) : null;

  // Start/stop LSP server based on file and settings
  useEffect(() => {
    if (!isEnabled || !filePath || !rootPath || !language) {
      // Cleanup if disabled
      if (serverIdRef.current && isDocumentOpenRef.current && filePathRef.current) {
        lspService.closeDocument(serverIdRef.current, filePathRef.current).catch(() => {});
        isDocumentOpenRef.current = false;
      }
      // Unregister connection
      if (filePathRef.current) {
        lspConnectionManager.unregister(filePathRef.current);
      }
      setIsConnected(false);
      setServerId(null);
      return;
    }

    // Check if language has LSP support
    if (!hasLspSupport(language)) {
      logger.debug(`[useLsp] No LSP support for language: ${language}`);
      return;
    }

    let isMounted = true;

    const startServer = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // First check server status
        const status = await lspService.getServerStatus(language);

        if (!status.available) {
          // Server not available, check if we can download
          if (status.canDownload) {
            // Add to pending downloads for user confirmation
            const config = getServerConfig(language);
            const pendingDownload: PendingDownload = {
              language,
              languageDisplayName: getLanguageDisplayName(language),
              serverName: config?.name || language,
              downloadUrl: status.downloadUrl,
            };
            addPendingDownload(pendingDownload);

            if (isMounted) {
              setError(
                `LSP server for ${getLanguageDisplayName(language)} is not installed. Click to install.`
              );
              setIsLoading(false);
            }
            return;
          } else {
            // Cannot auto-download
            if (isMounted) {
              const config = getServerConfig(language);
              setError(`LSP server not available. Please install: ${config?.command || 'unknown'}`);
              setIsLoading(false);
            }
            return;
          }
        }

        // Server is available, start it
        const id = await lspService.startServer(language, rootPath);

        if (isMounted) {
          serverIdRef.current = id;
          languageRef.current = language;
          setServerId(id);
          setIsConnected(true);

          // Register connection with connection manager for cross-file lookups
          lspConnectionManager.register(filePath, id, language, rootPath);

          logger.info(`[useLsp] Connected to LSP server: ${id}`);
        }
      } catch (e) {
        if (isMounted) {
          const errorMessage = e instanceof Error ? e.message : 'Failed to start LSP server';
          setError(errorMessage);
          logger.error(`[useLsp] Failed to start server:`, e);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    startServer();

    return () => {
      isMounted = false;
      // Unregister connection on cleanup
      if (filePath) {
        lspConnectionManager.unregister(filePath);
      }
    };
  }, [isEnabled, language, rootPath, filePath, addPendingDownload]);

  // Subscribe to diagnostics and apply to Monaco editor
  useEffect(() => {
    if (!isEnabled) return;

    const unsubscribe = lspService.onDiagnostics((uri, diagnostics) => {
      logger.info(`[LSP] Received ${diagnostics.length} diagnostics for ${uri}`);
      setDiagnostics(uri, diagnostics);

      // Apply diagnostics to editor immediately
      if (editor && filePath) {
        const { showDiagnostics } = useLspStore.getState();
        if (!showDiagnostics) return;

        const model = editor.getModel();
        if (!model) return;

        const monaco = (window as unknown as { monaco?: typeof import('monaco-editor') }).monaco;
        if (!monaco) return;

        // Convert URI to file path for comparison
        const diagnosticFilePath = uri.startsWith('file://') ? uri.slice(7) : uri;
        if (diagnosticFilePath !== filePath) {
          logger.debug(
            `[LSP] Diagnostics for different file: ${diagnosticFilePath} vs ${filePath}`
          );
          return;
        }

        // Verify the diagnostic is for a file with the same language as current LSP connection
        const diagnosticLang = getLanguageIdForPath(diagnosticFilePath);
        const currentLang = languageRef.current;
        if (diagnosticLang && currentLang && diagnosticLang !== currentLang) {
          logger.debug(`[LSP] Diagnostics language mismatch: ${diagnosticLang} vs ${currentLang}`);
          return;
        }

        // Get the language for this file to use as source
        const diagnosticLanguage = getLanguageIdForPath(diagnosticFilePath) || 'lsp';

        const markers = diagnostics.map((d) => ({
          severity: mapLspSeverity(d.severity, monaco),
          message: d.message,
          startLineNumber: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
          endLineNumber: d.range.end.line + 1,
          endColumn: d.range.end.character + 1,
          source: diagnosticLanguage,
          code: d.code?.toString(),
        }));

        logger.info(`[LSP] Setting ${markers.length} markers on editor`);
        monaco.editor.setModelMarkers(model, 'lsp', markers);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isEnabled, setDiagnostics, editor, filePath]);

  // Open document
  const openDocument = useCallback(
    async (content: string) => {
      if (!serverIdRef.current || !filePath || !languageRef.current) {
        throw new Error('LSP server not connected');
      }

      const lspLanguage = monacoToLspLanguage(languageRef.current) || languageRef.current;

      await lspService.openDocument(serverIdRef.current, filePath, lspLanguage, content);
      filePathRef.current = filePath;
      isDocumentOpenRef.current = true;
    },
    [filePath]
  );

  // Update document
  const updateDocument = useCallback(async (content: string) => {
    if (!serverIdRef.current || !filePathRef.current) {
      return;
    }

    await lspService.changeDocument(serverIdRef.current, filePathRef.current, content);
  }, []);

  // Close document
  const closeDocument = useCallback(async () => {
    if (!serverIdRef.current || !filePathRef.current) {
      return;
    }

    await lspService.closeDocument(serverIdRef.current, filePathRef.current);
    isDocumentOpenRef.current = false;
  }, []);

  // Get hover
  const getHover = useCallback(async (line: number, character: number): Promise<Hover | null> => {
    if (!serverIdRef.current || !filePathRef.current) {
      return null;
    }

    return lspService.hover(serverIdRef.current, filePathRef.current, line, character);
  }, []);

  // Get definition
  const getDefinition = useCallback(
    async (line: number, character: number): Promise<Location[] | null> => {
      if (!serverIdRef.current || !filePathRef.current) {
        return null;
      }

      return lspService.definition(serverIdRef.current, filePathRef.current, line, character);
    },
    []
  );

  // Get references
  const getReferences = useCallback(
    async (line: number, character: number): Promise<Location[] | null> => {
      if (!serverIdRef.current || !filePathRef.current) {
        return null;
      }

      return lspService.references(serverIdRef.current, filePathRef.current, line, character);
    },
    []
  );

  return {
    isConnected,
    isLoading,
    error,
    serverId,
    openDocument,
    updateDocument,
    closeDocument,
    getHover,
    getDefinition,
    getReferences,
  };
}
