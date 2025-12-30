/**
 * Preload script for bun test to set up happy-dom environment.
 * This enables tests that require DOM (window, document) to run with bun test.
 */

import { mock } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

// ============================================
// Tauri API Mocks for Bun environment
// ============================================

if (typeof window !== 'undefined') {
  // Mock __TAURI_INTERNALS__ which is used by @tauri-apps/api
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    value: {
      invoke: mock(() => Promise.resolve()),
      transformCallback: mock(() => 0),
    },
    configurable: true,
    writable: true,
  });
}

// Mock Tauri plugins
mock.module('@tauri-apps/plugin-log', () => ({
  error: mock(() => {}),
  warn: mock(() => {}),
  info: mock(() => {}),
  debug: mock(() => {}),
  trace: mock(() => {}),
}));

mock.module('@tauri-apps/plugin-fs', () => ({
  writeTextFile: mock(() => Promise.resolve()),
  readTextFile: mock(() => Promise.resolve('')),
  exists: mock(() => Promise.resolve(false)),
  readDir: mock(() => Promise.resolve([])),
  mkdir: mock(() => Promise.resolve()),
  remove: mock(() => Promise.resolve()),
  readFile: mock(() => Promise.resolve(new Uint8Array())),
  writeFile: mock(() => Promise.resolve()),
}));

mock.module('@tauri-apps/api/core', () => ({
  invoke: mock(() => Promise.resolve()),
  transformCallback: mock(() => 0),
  isTauri: mock(() => true),
  Channel: class MockChannel {},
  convertFileSrc: mock((path: string) => path),
}));

// Mock path API
mock.module('@tauri-apps/api/path', () => ({
  appDataDir: mock(() => Promise.resolve('/test/app-data')),
  join: mock((...paths: string[]) => Promise.resolve(paths.join('/'))),
  normalize: mock((path: string) => Promise.resolve(path)),
  dirname: mock((path: string) => {
    const parts = path.split('/');
    parts.pop();
    return Promise.resolve(parts.join('/') || '/');
  }),
  isAbsolute: mock((path: string) => Promise.resolve(path.startsWith('/'))),
}));
