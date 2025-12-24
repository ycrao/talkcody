// src/stores/lsp-store.ts
// LSP state management store

import { create } from 'zustand';
import type { Diagnostic } from '@/services/lsp/lsp-protocol';
import { severityToString, uriToFilePath } from '@/services/lsp/lsp-protocol';

// ============================================================================
// Types
// ============================================================================

export interface LspDiagnostic {
  id: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  source: 'lsp';
  code?: string;
}

export interface LspServerStatus {
  serverId: string;
  language: string;
  rootPath: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  error?: string;
}

export interface PendingDownload {
  language: string;
  languageDisplayName: string;
  serverName: string;
  downloadUrl?: string;
}

export interface DownloadProgress {
  language: string;
  status: 'downloading' | 'extracting' | 'completed' | 'error';
  progress?: number;
  message?: string;
}

interface LspState {
  // Settings
  enabled: boolean;
  showDiagnostics: boolean;
  showErrors: boolean;
  showWarnings: boolean;
  showInfo: boolean;
  showHints: boolean;

  // Servers
  servers: Map<string, LspServerStatus>;

  // Diagnostics
  diagnosticsByFile: Map<string, LspDiagnostic[]>;
  diagnosticsCounts: {
    errors: number;
    warnings: number;
    info: number;
    hints: number;
  };

  // Download state
  pendingDownloads: PendingDownload[];
  downloadProgress: DownloadProgress | null;
  isDownloading: boolean;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setShowDiagnostics: (show: boolean) => void;
  setShowErrors: (show: boolean) => void;
  setShowWarnings: (show: boolean) => void;
  setShowInfo: (show: boolean) => void;
  setShowHints: (show: boolean) => void;

  // Server actions
  setServerStatus: (serverId: string, status: LspServerStatus) => void;
  removeServer: (serverId: string) => void;
  getServer: (language: string, rootPath: string) => LspServerStatus | undefined;

  // Diagnostics actions
  setDiagnostics: (uri: string, diagnostics: Diagnostic[]) => void;
  clearDiagnostics: (uri: string) => void;
  clearAllDiagnostics: () => void;
  getDiagnostics: (filePath: string) => LspDiagnostic[];

  // Download actions
  addPendingDownload: (download: PendingDownload) => void;
  removePendingDownload: (language: string) => void;
  clearPendingDownloads: () => void;
  setDownloadProgress: (progress: DownloadProgress | null) => void;
  setIsDownloading: (isDownloading: boolean) => void;
}

// ============================================================================
// Helpers
// ============================================================================

type DiagnosticCounts = { errors: number; warnings: number; info: number; hints: number };

/** Count diagnostics by severity */
function countDiagnostics(diagnostics: LspDiagnostic[]): DiagnosticCounts {
  const counts: DiagnosticCounts = { errors: 0, warnings: 0, info: 0, hints: 0 };
  for (const d of diagnostics) {
    switch (d.severity) {
      case 'error':
        counts.errors++;
        break;
      case 'warning':
        counts.warnings++;
        break;
      case 'info':
        counts.info++;
        break;
      case 'hint':
        counts.hints++;
        break;
    }
  }
  return counts;
}

/** Update total counts by adding/subtracting file counts */
function updateCounts(
  current: DiagnosticCounts,
  oldFileCounts: DiagnosticCounts,
  newFileCounts: DiagnosticCounts
): DiagnosticCounts {
  return {
    errors: current.errors - oldFileCounts.errors + newFileCounts.errors,
    warnings: current.warnings - oldFileCounts.warnings + newFileCounts.warnings,
    info: current.info - oldFileCounts.info + newFileCounts.info,
    hints: current.hints - oldFileCounts.hints + newFileCounts.hints,
  };
}

// ============================================================================
// Store
// ============================================================================

