use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::file_watcher::FileWatcher;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub label: String,
    pub project_id: Option<String>,
    pub root_path: Option<String>,
    pub title: String,
}

pub struct WindowState {
    pub project_id: Option<String>,
    pub root_path: Option<String>,
    pub file_watcher: Option<FileWatcher>,
}

#[derive(Clone)]
pub struct WindowRegistry {
    windows: Arc<Mutex<HashMap<String, WindowState>>>,
}

impl WindowRegistry {
    pub fn new() -> Self {
        Self {
            windows: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn register_window(&self, label: String, state: WindowState) -> Result<(), String> {
        let mut windows = self.windows.lock().map_err(|e| e.to_string())?;
        windows.insert(label, state);
        Ok(())
    }

    pub fn unregister_window(&self, label: &str) -> Result<(), String> {
        let mut windows = self.windows.lock().map_err(|e| e.to_string())?;
        if let Some(mut state) = windows.remove(label) {
            // Stop file watcher if exists
            if let Some(mut watcher) = state.file_watcher.take() {
                watcher.stop();
            }
        }
        Ok(())
    }

    pub fn get_all_windows(&self) -> Result<Vec<WindowInfo>, String> {
        let windows = self.windows.lock().map_err(|e| e.to_string())?;
        let mut infos = Vec::new();
        for (label, state) in windows.iter() {
            infos.push(WindowInfo {
                label: label.clone(),
                project_id: state.project_id.clone(),
                root_path: state.root_path.clone(),
                title: state.root_path.clone().unwrap_or_else(|| "TalkCody".to_string()),
            });
        }
        Ok(infos)
    }

    pub fn find_window_by_project(&self, root_path: &str) -> Result<Option<String>, String> {
        let windows = self.windows.lock().map_err(|e| e.to_string())?;
        for (label, state) in windows.iter() {
            if let Some(ref path) = state.root_path {
                if path == root_path {
                    return Ok(Some(label.clone()));
                }
            }
        }
        Ok(None)
    }

    pub fn update_window_project(
        &self,
        label: &str,
        project_id: Option<String>,
        root_path: Option<String>,
    ) -> Result<(), String> {
        let mut windows = self.windows.lock().map_err(|e| e.to_string())?;
        if let Some(state) = windows.get_mut(label) {
            state.project_id = project_id;
            state.root_path = root_path;
        }
        Ok(())
    }

    pub fn set_window_file_watcher(
        &self,
        label: &str,
        watcher: Option<FileWatcher>,
    ) -> Result<(), String> {
        let mut windows = self.windows.lock().map_err(|e| e.to_string())?;
        if let Some(state) = windows.get_mut(label) {
            // Stop existing watcher if any
            if let Some(mut old_watcher) = state.file_watcher.take() {
                old_watcher.stop();
            }
            state.file_watcher = watcher;
        }
        Ok(())
    }
}

pub fn create_window(
    app_handle: &AppHandle,
    window_registry: &WindowRegistry,
    project_id: Option<String>,
    root_path: Option<String>,
) -> Result<String, String> {
    // Check if project is already open in another window
    if let Some(ref path) = root_path {
        if let Some(existing_label) = window_registry.find_window_by_project(path)? {
            // Try to focus existing window
            log::info!("Project already open in window: {}, attempting to focus it", existing_label);
            if let Some(window) = app_handle.get_webview_window(&existing_label) {
                // Window exists, focus it
                window.set_focus().map_err(|e| e.to_string())?;
                window.show().map_err(|e| e.to_string())?;
                #[cfg(target_os = "macos")]
                {
                    use cocoa::appkit::NSApplication;
                    unsafe {
                        let app = cocoa::appkit::NSApp();
                        app.activateIgnoringOtherApps_(cocoa::base::YES);
                    }
                }
                log::info!("Successfully focused existing window: {}", existing_label);
                return Ok(existing_label);
            } else {
                // Window is in registry but doesn't actually exist (was closed without cleanup)
                log::warn!("Window {} is in registry but doesn't exist, cleaning up", existing_label);
                window_registry.unregister_window(&existing_label)?;
                log::info!("Cleaned up stale window registration, will create new window");
                // Continue to create a new window
            }
        }
    }

    // Generate unique window label
    let label = format!("window-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis());

    let title = root_path
        .as_ref()
        .and_then(|p| std::path::Path::new(p).file_name())
        .and_then(|n| n.to_str())
        .map(|s| format!("{} - TalkCody", s))
        .unwrap_or_else(|| "TalkCody".to_string());

    log::info!("Creating new window with label: {}", label);

    // Create window
    let window = WebviewWindowBuilder::new(
        app_handle,
        &label,
        WebviewUrl::App("/".into()),
    )
    .title(&title)
    .inner_size(1200.0, 800.0)
    .build()
    .map_err(|e| format!("Failed to create window: {}", e))?;

    // Register window in registry
    let state = WindowState {
        project_id: project_id.clone(),
        root_path: root_path.clone(),
        file_watcher: None,
    };
    window_registry.register_window(label.clone(), state)?;

    // Setup window close handler to clean up registry
    let registry_clone = window_registry.clone();
    let label_clone = label.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            log::info!("Window {} is being destroyed, cleaning up registry", label_clone);
            if let Err(e) = registry_clone.unregister_window(&label_clone) {
                log::error!("Failed to unregister window {}: {}", label_clone, e);
            }
        }
    });

