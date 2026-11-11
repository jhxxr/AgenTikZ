//! Built-in TeX runtime: a bundled Tectonic engine (XeTeX core), bundled
//! Noto Sans CJK SC fonts and a pre-warmed package cache. Nothing here looks
//! at the user's PATH or at a system TeX distribution.
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};
use tokio::process::Command;

pub const BUILTIN_ENGINE: &str = "xelatex";

struct Runtime {
    root: Option<PathBuf>,
    cache_dir: PathBuf,
}

static RUNTIME: OnceLock<Runtime> = OnceLock::new();
static SEEDED: OnceLock<()> = OnceLock::new();

/// TeX tools take ordinary Windows paths, not NT extended-length prefixes.
pub(crate) fn plain_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
    }
}

fn tectonic_in(root: &Path) -> Option<PathBuf> {
    let name = if cfg!(windows) { "tectonic.exe" } else { "tectonic" };
    let path = root.join("bin").join(name);
    path.is_file().then_some(path)
}

pub fn init(app: &AppHandle) {
    let mut candidates = Vec::new();
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("tex-runtime"));
    }
    #[cfg(debug_assertions)]
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tex-runtime"));
    let root = candidates.into_iter().find(|dir| tectonic_in(dir).is_some());
    let cache_dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("agentikz"))
        .join("tex-cache");
    let _ = RUNTIME.set(Runtime { root, cache_dir });
}

/// Folder of the bundled runtime; it also carries the built-in paper templates.
pub(crate) fn runtime_root() -> Option<&'static Path> {
    RUNTIME.get()?.root.as_deref()
}

fn runtime() -> Result<(&'static Path, PathBuf, &'static Path), String> {
    let missing = "内置 TeX 引擎缺失，请重新安装 AgenTikZ（开发环境请先运行 npm run tex:stage）。";
    let rt = RUNTIME.get().ok_or(missing)?;
    let root = rt.root.as_deref().ok_or(missing)?;
    let bin = tectonic_in(root).ok_or(missing)?;
    Ok((root, bin, &rt.cache_dir))
}

fn copy_missing(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_missing(&entry.path(), &target)?;
        } else if !target.exists() {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Copies the bundled package cache into the writable cache once per runtime
/// build, so the pre-installed packages compile without network access.
fn seed_cache(root: &Path, cache_dir: &Path) {
    SEEDED.get_or_init(|| {
        let seed = root.join("cache");
        if !seed.is_dir() {
            return;
        }
        let stamp = fs::read_to_string(root.join("manifest.json")).unwrap_or_default();
        let marker = cache_dir.join(".agentikz-seed");
        if fs::read_to_string(&marker).is_ok_and(|done| done == stamp) {
            return;
        }
        if copy_missing(&seed, cache_dir).is_ok() {
            let _ = fs::write(marker, stamp);
        }
    });
}

/// Engines other than the bundled one are rejected instead of silently
/// compiling with different semantics.
pub(super) fn resolve_engine(requested: Option<&str>) -> Result<&'static str, String> {
    match requested.map(str::trim) {
        Some("lualatex") | Some("pdflatex") => Err(format!(
            "{} 尚未内置。当前内置引擎为 XeLaTeX（Tectonic），请在编译菜单中选择 XeLaTeX。",
            requested.unwrap_or_default()
        )),
        _ => Ok(BUILTIN_ENGINE),
    }
}

/// `tectonic -X compile` with the bundled cache, fonts and style files wired in.
/// Callers append the input file and output options.
pub(super) async fn tectonic_command(search_dirs: &[PathBuf]) -> Result<Command, String> {
    let (root, bin, cache_dir) = runtime()?;
    let cache = cache_dir.to_path_buf();
    let seed_root = root.to_path_buf();
    let seed_cache_dir = cache.clone();
    tokio::task::spawn_blocking(move || {
        let _ = fs::create_dir_all(&seed_cache_dir);
        seed_cache(&seed_root, &seed_cache_dir);
    })
    .await
    .map_err(|e| e.to_string())?;

    let mut cmd = Command::new(bin);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x0800_0000);
    cmd.env("TECTONIC_CACHE_DIR", plain_path(&cache));
    // An imported repository often has a folder literally called `latex`.
    // The default format name `latex` collides with it in the search path;
    // use the explicit format filename instead.
    cmd.args(["-X", "compile", "--format", "latex.fmt"]);
    for dir in [root.join("fonts"), root.join("texmf")]
        .iter()
        .chain(search_dirs)
        .filter(|dir| dir.is_dir())
    {
        cmd.arg("-Z")
            .arg(format!("search-path={}", plain_path(dir).replace('\\', "/")));
    }
    Ok(cmd)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexEngineInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub available: bool,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexRuntimeStatus {
    pub ready: bool,
    pub version: Option<String>,
    pub engines: Vec<TexEngineInfo>,
    pub cjk_font: Option<&'static str>,
    pub offline_packages: bool,
    pub message: String,
}

