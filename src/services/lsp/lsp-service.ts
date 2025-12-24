// src/services/lsp/lsp-service.ts
// LSP (Language Server Protocol) client service

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from '@/lib/logger';
import {
  type Definition,
  type Diagnostic,
  filePathToUri,
  type Hover,
  type InitializeParams,
  type InitializeResult,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type Location,
  LSP_METHODS,
  type PublishDiagnosticsParams,
  type TextDocumentContentChangeEvent,
  type TextDocumentItem,
  type TextDocumentPositionParams,
  type VersionedTextDocumentIdentifier,
} from './lsp-protocol';
import { getServerConfig } from './lsp-servers';

// ============================================================================
// Types
// ============================================================================

interface LspStartResponse {
  serverId: string;
  success: boolean;
  error?: string;
}

interface LspMessageEvent {
  serverId: string;
  message: string;
}

interface LspServerStatus {
  available: boolean;
  installed: boolean;
  installPath?: string;
  canDownload: boolean;
  downloadUrl?: string;
}

interface LspDownloadProgress {
  language: string;
  status: 'downloading' | 'extracting' | 'completed' | 'error';
  progress?: number; // 0.0 - 1.0
  message?: string;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  method: string;
  timeout: ReturnType<typeof setTimeout>;
}

interface ServerConnection {
  serverId: string;
  language: string;
  rootPath: string;
  isInitialized: boolean;
  documentVersions: Map<string, number>;
}

type DiagnosticsCallback = (uri: string, diagnostics: Diagnostic[]) => void;
type NotificationCallback = (method: string, params: unknown) => void;

// ============================================================================
// LSP Service
// ============================================================================

class LspService {
  private static instance: LspService;

  private servers: Map<string, ServerConnection> = new Map();
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private messageId = 0;
  private unlistenFn: UnlistenFn | null = null;
  private initialized = false;

  private diagnosticsCallbacks: Set<DiagnosticsCallback> = new Set();
  private notificationCallbacks: Set<NotificationCallback> = new Set();

  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

  static getInstance(): LspService {
    if (!LspService.instance) {
      LspService.instance = new LspService();
    }
    return LspService.instance;
  }

  /**
   * Initialize the LSP service
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('[LSP] Initializing LSP service');

    // Listen for LSP messages from the backend
    this.unlistenFn = await listen<LspMessageEvent>('lsp-message', (event) => {
      this.handleMessage(event.payload);
    });

    this.initialized = true;
    logger.info('[LSP] LSP service initialized');
  }

  /**
   * Cleanup the LSP service
   */
  async cleanup(): Promise<void> {
    logger.info('[LSP] Cleaning up LSP service');

    // Stop all servers
    for (const serverId of this.servers.keys()) {
      await this.stopServer(serverId);
    }

    // Remove event listener
    if (this.unlistenFn) {
      this.unlistenFn();
      this.unlistenFn = null;
    }

    // Clear pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('LSP service shutting down'));
    }
    this.pendingRequests.clear();