    log::info!("Window created successfully: {}", label);
    Ok(label)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_window_registry_new() {
        let registry = WindowRegistry::new();
        let windows = registry.get_all_windows().unwrap();
        assert!(windows.is_empty());
    }

    #[test]
    fn test_register_window() {
        let registry = WindowRegistry::new();

        let state = WindowState {
            project_id: Some("project-1".to_string()),
            root_path: Some("/path/to/project".to_string()),
            file_watcher: None,
        };

        let result = registry.register_window("window-1".to_string(), state);
        assert!(result.is_ok());

        let windows = registry.get_all_windows().unwrap();
        assert_eq!(windows.len(), 1);
        assert_eq!(windows[0].label, "window-1");
        assert_eq!(windows[0].project_id, Some("project-1".to_string()));
        assert_eq!(windows[0].root_path, Some("/path/to/project".to_string()));
    }

    #[test]
    fn test_unregister_window() {
        let registry = WindowRegistry::new();

        let state = WindowState {
            project_id: Some("project-1".to_string()),
            root_path: Some("/path/to/project".to_string()),
            file_watcher: None,
        };

        registry.register_window("window-1".to_string(), state).unwrap();
        assert_eq!(registry.get_all_windows().unwrap().len(), 1);

        let result = registry.unregister_window("window-1");
        assert!(result.is_ok());
        assert!(registry.get_all_windows().unwrap().is_empty());
    }

    #[test]
    fn test_unregister_nonexistent_window() {
        let registry = WindowRegistry::new();

        // Should not error when unregistering a window that doesn't exist
        let result = registry.unregister_window("nonexistent");
        assert!(result.is_ok());
    }

    #[test]
    fn test_find_window_by_project() {
        let registry = WindowRegistry::new();

        let state1 = WindowState {
            project_id: Some("project-1".to_string()),
            root_path: Some("/path/to/project1".to_string()),
            file_watcher: None,
        };

        let state2 = WindowState {
            project_id: Some("project-2".to_string()),
            root_path: Some("/path/to/project2".to_string()),
            file_watcher: None,
        };

        registry.register_window("window-1".to_string(), state1).unwrap();
        registry.register_window("window-2".to_string(), state2).unwrap();

        let found = registry.find_window_by_project("/path/to/project1").unwrap();
        assert_eq!(found, Some("window-1".to_string()));

        let found = registry.find_window_by_project("/path/to/project2").unwrap();
        assert_eq!(found, Some("window-2".to_string()));

        let not_found = registry.find_window_by_project("/path/to/unknown").unwrap();
        assert!(not_found.is_none());
    }