/// Reports the bundled engine for the settings and diagnostics panels.
#[tauri::command]
pub async fn tex_engine_status() -> TexRuntimeStatus {
    let found = runtime();
    let mut version = None;
    let mut cjk_font = None;
    let mut offline_packages = false;
    if let Ok((root, bin, _)) = &found {
        let mut cmd = Command::new(bin);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x0800_0000);
        cmd.arg("--version");
        if let Ok(out) = super::compiler::run_bounded_command(&mut cmd, 10).await {
            version = String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .map(|line| line.trim().to_string())
                .filter(|line| !line.is_empty());
        }
        if root.join("fonts/NotoSansCJKsc-Regular.otf").is_file() {
            cjk_font = Some("Noto Sans CJK SC");
        }
        offline_packages = root.join("cache").is_dir();
    }
    let ready = version.is_some();
    let unavailable = "未内置（需要 TeX Live 的专用二进制）".to_string();
    TexRuntimeStatus {
        ready,
        engines: vec![
            TexEngineInfo {
                id: "xelatex",
                label: "XeLaTeX",
                available: ready,
                note: if ready { "内置 · Tectonic（XeTeX 内核）".into() } else { "内置引擎缺失".into() },
            },
            TexEngineInfo { id: "lualatex", label: "LuaLaTeX", available: false, note: unavailable.clone() },
            TexEngineInfo { id: "pdflatex", label: "pdfLaTeX", available: false, note: unavailable },
        ],
        cjk_font,
        offline_packages,
        message: match (&found, ready) {
            (Err(error), _) => error.clone(),
            (_, false) => "内置 TeX 引擎无法启动，请重新安装 AgenTikZ。".into(),
            _ => "内置 TeX 引擎就绪，无需安装 TeX Live。".into(),
        },
        version,
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Points the engine at the staged runtime; `false` when it has not been staged.
    pub(crate) fn use_staged_runtime() -> bool {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tex-runtime");
        if tectonic_in(&root).is_none() {
            return false;
        }
        let cache_dir = std::env::temp_dir().join("agentikz_test_tex_cache");
        let _ = RUNTIME.set(Runtime { root: Some(root), cache_dir });
        true
    }

    #[test]
    fn only_the_bundled_engine_is_accepted() {
        assert_eq!(resolve_engine(None), Ok("xelatex"));
        assert_eq!(resolve_engine(Some("xelatex")), Ok("xelatex"));
        // Values persisted by releases that used a system TeX Live.
        assert_eq!(resolve_engine(Some("latex")), Ok("xelatex"));
        assert!(resolve_engine(Some("lualatex")).is_err());
        assert!(resolve_engine(Some("pdflatex")).is_err());
    }

    #[test]
    fn strips_extended_length_prefixes_and_seeds_without_overwriting() {
        assert_eq!(plain_path(Path::new(r"\\?\C:\App\tex-runtime")), r"C:\App\tex-runtime");
        let base = std::env::temp_dir().join(format!("agentikz_seed_{}", std::process::id()));
        let (from, to) = (base.join("from/a"), base.join("to"));
        fs::create_dir_all(&from).unwrap();
        fs::create_dir_all(to.join("a")).unwrap();
        fs::write(from.join("new.sty"), "seed").unwrap();
        fs::write(from.join("kept.sty"), "seed").unwrap();
        fs::write(to.join("a/kept.sty"), "local").unwrap();
        copy_missing(&base.join("from"), &to).unwrap();
        assert_eq!(fs::read_to_string(to.join("a/new.sty")).unwrap(), "seed");
        assert_eq!(fs::read_to_string(to.join("a/kept.sty")).unwrap(), "local");
        fs::remove_dir_all(base).unwrap();
    }
}
