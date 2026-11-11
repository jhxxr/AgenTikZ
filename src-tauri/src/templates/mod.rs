//! Paper templates: official author kits shipped with the app, plus templates
//! the user imports from a folder, an archive, a download URL or a Git
//! repository. A template is `<id>/template.json` next to `<id>/files/`.
use crate::project;
use crate::tex::{compiler, engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

const MAX_FILES: usize = 5000;
const MAX_TOTAL_BYTES: u64 = 300 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES: u64 = 200 * 1024 * 1024;
const MAX_VISITED_ENTRIES: usize = 20_000;
const MAX_TREE_DEPTH: usize = 64;
const TITLE_PLACEHOLDER: &str = "AGENTIKZ-PAPER-TITLE";
const SKIPPED_NAMES: [&str; 4] = [".git", "__MACOSX", ".DS_Store", "node_modules"];

static USER_ROOT: OnceLock<PathBuf> = OnceLock::new();

pub fn init(app: &AppHandle) {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = USER_ROOT.set(dir.join("paper-templates"));
    }
}

fn user_root() -> Result<&'static Path, String> {
    USER_ROOT
        .get()
        .map(PathBuf::as_path)
        .ok_or_else(|| "无法定位模板库目录".to_string())
}

fn builtin_root() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(runtime) = engine::runtime_root() {
        candidates.push(runtime.join("paper-templates"));
    }
    #[cfg(debug_assertions)]
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../runtime/paper-templates"));
    candidates.into_iter().find(|dir| dir.is_dir())
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Manifest {
    id: String,
    order: u32,
    name: String,
    description: String,
    main_file: String,
    default_theme_id: String,
    column_layout: String,
    source: String,
    /// Result of the last trial build with the bundled engine.
    verified: Option<bool>,
    note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub main_file: String,
    pub main_candidates: Vec<String>,
    pub default_theme_id: String,
    pub column_layout: String,
    pub source: String,
    pub builtin: bool,
    pub verified: Option<bool>,
    pub note: String,
    pub file_count: usize,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// Portable relative paths: validate Windows separators/ADS/device names even
/// on Unix, so an archive accepted on one platform stays safe on another.
fn clean_relative(path: &Path) -> Option<String> {
    let text = path.to_str()?.replace('\\', "/");
    if text.starts_with('/') || text.contains(':') || text.chars().any(char::is_control) {
        return None;
    }
    let mut parts = Vec::new();
    for part in text.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".."
            || part.ends_with(['.', ' '])
            || part.contains(['<', '>', '"', '|', '?', '*'])
        {
            return None;
        }
        let stem = part.split('.').next()?.to_ascii_uppercase();
        if ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
            || ((stem.starts_with("COM") || stem.starts_with("LPT"))
                && stem.len() == 4
                && matches!(stem.as_bytes()[3], b'1'..=b'9'))
        {
            return None;
        }
        parts.push(part);
    }
    (!parts.is_empty() && parts.len() <= MAX_TREE_DEPTH).then(|| parts.join("/"))
}

fn is_link(meta: &fs::Metadata) -> bool {
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // Includes junctions and other reparse points, not only symlinks.
        if meta.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    false
}

/// Do not follow existing directory links, even in a destination's ancestors.
fn safe_directory(path: &Path) -> Result<(), String> {
    for ancestor in path.ancestors().collect::<Vec<_>>().into_iter().rev() {
        if ancestor.as_os_str().is_empty() {
            continue;
        }
        match fs::symlink_metadata(ancestor) {
            Ok(meta) if is_link(&meta) || !meta.is_dir() => {
                return Err(format!("目录不能是链接或普通文件: {}", ancestor.display()));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(ancestor)
                    .map_err(|e| format!("无法创建目录 {}: {e}", ancestor.display()))?;
            }
            Err(error) => return Err(format!("无法检查目录 {}: {error}", ancestor.display())),
        }
    }
    Ok(())
}

fn safe_output(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel =
        clean_relative(Path::new(relative)).ok_or("文件路径无效，禁止访问模板或项目目录之外")?;
    let path = root.join(rel);
    safe_directory(path.parent().ok_or("文件路径无效")?)?;
    match fs::symlink_metadata(&path) {
        Ok(meta) if is_link(&meta) || !meta.is_file() => {
            Err(format!("不能写入链接或目录: {}", path.display()))
        }
        Ok(_) => Ok(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(path),
        Err(error) => Err(format!("无法检查输出文件: {error}")),
    }
}

/// Reject oversized or unreadable trees instead of silently importing an
/// incomplete subset. Repository metadata is skipped before descending.
fn list_files(dir: &Path) -> Result<Vec<String>, String> {
    fn walk(
        dir: &Path,
        root: &Path,
        depth: usize,
        visited: &mut usize,
        budget: &mut Budget,
        out: &mut Vec<String>,
    ) -> Result<(), String> {
        if depth > MAX_TREE_DEPTH {
            return Err("模板目录层级过深".into());
        }
        let mut entries = fs::read_dir(dir)
            .map_err(|e| format!("无法读取模板目录 {}: {e}", dir.display()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            *visited += 1;
            if *visited > MAX_VISITED_ENTRIES {
                return Err("模板目录项过多，请只导入模板所在的子目录".into());
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if skipped(&name) {
                continue;
            }
            let path = entry.path();
            let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            if is_link(&meta) {
                continue;
            }
            if meta.is_dir() {
                walk(&path, root, depth + 1, visited, budget, out)?;
            } else if meta.is_file() {
                let rel = path
                    .strip_prefix(root)
                    .ok()
                    .and_then(clean_relative)
                    .ok_or_else(|| format!("模板包含不受支持的文件路径: {}", path.display()))?;
                budget.admit(meta.len())?;
                out.push(rel);
            }
        }
        Ok(())
    }
    let meta = fs::symlink_metadata(dir).map_err(|e| format!("无法读取模板目录: {e}"))?;
    if !meta.is_dir() || is_link(&meta) {
        return Err("模板目录不能是链接或普通文件".into());
    }
    let mut out = Vec::new();
    walk(dir, dir, 0, &mut 0, &mut Budget::default(), &mut out)?;
    out.sort();
    Ok(out)
}

/// True when the source declares a document class outside a comment.
fn declares_document(text: &str) -> bool {
    text.lines().any(|line| {
        let code = line.split('%').next().unwrap_or("");
        code.contains("\\documentclass")
    })
}

/// Standalone documents in the template, best guess for the paper first.
fn main_candidates(files_dir: &Path) -> Result<Vec<String>, String> {
    let mut found: Vec<String> = list_files(files_dir)?
        .into_iter()
        .filter(|rel| rel.to_ascii_lowercase().ends_with(".tex"))
        .filter(|rel| {
            let mut bytes = Vec::new();
            fs::File::open(files_dir.join(rel))
                .and_then(|file| file.take(256 * 1024).read_to_end(&mut bytes))
                .map(|_| declares_document(&String::from_utf8_lossy(&bytes)))
                .unwrap_or(false)
        })
        .collect();
    let rank = |rel: &String| {
        let name = rel.rsplit('/').next().unwrap_or(rel).to_ascii_lowercase();
        let side_document = [
            "rebuttal", "suppl", "appendix", "response", "cover", "lualatex",
        ]
        .iter()
        .any(|word| name.contains(word));
        let named = if name == "main.tex" {
            0
        } else if [
            "paper",
            "template",
            "example",
            "sample",
            "conference",
            "manuscript",
            "article",
        ]
        .iter()
        .any(|word| name.contains(word))
        {
            1
        } else {
            2
        };
        (side_document, rel.matches('/').count(), named, rel.clone())
    };
    found.sort_by_key(rank);
    Ok(found)
}

fn read_template(dir: &Path, builtin: bool) -> Option<TemplateInfo> {
    let meta = fs::symlink_metadata(dir).ok()?;
    if is_link(&meta) || !meta.is_dir() {
        return None;
    }
    let manifest_meta = fs::symlink_metadata(dir.join("template.json")).ok()?;
    if is_link(&manifest_meta) || !manifest_meta.is_file() || manifest_meta.len() > 1024 * 1024 {
        return None;
    }
    let manifest: Manifest =
        serde_json::from_str(&fs::read_to_string(dir.join("template.json")).ok()?).ok()?;
    let files_dir = dir.join("files");
    if !valid_id(&manifest.id) || dir.file_name()?.to_str()? != manifest.id {
        return None;
    }
    let files = list_files(&files_dir).ok()?;
    let main = clean_relative(Path::new(&manifest.main_file))?;
    if !files.contains(&main) {
        return None;
    }
    Some(TemplateInfo {
        main_candidates: main_candidates(&files_dir).ok()?,
        file_count: files.len(),
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        main_file: main,
        default_theme_id: manifest.default_theme_id,
        column_layout: manifest.column_layout,
        source: manifest.source,
        builtin,
        verified: if builtin {
            Some(true)
        } else {
            manifest.verified
        },
        note: manifest.note,
    })
}

fn templates_in(root: &Path, builtin: bool) -> Vec<(u32, TemplateInfo)> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| {
            entry.path().is_dir() && !entry.file_name().to_string_lossy().starts_with('.')
        })
        .filter_map(|entry| {
            let order = fs::read_to_string(entry.path().join("template.json"))
                .ok()
                .and_then(|text| serde_json::from_str::<Manifest>(&text).ok())
                .map(|manifest| manifest.order)?;
            Some((order, read_template(&entry.path(), builtin)?))
        })
        .collect()
}

fn all_templates() -> Vec<TemplateInfo> {
    let mut builtin = builtin_root()
        .map(|root| templates_in(&root, true))
        .unwrap_or_default();
    builtin.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.name.cmp(&b.1.name)));
    let mut imported = USER_ROOT
        .get()
        .map(|root| templates_in(root, false))
        .unwrap_or_default();
    imported.sort_by(|a, b| a.1.name.to_lowercase().cmp(&b.1.name.to_lowercase()));
    builtin
        .into_iter()
        .chain(imported)
        .map(|(_, info)| info)
        .collect()
}

