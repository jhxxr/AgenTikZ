use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::process::Command;

pub const AGENTIKZ_FOLDER_NAME: &str = "agentikzfile";
pub const AGENTIKZ_EXPORT_FOLDER: &str = "export";
pub const PROJECT_META_FILE: &str = "project.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetaFile {
    pub schema: u32,
    pub name: String,
    pub last_active_canvas: Option<String>,
    pub default_theme_id: Option<String>,
    pub auto_sync_tikz: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasFileSummary {
    pub file_name: String,
    pub name: String,
    pub updated_at: u64,
    pub size_bytes: u64,
    pub active_theme_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAssetItem {
    pub relative_path: String,
    pub file_name: String,
    pub folder: String,
    pub ext: String,
    pub size_bytes: u64,
    pub modified_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkspaceInfo {
    pub project_dir: String,
    pub project_name: String,
    pub storage_dir: String,
    pub export_dir: String,
    pub meta: ProjectMetaFile,
    pub canvases: Vec<CanvasFileSummary>,
    pub assets: Vec<ProjectAssetItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSaveResult {
    pub ok: bool,
    pub file_name: String,
    pub file_path: String,
    pub exported_tikz_path: Option<String>,
    pub updated_at: u64,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn sanitize_canvas_file_name(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("画布文件名不能为空".into());
    }
    let clean: String = trimmed
        .chars()
        .map(|c| {
            if c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|' {
                '-'
            } else {
                c
            }
        })
        .collect();
    let clean = clean.trim_matches('.').trim();
    if clean.is_empty() || clean.contains("..") {
        return Err("非法的画布文件名".into());
    }
    if clean.ends_with(".canvas.json") {
        Ok(clean.to_string())
    } else if let Some(stem) = clean.strip_suffix(".json") {
        Ok(format!("{}.canvas.json", stem))
    } else {
        Ok(format!("{}.canvas.json", clean))
    }
}

fn sanitize_export_file_name(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\') {
        return Err("非法的导出文件名".into());
    }
    Ok(trimmed.to_string())
}

fn normalize_relative_path(rel: &str) -> Result<PathBuf, String> {
    let mut out = PathBuf::new();
    for comp in Path::new(rel).components() {
        match comp {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return Err("禁止访问项目目录之外的路径".into()),
        }
    }
    if out.as_os_str().is_empty() {
        return Err("相对路径不能为空".into());
    }
    Ok(out)
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    let mut i = 0;
    while i + 3 <= bytes.len() {
        let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8) | (bytes[i + 2] as u32);
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 6) & 0x3F) as usize] as char);
        out.push(TABLE[(n & 0x3F) as usize] as char);
        i += 3;
    }
    let rem = bytes.len() - i;
    if rem == 1 {
        let n = (bytes[i] as u32) << 16;
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        out.push('=');
        out.push('=');
    } else if rem == 2 {
        let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8);
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 6) & 0x3F) as usize] as char);
        out.push('=');
    }
    out
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let clean: Vec<u8> = input
        .bytes()
        .filter(|b| !b.is_ascii_whitespace())
        .collect();
    if clean.len() % 4 != 0 {
        return Err("无效的 Base64 数据长度".into());
    }
    let mut out = Vec::with_capacity(clean.len() / 4 * 3);
    for chunk in clean.chunks(4) {
        let a = val(chunk[0]).ok_or("无效的 Base64 字符")?;
        let b = val(chunk[1]).ok_or("无效的 Base64 字符")?;
        let c = if chunk[2] == b'=' {
            0
        } else {
            val(chunk[2]).ok_or("无效的 Base64 字符")?
        };
        let d = if chunk[3] == b'=' {
            0
        } else {
            val(chunk[3]).ok_or("无效的 Base64 字符")?
        };
        let triple = ((a as u32) << 18) | ((b as u32) << 12) | ((c as u32) << 6) | (d as u32);
        out.push(((triple >> 16) & 0xFF) as u8);
        if chunk[2] != b'=' {
            out.push(((triple >> 8) & 0xFF) as u8);
        }
        if chunk[3] != b'=' {
            out.push((triple & 0xFF) as u8);
        }
    }
    Ok(out)
}

fn read_or_init_project_meta(storage_dir: &Path, project_name: &str) -> ProjectMetaFile {
    let meta_path = storage_dir.join(PROJECT_META_FILE);
    if let Ok(raw) = fs::read_to_string(&meta_path) {
        if let Ok(parsed) = serde_json::from_str::<ProjectMetaFile>(&raw) {
            return parsed;
        }
    }
    let now = now_millis();
    let default_meta = ProjectMetaFile {
        schema: 1,
        name: project_name.to_string(),
        last_active_canvas: None,
        default_theme_id: Some("neurips".into()),
        auto_sync_tikz: true,
        created_at: now,
        updated_at: now,
    };
    if let Ok(serialized) = serde_json::to_string_pretty(&default_meta) {
        let _ = fs::write(&meta_path, serialized.as_bytes());
    }
    default_meta
}

fn write_project_meta(storage_dir: &Path, meta: &ProjectMetaFile) {
    let meta_path = storage_dir.join(PROJECT_META_FILE);
    if let Ok(serialized) = serde_json::to_string_pretty(meta) {
        let _ = fs::write(&meta_path, serialized.as_bytes());
    }
}