export const useLspStore = create<LspState>((set, get) => ({
  // Settings
  enabled: true,
  showDiagnostics: true,
  showErrors: true,
  showWarnings: true,
  showInfo: true,
  showHints: false,

  // Servers
  servers: new Map(),

  // Diagnostics
  diagnosticsByFile: new Map(),
  diagnosticsCounts: {
    errors: 0,
    warnings: 0,
    info: 0,
    hints: 0,
  },

  // Download state
  pendingDownloads: [],
  downloadProgress: null,
  isDownloading: false,

  // Actions
  setEnabled: (enabled) => set({ enabled }),
  setShowDiagnostics: (show) => set({ showDiagnostics: show }),
  setShowErrors: (show) => set({ showErrors: show }),
  setShowWarnings: (show) => set({ showWarnings: show }),
  setShowInfo: (show) => set({ showInfo: show }),
  setShowHints: (show) => set({ showHints: show }),

  // Server actions
  setServerStatus: (serverId, status) => {
    set((state) => {
      const servers = new Map(state.servers);
      servers.set(serverId, status);
      return { servers };
    });
  },

  removeServer: (serverId) => {
    set((state) => {
      const servers = new Map(state.servers);
      servers.delete(serverId);
      return { servers };
    });
  },

  getServer: (language, rootPath) => {
    const { servers } = get();
    for (const status of servers.values()) {
      if (status.language === language && status.rootPath === rootPath) {
        return status;
      }
    }
    return undefined;
  },

  // Diagnostics actions
  setDiagnostics: (uri, diagnostics) => {
    const filePath = uriToFilePath(uri);
    const state = get();

    // Convert LSP diagnostics to our format
    const lspDiagnostics: LspDiagnostic[] = diagnostics.map((d, index) => ({
      id: `lsp-${filePath}-${index}`,
      severity: severityToString(d.severity || 1),
      message: d.message,
      range: {
        start: { line: d.range.start.line, column: d.range.start.character },
        end: { line: d.range.end.line, column: d.range.end.character },
      },
      source: 'lsp' as const,
      code: d.code?.toString(),
    }));

    // Filter based on settings
    const filteredDiagnostics = lspDiagnostics.filter((d) => {
      switch (d.severity) {
        case 'error':
          return state.showErrors;
        case 'warning':
          return state.showWarnings;
        case 'info':
          return state.showInfo;
        case 'hint':
          return state.showHints;
        default:
          return true;
      }
    });

    // Get old diagnostics for this file (for delta calculation)
    const oldDiagnostics = state.diagnosticsByFile.get(filePath) || [];
    const oldFileCounts = countDiagnostics(oldDiagnostics);
    const newFileCounts = countDiagnostics(filteredDiagnostics);

    // Update diagnostics map
    const diagnosticsByFile = new Map(state.diagnosticsByFile);
    diagnosticsByFile.set(filePath, filteredDiagnostics);

    // Update counts using delta (O(1) instead of O(n*m))
    const newCounts = updateCounts(state.diagnosticsCounts, oldFileCounts, newFileCounts);

    set({
      diagnosticsByFile,
      diagnosticsCounts: newCounts,
    });
  },

  clearDiagnostics: (uri) => {
    const filePath = uriToFilePath(uri);
    const state = get();

    // Get old diagnostics for delta calculation
    const oldDiagnostics = state.diagnosticsByFile.get(filePath);
    if (!oldDiagnostics) {
      return; // Nothing to clear
    }

    const oldFileCounts = countDiagnostics(oldDiagnostics);
    const emptyFileCounts: DiagnosticCounts = { errors: 0, warnings: 0, info: 0, hints: 0 };

    const diagnosticsByFile = new Map(state.diagnosticsByFile);
    diagnosticsByFile.delete(filePath);

    // Update counts using delta (O(1) instead of O(n*m))
    const newCounts = updateCounts(state.diagnosticsCounts, oldFileCounts, emptyFileCounts);

    set({
      diagnosticsByFile,
      diagnosticsCounts: newCounts,
    });
  },

  clearAllDiagnostics: () => {
    set({
      diagnosticsByFile: new Map(),
      diagnosticsCounts: { errors: 0, warnings: 0, info: 0, hints: 0 },
    });
  },

  getDiagnostics: (filePath) => {
    const { diagnosticsByFile } = get();
    return diagnosticsByFile.get(filePath) || [];
  },

  // Download actions
  addPendingDownload: (download) => {
    set((state) => {
      // Don't add duplicates
      if (state.pendingDownloads.some((d) => d.language === download.language)) {
        return state;
      }
      return { pendingDownloads: [...state.pendingDownloads, download] };
    });
  },

  removePendingDownload: (language) => {
    set((state) => ({
      pendingDownloads: state.pendingDownloads.filter((d) => d.language !== language),
    }));
  },

  clearPendingDownloads: () => {
    set({ pendingDownloads: [] });
  },

  setDownloadProgress: (progress) => {
    set({ downloadProgress: progress });
  },

  setIsDownloading: (isDownloading) => {
    set({ isDownloading });
  },
}));
