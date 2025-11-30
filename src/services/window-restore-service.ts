import { getCurrentWindow } from '@tauri-apps/api/window';
import { logger } from '@/lib/logger';
import { type WindowState, WindowStateStore } from '@/lib/window-state-store';
import { WindowManagerService } from './window-manager-service';

export class WindowRestoreService {
  private constructor() {}

  /**
   * Save current window state
   */
  static async saveCurrentWindowState(projectId?: string, rootPath?: string): Promise<void> {
    try {
      const currentWindow = getCurrentWindow();
      const label = currentWindow.label;

      // Get window position and size
      const position = await currentWindow.outerPosition();
      const size = await currentWindow.outerSize();

      const state: WindowState = {
        label,
        projectId,
        rootPath,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      };

      await WindowStateStore.saveWindowState(state);
      logger.info('Window state saved:', state);
    } catch (error) {
      logger.error('Failed to save window state:', error);
    }
  }

  /**
   * Restore all windows from last session
   * This should be called on app startup
   */
  static async restoreWindows(): Promise<void> {
    try {
      const windowsToRestore = await WindowStateStore.getWindowsToRestore();

      if (windowsToRestore.length === 0) {
        logger.info('No windows to restore');
        return;
      }

      logger.info(`Restoring ${windowsToRestore.length} windows`);

      // Restore windows one by one
      for (const windowState of windowsToRestore) {
        try {
          if (windowState.rootPath) {
            await WindowManagerService.openProjectInWindow(
              windowState.rootPath,
              windowState.projectId
            );
            logger.info(`Restored window for: ${windowState.rootPath}`);
          }
        } catch (error) {
          logger.error(`Failed to restore window for ${windowState.rootPath}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to restore windows:', error);
    }
  }

  /**
   * Save all open windows state before closing
   */
  static async saveAllWindowsState(): Promise<void> {
    try {
      const windows = await WindowManagerService.getAllWindows();

      for (const window of windows) {
        if (window.label !== 'main' && window.root_path) {
          const state: WindowState = {
            label: window.label,
            projectId: window.project_id,
            rootPath: window.root_path,
          };
          await WindowStateStore.saveWindowState(state);
        }
      }

      logger.info('All window states saved');
    } catch (error) {
      logger.error('Failed to save all window states:', error);
    }
  }

  /**
   * Clean up window state when a window is closed
   */
  static async onWindowClosed(label: string): Promise<void> {
    try {
      await WindowStateStore.removeWindowState(label);
      logger.info(`Window state removed for: ${label}`);
    } catch (error) {
      logger.error(`Failed to remove window state for ${label}:`, error);
    }
  }
}