fn list_canvases_in_storage(storage_dir: &Path) -> Vec<CanvasFileSummary> {
    let mut list = Vec::new();
    let entries = match fs::read_dir(storage_dir) {
        Ok(e) => e,
        Err(_) => return list,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if file_name == PROJECT_META_FILE || !file_name.ends_with(".canvas.json") {
            continue;
        }

        let meta = fs::metadata(&path).ok();
        let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let fs_modified = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let mut display_name = file_name
            .strip_suffix(".canvas.json")
            .unwrap_or(&file_name)
            .to_string();
        let mut updated_at = fs_modified;
        let mut active_theme_id = None;

        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(n) = val.get("name").and_then(|v| v.as_str()) {
                    if !n.trim().is_empty() {
                        display_name = n.trim().to_string();
                    }
                }
                if let Some(u) = val.get("updatedAt").and_then(|v| v.as_u64()) {
                    updated_at = u;
                }
                if let Some(t) = val.get("activeThemeId").and_then(|v| v.as_str()) {
                    active_theme_id = Some(t.to_string());
                }
            }
        }

        list.push(CanvasFileSummary {
            file_name,
            name: display_name,
            updated_at,
            size_bytes,
            active_theme_id,
        });
    }

    list.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    list
}

/// Dedicated directories inside `<project_dir>` where AgenTikZ saves AI-generated cutout
/// illustrations (`figures/assets/ai`), user-imported assets (`figures/assets`),
/// and imported external figures (`figures/external`).
pub const DEDICATED_ASSET_DIRS: &[&str] = &[
    "figures/assets",
    "figures/external",
];

/// Dedicated subdirectories inside `<project_dir>` for LaTeX manuscript components.
pub const DEDICATED_PAPER_SUBDIRS: &[&str] = &["sections", "styles", "figures"];

const MAX_SCANNED_ASSETS: usize = 100;
const MAX_SCAN_VISITED_ENTRIES: usize = 600;

fn should_skip_dir(dir_name: &str) -> bool {
    if dir_name.starts_with('.') {
        return true;
    }
    matches!(
        dir_name.to_ascii_lowercase().as_str(),
        "node_modules"
            | "target"
            | "dist"
            | "build"
            | "out"
            | "__pycache__"
            | "venv"
            | "env"
            | "agentikzfile"
            | "tavottofile"
            | "data"
            | "dataset"
            | "datasets"
            | "checkpoints"
            | "wandb"
            | "runs"
            | "logs"
            | "cache"
            | "tmp"
            | "temp"
    )
}