    this.initialized = false;
  }

  /**
   * Get the status of an LSP server for a language
   */
  async getServerStatus(language: string): Promise<LspServerStatus> {
    return invoke<LspServerStatus>('lsp_get_server_status', { language });
  }

  /**
   * Download an LSP server for a language
   */
  async downloadServer(language: string): Promise<string> {
    logger.info(`[LSP] Downloading server for ${language}`);
    return invoke<string>('lsp_download_server', { language });
  }

  /**
   * Listen for download progress events
   */
  async onDownloadProgress(callback: (progress: LspDownloadProgress) => void): Promise<() => void> {
    const unlisten = await listen<LspDownloadProgress>('lsp-download-progress', (event) => {
      callback(event.payload);
    });
    return unlisten;
  }

  /**
   * Start an LSP server for a language
   */
  async startServer(language: string, rootPath: string): Promise<string> {
    await this.init();

    // Check if we already have a server for this language and root
    for (const [serverId, conn] of this.servers) {
      if (conn.language === language && conn.rootPath === rootPath) {
        logger.info(`[LSP] Reusing existing server: ${serverId}`);
        return serverId;
      }
    }

    logger.info(`[LSP] Starting server for ${language} in ${rootPath}`);

    // Check if server is available
    const isAvailable = await invoke<boolean>('lsp_check_server_available', { language });
    if (!isAvailable) {
      // Check if we can auto-download
      const status = await this.getServerStatus(language);
      if (status.canDownload) {
        throw new Error(
          `LSP server for ${language} is not installed. Call downloadServer('${language}') to install it.`
        );
      }
      const config = getServerConfig(language);
      throw new Error(
        `LSP server for ${language} is not installed. Please install: ${config?.command || 'unknown'}`
      );
    }

    // Start the server
    const response = await invoke<LspStartResponse>('lsp_start_server', {
      language,
      rootPath,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to start LSP server');
    }

    const { serverId } = response;

    // Register the connection
    this.servers.set(serverId, {
      serverId,
      language,
      rootPath,
      isInitialized: false,
      documentVersions: new Map(),
    });

    // Initialize the server
    await this.initializeServer(serverId, rootPath);

    logger.info(`[LSP] Server started and initialized: ${serverId}`);
    return serverId;
  }

  /**
   * Stop an LSP server
   */
  async stopServer(serverId: string): Promise<void> {
    const conn = this.servers.get(serverId);
    if (!conn) {
      return;
    }

    logger.info(`[LSP] Stopping server: ${serverId}`);

    try {
      // Send shutdown request
      await this.sendRequest(serverId, LSP_METHODS.SHUTDOWN, null);
      // Send exit notification
      await this.sendNotification(serverId, LSP_METHODS.EXIT, null);
    } catch (e) {
      logger.warn(`[LSP] Error during graceful shutdown: ${e}`);
    }

    // Stop the server process
    await invoke('lsp_stop_server', { serverId });

    // Remove from registry
    this.servers.delete(serverId);
  }

  /**
   * Get server for a language and root path
   */
  getServer(language: string, rootPath: string): string | null {
    for (const [serverId, conn] of this.servers) {
      if (conn.language === language && conn.rootPath === rootPath) {
        return serverId;
      }
    }
    return null;
  }

  /**
   * Initialize an LSP server
   */
  private async initializeServer(serverId: string, rootPath: string): Promise<void> {
    const params: InitializeParams = {
      processId: null,
      clientInfo: {
        name: 'talkcody',
        version: '1.0.0',
      },
      rootUri: filePathToUri(rootPath),
      rootPath,
      capabilities: {
        textDocument: {
          synchronization: {
            didSave: true,
          },
          hover: {
            contentFormat: ['markdown', 'plaintext'],
          },
          definition: {
            linkSupport: true,
          },
          references: {},
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: true,
            codeDescriptionSupport: true,
            dataSupport: true,
          },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      workspaceFolders: [
        {
          uri: filePathToUri(rootPath),
          name: rootPath.split('/').pop() || 'workspace',
        },
      ],
    };

    const result = await this.sendRequest<InitializeResult>(
      serverId,
      LSP_METHODS.INITIALIZE,
      params
    );

    logger.info('[LSP] Server capabilities:', result.capabilities);

    // Send initialized notification
    await this.sendNotification(serverId, LSP_METHODS.INITIALIZED, {});

    // Mark as initialized
    const conn = this.servers.get(serverId);
    if (conn) {
      conn.isInitialized = true;
    }
  }

  /**
   * Open a document
   */
  async openDocument(
    serverId: string,
    filePath: string,
    languageId: string,
    content: string
  ): Promise<void> {
    const conn = this.servers.get(serverId);
    if (!conn?.isInitialized) {
      throw new Error('Server not initialized');
    }

    const uri = filePathToUri(filePath);
    const version = 1;
    conn.documentVersions.set(uri, version);

    const textDocument: TextDocumentItem = {
      uri,
      languageId,
      version,
      text: content,
    };

    await this.sendNotification(serverId, LSP_METHODS.DID_OPEN, { textDocument });
    logger.debug(`[LSP] Document opened: ${filePath}`);
  }

  /**
   * Update a document
   */
  async changeDocument(serverId: string, filePath: string, content: string): Promise<void> {
    const conn = this.servers.get(serverId);
    if (!conn?.isInitialized) {
      throw new Error('Server not initialized');
    }

    const uri = filePathToUri(filePath);
    const currentVersion = conn.documentVersions.get(uri) || 0;
    const newVersion = currentVersion + 1;
    conn.documentVersions.set(uri, newVersion);

    const textDocument: VersionedTextDocumentIdentifier = {
      uri,
      version: newVersion,
    };

    const contentChanges: TextDocumentContentChangeEvent[] = [{ text: content }];

    await this.sendNotification(serverId, LSP_METHODS.DID_CHANGE, {
      textDocument,
      contentChanges,
    });
  }

  /**
   * Close a document
   */
  async closeDocument(serverId: string, filePath: string): Promise<void> {
    const conn = this.servers.get(serverId);
    if (!conn?.isInitialized) {
      return;
    }

    const uri = filePathToUri(filePath);
    conn.documentVersions.delete(uri);

    await this.sendNotification(serverId, LSP_METHODS.DID_CLOSE, {
      textDocument: { uri },
    });
  }

  /**
   * Get hover information
   */
  async hover(
    serverId: string,
    filePath: string,
    line: number,
    character: number
  ): Promise<Hover | null> {
    const params: TextDocumentPositionParams = {
      textDocument: { uri: filePathToUri(filePath) },
      position: { line, character },
    };

    try {
      const result = await this.sendRequest<Hover | null>(serverId, LSP_METHODS.HOVER, params);
      return result;
    } catch (e) {
      logger.debug(`[LSP] Hover request failed: ${e}`);
      return null;
    }
  }

  /**
   * Get definition
   */
  async definition(
    serverId: string,
    filePath: string,
    line: number,
    character: number
  ): Promise<Location[] | null> {
    const params: TextDocumentPositionParams = {
      textDocument: { uri: filePathToUri(filePath) },
      position: { line, character },
    };

    try {
      const result = await this.sendRequest<Definition | null>(
        serverId,
        LSP_METHODS.DEFINITION,
        params
      );

      if (!result) return null;

      // Normalize to Location[]
      if (Array.isArray(result)) {
        return result.map((item) => {
          if ('targetUri' in item) {
            // LocationLink
            return {
              uri: item.targetUri,
              range: item.targetSelectionRange,
            };
          }
          return item as Location;
        });
      }

      return [result as Location];
    } catch (e) {
      logger.debug(`[LSP] Definition request failed: ${e}`);
      return null;
    }
  }

  /**
   * Get references
   */
  async references(
    serverId: string,
    filePath: string,
    line: number,
    character: number,
    includeDeclaration = true
  ): Promise<Location[] | null> {
    const params = {
      textDocument: { uri: filePathToUri(filePath) },
      position: { line, character },
      context: { includeDeclaration },
    };

    try {
      const result = await this.sendRequest<Location[] | null>(
        serverId,
        LSP_METHODS.REFERENCES,
        params
      );
      return result;
    } catch (e) {
      logger.debug(`[LSP] References request failed: ${e}`);
      return null;
    }
  }

  /**
   * Register a callback for diagnostics
   */
  onDiagnostics(callback: DiagnosticsCallback): () => void {
    this.diagnosticsCallbacks.add(callback);
    return () => this.diagnosticsCallbacks.delete(callback);
  }

  /**
   * Register a callback for notifications
   */
  onNotification(callback: NotificationCallback): () => void {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }

  /**
   * Send a request to an LSP server
   */
  private async sendRequest<T>(serverId: string, method: string, params: unknown): Promise<T> {
    const id = ++this.messageId;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const message = JSON.stringify(request);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timeout: ${method}`));
      }, this.REQUEST_TIMEOUT);

      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        method,
        timeout,
      });

      invoke('lsp_send_message', { serverId, message }).catch((e) => {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(e);
      });
    });
  }

  /**
   * Send a notification to an LSP server
   */
  private async sendNotification(serverId: string, method: string, params: unknown): Promise<void> {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification);
    await invoke('lsp_send_message', { serverId, message });
  }

  /**
   * Handle incoming LSP message
   */
  private handleMessage(event: LspMessageEvent): void {
    const { serverId, message } = event;

    try {
      const parsed = JSON.parse(message) as JsonRpcResponse | JsonRpcNotification;

      // Check if it's a response
      if ('id' in parsed && parsed.id !== null) {
        this.handleResponse(parsed as JsonRpcResponse);
      } else if ('method' in parsed) {
        this.handleServerNotification(serverId, parsed as JsonRpcNotification);
      }
    } catch (e) {
      logger.error('[LSP] Failed to parse message:', e);
    }
  }

  /**
   * Handle response from LSP server
   */
  private handleResponse(response: JsonRpcResponse): void {
    const id = response.id as number;
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      logger.warn(`[LSP] Received response for unknown request: ${id}`);
      return;
    }

    this.pendingRequests.delete(id);
    clearTimeout(pending.timeout);

    if (response.error) {
      pending.reject(new Error(`LSP error: ${response.error.message}`));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle notification from LSP server
   */
  private handleServerNotification(_serverId: string, notification: JsonRpcNotification): void {
    const { method, params } = notification;

    logger.debug(`[LSP] Server notification: ${method}`);

    // Notify callbacks
    for (const callback of this.notificationCallbacks) {
      try {
        callback(method, params);
      } catch (e) {
        logger.error('[LSP] Notification callback error:', e);
      }
    }

    // Handle specific notifications
    if (method === LSP_METHODS.PUBLISH_DIAGNOSTICS) {
      const diagnosticsParams = params as PublishDiagnosticsParams;
      for (const callback of this.diagnosticsCallbacks) {
        try {
          callback(diagnosticsParams.uri, diagnosticsParams.diagnostics);
        } catch (e) {
          logger.error('[LSP] Diagnostics callback error:', e);
        }
      }
    }
  }
}

// Export singleton instance
export const lspService = LspService.getInstance();
