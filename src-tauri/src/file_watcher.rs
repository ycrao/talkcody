use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::{mpsc, Arc, atomic::{AtomicBool, Ordering}};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use crate::constants::EXCLUDED_DIRS;

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
    _thread_handle: Option<JoinHandle<()>>,
    _stop_flag: Arc<AtomicBool>,
    // Git watcher (separate from main file watcher)
    _git_watcher: Option<RecommendedWatcher>,
    _git_thread_handle: Option<JoinHandle<()>>,
    _git_stop_flag: Arc<AtomicBool>,
}

impl FileWatcher {
    pub fn new() -> notify::Result<Self> {
        // Create a dummy watcher initially
        let (sender, _receiver) = mpsc::channel();
        let watcher = RecommendedWatcher::new(
            move |result| {
                if let Err(e) = sender.send(result) {
                    log::error!("Failed to send file watcher event: {}", e);
                }
            },
            Config::default(),
        )?;

        Ok(Self {
            _watcher: watcher,
            _thread_handle: None,
            _stop_flag: Arc::new(AtomicBool::new(false)),
            _git_watcher: None,
            _git_thread_handle: None,
            _git_stop_flag: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn watch_directory<P: AsRef<Path>>(
        &mut self,
        path: P,
        app_handle: AppHandle,
    ) -> notify::Result<()> {
        // Stop any existing watcher first
        self.stop();

        let repo_path = path.as_ref().to_path_buf();

        let (sender, receiver) = mpsc::channel();

        // Create a new watcher
        let mut watcher = RecommendedWatcher::new(
            move |result| {
                if let Err(e) = sender.send(result) {
                    log::error!("Failed to send file watcher event: {}", e);
                }
            },
            Config::default(),
        )?;

        // Start watching
        watcher.watch(path.as_ref(), RecursiveMode::Recursive)?;

        // Replace the old watcher
        self._watcher = watcher;

        // Create new stop flag
        self._stop_flag = Arc::new(AtomicBool::new(false));
        let stop_flag = Arc::clone(&self._stop_flag);

        // Clone app_handle for the file watcher thread
        let file_app_handle = app_handle.clone();

        // Spawn thread to handle events
        let thread_handle = thread::spawn(move || {
            let mut last_event_time = std::time::Instant::now();
            let debounce_duration = Duration::from_millis(500);

            loop {
                // Check stop flag first
                if stop_flag.load(Ordering::Relaxed) {
                    log::info!("File watcher thread stopping");
                    break;
                }

                match receiver.recv_timeout(Duration::from_millis(500)) {
                    Ok(Ok(event)) => {
                        let now = std::time::Instant::now();

                        // Debounce events to avoid too many refreshes
                        if now.duration_since(last_event_time) < debounce_duration {
                            continue;
                        }

                        // Filter events we care about
                        match event.kind {
                            notify::EventKind::Create(_)
                            | notify::EventKind::Remove(_)
                            | notify::EventKind::Modify(notify::event::ModifyKind::Name(_))
                            | notify::EventKind::Modify(notify::event::ModifyKind::Data(_)) => {
                                // Check if the event is for files we care about
                                let should_emit = event.paths.iter().any(|path| {
                                    Self::should_watch_path(path)
                                });

                                if should_emit {
                                    if let Err(e) = file_app_handle.emit("file-system-changed", &event.paths) {
                                        log::error!("Failed to emit file system change event: {}", e);
                                    }
                                    last_event_time = now;
                                }
                            }
                            _ => {}
                        }
                    }
                    Ok(Err(e)) => {
                        log::error!("File watcher error: {}", e);
                    }
                    Err(_) => {
                        // Timeout, check stop flag and continue
                    }
                }
            }
        });

        self._thread_handle = Some(thread_handle);

        // Also start watching the .git directory for git status changes
        self.watch_git_directory(&repo_path, app_handle)?;

        Ok(())
    }

    /// Watch the .git directory for git status changes
    fn watch_git_directory<P: AsRef<Path>>(&mut self, repo_path: P, app_handle: AppHandle) -> notify::Result<()> {
        let git_path = repo_path.as_ref().join(".git");

        if !git_path.exists() {
            log::info!("No .git directory found at {:?}, skipping git watcher", git_path);
            return Ok(());
        }

        log::info!("Starting git directory watcher for: {:?}", git_path);

        // Stop any existing git watcher
        self.stop_git_watcher();

        let (sender, receiver) = mpsc::channel();

        // Create a new watcher for .git directory
        let mut watcher = RecommendedWatcher::new(
            move |result| {
                if let Err(e) = sender.send(result) {
                    log::error!("Failed to send git watcher event: {}", e);
                }
            },
            Config::default(),
        )?;

        // Watch the .git directory recursively
        watcher.watch(&git_path, RecursiveMode::Recursive)?;

        self._git_watcher = Some(watcher);

        // Create new stop flag for git watcher
        self._git_stop_flag = Arc::new(AtomicBool::new(false));
        let stop_flag = Arc::clone(&self._git_stop_flag);

        // Spawn thread to handle git events
        let git_thread_handle = thread::spawn(move || {
            let mut last_event_time = std::time::Instant::now();
            let debounce_duration = Duration::from_millis(500);

            loop {
                // Check stop flag first
                if stop_flag.load(Ordering::Relaxed) {
                    log::info!("Git watcher thread stopping");
                    break;
                }

                match receiver.recv_timeout(Duration::from_millis(500)) {
                    Ok(Ok(event)) => {
                        let now = std::time::Instant::now();

                        // Debounce events to avoid too many refreshes
                        if now.duration_since(last_event_time) < debounce_duration {
                            continue;
                        }

                        // Check if this is a git status-related file change
                        let is_git_status_change = event.paths.iter().any(|path| {
                            Self::is_git_status_file(path)
                        });

                        if is_git_status_change {
                            log::info!("Git status change detected: {:?}", event.paths);
                            // Emit event to frontend
                            if let Err(e) = app_handle.emit("git-status-changed", ()) {
                                log::error!("Failed to emit git-status-changed event: {}", e);
                            }
                            last_event_time = now;
                        }
                    }
                    Ok(Err(e)) => {
                        log::error!("Git watcher error: {}", e);
                    }
                    Err(_) => {
                        // Timeout, check stop flag and continue
                    }
                }
            }
        });

        self._git_thread_handle = Some(git_thread_handle);

        Ok(())
    }

    /// Stop the git watcher
    fn stop_git_watcher(&mut self) {
        // Set stop flag to signal thread to exit
        self._git_stop_flag.store(true, Ordering::Relaxed);

        // Drop the watcher first to close the watch
        self._git_watcher = None;

        // Wait for thread to finish
        if let Some(handle) = self._git_thread_handle.take() {
            if let Err(e) = handle.join() {
                log::error!("Failed to join git watcher thread: {:?}", e);
            }
        }
    }

    /// Stop the file watcher and wait for thread to finish
    pub fn stop(&mut self) {
        // Stop git watcher first
        self.stop_git_watcher();

        // Set stop flag to signal thread to exit
        self._stop_flag.store(true, Ordering::Relaxed);

        // Wait for thread to finish
        if let Some(handle) = self._thread_handle.take() {
            if let Err(e) = handle.join() {
                log::error!("Failed to join file watcher thread: {:?}", e);
            }
        }
    }

    /// Check if a path should be watched (not ignored)
    fn should_watch_path(path: &Path) -> bool {
        // Check if any component of the path is in EXCLUDED_DIRS
        for component in path.components() {
            if let Some(name) = component.as_os_str().to_str() {
                if EXCLUDED_DIRS.contains(&name) {
                    return false;
                }
            }
        }

        // Check file extensions to ignore
        if let Some(extension) = path.extension() {
            let ext_str = extension.to_string_lossy().to_lowercase();
            let ignore_extensions = [
                "tmp", "temp", "log", "cache", "lock", "swp", "swo", "bak",
                "DS_Store", "Thumbs.db", "desktop.ini",
            ];

            if ignore_extensions.contains(&ext_str.as_str()) {
                return false;
            }
        }

        true
    }

    /// Check if a path is a git status-related file
    fn is_git_status_file(path: &Path) -> bool {
        let path_str = path.to_string_lossy();

        // Ignore lock files - they are temporary and don't indicate status changes
        if path_str.ends_with(".lock") {
            return false;
        }

        // Files that indicate git status changes
        // .git/index - staging area changes (git add/reset)
        // .git/HEAD - current branch changes (git checkout)
        // .git/refs/heads/* - local branch commit changes (git commit)
        // .git/refs/remotes/* - remote branch changes (git fetch/pull)
        // .git/MERGE_HEAD - merge state
        // .git/REBASE_HEAD - rebase state
        // .git/CHERRY_PICK_HEAD - cherry-pick state
        // .git/ORIG_HEAD - original head before dangerous operations

        if path_str.ends_with(".git/index") || path_str.contains(".git/index") && !path_str.ends_with(".lock") {
            return true;
        }
        if path_str.ends_with(".git/HEAD") || path_str.ends_with("/HEAD") {
            return true;
        }
        if path_str.contains(".git/refs/heads/") {
            return true;
        }
        if path_str.contains(".git/refs/remotes/") {
            return true;
        }
        if path_str.ends_with("MERGE_HEAD")
            || path_str.ends_with("REBASE_HEAD")
            || path_str.ends_with("CHERRY_PICK_HEAD")
            || path_str.ends_with("ORIG_HEAD") {
            return true;
        }

        false
    }
}
