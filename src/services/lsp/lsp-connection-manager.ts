// src/services/lsp/lsp-connection-manager.ts
// Manages LSP connections for files, used by Monaco definition provider

import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

interface LspConnection {
  serverId: string;
  language: string;
  rootPath: string;
}

// ============================================================================
// Connection Manager
// ============================================================================

class LspConnectionManager {
  // Map from file path to connection info
  private connections: Map<string, LspConnection> = new Map();

  // Map from rootPath + language to active server ID
  private serversByRoot: Map<string, string> = new Map();

  /**
   * Check if a file has an active LSP connection
   */
  hasConnection(filePath: string): boolean {
    return this.connections.has(filePath);
  }

  /**
   * Get LSP connection info for a file
   */
  getConnection(filePath: string): LspConnection | null {
    return this.connections.get(filePath) || null;
  }

  /**
   * Get LSP connection by root path and language
   * This is useful when we need to find a server for a file that hasn't been opened yet
   */
  getConnectionByRoot(rootPath: string, language: string): LspConnection | null {
    const key = `${rootPath}:${language}`;
    const serverId = this.serversByRoot.get(key);
    if (!serverId) return null;

    return {
      serverId,
      language,
      rootPath,
    };
  }

  /**
   * Register an LSP connection for a file
   */
  register(filePath: string, serverId: string, language: string, rootPath: string): void {
    logger.debug(
      `[LspConnectionManager] Registering connection for ${filePath}: server=${serverId}, lang=${language}`
    );

    this.connections.set(filePath, {
      serverId,
      language,
      rootPath,
    });

    // Also track by root + language for cross-file lookups
    const key = `${rootPath}:${language}`;
    this.serversByRoot.set(key, serverId);
  }

  /**
   * Unregister an LSP connection for a file
   */
  unregister(filePath: string): void {
    logger.debug(`[LspConnectionManager] Unregistering connection for ${filePath}`);
    this.connections.delete(filePath);
  }

  /**
   * Unregister all connections for a server
   */
  unregisterServer(serverId: string): void {
    logger.debug(`[LspConnectionManager] Unregistering all connections for server ${serverId}`);

    // Remove file connections
    for (const [filePath, conn] of this.connections) {
      if (conn.serverId === serverId) {
        this.connections.delete(filePath);
      }
    }

    // Remove server by root
    for (const [key, sid] of this.serversByRoot) {
      if (sid === serverId) {
        this.serversByRoot.delete(key);
      }
    }
  }

  /**
   * Get all registered connections
   */
  getAllConnections(): Map<string, LspConnection> {
    return new Map(this.connections);
  }

  /**
   * Clear all connections
   */
  clear(): void {
    this.connections.clear();
    this.serversByRoot.clear();
  }
}

// Export singleton instance
export const lspConnectionManager = new LspConnectionManager();
