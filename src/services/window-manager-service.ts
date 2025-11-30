import { invoke } from '@tauri-apps/api/core';
import { logger } from '@/lib/logger';

export interface WindowInfo {
  label: string;
  project_id?: string;
  root_path?: string;
  title: string;
}

export class WindowManagerService {
  private constructor() {}

  /**
   * Create a new window for a project
   * If the project is already open in another window, focus that window instead
   */
  static async createProjectWindow(projectId?: string, rootPath?: string): Promise<string> {
    try {
      const label = await invoke<string>('create_project_window', {
        projectId,
        rootPath,
      });
      return label;
    } catch (error) {
      logger.error('Failed to create project window:', error);
      throw error;
    }
  }

  /**
   * Get all open windows
   */
  static async getAllWindows(): Promise<WindowInfo[]> {
    try {
      const windows = await invoke<WindowInfo[]>('get_all_project_windows');
      return windows;
    } catch (error) {
      logger.error('Failed to get all windows:', error);
      return [];
    }
  }

  /**
   * Get current window label
   */
  static async getCurrentWindowLabel(): Promise<string> {
    try {
      const label = await invoke<string>('get_current_window_label');
      return label;
    } catch (error) {
      logger.error('Failed to get current window label:', error);
      return 'main';
    }
  }

  /**
   * Check if a project is already open in a window
   * Returns the window label if found, null otherwise
   */
  static async checkProjectWindowExists(rootPath: string): Promise<string | null> {
    try {
      const label = await invoke<string | null>('check_project_window_exists', {
        rootPath,
      });
      return label;
    } catch (error) {
      logger.error('Failed to check project window:', error);
      return null;
    }
  }

  /**
   * Focus a window by label
   */
  static async focusWindow(label: string): Promise<void> {
    try {
      await invoke('focus_project_window', { label });
    } catch (error) {
      logger.error('Failed to focus window:', error);
      throw error;
    }
  }

  /**
   * Update window's project information
   */
  static async updateWindowProject(
    label: string,
    projectId?: string,
    rootPath?: string
  ): Promise<void> {
    try {
      await invoke('update_window_project', {
        label,
        projectId,
        rootPath,
      });
    } catch (error) {
      logger.error('Failed to update window project:', error);
      throw error;
    }
  }

  /**
   * Start file watching for a window
   */
  static async startWindowFileWatching(windowLabel: string, path: string): Promise<void> {
    try {
      await invoke('start_window_file_watching', {
        windowLabel,
        path,
      });
    } catch (error) {
      logger.error('Failed to start window file watching:', error);
      throw error;
    }
  }

  /**
   * Stop file watching for a window
   */
  static async stopWindowFileWatching(windowLabel: string): Promise<void> {
    try {
      await invoke('stop_window_file_watching', {
        windowLabel,
      });
    } catch (error) {
      logger.error('Failed to stop window file watching:', error);
      throw error;
    }
  }

  /**
   * Open a project in a new window or focus existing window if already open
   */
  static async openProjectInWindow(
    rootPath: string,
    projectId?: string,
    forceNew: boolean = false
  ): Promise<string> {
    // Check if project is already open
    if (!forceNew) {
      const existingLabel = await WindowManagerService.checkProjectWindowExists(rootPath);
      if (existingLabel) {
        // Focus existing window
        await WindowManagerService.focusWindow(existingLabel);
        return existingLabel;
      }
    }

    // Create new window
    const label = await WindowManagerService.createProjectWindow(projectId, rootPath);
    return label;
  }
}