fn find_template(id: &str) -> Result<(PathBuf, TemplateInfo), String> {
    if !valid_id(id) {
        return Err("无效的模板标识".into());
    }
    let roots = [
        builtin_root().map(|root| (root, true)),
        USER_ROOT.get().map(|root| (root.clone(), false)),
    ];
    roots
        .into_iter()
        .flatten()
        .find_map(|(root, builtin)| {
            let dir = root.join(id);
            read_template(&dir, builtin).map(|info| (dir, info))
        })
        .ok_or_else(|| format!("未找到模板: {id}"))
}

fn save_manifest(dir: &Path, update: impl FnOnce(&mut Manifest)) -> Result<(), String> {
    let path = dir.join("template.json");
    let mut manifest: Manifest =
        serde_json::from_str(&fs::read_to_string(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    update(&mut manifest);
    let text = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| format!("无法保存模板信息: {e}"))
}

/// Tracks how much has been unpacked so an archive cannot fill the disk.
#[derive(Default)]
struct Budget {
    files: usize,
    bytes: u64,
}

impl Budget {
    fn admit(&mut self, bytes: u64) -> Result<(), String> {
        self.files = self.files.saturating_add(1);
        self.bytes = self.bytes.saturating_add(bytes);
        if self.files > MAX_FILES || self.bytes > MAX_TOTAL_BYTES {
            return Err(format!(
                "模板过大（超过 {MAX_FILES} 个文件或 {} MB），请只导入模板所在的子目录",
                MAX_TOTAL_BYTES / 1024 / 1024
            ));
        }
        Ok(())
    }
}

fn skipped(rel: &str) -> bool {
    rel.split('/').any(|part| SKIPPED_NAMES.contains(&part))
}

/// Writes one archive member below `into`; entries that would escape it are rejected.
fn write_member(
    into: &Path,
    rel: &Path,
    mut data: impl Read,
    budget: &mut Budget,
) -> Result<(), String> {
    let Some(rel) = clean_relative(rel) else {
        return Err("压缩包包含指向模板目录之外的路径，已拒绝导入".into());
    };
    if skipped(&rel) {
        return Ok(());
    }
    if budget.files >= MAX_FILES {
        return Err(format!(
            "模板过大（超过 {MAX_FILES} 个文件），请只导入模板所在的子目录"
        ));
    }
    let target = safe_output(into, &rel)?;
    // Duplicate members must not overwrite each other (including case aliases
    // on Windows), and create_new does not follow a leaf symlink.
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| format!("无法写入 {rel}（压缩包可能含重名文件）: {e}"))?;
    let remaining = MAX_TOTAL_BYTES.saturating_sub(budget.bytes);
    let written = std::io::copy(&mut data.by_ref().take(remaining + 1), &mut file)
        .map_err(|e| e.to_string())?;
    budget.admit(written)
}

fn extract_zip(archive: &Path, into: &Path, budget: &mut Budget) -> Result<(), String> {
    let file = fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("无法读取 zip 压缩包: {e}"))?;
    if zip.len() > MAX_VISITED_ENTRIES {
        return Err("压缩包目录项过多，请只导入模板所在的子目录".into());
    }
    for index in 0..zip.len() {
        let entry = zip
            .by_index(index)
            .map_err(|e| format!("zip 压缩包已损坏: {e}"))?;
        let is_link = entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000);
        let rel =
            clean_relative(Path::new(entry.name())).ok_or("压缩包包含不安全的路径，已拒绝导入")?;
        if entry.is_dir() || is_link {
            continue;
        }
        write_member(into, Path::new(&rel), entry, budget)?;
    }
    Ok(())
}

fn extract_tar(reader: impl Read, into: &Path, budget: &mut Budget) -> Result<(), String> {
    let mut archive = tar::Archive::new(reader);
    for (index, entry) in archive
        .entries()
        .map_err(|e| format!("无法读取 tar 压缩包: {e}"))?
        .enumerate()
    {
        if index >= MAX_VISITED_ENTRIES {
            return Err("压缩包目录项过多，请只导入模板所在的子目录".into());
        }
        let entry = entry.map_err(|e| format!("tar 压缩包已损坏: {e}"))?;
        // Links are skipped: a template never needs them and they can point outside it.
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let rel = entry.path().map_err(|e| e.to_string())?.into_owned();
        write_member(into, &rel, entry, budget)?;
    }
    Ok(())
}

