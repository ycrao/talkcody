// src-tauri/src/lsp.rs
// LSP (Language Server Protocol) client management for talkcody
//
// This module manages LSP server processes and provides bidirectional
// communication between the frontend and LSP servers via JSON-RPC over stdio.
//
// LSP servers are automatically downloaded to ~/.talkcody/lsp-servers/

use flate2::read::GzDecoder;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command as TokioCommand};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

/// LSP server registry - global state for managing LSP servers
#[derive(Default)]
pub struct LspRegistry {
    servers: HashMap<String, Arc<Mutex<LspServer>>>,
}

impl LspRegistry {
    pub fn new() -> Self {
        Self {
            servers: HashMap::new(),
        }
    }

    pub fn insert(&mut self, server_id: String, server: Arc<Mutex<LspServer>>) {
        self.servers.insert(server_id, server);
    }

    pub fn get(&self, server_id: &str) -> Option<Arc<Mutex<LspServer>>> {
        self.servers.get(server_id).cloned()
    }

    pub fn remove(&mut self, server_id: &str) -> Option<Arc<Mutex<LspServer>>> {
        self.servers.remove(server_id)
    }

    pub fn list(&self) -> Vec<String> {
        self.servers.keys().cloned().collect()
    }
}

/// Global LSP registry state
pub struct LspState(pub Mutex<LspRegistry>);

/// LSP server instance
pub struct LspServer {
    pub server_id: String,
    pub language: String,
    pub root_path: String,
    pub child: Option<Child>,
    pub stdin: Option<ChildStdin>,
    pub stdout_task: Option<JoinHandle<()>>,
    pub is_initialized: bool,
}

impl LspServer {
    pub fn new(server_id: String, language: String, root_path: String) -> Self {
        Self {
            server_id,
            language,
            root_path,
            child: None,
            stdin: None,
            stdout_task: None,
            is_initialized: false,
        }
    }
}

/// LSP server configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspServerConfig {
    pub command: String,
    pub args: Vec<String>,
    pub extensions: Vec<String>,
}

/// Response for starting an LSP server
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspStartResponse {
    pub server_id: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Response for listing LSP servers
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspServerInfo {
    pub server_id: String,
    pub language: String,
    pub root_path: String,
    pub is_initialized: bool,
}

/// LSP message event payload
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspMessageEvent {
    pub server_id: String,
    pub message: String,
}

/// Download progress event
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspDownloadProgress {
    pub language: String,
    pub status: String, // "downloading", "extracting", "completed", "error"
    pub progress: Option<f32>, // 0.0 - 1.0
    pub message: Option<String>,
}

/// Server availability status
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspServerStatus {
    pub available: bool,
    pub installed: bool,
    pub install_path: Option<String>,
    pub can_download: bool,
    pub download_url: Option<String>,
}

// ============================================================================
// LSP Server Directory Management
// ============================================================================

/// Get the LSP servers directory (~/.talkcody/lsp-servers/)
fn get_lsp_servers_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Failed to get home directory")?;
    let lsp_dir = home.join(".talkcody").join("lsp-servers");
    Ok(lsp_dir)
}

/// Ensure the LSP servers directory exists
fn ensure_lsp_servers_dir() -> Result<PathBuf, String> {
    let lsp_dir = get_lsp_servers_dir()?;
    if !lsp_dir.exists() {
        std::fs::create_dir_all(&lsp_dir)
            .map_err(|e| format!("Failed to create LSP servers directory: {}", e))?;
    }
    Ok(lsp_dir)
}

/// Get the path to a specific LSP server binary
fn get_lsp_server_path(server_name: &str) -> Result<PathBuf, String> {
    let lsp_dir = get_lsp_servers_dir()?;

    #[cfg(target_os = "windows")]
    let binary_name = format!("{}.exe", server_name);
    #[cfg(not(target_os = "windows"))]
    let binary_name = server_name.to_string();

    Ok(lsp_dir.join(binary_name))
}