fn scan_assets_in_dir(
    root: &Path,
    current: &Path,
    depth: usize,
    max_depth: usize,
    visited_budget: &mut usize,
    out: &mut Vec<ProjectAssetItem>,
) {
    if depth > max_depth || out.len() >= MAX_SCANNED_ASSETS || *visited_budget == 0 {
        return;
    }
    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if out.len() >= MAX_SCANNED_ASSETS || *visited_budget == 0 {
            break;
        }
        *visited_budget = visited_budget.saturating_sub(1);

        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_symlink() {
            continue;
        }

        let path = entry.path();
        let file_name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue,
        };

        if ft.is_dir() {
            if !should_skip_dir(&file_name) {
                scan_assets_in_dir(root, &path, depth + 1, max_depth, visited_budget, out);
            }
            continue;
        }

        if !ft.is_file() {
            continue;
        }

        let ext = match path.extension().and_then(|e| e.to_str()) {
            Some(e) => e.to_ascii_lowercase(),
            None => continue,
        };

        if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "svg" | "webp" | "pdf") {
            continue;
        }

        let rel_path = match path.strip_prefix(root) {
            Ok(r) => r,
            Err(_) => continue,
        };

        let rel_str = rel_path
            .components()
            .filter_map(|c| match c {
                Component::Normal(s) => s.to_str(),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("/");

        let folder = rel_path
            .parent()
            .map(|p| {
                let s = p
                    .components()
                    .filter_map(|c| match c {
                        Component::Normal(part) => part.to_str(),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join("/");
                if s.is_empty() {
                    ".".to_string()
                } else {
                    s
                }
            })
            .unwrap_or_else(|| ".".to_string());

        let meta = entry.metadata().ok();
        let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_at = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        out.push(ProjectAssetItem {
            relative_path: rel_str,
            file_name,
            folder,
            ext,
            size_bytes,
            modified_at,
        });
    }
}

/// Scans only AgenTikZ's dedicated asset folders (`figures/assets`, `figures/external`,
/// `agentikzfile/export`) rather than walking the entire project directory tree.
fn scan_dedicated_project_assets(root: &Path) -> Vec<ProjectAssetItem> {
    let mut assets = Vec::new();
    let mut visited_budget = MAX_SCAN_VISITED_ENTRIES;

    for rel_dir in DEDICATED_ASSET_DIRS {
        let mut dir_path = root.to_path_buf();
        for part in rel_dir.split('/') {
            dir_path.push(part);
        }
        if let Ok(meta) = fs::symlink_metadata(&dir_path) {
            if meta.is_dir() && !meta.file_type().is_symlink() {
                scan_assets_in_dir(root, &dir_path, 0, 2, &mut visited_budget, &mut assets);
            }
        }
    }

    assets.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    assets
}

/// Opens the native OS folder selection dialog and returns the selected directory path.
#[tauri::command]
pub async fn project_pick_directory(
    initial_dir: Option<String>,
    title: Option<String>,
) -> Result<Option<String>, String> {
    let title = title.as_deref().unwrap_or("选择项目或论文文件夹");
    #[cfg(target_os = "windows")]
    {
        let init_path = initial_dir
            .as_deref()
            .filter(|p| !p.trim().is_empty() && Path::new(p).is_dir())
            .unwrap_or("");
        let escaped_init = init_path.replace('\'', "''");
        let escaped_title = title.replace('\'', "''");
        let ps_script = format!(
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
             Add-Type -AssemblyName System.Windows.Forms; \
             [System.Windows.Forms.Application]::EnableVisualStyles(); \
             $dlg = New-Object System.Windows.Forms.FolderBrowserDialog; \
             $dlg.Description = '{}'; \
             $dlg.UseDescriptionForTitle = $true; \
             $dlg.ShowNewFolderButton = $true; \
             if ('{}' -ne '') {{ $dlg.SelectedPath = '{}' }}; \
             $owner = New-Object System.Windows.Forms.Form -Property @{{TopMost = $true}}; \
             $res = $dlg.ShowDialog($owner); \
             $owner.Dispose(); \
             if ($res -eq [System.Windows.Forms.DialogResult]::OK) {{ Write-Output $dlg.SelectedPath }}",
            escaped_title, escaped_init, escaped_init
        );
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-STA",
            "-Command",
            &ps_script,
        ]);
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: prevent black console window popup
        let output = cmd
            .output()
            .await
            .map_err(|e| format!("无法启动文件夹选择器: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return Ok(None);
        }
        return Ok(Some(stdout));
    }

    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "POSIX path of (choose folder with prompt \"{}\")",
            title.replace('\\', "\\\\").replace('"', "\\\""),
        );
        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .await
            .map_err(|e| format!("无法启动 macOS 文件夹选择器: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return Ok(None);
        }
        return Ok(Some(stdout));
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let output = Command::new("zenity")
            .args([
                "--file-selection",
                "--directory",
                &format!("--title={title}"),
            ])
            .output()
            .await
            .map_err(|e| format!("无法启动文件夹选择器: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return Ok(None);
        }
        return Ok(Some(stdout));
    }
}

/// Opens a project folder, ensures `<project_dir>/agentikzfile/` and `export/` exist,
/// and returns all saved canvas files and same-directory image assets.
#[tauri::command]
pub async fn project_open_workspace(project_dir: String) -> Result<ProjectWorkspaceInfo, String> {
    let trimmed = project_dir.trim();
    if trimmed.is_empty() {
        return Err("项目文件夹路径不能为空".into());
    }
    let root_path = PathBuf::from(trimmed);
    if !root_path.exists() {
        return Err(format!("文件夹不存在: {}", trimmed));
    }
    if !root_path.is_dir() {
        return Err(format!("所选路径不是文件夹: {}", trimmed));
    }

    let canonical_root = fs::canonicalize(&root_path).unwrap_or_else(|_| root_path.clone());
    // Strip Windows verbatim prefix `\\?\` for clean display
    let clean_root_str = canonical_root
        .to_string_lossy()
        .strip_prefix(r"\\?\")
        .unwrap_or(&canonical_root.to_string_lossy())
        .to_string();
    let clean_root = PathBuf::from(&clean_root_str);

    let project_name = clean_root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled-Project")
        .to_string();

    let storage_dir = clean_root.join(AGENTIKZ_FOLDER_NAME);
    let export_dir = storage_dir.join(AGENTIKZ_EXPORT_FOLDER);

    fs::create_dir_all(&export_dir)
        .map_err(|e| format!("无法创建 {} 专属目录: {}", AGENTIKZ_FOLDER_NAME, e))?;

    let meta = read_or_init_project_meta(&storage_dir, &project_name);
    let canvases = list_canvases_in_storage(&storage_dir);
    let assets = scan_dedicated_project_assets(&clean_root);

    Ok(ProjectWorkspaceInfo {
        project_dir: clean_root_str,
        project_name,
        storage_dir: storage_dir.to_string_lossy().to_string(),
        export_dir: export_dir.to_string_lossy().to_string(),
        meta,
        canvases,
        assets,
    })
}

/// Loads a specific canvas JSON file from `<project_dir>/agentikzfile/<file_name>`.
#[tauri::command]
pub async fn project_load_canvas(project_dir: String, file_name: String) -> Result<String, String> {
    let safe_name = sanitize_canvas_file_name(&file_name)?;
    let storage_dir = PathBuf::from(project_dir.trim()).join(AGENTIKZ_FOLDER_NAME);
    let file_path = storage_dir.join(&safe_name);
    if !file_path.exists() {
        return Err(format!("画布文件不存在: {}", safe_name));
    }
    let raw = fs::read_to_string(&file_path)
        .map_err(|e| format!("读取画布文件 {} 失败: {}", safe_name, e))?;

    // Update lastActiveCanvas in project.json
    let project_name = Path::new(project_dir.trim())
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Project");
    let mut meta = read_or_init_project_meta(&storage_dir, project_name);
    if meta.last_active_canvas.as_deref() != Some(&safe_name) {
        meta.last_active_canvas = Some(safe_name);
        meta.updated_at = now_millis();
        write_project_meta(&storage_dir, &meta);
    }

    Ok(raw)
}

/// Saves a single canvas to `<project_dir>/agentikzfile/<file_name>`, and optionally
/// writes a synchronized `.tikz` file into `<project_dir>/agentikzfile/export/<stem>.tikz`.
#[tauri::command]
pub async fn project_save_canvas(
    project_dir: String,
    file_name: String,
    content: String,
    sync_tikz: Option<String>,
) -> Result<CanvasSaveResult, String> {
    let safe_name = sanitize_canvas_file_name(&file_name)?;
    let root_path = PathBuf::from(project_dir.trim());
    let storage_dir = root_path.join(AGENTIKZ_FOLDER_NAME);
    let export_dir = storage_dir.join(AGENTIKZ_EXPORT_FOLDER);

    fs::create_dir_all(&export_dir)
        .map_err(|e| format!("创建存档目录失败: {}", e))?;

    let file_path = storage_dir.join(&safe_name);
    let tmp_path = storage_dir.join(format!(".{}.tmp", safe_name));

    if fs::write(&tmp_path, content.as_bytes()).is_ok() {
        if fs::rename(&tmp_path, &file_path).is_err() {
            let _ = fs::remove_file(&tmp_path);
            fs::write(&file_path, content.as_bytes())
                .map_err(|e| format!("保存画布文件失败: {}", e))?;
        }
    } else {
        fs::write(&file_path, content.as_bytes())
            .map_err(|e| format!("保存画布文件失败: {}", e))?;
    }

    let mut exported_tikz_path = None;
    if let Some(tikz_code) = sync_tikz {
        let stem = safe_name
            .strip_suffix(".canvas.json")
            .unwrap_or(&safe_name);
        let tikz_file = export_dir.join(format!("{}.tikz", stem));
        if fs::write(&tikz_file, tikz_code.as_bytes()).is_ok() {
            exported_tikz_path = Some(tikz_file.to_string_lossy().to_string());
        }
        // Also write to `<project_dir>/figures/<stem>.tikz` for clean `\input{figures/<stem>.tikz}` paper workflows
        let figures_dir = root_path.join("figures");
        if fs::create_dir_all(&figures_dir).is_ok() {
            let clean_fig_tikz = figures_dir.join(format!("{}.tikz", stem));
            let _ = fs::write(&clean_fig_tikz, tikz_code.as_bytes());
        }
    }

    let now = now_millis();
    let project_name = root_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Project");
    let mut meta = read_or_init_project_meta(&storage_dir, project_name);
    meta.last_active_canvas = Some(safe_name.clone());
    meta.updated_at = now;
    write_project_meta(&storage_dir, &meta);

    Ok(CanvasSaveResult {
        ok: true,
        file_name: safe_name,
        file_path: file_path.to_string_lossy().to_string(),
        exported_tikz_path,
        updated_at: now,
    })
}

/// Renames an existing canvas file inside `<project_dir>/agentikzfile/`.
#[tauri::command]
pub async fn project_rename_canvas(
    project_dir: String,
    old_file_name: String,
    new_file_name: String,
    new_content: String,
    sync_tikz: Option<String>,
) -> Result<CanvasSaveResult, String> {
    let old_safe = sanitize_canvas_file_name(&old_file_name)?;
    let new_safe = sanitize_canvas_file_name(&new_file_name)?;

    let root_path = PathBuf::from(project_dir.trim());
    let storage_dir = root_path.join(AGENTIKZ_FOLDER_NAME);
    let export_dir = storage_dir.join(AGENTIKZ_EXPORT_FOLDER);
    let figures_dir = root_path.join("figures");
    let old_path = storage_dir.join(&old_safe);
    let new_path = storage_dir.join(&new_safe);

    let old_stem = old_safe.strip_suffix(".canvas.json").unwrap_or(&old_safe);
    let new_stem = new_safe.strip_suffix(".canvas.json").unwrap_or(&new_safe);
    let old_tikz = export_dir.join(format!("{}.tikz", old_stem));
    let new_tikz = export_dir.join(format!("{}.tikz", new_stem));
    let old_fig_tikz = figures_dir.join(format!("{}.tikz", old_stem));
    let new_fig_tikz = figures_dir.join(format!("{}.tikz", new_stem));

    let is_case_only_rename = old_safe != new_safe
        && (old_safe.eq_ignore_ascii_case(&new_safe)
            || old_safe.to_lowercase() == new_safe.to_lowercase()
            || (old_path.exists()
                && new_path.exists()
                && fs::canonicalize(&old_path).ok() == fs::canonicalize(&new_path).ok()));

    if is_case_only_rename {
        if old_path.exists() {
            let tmp_canvas = storage_dir.join(format!(".rename_tmp_{}", new_safe));
            let _ = fs::remove_file(&tmp_canvas);
            if fs::rename(&old_path, &tmp_canvas).is_ok() {
                let _ = fs::rename(&tmp_canvas, &new_path);
            }
        }
        if old_tikz.exists() {
            let tmp_tikz = export_dir.join(format!(".rename_tmp_{}.tikz", new_stem));
            let _ = fs::remove_file(&tmp_tikz);
            if fs::rename(&old_tikz, &tmp_tikz).is_ok() {
                let _ = fs::rename(&tmp_tikz, &new_tikz);
            }
        }
        if old_fig_tikz.exists() {
            let tmp_fig = figures_dir.join(format!(".rename_tmp_{}.tikz", new_stem));
            let _ = fs::remove_file(&tmp_fig);
            if fs::rename(&old_fig_tikz, &tmp_fig).is_ok() {
                let _ = fs::rename(&tmp_fig, &new_fig_tikz);
            }
        }
    }

    let save_res =
        project_save_canvas(project_dir.clone(), new_safe.clone(), new_content, sync_tikz).await?;

    if old_safe != new_safe && !is_case_only_rename {
        let same_canvas = match (fs::canonicalize(&old_path), fs::canonicalize(&new_path)) {
            (Ok(a), Ok(b)) => a == b,
            _ => false,
        };
        if !same_canvas {
            let _ = fs::remove_file(&old_path);
        }

        let same_tikz = match (fs::canonicalize(&old_tikz), fs::canonicalize(&new_tikz)) {
            (Ok(a), Ok(b)) => a == b,
            _ => false,
        };
        if !same_tikz {
            let _ = fs::remove_file(&old_tikz);
        }

        let same_fig_tikz = match (fs::canonicalize(&old_fig_tikz), fs::canonicalize(&new_fig_tikz)) {
            (Ok(a), Ok(b)) => a == b,
            _ => false,
        };
        if !same_fig_tikz {
            let _ = fs::remove_file(&old_fig_tikz);
        }
    }

    Ok(save_res)
}

/// Deletes a canvas file from `<project_dir>/agentikzfile/`.
#[tauri::command]
pub async fn project_delete_canvas(project_dir: String, file_name: String) -> Result<bool, String> {
    let safe_name = sanitize_canvas_file_name(&file_name)?;
    let root_path = PathBuf::from(project_dir.trim());
    let storage_dir = root_path.join(AGENTIKZ_FOLDER_NAME);
    let file_path = storage_dir.join(&safe_name);
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("删除画布文件失败: {}", e))?;
    }
    let stem = safe_name.strip_suffix(".canvas.json").unwrap_or(&safe_name);
    let tikz_path = storage_dir
        .join(AGENTIKZ_EXPORT_FOLDER)
        .join(format!("{}.tikz", stem));
    let _ = fs::remove_file(tikz_path);
    let fig_tikz_path = root_path.join("figures").join(format!("{}.tikz", stem));
    let _ = fs::remove_file(fig_tikz_path);
    Ok(true)
}