/// Unpacks by content, not by file name: download URLs often have no extension.
fn extract_archive(archive: &Path, into: &Path) -> Result<(), String> {
    let mut head = [0u8; 512];
    let read = fs::File::open(archive)
        .and_then(|mut file| file.read(&mut head))
        .map_err(|e| format!("无法读取压缩包: {e}"))?;
    let mut budget = Budget::default();
    if head.starts_with(b"PK\x03\x04") || head.starts_with(b"PK\x05\x06") {
        extract_zip(archive, into, &mut budget)
    } else if head.starts_with(&[0x1f, 0x8b]) {
        let file = fs::File::open(archive).map_err(|e| e.to_string())?;
        extract_tar(flate2::read::GzDecoder::new(file), into, &mut budget)
    } else if read > 262 && &head[257..262] == b"ustar" {
        extract_tar(
            fs::File::open(archive).map_err(|e| e.to_string())?,
            into,
            &mut budget,
        )
    } else {
        Err("不是受支持的压缩包（支持 .zip、.tar.gz、.tar）。如果这是网页链接，请改用仓库地址或压缩包的直接下载链接。".into())
    }
}

fn copy_tree(from: &Path, into: &Path) -> Result<(), String> {
    let files = list_files(from)?;
    safe_directory(into)?;
    // Refuse a destination inside the source, which otherwise recursively
    // consumes its own staging directory on a local-folder import.
    let source_root = fs::canonicalize(from).map_err(|e| e.to_string())?;
    let target_root = fs::canonicalize(into).map_err(|e| e.to_string())?;
    if target_root.starts_with(&source_root) {
        return Err("模板导入目标不能位于源目录内".into());
    }
    let mut budget = Budget::default();
    for rel in files {
        let source = from.join(&rel);
        let meta = fs::symlink_metadata(&source).map_err(|e| e.to_string())?;
        if is_link(&meta) || !meta.is_file() {
            return Err(format!("模板文件在复制期间发生变化: {rel}"));
        }
        let file = fs::File::open(&source).map_err(|e| format!("无法读取 {rel}: {e}"))?;
        write_member(into, Path::new(&rel), file, &mut budget)?;
    }
    Ok(())
}

/// Where a remote template comes from and which part of it to keep.
#[derive(Debug, PartialEq)]
struct Remote {
    /// Direct archive download, when the host offers one.
    archive_url: Option<String>,
    /// Repository to clone with the system `git` when there is no archive URL.
    clone_url: Option<String>,
    subdir: Option<String>,
    name: String,
}

fn remote_url(input: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(input.trim()).map_err(|_| "无法识别的链接".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("仅支持 http / https 链接".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("请勿在模板地址中包含用户名或密码；当前仅支持公开下载".into());
    }
    Ok(url)
}

/// Turns a repository page, a `tree/<ref>/<dir>` page or an archive link into a download.
fn resolve_remote(input: &str) -> Result<Remote, String> {
    let url = remote_url(input)?;
    let host = url
        .host_str()
        .unwrap_or("")
        .trim_start_matches("www.")
        .to_ascii_lowercase();
    let segments: Vec<&str> = url
        .path()
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    let last = segments.last().copied().unwrap_or("template");
    let lower = url.path().to_ascii_lowercase();
    let stem = |name: &str| {
        let mut name = name.to_string();
        for ext in [".git", ".tar.gz", ".tgz", ".zip", ".tar"] {
            if name.to_ascii_lowercase().ends_with(ext) {
                name.truncate(name.len() - ext.len());
            }
        }
        name
    };
    let subdir_of = |parts: &[&str]| (!parts.is_empty()).then(|| parts.join("/"));
    if [".zip", ".tar.gz", ".tgz", ".tar"]
        .iter()
        .any(|ext| lower.ends_with(ext))
    {
        return Ok(Remote {
            archive_url: Some(url.to_string()),
            clone_url: None,
            subdir: None,
            name: stem(last),
        });
    }
    match host.as_str() {
        "github.com" | "gitee.com" if segments.len() >= 2 => {
            let (owner, repo) = (segments[0], stem(segments[1]));
            let (reference, subdir) = match segments.get(2) {
                Some(&"tree") | Some(&"blob") if segments.len() >= 4 => {
                    (Some(segments[3]), subdir_of(&segments[4..]))
                }
                _ => (None, None),
            };
            let archive_url = if host == "github.com" {
                format!(
                    "https://github.com/{owner}/{repo}/archive/{}.zip",
                    reference.unwrap_or("HEAD")
                )
            } else {
                format!(
                    "https://gitee.com/{owner}/{repo}/repository/archive/{}.zip",
                    reference.unwrap_or("master")
                )
            };
            let name = subdir
                .as_deref()
                .and_then(|dir| dir.rsplit('/').next())
                .unwrap_or(&repo)
                .to_string();
            Ok(Remote {
                archive_url: Some(archive_url),
                clone_url: None,
                subdir,
                name,
            })
        }
        "gitlab.com" if segments.len() >= 2 => {
            let split = segments
                .iter()
                .position(|part| *part == "-")
                .unwrap_or(segments.len());
            let mut project: Vec<String> = segments[..split]
                .iter()
                .map(|part| part.to_string())
                .collect();
            let repo = stem(project.last().map(String::as_str).unwrap_or("template"));
            if let Some(tail) = project.last_mut() {
                *tail = repo.clone();
            }
            let rest = segments.get(split + 1..).unwrap_or(&[]);
            let (reference, subdir) = match rest.first() {
                Some(&"tree") | Some(&"blob") if rest.len() >= 2 => {
                    (rest[1], subdir_of(&rest[2..]))
                }
                _ => ("HEAD", None),
            };
            let name = subdir
                .as_deref()
                .and_then(|dir| dir.rsplit('/').next())
                .unwrap_or(&repo)
                .to_string();
            Ok(Remote {
                archive_url: Some(format!(
                    "https://gitlab.com/{}/-/archive/{reference}/{repo}-{reference}.zip",
                    project.join("/")
                )),
                clone_url: None,
                subdir,
                name,
            })
        }
        _ if lower.ends_with(".git") => Ok(Remote {
            archive_url: None,
            clone_url: Some(url.to_string()),
            subdir: None,
            name: stem(last),
        }),
        _ => Ok(Remote {
            archive_url: Some(url.to_string()),
            clone_url: None,
            subdir: None,
            name: stem(last),
        }),
    }
}

fn remote_for_kind(input: &str, kind: &str) -> Result<Remote, String> {
    match kind {
        "auto" => resolve_remote(input),
        "git" => {
            // Known hosts use archives, which need no system Git and cannot
            // execute checkout filters. Other hosts use the isolated clone.
            let mut remote = resolve_remote(input)?;
            let host = remote_url(input)?
                .host_str()
                .unwrap_or("")
                .trim_start_matches("www.")
                .to_ascii_lowercase();
            if !["github.com", "gitlab.com", "gitee.com"].contains(&host.as_str()) {
                remote.archive_url = None;
                remote.clone_url = Some(remote_url(input)?.to_string());
            }
            Ok(remote)
        }
        "url" => {
            let url = remote_url(input)?;
            let name = url
                .path_segments()
                .and_then(|parts| parts.filter(|s| !s.is_empty()).next_back())
                .unwrap_or("template")
                .to_string();
            Ok(Remote {
                archive_url: Some(url.to_string()),
                clone_url: None,
                subdir: None,
                name,
            })
        }
        _ => Err("不支持的模板来源类型（请选择自动识别、下载链接或 Git 仓库）".into()),
    }
}

async fn download(url: &str, proxy: Option<&str>, into: &Path) -> Result<(), String> {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .user_agent(concat!("AgenTikZ/", env!("CARGO_PKG_VERSION")));
    if let Some(proxy) = proxy.map(str::trim).filter(|proxy| !proxy.is_empty()) {
        builder =
            builder.proxy(reqwest::Proxy::all(proxy).map_err(|e| format!("代理地址无效: {e}"))?);
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("下载失败，请检查链接或网络: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载失败：服务器返回 {}（{url}）",
            response.status()
        ));
    }
    let mut file = fs::File::create(into).map_err(|e| e.to_string())?;
    let mut total = 0u64;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("下载中断: {e}"))?
    {
        total += chunk.len() as u64;
        if total > MAX_DOWNLOAD_BYTES {
            return Err(format!(
                "下载内容超过 {} MB，已停止",
                MAX_DOWNLOAD_BYTES / 1024 / 1024
            ));
        }
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Shallow clone with the user's `git`, for hosts without a known archive URL.
async fn clone_repository(url: &str, proxy: Option<&str>, into: &Path) -> Result<(), String> {
    remote_url(url)?;
    let parent = into.parent().ok_or("克隆目录无效")?;
    let empty = parent.join("empty-git-config");
    safe_directory(&empty)?;
    let mut cmd = tokio::process::Command::new("git");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x0800_0000);
    // Do not inherit Git configuration (hooks, filters, URL rewrites, credential
    // helpers or external transports) while checking out an untrusted tree.
    for (key, _) in std::env::vars_os() {
        if key.to_string_lossy().starts_with("GIT_") {
            cmd.env_remove(key);
        }
    }
    if let Some(proxy) = proxy.map(str::trim).filter(|s| !s.is_empty()) {
        cmd.args(["-c", &format!("http.proxy={proxy}")]);
    }
    cmd.current_dir(parent)
        .args([
            "-c",
            "core.symlinks=false",
            "-c",
            "credential.helper=",
            "-c",
            "core.askPass=",
            "-c",
            "protocol.allow=never",
            "-c",
            "protocol.http.allow=always",
            "-c",
            "protocol.https.allow=always",
        ])
        .arg("-c")
        .arg(format!("core.hooksPath={}", engine::plain_path(&empty)))
        .args([
            "clone",
            "--depth",
            "1",
            "--no-tags",
            "--single-branch",
            "--no-recurse-submodules",
            "--template",
        ])
        .arg(engine::plain_path(&empty))
        .arg("--")
        .arg(url)
        .arg(engine::plain_path(into))
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", engine::plain_path(&empty.join("nonexistent-config")))
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ALLOW_PROTOCOL", "http:https")
        .env("GCM_INTERACTIVE", "Never");
    let output = compiler::run_bounded_command(&mut cmd, 240).await.map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "这个地址不是压缩包，也不是 GitHub / GitLab / Gitee 仓库；克隆其它 Git 仓库需要本机安装 git。也可以改用压缩包的下载链接。".to_string()
        } else {
            format!("克隆仓库失败: {error}")
        }
    })?;
    if !output.status.success() {
        let detail: String = String::from_utf8_lossy(&output.stderr)
            .chars()
            .take(400)
            .collect();
        return Err(format!(
            "克隆仓库失败，请确认这是可公开访问的 Git 仓库或压缩包链接。{detail}"
        ));
    }
    Ok(())
}