/// Check if an LSP server is installed locally
fn is_lsp_server_installed(server_name: &str) -> bool {
    if let Ok(path) = get_lsp_server_path(server_name) {
        path.exists()
    } else {
        false
    }
}

// ============================================================================
// rust-analyzer Download
// ============================================================================

/// Get the download URL for rust-analyzer based on current platform
fn get_rust_analyzer_download_url() -> Option<String> {
    let (os, arch) = get_platform_info();

    let suffix = match (os.as_str(), arch.as_str()) {
        ("macos", "x86_64") => "x86_64-apple-darwin.gz",
        ("macos", "aarch64") => "aarch64-apple-darwin.gz",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu.gz",
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu.gz",
        ("windows", "x86_64") => "x86_64-pc-windows-msvc.zip",
        _ => return None,
    };

    Some(format!(
        "https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-{}",
        suffix
    ))
}

/// Get platform info (os, arch)
fn get_platform_info() -> (String, String) {
    let os = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "unknown"
    };

    let arch = if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "unknown"
    };

    (os.to_string(), arch.to_string())
}

/// Download rust-analyzer to the local LSP servers directory
async fn download_rust_analyzer(app: &AppHandle) -> Result<PathBuf, String> {
    let lsp_dir = ensure_lsp_servers_dir()?;
    let download_url = get_rust_analyzer_download_url()
        .ok_or("rust-analyzer is not available for this platform")?;

    log::info!("Downloading rust-analyzer from: {}", download_url);

    // Emit progress event
    emit_download_progress(app, "rust", "downloading", None, Some("Starting download..."));

    // Download the file
    let client = Client::new();
    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download rust-analyzer: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download rust-analyzer: HTTP {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    emit_download_progress(app, "rust", "extracting", Some(0.5), Some("Extracting..."));

    // Determine output path
    #[cfg(target_os = "windows")]
    let output_path = lsp_dir.join("rust-analyzer.exe");
    #[cfg(not(target_os = "windows"))]
    let output_path = lsp_dir.join("rust-analyzer");

    // Track if we successfully wrote the binary
    let mut binary_written = false;

    // Extract based on file type
    if download_url.ends_with(".gz") {
        // Extract gzip
        let mut decoder = GzDecoder::new(&bytes[..]);
        let mut decompressed = Vec::new();
        decoder
            .read_to_end(&mut decompressed)
            .map_err(|e| format!("Failed to decompress: {}", e))?;

        if decompressed.is_empty() {
            return Err("Downloaded file is empty after decompression".to_string());
        }

        std::fs::write(&output_path, &decompressed)
            .map_err(|e| format!("Failed to write rust-analyzer: {}", e))?;
        binary_written = true;
    } else if download_url.ends_with(".zip") {
        // For Windows - extract zip
        let cursor = std::io::Cursor::new(&bytes[..]);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("Failed to open zip: {}", e))?;

        // Look for rust-analyzer executable in the zip
        for i in 0..archive.len() {
            let mut file = archive.by_index(i)
                .map_err(|e| format!("Failed to read zip entry: {}", e))?;

            let file_name = file.name().to_string();
            // Match rust-analyzer.exe or rust-analyzer (in case of different archive structures)
            if file_name.ends_with("rust-analyzer.exe") ||
               (file_name.ends_with("rust-analyzer") && !file_name.contains('/')) ||
               file_name == "rust-analyzer" {
                let mut contents = Vec::new();
                file.read_to_end(&mut contents)
                    .map_err(|e| format!("Failed to read file from zip: {}", e))?;

                if contents.is_empty() {
                    return Err("Extracted binary is empty".to_string());
                }

                std::fs::write(&output_path, &contents)
                    .map_err(|e| format!("Failed to write rust-analyzer: {}", e))?;
                binary_written = true;
                log::info!("Extracted {} from zip", file_name);
                break;
            }
        }
    }

    // Verify the binary was actually written
    if !binary_written {
        return Err("Failed to extract rust-analyzer binary from archive".to_string());
    }

    // Verify the file exists and has non-zero size
    let metadata = std::fs::metadata(&output_path)
        .map_err(|e| format!("Failed to verify downloaded binary: {}", e))?;
    if metadata.len() == 0 {
        std::fs::remove_file(&output_path).ok();
        return Err("Downloaded binary is empty".to_string());
    }

    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = metadata.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&output_path, perms)
            .map_err(|e| format!("Failed to set executable permission: {}", e))?;
    }

    emit_download_progress(app, "rust", "completed", Some(1.0), Some("Download complete"));

    log::info!("rust-analyzer downloaded to: {:?} ({} bytes)", output_path, metadata.len());
    Ok(output_path)
}