    #[test]
    fn test_update_window_project() {
        let registry = WindowRegistry::new();

        let state = WindowState {
            project_id: Some("old-project".to_string()),
            root_path: Some("/old/path".to_string()),
            file_watcher: None,
        };

        registry.register_window("window-1".to_string(), state).unwrap();

        // Update the window project
        registry.update_window_project(
            "window-1",
            Some("new-project".to_string()),
            Some("/new/path".to_string()),
        ).unwrap();

        let windows = registry.get_all_windows().unwrap();
        assert_eq!(windows[0].project_id, Some("new-project".to_string()));
        assert_eq!(windows[0].root_path, Some("/new/path".to_string()));
    }

    #[test]
    fn test_update_nonexistent_window() {
        let registry = WindowRegistry::new();

        // Should not error when updating a window that doesn't exist
        let result = registry.update_window_project(
            "nonexistent",
            Some("project".to_string()),
            Some("/path".to_string()),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_multiple_windows() {
        let registry = WindowRegistry::new();

        for i in 0..5 {
            let state = WindowState {
                project_id: Some(format!("project-{}", i)),
                root_path: Some(format!("/path/to/project{}", i)),
                file_watcher: None,
            };
            registry.register_window(format!("window-{}", i), state).unwrap();
        }

        let windows = registry.get_all_windows().unwrap();
        assert_eq!(windows.len(), 5);
    }

    #[test]
    fn test_window_info_serialization() {
        let info = WindowInfo {
            label: "window-1".to_string(),
            project_id: Some("project-1".to_string()),
            root_path: Some("/path/to/project".to_string()),
            title: "Project - TalkCody".to_string(),
        };

        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"label\":\"window-1\""));
        assert!(json.contains("\"project_id\":\"project-1\""));
        assert!(json.contains("\"root_path\":\"/path/to/project\""));
        assert!(json.contains("\"title\":\"Project - TalkCody\""));

        let parsed: WindowInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.label, "window-1");
        assert_eq!(parsed.project_id, Some("project-1".to_string()));
    }

    #[test]
    fn test_window_info_with_none_values() {
        let info = WindowInfo {
            label: "window-1".to_string(),
            project_id: None,
            root_path: None,
            title: "TalkCody".to_string(),
        };

        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"project_id\":null"));
        assert!(json.contains("\"root_path\":null"));

        let parsed: WindowInfo = serde_json::from_str(&json).unwrap();
        assert!(parsed.project_id.is_none());
        assert!(parsed.root_path.is_none());
    }

    #[test]
    fn test_get_all_windows_title_fallback() {
        let registry = WindowRegistry::new();

        // Window with root_path - should use root_path as title
        let state_with_path = WindowState {
            project_id: None,
            root_path: Some("/path/to/project".to_string()),
            file_watcher: None,
        };
        registry.register_window("window-1".to_string(), state_with_path).unwrap();

        // Window without root_path - should use "TalkCody" as title
        let state_without_path = WindowState {
            project_id: None,
            root_path: None,
            file_watcher: None,
        };
        registry.register_window("window-2".to_string(), state_without_path).unwrap();

        let windows = registry.get_all_windows().unwrap();
        assert_eq!(windows.len(), 2);

        // Find each window and check title
        for window in &windows {
            if window.label == "window-1" {
                assert_eq!(window.title, "/path/to/project");
            } else if window.label == "window-2" {
                assert_eq!(window.title, "TalkCody");
            }
        }
    }

    #[test]
    fn test_registry_thread_safety() {
        use std::thread;

        let registry = Arc::new(WindowRegistry::new());

        // Spawn multiple threads to register windows
        let mut handles = vec![];
        for i in 0..10 {
            let registry_clone = Arc::clone(&registry);
            let handle = thread::spawn(move || {
                let state = WindowState {
                    project_id: Some(format!("project-{}", i)),
                    root_path: Some(format!("/path/{}", i)),
                    file_watcher: None,
                };
                registry_clone.register_window(format!("window-{}", i), state).unwrap();
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        let windows = registry.get_all_windows().unwrap();
        assert_eq!(windows.len(), 10);
    }
}
