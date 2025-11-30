pub mod diff;
pub mod repository;
pub mod status;
pub mod types;

use types::{GitStatus, GitFileStatus, DiffLineType};

/// Gets the Git status for a repository at the given path
#[tauri::command]
pub async fn git_get_status(repo_path: String) -> Result<GitStatus, String> {
    let repo = repository::discover_repository(&repo_path)
        .map_err(|e| format!("Failed to open repository: {}", e))?;

    status::get_repository_status(&repo)
        .map_err(|e| format!("Failed to get repository status: {}", e))
}

/// Checks if a path is a Git repository
#[tauri::command]
pub async fn git_is_repository(repo_path: String) -> Result<bool, String> {
    Ok(repository::is_git_repository(&repo_path))
}

/// Gets all file statuses as a map
#[tauri::command]
pub async fn git_get_all_file_statuses(
    repo_path: String,
) -> Result<std::collections::HashMap<String, (GitFileStatus, bool)>, String> {
    let repo = repository::discover_repository(&repo_path)
        .map_err(|e| format!("Failed to open repository: {}", e))?;

    status::get_all_file_statuses(&repo)
        .map_err(|e| format!("Failed to get all file statuses: {}", e))
}

/// Gets line-level changes for a file (for editor gutter indicators)
#[tauri::command]
pub async fn git_get_line_changes(
    repo_path: String,
    file_path: String,
) -> Result<Vec<(u32, DiffLineType)>, String> {
    let repo = repository::discover_repository(&repo_path)
        .map_err(|e| format!("Failed to open repository: {}", e))?;

    // Convert absolute path to relative path from repo root
    let repo_root = repository::get_repository_root(&repo)
        .ok_or_else(|| "Failed to get repository root".to_string())?;

    let relative_path = if file_path.starts_with(&repo_root) {
        file_path[repo_root.len()..].trim_start_matches('/')
    } else {
        &file_path
    };

    diff::get_line_changes(&repo, relative_path)
        .map_err(|e| format!("Failed to get line changes: {}", e))
}
