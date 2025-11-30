import { BaseDirectory, exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { logger } from '@/lib/logger';

export interface WindowState {
  label: string;
  projectId?: string;
  rootPath?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface WindowsState {
  windows: WindowState[];
  lastActive?: string;
}

const STORE_FILE = 'windows-state.json';

export class WindowStateStore {
  private constructor() {}

  private static async readData(): Promise<WindowsState> {
    try {
      const fileExists = await exists(STORE_FILE, { baseDir: BaseDirectory.AppData });
      if (!fileExists) {
        return { windows: [] };
      }
      const content = await readTextFile(STORE_FILE, { baseDir: BaseDirectory.AppData });
      return JSON.parse(content) as WindowsState;
    } catch (error) {
      logger.error('Failed to read window state:', error);
      return { windows: [] };
    }
  }

  private static async writeData(data: WindowsState): Promise<void> {
    await writeTextFile(STORE_FILE, JSON.stringify(data, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
  }

  static async saveWindowState(state: WindowState): Promise<void> {
    try {
      const currentState = await WindowStateStore.readData();

      const existingIndex = currentState.windows.findIndex((w) => w.label === state.label);

      if (existingIndex >= 0) {
        currentState.windows[existingIndex] = state;
      } else {
        currentState.windows.push(state);
      }

      await WindowStateStore.writeData(currentState);
    } catch (error) {
      logger.error('Failed to save window state:', error);
    }
  }

  static async getWindowsState(): Promise<WindowsState> {
    return WindowStateStore.readData();
  }

  static async removeWindowState(label: string): Promise<void> {
    try {
      const currentState = await WindowStateStore.readData();
      currentState.windows = currentState.windows.filter((w) => w.label !== label);
      await WindowStateStore.writeData(currentState);
    } catch (error) {
      logger.error('Failed to remove window state:', error);
    }
  }

  static async setLastActiveWindow(label: string): Promise<void> {
    try {
      const currentState = await WindowStateStore.readData();
      currentState.lastActive = label;
      await WindowStateStore.writeData(currentState);
    } catch (error) {
      logger.error('Failed to set last active window:', error);
    }
  }

  static async clearAll(): Promise<void> {
    try {
      await WindowStateStore.writeData({ windows: [] });
    } catch (error) {
      logger.error('Failed to clear window states:', error);
    }
  }

  static async getWindowsToRestore(): Promise<WindowState[]> {
    try {
      const state = await WindowStateStore.readData();
      return state.windows.filter((w) => w.label !== 'main' && w.rootPath);
    } catch (error) {
      logger.error('Failed to get windows to restore:', error);
      return [];
    }
  }
}