/// GitHub-style archives wrap everything in one folder; step into it.
fn unwrap_single_dir(dir: PathBuf) -> PathBuf {
    // Strip at most the archive's wrapper. Repeatedly descending through
    // single folders makes an explicit `kits/acl` selection disappear.
    let entries: Vec<_> = fs::read_dir(&dir)
        .map(|e| {
            e.flatten()
                .filter(|e| !skipped(&e.file_name().to_string_lossy()))
                .collect()
        })
        .unwrap_or_default();
    match entries.as_slice() {
        [only] if fs::symlink_metadata(only.path()).is_ok_and(|m| m.is_dir() && !is_link(&m)) => {
            only.path()
        }
        _ => dir,
    }
}

fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed: String = out.trim_matches('-').chars().take(40).collect();
    if trimmed.is_empty() {
        "template".into()
    } else {
        trimmed
    }
}

/// Moves the unpacked tree into the library and records what it is.
fn install(
    tree: &Path,
    subdir: Option<&str>,
    name: &str,
    source: &str,
) -> Result<TemplateInfo, String> {
    let mut base = tree.to_path_buf();
    if let Some(subdir) = subdir {
        let rel = clean_relative(Path::new(subdir)).ok_or("链接中的子目录无效")?;
        // Archive downloads wrap the repository in one directory; local folders
        // and Git clones do not. Prefer an exact subfolder before unwrapping.
        let direct = base.join(&rel);
        base = if direct.is_dir() {
            direct
        } else {
            unwrap_single_dir(base).join(&rel)
        };
        if !base.is_dir() {
            return Err(format!("仓库中不存在目录: {subdir}"));
        }
    } else {
        base = unwrap_single_dir(base);
    }
    let candidates = main_candidates(&base)?;
    let Some(main_file) = candidates.first().cloned() else {
        return Err("没有找到包含 \\documentclass 的主文件，这看起来不是 LaTeX 论文模板。".into());
    };
    // Keep the selected root intact, even when main.tex is nested: it can
    // reference ../styles or ../figures. Only an explicit subfolder may prune it.
    let id = format!("user-{}-{}", slug(name), uuid::Uuid::new_v4().simple());
    let target = user_root()?.join(&id);
    safe_directory(&target)?;
    let installed = copy_tree(&base, &target.join("files"));
    let manifest = Manifest {
        id: id.clone(),
        order: 1000,
        name: name.trim().chars().take(60).collect(),
        description: "导入的模板".into(),
        main_file,
        source: source.to_string(),
        ..Manifest::default()
    };
    let saved = installed.and_then(|_| {
        fs::write(
            target.join("template.json"),
            serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())
    });
    if let Err(error) = saved {
        let _ = fs::remove_dir_all(&target);
        return Err(format!("无法保存模板: {error}"));
    }
    read_template(&target, false).ok_or_else(|| "模板保存后无法读取".to_string())
}

#[tauri::command]
pub async fn paper_templates_list() -> Vec<TemplateInfo> {
    tokio::task::spawn_blocking(all_templates)
        .await
        .unwrap_or_default()
}