// ============================================================================
// TypeScript Language Server
// ============================================================================

/// Find bun or npm executable
fn find_package_runner() -> Option<(String, Vec<String>)> {
    // Prefer bun, then npx
    if which::which("bunx").is_ok() {
        Some(("bunx".to_string(), vec![]))
    } else if which::which("npx").is_ok() {
        Some(("npx".to_string(), vec![]))
    } else {
        None
    }
}

/// Get the command to run typescript-language-server
fn get_typescript_server_command() -> Option<(String, Vec<String>)> {
    // First check if globally installed
    if which::which("typescript-language-server").is_ok() {
        return Some(("typescript-language-server".to_string(), vec!["--stdio".to_string()]));
    }

    // Otherwise use bunx/npx
    if let Some((runner, _)) = find_package_runner() {
        Some((runner, vec!["typescript-language-server".to_string(), "--stdio".to_string()]))
    } else {
        None
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Emit download progress event
fn emit_download_progress(
    app: &AppHandle,
    language: &str,
    status: &str,
    progress: Option<f32>,
    message: Option<&str>,
) {
    let event = LspDownloadProgress {
        language: language.to_string(),
        status: status.to_string(),
        progress,
        message: message.map(|s| s.to_string()),
    };

    if let Err(e) = app.emit("lsp-download-progress", &event) {
        log::error!("Failed to emit download progress: {}", e);
    }
}

/// Get the command for a language server
/// Returns (command, args) or None if not available
fn get_lsp_command(language: &str) -> Option<(String, Vec<String>)> {
    match language {
        "typescript" | "javascript" | "typescriptreact" | "javascriptreact" => {
            get_typescript_server_command()
        }
        "rust" => {
            // First check local installation
            if let Ok(local_path) = get_lsp_server_path("rust-analyzer") {
                if local_path.exists() {
                    return Some((local_path.to_string_lossy().to_string(), vec![]));
                }
            }
            // Then check global installation
            if which::which("rust-analyzer").is_ok() {
                return Some(("rust-analyzer".to_string(), vec![]));
            }
            None
        }
        "python" => {
            if which::which("pyright-langserver").is_ok() {
                Some(("pyright-langserver".to_string(), vec!["--stdio".to_string()]))
            } else {
                None
            }
        }
        "go" => {
            if which::which("gopls").is_ok() {
                Some(("gopls".to_string(), vec![]))
            } else {
                None
            }
        }
        "c" | "cpp" => {
            if which::which("clangd").is_ok() {
                Some(("clangd".to_string(), vec![]))
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Generate a unique server ID
fn generate_server_id(language: &str) -> String {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("lsp_{}_{}", language, timestamp)
}

/// Parse Content-Length header from LSP message
fn parse_content_length(headers: &str) -> Option<usize> {
    for line in headers.lines() {
        if line.to_lowercase().starts_with("content-length:") {
            let value = line.split(':').nth(1)?.trim();
            return value.parse().ok();
        }
    }
    None
}

/// Read a single LSP message from stdout
async fn read_lsp_message(reader: &mut BufReader<ChildStdout>) -> Result<String, String> {
    // Read headers until empty line
    let mut headers = String::new();
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line).await {
            Ok(0) => return Err("EOF reached".to_string()),
            Ok(_) => {
                if line == "\r\n" || line == "\n" {
                    break;
                }
                headers.push_str(&line);
            }
            Err(e) => return Err(format!("Failed to read header: {}", e)),
        }
    }

    // Parse Content-Length
    let content_length = parse_content_length(&headers)
        .ok_or_else(|| "Missing Content-Length header".to_string())?;

    // Read content
    let mut content = vec![0u8; content_length];
    reader
        .read_exact(&mut content)
        .await
        .map_err(|e| format!("Failed to read content: {}", e))?;

    String::from_utf8(content).map_err(|e| format!("Invalid UTF-8: {}", e))
}

/// Write an LSP message to stdin
async fn write_lsp_message(stdin: &mut ChildStdin, message: &str) -> Result<(), String> {
    let header = format!("Content-Length: {}\r\n\r\n", message.len());
    stdin
        .write_all(header.as_bytes())
        .await
        .map_err(|e| format!("Failed to write header: {}", e))?;
    stdin
        .write_all(message.as_bytes())
        .await
        .map_err(|e| format!("Failed to write message: {}", e))?;
    stdin
        .flush()
        .await
        .map_err(|e| format!("Failed to flush: {}", e))?;
    Ok(())
}

/// Validate root_path to ensure it's a valid directory
fn validate_root_path(root_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(root_path);

    // Check if path is absolute
    if !path.is_absolute() {
        return Err(format!("root_path must be absolute: {}", root_path));
    }

    // Check if path exists and is a directory
    if !path.exists() {
        return Err(format!("root_path does not exist: {}", root_path));
    }

    if !path.is_dir() {
        return Err(format!("root_path is not a directory: {}", root_path));
    }

    // Canonicalize to resolve any symlinks or relative components
    let canonical = path.canonicalize()
        .map_err(|e| format!("Failed to resolve root_path: {}", e))?;

    Ok(canonical)
}

/// Start an LSP server for a specific language
#[tauri::command]
pub async fn lsp_start_server(
    app: AppHandle,
    state: tauri::State<'_, LspState>,
    language: String,
    root_path: String,
) -> Result<LspStartResponse, String> {
    log::info!("Starting LSP server for language: {} in {}", language, root_path);

    // Validate root_path
    let validated_root = validate_root_path(&root_path)?;
    let root_path_str = validated_root.to_string_lossy().to_string();

    // Get the command for this language
    let (command, args) = match get_lsp_command(&language) {
        Some(cmd) => cmd,
        None => {
            // Check if we can auto-download
            let status = get_server_status(&language);
            if status.can_download {
                return Err(format!(
                    "LSP server for {} is not installed. Use lsp_download_server to install it.",
                    language
                ));
            } else {
                return Err(format!(
                    "No LSP server available for language: {}. Please install it manually.",
                    language
                ));
            }
        }
    };

    log::info!("Using LSP command: {} {:?}", command, args);

    // Generate server ID
    let server_id = generate_server_id(&language);

    // Spawn the LSP server process
    let mut child = TokioCommand::new(&command)
        .args(&args)
        .current_dir(&validated_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn LSP server '{}': {}", command, e))?;

    log::info!("LSP server started with PID: {:?}", child.id());

    // Take stdin and stdout
    let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;

    // Create server instance
    let mut server = LspServer::new(server_id.clone(), language.clone(), root_path_str);
    server.child = Some(child);
    server.stdin = Some(stdin);

    let server_arc = Arc::new(Mutex::new(server));

    // Register the server
    {
        let mut registry = state.0.lock().await;
        registry.insert(server_id.clone(), server_arc.clone());
    }

    // Spawn stdout reader task
    let app_handle = app.clone();
    let server_id_clone = server_id.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        loop {
            match read_lsp_message(&mut reader).await {
                Ok(message) => {
                    log::debug!("LSP message received: {} bytes", message.len());
                    let event = LspMessageEvent {
                        server_id: server_id_clone.clone(),
                        message,
                    };
                    if let Err(e) = app_handle.emit("lsp-message", &event) {
                        log::error!("Failed to emit LSP message: {}", e);
                    }
                }
                Err(e) => {
                    log::info!("LSP stdout reader ended: {}", e);
                    break;
                }
            }
        }
    });

    // Store the task handle
    {
        let mut server = server_arc.lock().await;
        server.stdout_task = Some(stdout_task);
    }

    Ok(LspStartResponse {
        server_id,
        success: true,
        error: None,
    })
}

/// Send a message to an LSP server
#[tauri::command]
pub async fn lsp_send_message(
    state: tauri::State<'_, LspState>,
    server_id: String,
    message: String,
) -> Result<(), String> {
    log::debug!("Sending LSP message to {}: {} bytes", server_id, message.len());

    let server_arc = {
        let registry = state.0.lock().await;
        registry
            .get(&server_id)
            .ok_or_else(|| format!("LSP server not found: {}", server_id))?
    };

    let mut server = server_arc.lock().await;
    let stdin = server
        .stdin
        .as_mut()
        .ok_or("LSP server stdin not available")?;

    write_lsp_message(stdin, &message).await
}

/// Stop an LSP server
#[tauri::command]
pub async fn lsp_stop_server(
    state: tauri::State<'_, LspState>,
    server_id: String,
) -> Result<(), String> {
    log::info!("Stopping LSP server: {}", server_id);

    let server_arc = {
        let mut registry = state.0.lock().await;
        registry
            .remove(&server_id)
            .ok_or_else(|| format!("LSP server not found: {}", server_id))?
    };

    let mut server = server_arc.lock().await;

    // Cancel stdout task
    if let Some(task) = server.stdout_task.take() {
        task.abort();
    }

    // Kill the child process
    if let Some(mut child) = server.child.take() {
        // Send shutdown request first (graceful shutdown)
        if let Some(stdin) = server.stdin.as_mut() {
            let shutdown_request = r#"{"jsonrpc":"2.0","id":999999,"method":"shutdown","params":null}"#;
            let _ = write_lsp_message(stdin, shutdown_request).await;

            // Wait a bit for graceful shutdown
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

            // Send exit notification
            let exit_notification = r#"{"jsonrpc":"2.0","method":"exit","params":null}"#;
            let _ = write_lsp_message(stdin, exit_notification).await;
        }

        // Force kill if still running
        let _ = child.kill().await;
    }

    log::info!("LSP server stopped: {}", server_id);
    Ok(())
}

/// List all active LSP servers
#[tauri::command]
pub async fn lsp_list_servers(
    state: tauri::State<'_, LspState>,
) -> Result<Vec<LspServerInfo>, String> {
    let registry = state.0.lock().await;
    let mut servers = Vec::new();

    for server_id in registry.list() {
        if let Some(server_arc) = registry.get(&server_id) {
            let server = server_arc.lock().await;
            servers.push(LspServerInfo {
                server_id: server.server_id.clone(),
                language: server.language.clone(),
                root_path: server.root_path.clone(),
                is_initialized: server.is_initialized,
            });
        }
    }

    Ok(servers)
}

/// Get detailed server status for a language
fn get_server_status(language: &str) -> LspServerStatus {
    let available = get_lsp_command(language).is_some();

    // Check if locally installed
    let (installed, install_path) = match language {
        "rust" => {
            if let Ok(path) = get_lsp_server_path("rust-analyzer") {
                if path.exists() {
                    (true, Some(path.to_string_lossy().to_string()))
                } else {
                    (false, None)
                }
            } else {
                (false, None)
            }
        }
        "typescript" | "javascript" | "typescriptreact" | "javascriptreact" => {
            // TypeScript uses bunx/npx, so it's "installed" if we have a package runner
            let has_runner = find_package_runner().is_some();
            let globally_installed = which::which("typescript-language-server").is_ok();
            (has_runner || globally_installed, None)
        }
        _ => {
            // For other languages, check global installation
            if let Some((cmd, _)) = get_lsp_command(language) {
                (which::which(&cmd).is_ok(), None)
            } else {
                (false, None)
            }
        }
    };

    // Determine if we can auto-download
    let (can_download, download_url) = match language {
        "rust" => {
            let url = get_rust_analyzer_download_url();
            (url.is_some(), url)
        }
        "typescript" | "javascript" | "typescriptreact" | "javascriptreact" => {
            // TypeScript uses bunx/npx, no direct download
            (find_package_runner().is_some(), None)
        }
        _ => (false, None),
    };

    LspServerStatus {
        available,
        installed,
        install_path,
        can_download,
        download_url,
    }
}

/// Check if an LSP server is available for a language
#[tauri::command]
pub fn lsp_check_server_available(language: String) -> Result<bool, String> {
    Ok(get_lsp_command(&language).is_some())
}

/// Get detailed LSP server status for a language
#[tauri::command]
pub fn lsp_get_server_status(language: String) -> Result<LspServerStatus, String> {
    Ok(get_server_status(&language))
}

/// Download and install an LSP server
#[tauri::command]
pub async fn lsp_download_server(
    app: AppHandle,
    language: String,
) -> Result<String, String> {
    log::info!("Downloading LSP server for: {}", language);

    match language.as_str() {
        "rust" => {
            let path = download_rust_analyzer(&app).await?;
            Ok(path.to_string_lossy().to_string())
        }
        "typescript" | "javascript" | "typescriptreact" | "javascriptreact" => {
            // For TypeScript, we just need bunx/npx - no download needed
            if find_package_runner().is_some() {
                Ok("TypeScript language server will be run via bunx/npx".to_string())
            } else {
                Err("Please install bun or npm to use TypeScript language server".to_string())
            }
        }
        _ => Err(format!("Auto-download is not supported for language: {}", language)),
    }
}

/// Get LSP server configuration for a language
#[tauri::command]
pub fn lsp_get_server_config(language: String) -> Result<Option<LspServerConfig>, String> {
    let config = get_lsp_command(&language).map(|(command, args)| {
        let extensions = match language.as_str() {
            "typescript" | "javascript" | "typescriptreact" | "javascriptreact" => {
                vec![".ts".to_string(), ".tsx".to_string(), ".js".to_string(), ".jsx".to_string()]
            }
            "rust" => vec![".rs".to_string()],
            "python" => vec![".py".to_string()],
            "go" => vec![".go".to_string()],
            "c" => vec![".c".to_string(), ".h".to_string()],
            "cpp" => vec![".cpp".to_string(), ".hpp".to_string(), ".cc".to_string(), ".hh".to_string()],
            _ => vec![],
        };

        LspServerConfig {
            command,
            args,
            extensions,
        }
    });

    Ok(config)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_lsp_servers_dir() {
        let result = get_lsp_servers_dir();
        assert!(result.is_ok());
        let dir = result.unwrap();
        assert!(dir.ends_with("lsp-servers"));
        assert!(dir.to_string_lossy().contains(".talkcody"));
    }

    #[test]
    fn test_get_lsp_server_path() {
        let result = get_lsp_server_path("rust-analyzer");
        assert!(result.is_ok());
        let path = result.unwrap();

        #[cfg(target_os = "windows")]
        assert!(path.to_string_lossy().ends_with("rust-analyzer.exe"));

        #[cfg(not(target_os = "windows"))]
        assert!(path.to_string_lossy().ends_with("rust-analyzer"));
    }

    #[test]
    fn test_get_platform_info() {
        let (os, arch) = get_platform_info();

        // OS should be one of the known values
        assert!(["macos", "linux", "windows", "unknown"].contains(&os.as_str()));

        // Arch should be one of the known values
        assert!(["x86_64", "aarch64", "unknown"].contains(&arch.as_str()));
    }

    #[test]
    fn test_get_rust_analyzer_download_url() {
        let url = get_rust_analyzer_download_url();

        // On known platforms, we should get a URL
        let (os, arch) = get_platform_info();
        if os != "unknown" && arch != "unknown" {
            assert!(url.is_some());
            let url = url.unwrap();
            assert!(url.starts_with("https://github.com/rust-lang/rust-analyzer/releases/"));
            assert!(url.contains("rust-analyzer"));
        }
    }

    #[test]
    fn test_generate_server_id() {
        let id1 = generate_server_id("rust");

        assert!(id1.starts_with("lsp_rust_"));

        // Sleep 1ms to ensure different timestamp
        std::thread::sleep(std::time::Duration::from_millis(1));

        let id2 = generate_server_id("rust");

        assert!(id2.starts_with("lsp_rust_"));

        // IDs should be unique (different timestamps)
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_generate_server_id_different_languages() {
        let rust_id = generate_server_id("rust");
        let ts_id = generate_server_id("typescript");

        assert!(rust_id.starts_with("lsp_rust_"));
        assert!(ts_id.starts_with("lsp_typescript_"));
    }

    #[test]
    fn test_parse_content_length() {
        let headers = "Content-Length: 123\r\nContent-Type: application/json\r\n";
        let result = parse_content_length(headers);
        assert_eq!(result, Some(123));

        let headers_lowercase = "content-length: 456\r\n";
        let result = parse_content_length(headers_lowercase);
        assert_eq!(result, Some(456));

        let no_content_length = "Content-Type: application/json\r\n";
        let result = parse_content_length(no_content_length);
        assert_eq!(result, None);

        let invalid_value = "Content-Length: abc\r\n";
        let result = parse_content_length(invalid_value);
        assert_eq!(result, None);
    }

    #[test]
    fn test_validate_root_path_valid() {
        // Use a path that should exist on all systems
        let temp_dir = std::env::temp_dir();
        let result = validate_root_path(temp_dir.to_str().unwrap());
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_root_path_relative() {
        let result = validate_root_path("relative/path");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be absolute"));
    }

    #[test]
    fn test_validate_root_path_nonexistent() {
        // Use temp_dir as base to ensure the path is absolute on all platforms (Windows uses C:\, Unix uses /)
        let temp_dir = std::env::temp_dir();
        let nonexistent = temp_dir.join("nonexistent_path_that_should_not_exist_12345");
        let result = validate_root_path(nonexistent.to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn test_validate_root_path_not_directory() {
        // Create a temporary file
        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join("lsp_test_file.txt");
        std::fs::write(&temp_file, "test").unwrap();

        let result = validate_root_path(temp_file.to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a directory"));

        // Cleanup
        std::fs::remove_file(&temp_file).ok();
    }

    #[test]
    fn test_lsp_registry() {
        let mut registry = LspRegistry::new();

        assert!(registry.list().is_empty());

        let server = Arc::new(Mutex::new(LspServer::new(
            "test_id".to_string(),
            "rust".to_string(),
            "/test/path".to_string(),
        )));

        registry.insert("test_id".to_string(), server.clone());

        assert_eq!(registry.list().len(), 1);
        assert!(registry.list().contains(&"test_id".to_string()));

        let retrieved = registry.get("test_id");
        assert!(retrieved.is_some());

        let removed = registry.remove("test_id");
        assert!(removed.is_some());
        assert!(registry.list().is_empty());
    }

    #[test]
    fn test_lsp_server_new() {
        let server = LspServer::new(
            "server_123".to_string(),
            "typescript".to_string(),
            "/home/user/project".to_string(),
        );

        assert_eq!(server.server_id, "server_123");
        assert_eq!(server.language, "typescript");
        assert_eq!(server.root_path, "/home/user/project");
        assert!(server.child.is_none());
        assert!(server.stdin.is_none());
        assert!(server.stdout_task.is_none());
        assert!(!server.is_initialized);
    }

    #[test]
    fn test_get_server_status() {
        let status = get_server_status("rust");
        // Status should have the expected fields
        assert!(status.can_download || !status.can_download); // Just verify it doesn't panic

        let unknown_status = get_server_status("unknown_language");
        assert!(!unknown_status.can_download);
        assert!(!unknown_status.available);
    }
}