/// Rescans image/figure assets inside AgenTikZ's dedicated folders (`figures/assets`, `figures/external`, `agentikzfile/export`).
#[tauri::command]
pub async fn project_scan_assets(project_dir: String) -> Result<Vec<ProjectAssetItem>, String> {
    let root_path = PathBuf::from(project_dir.trim());
    if !root_path.is_dir() {
        return Err("项目文件夹不存在".into());
    }
    Ok(scan_dedicated_project_assets(&root_path))
}

/// Reads an image asset from `<project_dir>/<relative_path>` as a `data:` URL for canvas rendering & export.
#[tauri::command]
pub async fn project_read_asset_data_url(
    project_dir: String,
    relative_path: String,
) -> Result<String, String> {
    let root_path = PathBuf::from(project_dir.trim());
    let clean_rel = normalize_relative_path(&relative_path)?;
    let full_path = root_path.join(&clean_rel);

    if !full_path.exists() || !full_path.is_file() {
        return Err(format!("素材文件不存在: {}", relative_path));
    }

    if let (Ok(canon_root), Ok(canon_full)) = (fs::canonicalize(&root_path), fs::canonicalize(&full_path)) {
        if !canon_full.starts_with(&canon_root) {
            return Err("禁止读取项目目录之外的链接文件".into());
        }
    }

    let ext = full_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if ext == "pdf" {
        return Err("PDF 文件不支持直接作为位图 Data URL 预览".into());
    }

    if let Ok(meta) = fs::metadata(&full_path) {
        if meta.len() > 10 * 1024 * 1024 {
            return Err("素材文件超过 10MB 内存预览上限".into());
        }
    }

    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    };

    let bytes = fs::read(&full_path)
        .map_err(|e| format!("读取素材文件失败: {}", e))?;
    let b64 = encode_base64(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

/// Imports an external image asset (`data:` URL or Base64 string) into `<project_dir>/<relative_path>`.
#[tauri::command]
pub async fn project_import_asset(
    project_dir: String,
    relative_path: String,
    data_url: String,
) -> Result<ProjectAssetItem, String> {
    let root_path = PathBuf::from(project_dir.trim());
    if !root_path.exists() || !root_path.is_dir() {
        return Err("项目文件夹不存在".into());
    }

    let clean_rel = normalize_relative_path(&relative_path)?;
    let file_name = clean_rel
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效的素材文件名".to_string())?
        .to_string();

    let ext = clean_rel
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .ok_or_else(|| "素材文件缺少扩展名".to_string())?;

    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "svg" | "webp" | "pdf") {
        return Err(format!("不支持的素材文件类型: {}", ext));
    }

    let raw_b64 = data_url
        .split_once(";base64,")
        .map(|(_, b)| b)
        .unwrap_or(&data_url);
    let bytes = decode_base64(raw_b64)?;

    let full_path = root_path.join(&clean_rel);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建素材目录: {}", e))?;
        if let (Ok(canon_root), Ok(canon_parent)) =
            (fs::canonicalize(&root_path), fs::canonicalize(parent))
        {
            if !canon_parent.starts_with(&canon_root) {
                return Err("禁止写入项目目录之外的路径".into());
            }
        }
    }

    fs::write(&full_path, &bytes)
        .map_err(|e| format!("写入素材文件失败: {}", e))?;

    let rel_str = clean_rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => s.to_str(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");

    let folder = clean_rel
        .parent()
        .map(|p| {
            let s = p
                .components()
                .filter_map(|c| match c {
                    Component::Normal(part) => part.to_str(),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("/");
            if s.is_empty() {
                ".".to_string()
            } else {
                s
            }
        })
        .unwrap_or_else(|| ".".to_string());

    let meta = fs::metadata(&full_path).ok();
    let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(bytes.len() as u64);
    let modified_at = meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or_else(now_millis);

    Ok(ProjectAssetItem {
        relative_path: rel_str,
        file_name,
        folder,
        ext,
        size_bytes,
        modified_at,
    })
}

/// Writes an exported figure file (`.tikz`, `.tex`, `.svg`, `.png`) directly into `<project_dir>/agentikzfile/export/`.
#[tauri::command]
pub async fn project_export_file(
    project_dir: String,
    file_name: String,
    content: String,
    is_base64: bool,
) -> Result<String, String> {
    let safe_name = sanitize_export_file_name(&file_name)?;
    let export_dir = PathBuf::from(project_dir.trim())
        .join(AGENTIKZ_FOLDER_NAME)
        .join(AGENTIKZ_EXPORT_FOLDER);
    fs::create_dir_all(&export_dir)
        .map_err(|e| format!("无法创建导出目录: {}", e))?;

    let target = export_dir.join(&safe_name);
    if is_base64 {
        let raw_b64 = content
            .split_once(";base64,")
            .map(|(_, b)| b)
            .unwrap_or(&content);
        let bytes = decode_base64(raw_b64)?;
        fs::write(&target, &bytes)
            .map_err(|e| format!("写入导出文件失败: {}", e))?;
    } else {
        fs::write(&target, content.as_bytes())
            .map_err(|e| format!("写入导出文件失败: {}", e))?;
    }

    Ok(target.to_string_lossy().to_string())
}

/// Opens the specified folder or file location in the system file manager (Explorer / Finder).
#[tauri::command]
pub async fn project_reveal_in_explorer(path: String) -> Result<bool, String> {
    let p = PathBuf::from(path.trim());
    if !p.exists() {
        return Err("路径不存在".into());
    }

    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("explorer");
        if p.is_file() {
            cmd.arg(format!("/select,{}", p.to_string_lossy()));
        } else {
            cmd.arg(p.to_string_lossy().to_string());
        }
        let _ = cmd.spawn();
        return Ok(true);
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        if p.is_file() {
            cmd.arg("-R");
        }
        cmd.arg(p.to_string_lossy().to_string());
        let _ = cmd.spawn();
        return Ok(true);
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let target_dir = if p.is_file() {
            p.parent().unwrap_or(&p)
        } else {
            &p
        };
        let _ = Command::new("xdg-open")
            .arg(target_dir.to_string_lossy().to_string())
            .spawn();
        return Ok(true);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperFileItem {
    pub relative_path: String,
    pub file_name: String,
    pub category: String,
    pub size_bytes: u64,
    pub modified_at: u64,
}

fn classify_paper_file(rel_str: &str) -> String {
    let lower = rel_str.to_ascii_lowercase();
    if lower == "main.tex" || lower == "paper.tex" || lower == "manuscript.tex" {
        "main".into()
    } else if lower.ends_with(".bib") {
        "bib".into()
    } else if lower.ends_with(".sty") || lower.ends_with(".cls") {
        "style".into()
    } else if lower.ends_with(".tikz") {
        "figure_tikz".into()
    } else if lower.ends_with(".tex") {
        "section".into()
    } else {
        "other".into()
    }
}

fn scan_paper_files_in_dir(
    root: &Path,
    current: &Path,
    depth: usize,
    max_depth: usize,
    visited_budget: &mut usize,
    out: &mut Vec<PaperFileItem>,
) {
    if depth > max_depth || out.len() >= 150 || *visited_budget == 0 {
        return;
    }
    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if out.len() >= 150 || *visited_budget == 0 {
            break;
        }
        *visited_budget = visited_budget.saturating_sub(1);

        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_symlink() {
            continue;
        }

        let path = entry.path();
        let file_name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue,
        };

        if ft.is_dir() {
            if depth < max_depth && !should_skip_dir(&file_name) {
                scan_paper_files_in_dir(root, &path, depth + 1, max_depth, visited_budget, out);
            }
            continue;
        }

        if !ft.is_file() {
            continue;
        }

        let ext = match path.extension().and_then(|e| e.to_str()) {
            Some(e) => e.to_ascii_lowercase(),
            None => continue,
        };

        if !matches!(ext.as_str(), "tex" | "bib" | "sty" | "cls" | "tikz") {
            continue;
        }

        let rel_path = match path.strip_prefix(root) {
            Ok(r) => r,
            Err(_) => continue,
        };

        let rel_str = rel_path
            .components()
            .filter_map(|c| match c {
                Component::Normal(s) => s.to_str(),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("/");

        let meta = entry.metadata().ok();
        let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_at = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        out.push(PaperFileItem {
            relative_path: rel_str.clone(),
            file_name,
            category: classify_paper_file(&rel_str),
            size_bytes,
            modified_at,
        });
    }
}

/// Scans top-level manuscript files in `<root>` plus dedicated paper folders (`sections`, `styles`, `figures`)
/// without traversing unrelated subdirectories in the user's workspace.
fn scan_dedicated_paper_files(root: &Path) -> Vec<PaperFileItem> {
    let mut list = Vec::new();
    let mut visited_budget = MAX_SCAN_VISITED_ENTRIES;

    // 1. Top-level files in root only (depth = 0, max_depth = 0 -> does not recurse into arbitrary folders)
    scan_paper_files_in_dir(root, root, 0, 0, &mut visited_budget, &mut list);

    // 2. Dedicated paper subdirectories (`sections/`, `styles/`, `figures/`)
    for sub in DEDICATED_PAPER_SUBDIRS {
        let sub_path = root.join(sub);
        if let Ok(meta) = fs::symlink_metadata(&sub_path) {
            if meta.is_dir() && !meta.file_type().is_symlink() {
                scan_paper_files_in_dir(root, &sub_path, 0, 1, &mut visited_budget, &mut list);
            }
        }
    }

    list
}

/// Initializes a clean academic paper directory structure (`main.tex`, `sections/`, `styles/`, `figures/`, etc.).
/// Existing files with the same name are NOT overwritten unless they are `styles/agentikz-macros.sty`.
#[tauri::command]
pub async fn project_init_paper_workspace(
    project_dir: String,
    files: std::collections::HashMap<String, String>,
) -> Result<bool, String> {
    let trimmed = project_dir.trim();
    if trimmed.is_empty() {
        return Err("论文项目目录路径不能为空".into());
    }
    let root = PathBuf::from(trimmed);
    fs::create_dir_all(&root).map_err(|e| format!("无法创建论文目录: {}", e))?;
    fs::create_dir_all(root.join("sections")).ok();
    fs::create_dir_all(root.join("styles")).ok();
    fs::create_dir_all(root.join("figures")).ok();
    fs::create_dir_all(root.join("figures").join("external")).ok();
    fs::create_dir_all(root.join("figures").join("assets").join("ai")).ok();

    for (rel, content) in files {
        let clean_rel = normalize_relative_path(&rel)?;
        let target = root.join(&clean_rel);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("无法创建子目录 {:?}: {}", parent, e))?;
        }
        let is_macros = rel.ends_with("agentikz-macros.sty");
        if !target.exists() || is_macros {
            fs::write(&target, content.as_bytes())
                .map_err(|e| format!("写入文件 {} 失败: {}", rel, e))?;
        }
    }

    Ok(true)
}

/// Lists `.tex`, `.bib`, `.sty`, `.cls`, and `.tikz` files inside `<project_dir>` root and dedicated paper folders.
#[tauri::command]
pub async fn project_list_paper_files(project_dir: String) -> Result<Vec<PaperFileItem>, String> {
    let root = PathBuf::from(project_dir.trim());
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut list = scan_dedicated_paper_files(&root);
    list.sort_by(|a, b| {
        let rank = |cat: &str| match cat {
            "main" => 0,
            "section" => 1,
            "bib" => 2,
            "style" => 3,
            "figure_tikz" => 4,
            _ => 5,
        };
        rank(&a.category)
            .cmp(&rank(&b.category))
            .then_with(|| a.relative_path.cmp(&b.relative_path))
    });
    Ok(list)
}

/// Reads a UTF-8 text file (`.tex`, `.bib`, `.sty`, `.tikz`) inside `<project_dir>`.
#[tauri::command]
pub async fn project_read_text_file(
    project_dir: String,
    relative_path: String,
) -> Result<String, String> {
    let root = PathBuf::from(project_dir.trim());
    let clean_rel = normalize_relative_path(&relative_path)?;
    let full_path = root.join(&clean_rel);
    if !full_path.is_file() {
        return Err(format!("文件不存在: {}", relative_path));
    }
    if let (Ok(canon_root), Ok(canon_full)) = (fs::canonicalize(&root), fs::canonicalize(&full_path)) {
        if !canon_full.starts_with(&canon_root) {
            return Err("禁止读取项目目录之外的文件".into());
        }
    }
    fs::read_to_string(&full_path).map_err(|e| format!("读取文件失败: {}", e))
}

/// Writes a UTF-8 text file (`.tex`, `.bib`, `.sty`, `.tikz`) inside `<project_dir>`.
#[tauri::command]
pub async fn project_write_text_file(
    project_dir: String,
    relative_path: String,
    content: String,
) -> Result<bool, String> {
    let root = PathBuf::from(project_dir.trim());
    if !root.is_dir() {
        return Err("项目目录不存在".into());
    }
    let clean_rel = normalize_relative_path(&relative_path)?;
    let full_path = root.join(&clean_rel);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建父目录: {}", e))?;
        if let (Ok(canon_root), Ok(canon_parent)) =
            (fs::canonicalize(&root), fs::canonicalize(parent))
        {
            if !canon_parent.starts_with(&canon_root) {
                return Err("禁止写入项目目录之外的路径".into());
            }
        }
    }
    fs::write(&full_path, content.as_bytes())
        .map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_temp_project_dir(test_name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "agentikz_test_{}_{}_{}",
            test_name,
            std::process::id(),
            now_millis()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("failed to create temp project dir");
        dir
    }

    #[tokio::test]
    async fn test_project_rename_canvas_case_only() {
        let dir = create_temp_project_dir("rename_case_only");
        let dir_str = dir.to_string_lossy().to_string();

        let initial_content = r#"{"name":"Figure","updatedAt":1000}"#.to_string();
        let initial_tikz = Some(r"\begin{tikzpicture}\node {A};\end{tikzpicture}".to_string());

        project_save_canvas(
            dir_str.clone(),
            "Figure.canvas.json".to_string(),
            initial_content,
            initial_tikz,
        )
        .await
        .expect("initial save should succeed");

        let renamed_content = r#"{"name":"figure","updatedAt":2000}"#.to_string();
        let renamed_tikz = Some(r"\begin{tikzpicture}\node {B};\end{tikzpicture}".to_string());

        let rename_res = project_rename_canvas(
            dir_str.clone(),
            "Figure.canvas.json".to_string(),
            "figure.canvas.json".to_string(),
            renamed_content.clone(),
            renamed_tikz,
        )
        .await
        .expect("case-only rename should succeed");

        assert!(rename_res.ok);
        assert_eq!(rename_res.file_name, "figure.canvas.json");

        let storage_dir = dir.join(AGENTIKZ_FOLDER_NAME);
        let canvas_path = storage_dir.join("figure.canvas.json");
        assert!(canvas_path.exists(), "renamed canvas file must still exist");
        let saved_raw = fs::read_to_string(&canvas_path).expect("should read canvas file");
        assert_eq!(saved_raw, renamed_content);

        let canvases = list_canvases_in_storage(&storage_dir);
        assert_eq!(canvases.len(), 1);
        assert_eq!(canvases[0].file_name, "figure.canvas.json");

        let tikz_path = storage_dir.join(AGENTIKZ_EXPORT_FOLDER).join("figure.tikz");
        assert!(tikz_path.exists(), "synchronized tikz file must still exist");
        let saved_tikz = fs::read_to_string(&tikz_path).expect("should read tikz file");
        assert_eq!(saved_tikz, r"\begin{tikzpicture}\node {B};\end{tikzpicture}");

        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn test_project_rename_canvas_normal() {
        let dir = create_temp_project_dir("rename_normal");
        let dir_str = dir.to_string_lossy().to_string();

        project_save_canvas(
            dir_str.clone(),
            "fig1.canvas.json".to_string(),
            r#"{"name":"fig1"}"#.to_string(),
            Some(r"\tikz \draw (0,0) -- (1,1);".to_string()),
        )
        .await
        .expect("initial save should succeed");

        let rename_res = project_rename_canvas(
            dir_str.clone(),
            "fig1.canvas.json".to_string(),
            "fig2.canvas.json".to_string(),
            r#"{"name":"fig2"}"#.to_string(),
            Some(r"\tikz \draw (0,0) -- (2,2);".to_string()),
        )
        .await
        .expect("normal rename should succeed");

        assert!(rename_res.ok);
        assert_eq!(rename_res.file_name, "fig2.canvas.json");

        let storage_dir = dir.join(AGENTIKZ_FOLDER_NAME);
        let export_dir = storage_dir.join(AGENTIKZ_EXPORT_FOLDER);

        assert!(!storage_dir.join("fig1.canvas.json").exists());
        assert!(!export_dir.join("fig1.tikz").exists());
        assert!(storage_dir.join("fig2.canvas.json").exists());
        assert!(export_dir.join("fig2.tikz").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn test_project_import_asset_and_security() {
        let dir = create_temp_project_dir("import_asset");
        let dir_str = dir.to_string_lossy().to_string();

        // 1x1 transparent PNG in base64
        let png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        let data_url = format!("data:image/png;base64,{}", png_b64);

        // Save into dedicated folder `figures/assets/ai/test.png`
        let item = project_import_asset(
            dir_str.clone(),
            "figures/assets/ai/test.png".to_string(),
            data_url.clone(),
        )
        .await
        .expect("import asset should succeed");

        assert_eq!(item.relative_path, "figures/assets/ai/test.png");
        assert_eq!(item.file_name, "test.png");
        assert_eq!(item.folder, "figures/assets/ai");
        assert_eq!(item.ext, "png");
        assert!(item.size_bytes > 0);
        assert!(dir.join("figures").join("assets").join("ai").join("test.png").exists());

        // Also place an unrelated image in the project root / arbitrary subfolder;
        // `project_scan_assets` must NOT scan unrelated images outside dedicated folders.
        fs::create_dir_all(dir.join("random_dataset")).unwrap();
        fs::write(dir.join("root_wallpaper.png"), b"fake").unwrap();
        fs::write(dir.join("random_dataset").join("sample_001.png"), b"fake").unwrap();

        let read_back = project_read_asset_data_url(
            dir_str.clone(),
            "figures/assets/ai/test.png".to_string(),
        )
        .await
        .expect("read asset data url should succeed");
        assert_eq!(read_back, data_url);

        let scanned = project_scan_assets(dir_str.clone())
            .await
            .expect("scan assets should succeed");
        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].relative_path, "figures/assets/ai/test.png");

        // Reject path traversal
        let traversal = project_import_asset(
            dir_str.clone(),
            "../evil.png".to_string(),
            data_url,
        )
        .await;
        assert!(traversal.is_err(), "path traversal must be rejected");

        let _ = fs::remove_dir_all(&dir);
    }
}