/// Imports a template from a local folder, a local archive, an archive URL or
/// a Git repository page (optionally a `tree/<branch>/<folder>` page).
#[tauri::command]
pub async fn paper_template_import(
    location: String,
    name: Option<String>,
    proxy: Option<String>,
    source_kind: Option<String>,
    subdirectory: Option<String>,
) -> Result<TemplateInfo, String> {
    let location = location.trim().to_string();
    if location.is_empty() {
        return Err("请输入模板的文件夹、压缩包路径或链接".into());
    }
    let source_kind = source_kind.as_deref().unwrap_or("auto");
    if !["auto", "url", "git"].contains(&source_kind) {
        return Err("不支持的模板来源类型".into());
    }
    let subdirectory = subdirectory
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if subdirectory
        .as_deref()
        .is_some_and(|s| clean_relative(Path::new(s)).is_none())
    {
        return Err("模板子目录路径无效".into());
    }
    let stage = user_root()?.join(format!(".staging-{}", uuid::Uuid::new_v4().simple()));
    let tree = stage.join("tree");
    safe_directory(&tree).map_err(|e| format!("无法创建模板库目录: {e}"))?;
    let custom_name = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let result = async {
        let remote = location
            .get(..7)
            .is_some_and(|s| s.eq_ignore_ascii_case("http://"))
            || location
                .get(..8)
                .is_some_and(|s| s.eq_ignore_ascii_case("https://"));
        if !remote && source_kind != "auto" {
            return Err("下载链接和 Git 仓库模式需要 http / https 地址".into());
        }
        let (subdir, default_name) = if remote {
            let remote = remote_for_kind(&location, source_kind)?;
            if let Some(url) = &remote.archive_url {
                let archive = stage.join("download");
                download(url, proxy.as_deref(), &archive).await?;
                let (archive, tree) = (archive.clone(), tree.clone());
                tokio::task::spawn_blocking(move || extract_archive(&archive, &tree))
                    .await
                    .map_err(|e| e.to_string())??;
            } else if let Some(url) = &remote.clone_url {
                clone_repository(url, proxy.as_deref(), &tree).await?;
                let _ = fs::remove_dir_all(tree.join(".git"));
            }
            (subdirectory.clone().or(remote.subdir), remote.name)
        } else {
            let path = PathBuf::from(&location);
            let default_name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("template")
                .to_string();
            let tree = tree.clone();
            tokio::task::spawn_blocking(move || {
                if path.is_dir() {
                    copy_tree(&path, &tree)
                } else if path.is_file() {
                    extract_archive(&path, &tree)
                } else {
                    Err("找不到这个文件夹或压缩包".to_string())
                }
            })
            .await
            .map_err(|e| e.to_string())??;
            (subdirectory.clone(), default_name)
        };
        let name = custom_name.unwrap_or(default_name);
        let (tree, source) = (tree.clone(), location.clone());
        tokio::task::spawn_blocking(move || install(&tree, subdir.as_deref(), &name, &source))
            .await
            .map_err(|e| e.to_string())?
    }
    .await;
    let _ = fs::remove_dir_all(&stage);
    result
}

#[tauri::command]
pub async fn paper_template_remove(id: String) -> Result<(), String> {
    let (dir, info) = find_template(&id)?;
    if info.builtin {
        return Err("内置模板不能删除".into());
    }
    fs::remove_dir_all(dir).map_err(|e| format!("删除模板失败: {e}"))
}

#[tauri::command]
pub async fn paper_template_set_main(
    id: String,
    main_file: String,
) -> Result<TemplateInfo, String> {
    let (dir, info) = find_template(&id)?;
    if info.builtin {
        return Err("内置模板的主文件不能修改".into());
    }
    if !info.main_candidates.contains(&main_file) {
        return Err("所选文件不是可独立编译的 LaTeX 文档".into());
    }
    save_manifest(&dir, |manifest| {
        manifest.main_file = main_file;
        manifest.verified = None;
        manifest.note.clear();
    })?;
    read_template(&dir, false).ok_or_else(|| "无法读取模板".to_string())
}

/// Builds the template once with the bundled engine and records whether it works.
#[tauri::command]
pub async fn paper_template_verify(id: String) -> Result<TemplateInfo, String> {
    let (dir, info) = find_template(&id)?;
    let temp =
        fs::canonicalize(std::env::temp_dir()).map_err(|e| format!("无法读取临时目录: {e}"))?;
    let work = temp.join(format!(
        "agentikz_template_check_{}",
        uuid::Uuid::new_v4().simple()
    ));
    let (files, copy_to) = (dir.join("files"), work.clone());
    let copied = tokio::task::spawn_blocking(move || copy_tree(&files, &copy_to))
        .await
        .map_err(|e| e.to_string())?;
    if let Err(error) = copied {
        let _ = fs::remove_dir_all(&work);
        return Err(error);
    }
    let outcome = compiler::trial_compile(&work, &info.main_file).await;
    let _ = fs::remove_dir_all(&work);
    if info.builtin {
        return Ok(TemplateInfo {
            verified: Some(outcome.is_ok()),
            note: outcome.err().unwrap_or_default(),
            ..info
        });
    }
    save_manifest(&dir, |manifest| {
        manifest.verified = Some(outcome.is_ok());
        manifest.note = outcome.err().unwrap_or_default();
    })?;
    read_template(&dir, false).ok_or_else(|| "无法读取模板".to_string())
}

