import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import monacoEditorEsmPlugin from 'vite-plugin-monaco-editor-esm';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [wasm(), topLevelAwait(), react(), tailwindcss(), monacoEditorEsmPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@talkcody/shared': path.resolve(__dirname, './packages/shared/src'),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host,
    proxy: {
      // Dev proxy to bypass CORS for GitHub MCP
      '/mcp/github': {
        target: 'https://api.githubcopilot.com',
        changeOrigin: true,
        secure: true,
        // e.g. /mcp/github/... -> /mcp/...
        rewrite: (p: string) => p.replace(/^\/mcp\/github/, '/mcp'),
      },
    },
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}));