fn escape_title(title: &str) -> String {
    let mut out = String::new();
    for c in title.chars() {
        match c {
            '\\' => out.push_str("\\textbackslash{}"),
            '~' => out.push_str("\\textasciitilde{}"),
            '^' => out.push_str("\\textasciicircum{}"),
            '&' | '%' | '$' | '#' | '_' | '{' | '}' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedPaper {
    pub main_file: String,
    pub default_theme_id: String,
}

fn create_project(
    files_dir: &Path,
    info: &TemplateInfo,
    root: &Path,
    title: &str,
    extra_files: &HashMap<String, String>,
) -> Result<CreatedPaper, String> {
    let files = list_files(files_dir)?;
    if !files.contains(&info.main_file) {
        return Err(format!("模板缺少主文件 {}", info.main_file));
    }
    safe_directory(root).map_err(|e| format!("无法创建论文目录: {e}"))?;
    // Validate every destination, including metadata and optional macros, before
    // any file is copied. Existing directory junctions must never redirect writes.
    for rel in files.iter().chain(extra_files.keys()) {
        safe_output(root, rel)?;
    }
    let marker_rel = format!("{}/paper.json", project::AGENTIKZ_FOLDER_NAME);
    safe_output(root, &marker_rel)?;
    for rel in &files {
        let target = safe_output(root, rel)?;
        // An existing manuscript is never overwritten.
        if target.exists() {
            continue;
        }
        let source = files_dir.join(rel);
        let titled = (rel == &info.main_file)
            .then(|| fs::read_to_string(&source).ok())
            .flatten()
            .filter(|text| text.contains(TITLE_PLACEHOLDER));
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(|e| format!("无法创建文件 {rel}: {e}"))?;
        match titled {
            Some(text) => output.write_all(
                text.replace(TITLE_PLACEHOLDER, &escape_title(title))
                    .as_bytes(),
            ),
            None => fs::File::open(&source)
                .and_then(|mut source| std::io::copy(&mut source, &mut output).map(|_| ())),
        }
        .map_err(|e| format!("写入文件 {rel} 失败: {e}"))?;
    }
    for dir in ["styles", "figures/external", "figures/assets/ai"] {
        safe_directory(&root.join(dir))?;
    }
    for (rel, content) in extra_files {
        let target = safe_output(root, rel)?;
        if !target.exists() {
            fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .and_then(|mut file| file.write_all(content.as_bytes()))
                .map_err(|e| format!("写入文件 {rel} 失败: {e}"))?;
        }
    }
    // The template's own folders (for example `sec/`) belong to the paper's file tree.
    let mut paper_dirs: Vec<String> = files
        .iter()
        .filter_map(|rel| rel.split_once('/').map(|(dir, _)| dir.to_string()))
        .collect();
    paper_dirs.sort();
    paper_dirs.dedup();
    project::write_paper_marker(
        root,
        &project::PaperMarker {
            template_id: info.id.clone(),
            main_file: info.main_file.clone(),
            paper_dirs,
        },
    )?;
    Ok(CreatedPaper {
        main_file: info.main_file.clone(),
        default_theme_id: info.default_theme_id.clone(),
    })
}

/// Creates a paper project from a template without touching files that already exist.
#[tauri::command]
pub async fn paper_template_create_project(
    template_id: String,
    project_dir: String,
    title: Option<String>,
    extra_files: Option<HashMap<String, String>>,
) -> Result<CreatedPaper, String> {
    let project_dir = project_dir.trim().to_string();
    if project_dir.is_empty() {
        return Err("论文项目目录路径不能为空".into());
    }
    let (dir, info) = find_template(&template_id)?;
    tokio::task::spawn_blocking(move || {
        create_project(
            &dir.join("files"),
            &info,
            Path::new(&project_dir),
            title
                .as_deref()
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .unwrap_or("Title of Your Paper"),
            &extra_files.unwrap_or_default(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = fs::canonicalize(std::env::temp_dir())
            .unwrap()
            .join(format!(
                "agentikz_tpl_{name}_{}",
                uuid::Uuid::new_v4().simple()
            ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// One library for every test in this process; the location is set only once.
    fn test_library() -> &'static Path {
        static LIBRARY: OnceLock<PathBuf> = OnceLock::new();
        let path = LIBRARY.get_or_init(|| temp_dir("library"));
        let _ = USER_ROOT.set(path.clone());
        user_root().unwrap()
    }

    fn write(root: &Path, rel: &str, text: &str) {
        let path = root.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn repository_pages_resolve_to_archives_and_subfolders() {
        let github = resolve_remote("https://github.com/cvpr-org/author-kit").unwrap();
        assert_eq!(
            github.archive_url.as_deref(),
            Some("https://github.com/cvpr-org/author-kit/archive/HEAD.zip")
        );
        assert_eq!((github.subdir, github.name.as_str()), (None, "author-kit"));

        let nested =
            resolve_remote("https://github.com/acl-org/acl-style-files.git/tree/master/latex")
                .unwrap();
        assert_eq!(
            nested.archive_url.as_deref(),
            Some("https://github.com/acl-org/acl-style-files/archive/master.zip")
        );
        assert_eq!(
            (nested.subdir.as_deref(), nested.name.as_str()),
            (Some("latex"), "latex")
        );

        let gitlab =
            resolve_remote("https://gitlab.com/group/sub/paper-kit/-/tree/v2/tex").unwrap();
        assert_eq!(
            gitlab.archive_url.as_deref(),
            Some("https://gitlab.com/group/sub/paper-kit/-/archive/v2/paper-kit-v2.zip")
        );
        assert_eq!(gitlab.subdir.as_deref(), Some("tex"));
        assert_eq!(
            resolve_remote("https://gitee.com/someone/thesis")
                .unwrap()
                .archive_url
                .as_deref(),
            Some("https://gitee.com/someone/thesis/repository/archive/master.zip")
        );

        let direct =
            resolve_remote("https://media.icml.cc/Conferences/ICML2026/Styles/icml2026.zip")
                .unwrap();
        assert_eq!(
            direct.archive_url.as_deref(),
            Some("https://media.icml.cc/Conferences/ICML2026/Styles/icml2026.zip")
        );
        assert_eq!(direct.name, "icml2026");

        let other = resolve_remote("https://git.example.org/lab/template.git").unwrap();
        assert_eq!(
            (other.archive_url, other.clone_url.as_deref()),
            (None, Some("https://git.example.org/lab/template.git"))
        );
        assert!(resolve_remote("file:///etc/passwd").is_err());
        assert!(resolve_remote("ssh://git@github.com/a/b").is_err());
    }

    #[test]
    fn archives_cannot_write_outside_the_template_and_links_are_dropped() {
        let dir = temp_dir("zip");
        let archive = dir.join("kit.zip");
        let mut zip = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("kit-main/main.tex", options).unwrap();
        zip.write_all(b"\\documentclass{article}").unwrap();
        zip.start_file("kit-main/.git/config", options).unwrap();
        zip.write_all(b"secret").unwrap();
        zip.finish().unwrap();
        extract_archive(&archive, &dir.join("out")).unwrap();
        assert!(dir.join("out/kit-main/main.tex").is_file());
        assert!(!dir.join("out/kit-main/.git").exists());

        let evil = dir.join("evil.zip");
        let mut zip = zip::ZipWriter::new(fs::File::create(&evil).unwrap());
        zip.start_file("../escaped.tex", options).unwrap();
        zip.write_all(b"x").unwrap();
        zip.finish().unwrap();
        assert!(extract_archive(&evil, &dir.join("evil-out")).is_err());
        assert!(!dir.join("escaped.tex").exists());

        let mut budget = Budget::default();
        assert!(write_member(&dir, Path::new("/abs.tex"), &b"x"[..], &mut budget).is_err());
        fs::write(dir.join("page.html"), "<html>").unwrap();
        assert!(
            extract_archive(&dir.join("page.html"), &dir.join("html-out"))
                .unwrap_err()
                .contains("压缩包")
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn tarballs_unpack_and_the_wrapping_folder_is_removed() {
        let dir = temp_dir("tar");
        let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(
            Vec::new(),
            flate2::Compression::default(),
        ));
        let mut header = tar::Header::new_gnu();
        let body = b"\\documentclass{article}";
        header.set_size(body.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, "repo-main/paper/main.tex", &body[..])
            .unwrap();
        fs::write(
            dir.join("kit.tar.gz"),
            builder.into_inner().unwrap().finish().unwrap(),
        )
        .unwrap();
        extract_archive(&dir.join("kit.tar.gz"), &dir.join("out")).unwrap();
        assert_eq!(
            unwrap_single_dir(dir.join("out")),
            dir.join("out/repo-main")
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_paper_is_preferred_over_side_documents_and_commented_classes() {
        let dir = temp_dir("main");
        write(&dir, "rebuttal.tex", "\\documentclass{article}");
        write(&dir, "acl_lualatex.tex", "\\documentclass{article}");
        write(&dir, "acl_latex.tex", "\\documentclass{article}");
        write(&dir, "sec/intro.tex", "\\section{Intro}");
        write(&dir, "notes.tex", "% \\documentclass{article}\nText");
        assert_eq!(
            main_candidates(&dir).unwrap(),
            vec!["acl_latex.tex", "acl_lualatex.tex", "rebuttal.tex"]
        );
        write(&dir, "main.tex", "\\documentclass{article}");
        assert_eq!(main_candidates(&dir).unwrap()[0], "main.tex");
        assert_eq!(slug("ACL / EMNLP 2026 模板"), "acl-emnlp-2026");
        assert!(valid_id("user-acl-1a2b3c") && !valid_id("../x") && !valid_id("A"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn projects_copy_the_kit_fill_the_title_and_keep_existing_files() {
        let dir = temp_dir("create");
        let files = dir.join("tpl/files");
        write(
            &files,
            "paper.tex",
            "\\documentclass{article}\\title{AGENTIKZ-PAPER-TITLE}",
        );
        write(&files, "sec/intro.tex", "\\section{Intro}");
        write(&files, "kit.sty", "% style");
        let info = TemplateInfo {
            id: "user-kit".into(),
            name: "Kit".into(),
            description: String::new(),
            main_file: "paper.tex".into(),
            main_candidates: vec!["paper.tex".into()],
            default_theme_id: "cvpr".into(),
            column_layout: "double".into(),
            source: String::new(),
            builtin: false,
            verified: None,
            note: String::new(),
            file_count: 3,
        };
        let project = dir.join("project");
        write(&project, "kit.sty", "% mine");
        let extra = HashMap::from([(
            "styles/agentikz-macros.sty".to_string(),
            "% macros".to_string(),
        )]);
        let created = create_project(&files, &info, &project, "A & B_50%", &extra).unwrap();
        assert_eq!(
            (
                created.main_file.as_str(),
                created.default_theme_id.as_str()
            ),
            ("paper.tex", "cvpr")
        );
        assert!(fs::read_to_string(project.join("paper.tex"))
            .unwrap()
            .contains("\\title{A \\& B\\_50\\%}"));
        assert_eq!(
            fs::read_to_string(project.join("kit.sty")).unwrap(),
            "% mine"
        );
        assert!(
            project.join("sec/intro.tex").is_file()
                && project.join("styles/agentikz-macros.sty").is_file()
        );
        let marker = project::read_paper_marker(&project).unwrap();
        assert_eq!(
            (marker.main_file.as_str(), marker.paper_dirs),
            ("paper.tex", vec!["sec".to_string()])
        );
        // The official file tree is listed, with the template's main file marked as such.
        let listed = project::list_paper_files(&project);
        assert_eq!(listed[0].relative_path, "paper.tex");
        assert_eq!(listed[0].category, "main");
        assert!(listed
            .iter()
            .any(|file| file.relative_path == "sec/intro.tex"));
        assert!(create_project(
            &files,
            &TemplateInfo {
                main_file: "missing.tex".into(),
                ..info
            },
            &project,
            "t",
            &extra
        )
        .is_err());
        fs::remove_dir_all(dir).unwrap();
    }

    /// Downloads from GitHub and runs the bundled engine: `AGENTIKZ_NETWORK_TESTS=1 cargo test`.
    #[tokio::test]
    async fn imports_a_repository_folder_and_builds_it() {
        if std::env::var("AGENTIKZ_NETWORK_TESTS").is_err() || !engine::tests::use_staged_runtime()
        {
            eprintln!("skipped: needs AGENTIKZ_NETWORK_TESTS=1 and a staged TeX runtime");
            return;
        }
        test_library();
        let imported = paper_template_import(
            "https://github.com/acl-org/acl-style-files".into(),
            Some("ACL upstream".into()),
            None,
            None,
            None,
        )
        .await
        .unwrap();
        assert_eq!(
            (imported.name.as_str(), imported.main_file.as_str()),
            ("ACL upstream", "acl_latex.tex")
        );
        assert!(
            imported.id.starts_with("user-acl-upstream-")
                && !imported.builtin
                && imported.verified.is_none()
        );
        assert!(user_root()
            .unwrap()
            .join(&imported.id)
            .join("files/acl.sty")
            .is_file());

        let verified = paper_template_verify(imported.id.clone()).await.unwrap();
        assert_eq!(verified.verified, Some(true), "{}", verified.note);
        assert!(paper_templates_list()
            .await
            .iter()
            .any(|t| t.id == imported.id));
        assert!(
            paper_template_set_main(imported.id.clone(), "acl.sty".into())
                .await
                .is_err()
        );

        assert!(paper_template_import(
            "https://github.com/acl-org/acl-style-files/tree/master/nope".into(),
            None,
            None,
            None,
            None
        )
        .await
        .unwrap_err()
        .contains("不存在目录"));
        paper_template_remove(imported.id.clone()).await.unwrap();
        assert!(find_template(&imported.id).is_err());
        assert!(paper_template_remove("cvpr".into()).await.is_err());
    }

    #[tokio::test]
    async fn isolated_https_git_clone_produces_an_importable_template() {
        if std::env::var("AGENTIKZ_NETWORK_TESTS").is_err() {
            eprintln!("skipped: needs AGENTIKZ_NETWORK_TESTS=1 and git");
            return;
        }
        test_library();
        let stage = temp_dir("clone");
        let checkout = stage.join("checkout");
        clone_repository("https://github.com/acl-org/acl-style-files.git", None, &checkout).await.unwrap();
        let imported = install(&checkout, None, "Git clone test", "https://github.com/acl-org/acl-style-files.git").unwrap();
        assert_eq!(imported.main_file, "acl_latex.tex");
        assert!(!user_root().unwrap().join(&imported.id).join("files/.git").exists());
        assert_eq!(imported.verified, None);
        paper_template_remove(imported.id).await.unwrap();
        fs::remove_dir_all(stage).unwrap();
    }

    #[tokio::test]
    async fn extensionless_download_urls_import_without_running_the_source() {
        test_library();
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        zip.start_file("journal/main.tex", zip::write::SimpleFileOptions::default()).unwrap();
        // Invalid TeX still imports: import must never implicitly execute it.
        zip.write_all(b"\\documentclass{article}\\undefinedmacro").unwrap();
        let body = zip.finish().unwrap().into_inner();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 4096];
            let count = stream.read(&mut request).unwrap();
            assert!(String::from_utf8_lossy(&request[..count]).starts_with("GET /download?id=42 "));
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/zip\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).unwrap();
            stream.write_all(&body).unwrap();
        });
        let url = format!("http://{address}/download?id=42");
        let imported = paper_template_import(url.clone(), Some("Download endpoint".into()), None, Some("url".into()), None).await.unwrap();
        server.join().unwrap();
        assert_eq!(imported.main_file, "main.tex");
        assert_eq!(imported.verified, None);
        assert_eq!(imported.source, url);
        paper_template_remove(imported.id).await.unwrap();
    }

    #[test]
    fn installs_the_requested_subfolder_and_starts_at_the_main_document() {
        test_library();
        let tree = temp_dir("install");
        write(&tree, "repo-main/README.md", "# kits");
        write(
            &tree,
            "repo-main/kits/acl/main.tex",
            "\\documentclass{article}",
        );
        write(&tree, "repo-main/kits/acl/acl.sty", "% style");
        write(
            &tree,
            "repo-main/other/paper.tex",
            "\\documentclass{article}",
        );
        let chosen = install(
            &tree,
            Some("kits/acl"),
            "ACL kit",
            "https://example.org/kits",
        )
        .unwrap();
        assert_eq!(
            (chosen.main_file.as_str(), chosen.file_count),
            ("main.tex", 2)
        );
        assert_eq!(chosen.source, "https://example.org/kits");
        assert!(install(&tree, Some("../outside"), "x", "").is_err());

        // Nested main documents keep resources outside their own folder.
        let nested = temp_dir("nested");
        write(&nested, "docs/guide.md", "guide");
        write(
            &nested,
            "latex/paper.tex",
            "\\documentclass{article}\\input{../styles/shared}",
        );
        write(&nested, "latex/kit.cls", "% class");
        write(&nested, "styles/shared.tex", "Shared resource");
        let found = install(&nested, None, "Nested", "").unwrap();
        assert_eq!(
            (found.main_file.as_str(), found.file_count),
            ("latex/paper.tex", 4)
        );
        assert!(user_root()
            .unwrap()
            .join(&found.id)
            .join("files/styles/shared.tex")
            .is_file());

        let empty = temp_dir("empty");
        write(&empty, "README.md", "no tex here");
        assert!(install(&empty, None, "Empty", "")
            .unwrap_err()
            .contains("documentclass"));
        for id in [chosen.id, found.id] {
            fs::remove_dir_all(user_root().unwrap().join(id)).unwrap();
        }
        for dir in [tree, nested, empty] {
            let _ = fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn portable_paths_reject_windows_aliases_and_traversal() {
        for bad in [
            "../x.tex",
            "..\\x.tex",
            "C:/x.tex",
            "C:x.tex",
            "/x.tex",
            "\\\\host\\share\\x",
            "fig/a.pdf:payload",
            "a/NUL.txt",
            "AUX",
            "foo./bar",
            "foo /bar",
            "a?b.tex",
        ] {
            assert!(clean_relative(Path::new(bad)).is_none(), "{bad}");
        }
        assert_eq!(
            clean_relative(Path::new("./sec\\intro.tex")),
            Some("sec/intro.tex".into())
        );
        assert_eq!(
            clean_relative(Path::new("中文模板/main.tex")),
            Some("中文模板/main.tex".into())
        );
    }

    #[test]
    fn oversized_trees_fail_instead_of_silently_losing_files() {
        let dir = temp_dir("budget");
        for i in 0..=MAX_FILES {
            fs::write(dir.join(format!("{i}.tex")), "").unwrap();
        }
        assert!(list_files(&dir).unwrap_err().contains("模板过大"));
        let out = temp_dir("budget_out");
        assert!(copy_tree(&dir, &out).is_err());
        assert_eq!(fs::read_dir(&out).unwrap().count(), 0);

        let mut count = Budget {
            files: MAX_FILES,
            bytes: 0,
        };
        assert!(write_member(&out, Path::new("one.tex"), &b"x"[..], &mut count).is_err());
        assert!(!out.join("one.tex").exists());
        let mut size = Budget {
            files: 0,
            bytes: MAX_TOTAL_BYTES,
        };
        assert!(write_member(&out, Path::new("two.tex"), &b"x"[..], &mut size).is_err());
        assert_eq!(fs::metadata(out.join("two.tex")).unwrap().len(), 1);
        fs::remove_dir_all(dir).unwrap();
        fs::remove_dir_all(out).unwrap();
    }

    #[tokio::test]
    async fn local_import_honors_source_kind_and_subdirectory_without_compiling() {
        test_library();
        let tree = temp_dir("local");
        write(
            &tree,
            "templates/example/main.tex",
            "\\documentclass{article}",
        );
        write(&tree, "README.md", "repository");
        let imported = paper_template_import(
            tree.to_string_lossy().into_owned(),
            Some("Folder".into()),
            None,
            Some("auto".into()),
            Some("templates/example".into()),
        )
        .await
        .unwrap();
        assert_eq!(imported.main_file, "main.tex");
        assert_eq!(imported.verified, None);
        paper_template_remove(imported.id).await.unwrap();
        assert!(paper_template_import(
            tree.to_string_lossy().into_owned(),
            None,
            None,
            Some("url".into()),
            None
        )
        .await
        .is_err());
        assert!(paper_template_import(
            tree.to_string_lossy().into_owned(),
            None,
            None,
            None,
            Some("../escape".into())
        )
        .await
        .is_err());
        let direct = remote_for_kind("https://example.org/download?id=123", "url").unwrap();
        assert_eq!(
            direct.archive_url.as_deref(),
            Some("https://example.org/download?id=123")
        );
        assert!(remote_for_kind("https://example.org/research/kit", "git")
            .unwrap()
            .clone_url
            .is_some());
        assert!(remote_for_kind("https://example.org/kit", "auto")
            .unwrap()
            .archive_url
            .is_some());
        assert!(remote_for_kind("https://example.org/kit", "invalid").is_err());
        assert!(resolve_remote("https://user:secret@example.org/kit.zip").is_err());
        fs::remove_dir_all(tree).unwrap();
    }

    /// Windows junctions do not require symlink privileges, unlike symlink_dir.
    #[cfg(windows)]
    fn directory_link(target: &Path, link: &Path) -> bool {
        std::process::Command::new("cmd")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .output()
            .is_ok_and(|output| output.status.success())
    }

    #[cfg(unix)]
    fn directory_link(target: &Path, link: &Path) -> bool {
        std::os::unix::fs::symlink(target, link).is_ok()
    }

    #[test]
    fn directory_links_are_neither_copied_nor_used_as_write_destinations() {
        let dir = temp_dir("links");
        let outside = temp_dir("outside");
        let source = dir.join("source");
        write(&source, "main.tex", "\\documentclass{article}");
        write(&outside, "hidden.tex", "do not import");
        if !directory_link(&outside, &source.join("external")) {
            eprintln!("skipped directory-link assertions: platform does not permit creating links");
            fs::remove_dir_all(dir).unwrap();
            fs::remove_dir_all(outside).unwrap();
            return;
        }
        assert_eq!(list_files(&source).unwrap(), vec!["main.tex"]);
        assert!(copy_tree(&source.join("external"), &dir.join("copy")).is_err());
        let dest = dir.join("dest");
        fs::create_dir(&dest).unwrap();
        assert!(directory_link(&outside, &dest.join("sec")));
        assert!(safe_output(&dest, "sec/new.tex").is_err());
        assert!(safe_directory(&dest.join("sec")).is_err());
        assert!(!outside.join("new.tex").exists());
        // Remove links without recursively walking their targets.
        fs::remove_dir(source.join("external"))
            .or_else(|_| fs::remove_file(source.join("external")))
            .unwrap();
        fs::remove_dir(dest.join("sec"))
            .or_else(|_| fs::remove_file(dest.join("sec")))
            .unwrap();
        fs::remove_dir_all(dir).unwrap();
        assert!(outside.join("hidden.tex").is_file());
        fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn duplicate_archive_members_are_not_silently_overwritten() {
        let dir = temp_dir("duplicate");
        let mut budget = Budget::default();
        write_member(&dir, Path::new("main.tex"), &b"first"[..], &mut budget).unwrap();
        assert!(write_member(&dir, Path::new("main.tex"), &b"second"[..], &mut budget).is_err());
        assert_eq!(fs::read(dir.join("main.tex")).unwrap(), b"first");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn bundled_kits_are_complete() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../runtime/paper-templates");
        let templates: Vec<TemplateInfo> = templates_in(&root, true)
            .into_iter()
            .map(|(_, info)| info)
            .collect();
        let mut ids: Vec<&str> = templates.iter().map(|t| t.id.as_str()).collect();
        ids.sort();
        assert_eq!(
            ids,
            ["acl", "blank", "cvpr", "iclr", "icml", "ieee", "neurips"]
        );
        for template in &templates {
            assert!(
                template.main_candidates.contains(&template.main_file),
                "{} main file",
                template.id
            );
        }
        for (id, style) in [
            ("cvpr", "cvpr.sty"),
            ("icml", "icml2026.sty"),
            ("neurips", "neurips_2026.sty"),
            ("acl", "acl.sty"),
        ] {
            assert!(
                root.join(id).join("files").join(style).is_file(),
                "{id} ships {style}"
            );
        }
    }
}
