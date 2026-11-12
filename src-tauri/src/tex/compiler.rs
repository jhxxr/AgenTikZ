//! Figure previews and paper builds on the bundled engine (see `engine.rs`).
//! Tectonic produces the PDF; previews are converted to path-only SVG in-process.
use super::engine;
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Component, Path, PathBuf};
use std::process::Output;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, UNIX_EPOCH};
use tokio::process::Command;

static NEXT_BUILD_ID: AtomicU64 = AtomicU64::new(0);

/// Build files are kept out of the paper sources.
const BUILD_DIR: &str = ".agentikz/build";
/// Left next to the sources by this app (SyncTeX map) or by earlier TeX Live builds.
const ROOT_ARTIFACT_EXTENSIONS: [&str; 16] = [
    "aux", "log", "out", "toc", "lof", "lot", "bbl", "blg", "fls", "fdb_latexmk", "synctex.gz",
    "synctex", "xdv", "nav", "snm", "bcf",
];

pub(crate) async fn run_bounded_command(cmd: &mut Command, seconds: u64) -> std::io::Result<Output> {
    // Dropping a timed-out output future must also terminate its child.
    cmd.kill_on_drop(true);
    tokio::time::timeout(Duration::from_secs(seconds), cmd.output())
        .await
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::TimedOut, "TeX command timed out"))?
}

fn paper_compile_succeeded(process_ok: bool, pdf_path: &Path) -> bool {
    process_ok
        && fs::metadata(pdf_path)
            .map(|m| m.is_file() && m.len() > 0)
            .unwrap_or(false)
}

fn preview_log_excerpt(log: &str) -> String {
    let lines: Vec<&str> = log.lines().collect();
    let start = lines
        .iter()
        .position(|line| {
            line.starts_with("! ")
                || line.starts_with("error:")
                || line.contains(": error:")
                || line.contains(" Error:")
                || line.contains("Undefined control sequence")
        })
        .unwrap_or_else(|| lines.len().saturating_sub(12));
    lines[start..lines.len().min(start + 12)]
        .join("\n")
        .chars()
        .take(2400)
        .collect()
}

/// XeTeX may exit successfully and still omit text. Such a PDF is not an exact
/// preview and must never be published or exported as a complete drawing.
fn missing_glyph_diagnostic(log: &str) -> Option<String> {
    let missing: Vec<&str> = log
        .lines()
        .filter(|line| line.trim_start().starts_with("Missing character:"))
        .collect();
    if missing.is_empty() {
        return None;
    }
    Some(format!(
        "检测到缺字（{} 处），渲染结果不完整，未作为精确预览发布。\n{}\n请配置覆盖这些字符的字体；中文可使用内置 agentikz-fonts 宏包。",
        missing.len(),
        missing.iter().take(8).copied().collect::<Vec<_>>().join("\n")
    ))
}

fn command_error(error: &std::io::Error, seconds: u64) -> String {
    if error.kind() == std::io::ErrorKind::TimedOut {
        format!("编译超时（{seconds} 秒）。首次使用新宏包需要联网下载，请检查网络或减少图形复杂度后重试。")
    } else {
        format!("无法启动内置 TeX 引擎：{error}")
    }
}

/// Explains the two failures a user cannot diagnose from a TeX log alone.
fn failure_hint(output: &str) -> &'static str {
    let lower = output.to_lowercase();
    if lower.contains("tex capacity exceeded") {
        // The bundled engine's memory is fixed at build time; there is no texmf.cnf to raise it.
        "\n提示：图形超出了内置引擎的内存上限（约 500 万字）。请减少单张图内的循环绘制数量，或把热力图 / 大矩阵改用 PGFPlots 的 matrix plot，或拆成多张子图。"
    } else if ["failed to download", "error sending request", "dns error", "connection", "timed out"]
        .iter()
        .any(|needle| lower.contains(needle))
    {
        "\n提示：文档用到了未预置的宏包或字体，首次使用需要联网下载（之后会缓存到本机）。"
    } else {
        ""
    }
}

fn engine_output(output: &Output) -> String {
    format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

/// The project folder and its first-level folders, so `\input` and
/// `\includegraphics` resolve the way they do inside the paper.
fn project_search_dirs(project_dir: Option<&str>) -> Vec<PathBuf> {
    let Some(root) = project_dir.map(str::trim).filter(|dir| !dir.is_empty()).map(PathBuf::from) else {
        return Vec::new();
    };
    if !root.is_dir() {
        return Vec::new();
    }
    let mut dirs = vec![root.clone()];
    if let Ok(entries) = fs::read_dir(&root) {
        let mut children: Vec<PathBuf> = entries
            .flatten()
            .filter(|entry| {
                let name = entry.file_name().to_string_lossy().to_string();
                entry.path().is_dir() && !name.starts_with('.') && name != "node_modules"
            })
            .map(|entry| entry.path())
            .collect();
        children.sort();
        dirs.extend(children.into_iter().take(24));
    }
    dirs
}

fn pdf_to_svg(pdf: Vec<u8>) -> Result<String, String> {
    use hayro_svg::hayro_interpret::InterpreterSettings;
    use hayro_svg::hayro_syntax::Pdf;
    let pdf = Pdf::new(pdf).map_err(|_| "生成的 PDF 无法解析".to_string())?;
    let page = pdf.pages().iter().next().ok_or("生成的 PDF 没有页面")?;
    // Glyphs become outlines: the SVG needs no fonts and renders identically everywhere.
    Ok(hayro_svg::convert(
        page,
        &hayro_svg::RenderCache::new(),
        &InterpreterSettings::default(),
        &hayro_svg::SvgRenderSettings::default(),
    ))
}

#[derive(Debug, Serialize)]
pub struct TexCompileResult {
    pub ok: bool,
    pub svg: Option<String>,
    pub message: String,
}

impl TexCompileResult {
    fn failed(message: impl Into<String>) -> Self {
        Self { ok: false, svg: None, message: message.into() }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperCompileResult {
    pub ok: bool,
    pub pdf_path: Option<String>,
    pub pdf_data_url: Option<String>,
    pub message: String,
    pub log_excerpt: String,
    pub errors: Vec<String>,
}

impl PaperCompileResult {
    fn failed(message: impl Into<String>, errors: Vec<String>) -> Self {
        Self {
            ok: false,
            pdf_path: None,
            pdf_data_url: None,
            message: message.into(),
            log_excerpt: String::new(),
            errors,
        }
    }
}

/// Compiles a standalone TikZ/PGFPlots document with the bundled engine and
/// returns it as SVG.
#[tauri::command]
pub async fn tex_compile_preview(
    tex_source: String,
    tex_engine: Option<String>,
    project_dir: Option<String>,
) -> TexCompileResult {
    let engine_name = match engine::resolve_engine(tex_engine.as_deref()) {
        Ok(name) => name,
        Err(error) => return TexCompileResult::failed(error),
    };
    let stamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let temp_dir = std::env::temp_dir().join(format!(
        "agentikz_build_{}_{}_{}",
        std::process::id(),
        stamp,
        NEXT_BUILD_ID.fetch_add(1, Ordering::Relaxed)
    ));
    if let Err(e) = fs::create_dir_all(&temp_dir) {
        return TexCompileResult::failed(format!("无法创建临时编译目录: {e}"));
    }
    let result = compile_preview_in(&temp_dir, &tex_source, engine_name, project_dir.as_deref()).await;
    let _ = fs::remove_dir_all(&temp_dir);
    result
}

async fn compile_preview_in(
    temp_dir: &Path,
    tex_source: &str,
    engine_name: &str,
    project_dir: Option<&str>,
) -> TexCompileResult {
    const SECONDS: u64 = 180;
    if let Err(e) = fs::write(temp_dir.join("figure.tex"), tex_source.as_bytes()) {
        return TexCompileResult::failed(format!("写入临时 .tex 文件失败: {e}"));
    }
    let mut cmd = match engine::tectonic_command(&project_search_dirs(project_dir)).await {
        Ok(cmd) => cmd,
        Err(error) => return TexCompileResult::failed(error),
    };
    cmd.args(["figure.tex", "--outfmt", "pdf", "--keep-logs"])
        .current_dir(temp_dir);
    let output = match run_bounded_command(&mut cmd, SECONDS).await {
        Ok(output) => output,
        Err(error) => return TexCompileResult::failed(command_error(&error, SECONDS)),
    };
    let pdf = fs::read(temp_dir.join("figure.pdf")).ok().filter(|bytes| !bytes.is_empty());
    let log = fs::read_to_string(temp_dir.join("figure.log")).unwrap_or_default();
    let Some(pdf) = pdf.filter(|_| output.status.success()) else {
        let console = engine_output(&output);
        let excerpt = preview_log_excerpt(if log.contains("\n! ") { &log } else { &console });
        return TexCompileResult::failed(format!(
            "{engine_name} 编译失败：\n{excerpt}{}",
            failure_hint(&format!("{console}\n{log}"))
        ));
    };
    if let Some(diagnostic) = missing_glyph_diagnostic(&log) {
        return TexCompileResult::failed(format!("{engine_name} 编译结果不完整：\n{diagnostic}"));
    }
    match tokio::task::spawn_blocking(move || pdf_to_svg(pdf)).await {
        Ok(Ok(svg)) => TexCompileResult {
            ok: true,
            svg: Some(svg),
            message: format!("内置 {engine_name} 引擎编译成功"),
        },
        Ok(Err(error)) => TexCompileResult::failed(error),
        Err(error) => TexCompileResult::failed(format!("SVG 转换失败: {error}")),
    }
}

/// Builds `entry` inside `dir` once and reports why it failed, if it did.
/// Used to tell whether an imported template works with the bundled engine.
pub(crate) async fn trial_compile(dir: &Path, entry: &str) -> Result<(), String> {
    const SECONDS: u64 = 300;
    let out = dir.join(BUILD_DIR);
    fs::create_dir_all(&out).map_err(|e| format!("无法创建编译目录: {e}"))?;
    let entry_path = dir.join(entry);
    let working_dir = entry_path.parent().unwrap_or(dir);
    let mut cmd = engine::tectonic_command(&project_search_dirs(dir.to_str())).await?;
    cmd.arg(entry_path.file_name().ok_or("模板主文件路径无效")?)
        .args(["--outfmt", "pdf", "--keep-logs", "--outdir"])
        .arg(engine::plain_path(&out))
        .current_dir(working_dir);
    let output = run_bounded_command(&mut cmd, SECONDS).await.map_err(|e| command_error(&e, SECONDS))?;
    let stem = Path::new(entry).file_stem().and_then(|s| s.to_str()).unwrap_or("main");
    if paper_compile_succeeded(output.status.success(), &out.join(format!("{stem}.pdf"))) {
        return Ok(());
    }
    let console = engine_output(&output);
    let log = fs::read_to_string(out.join(format!("{stem}.log"))).unwrap_or_default();
    let excerpt = preview_log_excerpt(if log.contains("\n! ") { &log } else { &console });
    Err(format!("{excerpt}{}", failure_hint(&format!("{console}\n{log}"))))
}

fn paper_root(project_dir: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(project_dir.trim());
    if project_dir.trim().is_empty() || !root.is_dir() {
        return Err("请先打开或新建论文项目文件夹".into());
    }
    Ok(root)
}

/// The entry file must be a `.tex` path inside the project.
fn paper_entry(root: &Path, main_tex_file: Option<&str>) -> Result<(String, String), String> {
    let entry = main_tex_file.map(str::trim).filter(|s| !s.is_empty()).unwrap_or("main.tex");
    let path = Path::new(entry);
    if path.is_absolute() || !path.components().all(|part| matches!(part, Component::Normal(_))) {
        return Err(format!("论文入口文件必须位于项目内: {entry}"));
    }
    if path.extension().is_none_or(|ext| !ext.eq_ignore_ascii_case("tex")) || !root.join(path).is_file() {
        return Err(format!("未找到可编译的论文入口文件: {entry}"));
    }
    let canonical_root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let canonical_entry = fs::canonicalize(root.join(path)).map_err(|e| e.to_string())?;
    if !canonical_entry.starts_with(&canonical_root) {
        return Err("论文入口文件不能链接到项目目录之外".into());
    }
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("main").to_string();
    Ok((entry.replace('\\', "/"), stem))
}

fn count_files(dir: &Path) -> usize {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| if entry.path().is_dir() { count_files(&entry.path()) } else { 1 })
                .sum()
        })
        .unwrap_or(0)
}

/// Removes build files but never sources or the compiled PDF.
fn clean_artifacts(root: &Path, stem: &str) -> usize {
    let build = root.join(BUILD_DIR);
    let mut removed = count_files(&build);
    if build.is_dir() && fs::remove_dir_all(&build).is_err() {
        removed = 0;
    }
    for ext in ROOT_ARTIFACT_EXTENSIONS {
        let path = root.join(format!("{stem}.{ext}"));
        if path.is_file() && fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Changes whenever a source file is added, removed or modified.
fn source_fingerprint(root: &Path, stem: &str, engine_name: &str) -> String {
    fn walk(dir: &Path, root: &Path, skip: &[String], depth: u32, out: &mut Vec<(String, u64, u128)>) {
        let Ok(entries) = fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path();
            if name.starts_with('.') || name == "node_modules" || out.len() >= 5000 {
                continue;
            }
            if path.is_dir() {
                if depth < 6 {
                    walk(&path, root, skip, depth + 1, out);
                }
            } else if let Ok(meta) = entry.metadata() {
                let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                if skip.contains(&rel) {
                    continue;
                }
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_nanos())
                    .unwrap_or(0);
                out.push((rel, meta.len(), modified));
            }
        }
    }
    let mut skip = vec![format!("{stem}.pdf")];
    skip.extend(ROOT_ARTIFACT_EXTENSIONS.iter().map(|ext| format!("{stem}.{ext}")));
    let mut files = Vec::new();
    walk(root, root, &skip, 0, &mut files);
    files.sort();
    let mut hasher = DefaultHasher::new();
    (engine_name, &files).hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Compiles the paper with the bundled engine. `mode` is `normal` (skip when
/// the sources are unchanged), `force` (always rebuild) or `clean` (remove
/// build files, then rebuild).
#[tauri::command]
pub async fn tex_compile_paper(
    project_dir: String,
    main_tex_file: Option<String>,
    tex_engine: Option<String>,
    mode: Option<String>,
) -> PaperCompileResult {
    const SECONDS: u64 = 300;
    let (root, entry, stem) = match paper_root(&project_dir)
        .and_then(|root| paper_entry(&root, main_tex_file.as_deref()).map(|(e, s)| (root, e, s)))
    {
        Ok(found) => found,
        Err(error) => return PaperCompileResult::failed(error.clone(), vec![error]),
    };
    let engine_name = match engine::resolve_engine(tex_engine.as_deref()) {
        Ok(name) => name,
        Err(error) => return PaperCompileResult::failed(error.clone(), vec![error]),
    };
    let mode = mode.as_deref().unwrap_or("normal");
    if mode == "clean" {
        clean_artifacts(&root, &stem);
    }
    let build_dir = root.join(BUILD_DIR);
    let pdf_path = root.join(format!("{stem}.pdf"));
    let fingerprint_path = build_dir.join(format!("{stem}.fingerprint"));
    let fingerprint = source_fingerprint(&root, &stem, engine_name);
    let log_tail = |log: &str| {
        let lines: Vec<&str> = log.lines().collect();
        lines[lines.len().saturating_sub(45)..].join("\n")
    };
    if mode == "normal"
        && paper_compile_succeeded(true, &pdf_path)
        && fs::read_to_string(&fingerprint_path).is_ok_and(|saved| saved == fingerprint)
    {
        return PaperCompileResult {
            ok: true,
            pdf_path: Some(pdf_path.to_string_lossy().to_string()),
            pdf_data_url: None,
            message: format!("源码未变化，{stem}.pdf 已是最新（需要重跑请选择「强制重新编译」）"),
            log_excerpt: log_tail(&fs::read_to_string(build_dir.join(format!("{stem}.log"))).unwrap_or_default()),
            errors: Vec::new(),
        };
    }
    if let Err(e) = fs::create_dir_all(&build_dir) {
        let error = format!("无法创建编译目录: {e}");
        return PaperCompileResult::failed(error.clone(), vec![error]);
    }
    // A failed build must not leave an earlier success marker or PDF behind as evidence.
    let _ = fs::remove_file(&fingerprint_path);
    let built_pdf = build_dir.join(format!("{stem}.pdf"));
    let _ = fs::remove_file(&built_pdf);

    let mut cmd = match engine::tectonic_command(&project_search_dirs(Some(&project_dir))).await {
        Ok(cmd) => cmd,
        Err(error) => return PaperCompileResult::failed(error.clone(), vec![error]),
    };
    // Tectonic reruns TeX and BibTeX itself until references settle.
    let entry_path = root.join(&entry);
    cmd.arg(entry_path.file_name().unwrap_or_default())
        .args(["--outfmt", "pdf", "--keep-logs", "--keep-intermediates", "--synctex", "--outdir"])
        .arg(engine::plain_path(&build_dir))
        .current_dir(entry_path.parent().unwrap_or(&root));
    let output = match run_bounded_command(&mut cmd, SECONDS).await {
        Ok(output) => output,
        Err(error) => {
            let message = command_error(&error, SECONDS);
            return PaperCompileResult::failed(message.clone(), vec![message]);
        }
    };

    let console = engine_output(&output);
    let full_log = fs::read_to_string(build_dir.join(format!("{stem}.log"))).unwrap_or_default();
    let mut errors: Vec<String> = full_log
        .lines()
        .chain(console.lines())
        .map(str::trim)
        .filter(|line| line.starts_with("! ") || line.starts_with("l.") || line.starts_with("error:"))
        .map(String::from)
        .collect();
    errors.dedup();
    let log_excerpt = log_tail(if full_log.trim().is_empty() { &console } else { &full_log });

    if paper_compile_succeeded(output.status.success(), &built_pdf) {
        let synctex = build_dir.join(format!("{stem}.synctex.gz"));
        let published = fs::copy(&built_pdf, &pdf_path).and_then(|_| {
            if synctex.is_file() {
                fs::copy(&synctex, root.join(format!("{stem}.synctex.gz"))).map(|_| ())
            } else {
                Ok(())
            }
        });
        if let Err(e) = published {
            let error = format!("无法写入 {stem}.pdf（文件可能正被其他程序占用）: {e}");
            return PaperCompileResult { log_excerpt, ..PaperCompileResult::failed(error.clone(), vec![error]) };
        }
        let _ = fs::write(&fingerprint_path, &fingerprint);
        PaperCompileResult {
            ok: true,
            pdf_path: Some(pdf_path.to_string_lossy().to_string()),
            pdf_data_url: None,
            message: format!("{engine_name} 编译完成 → {stem}.pdf"),
            log_excerpt,
            errors,
        }
    } else {
        PaperCompileResult {
            log_excerpt,
            ..PaperCompileResult::failed(
                format!(
                    "{engine_name} 编译失败或未生成有效 PDF，请查看编译日志定位错误{}",
                    failure_hint(&format!("{console}\n{full_log}"))
                ),
                errors,
            )
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CleanArtifactsResult {
    pub removed: usize,
    pub message: String,
}

/// Deletes intermediate build files of the paper; sources and the PDF stay.
#[tauri::command]
pub async fn tex_clean_artifacts(
    project_dir: String,
    main_tex_file: Option<String>,
) -> Result<CleanArtifactsResult, String> {
    let root = paper_root(&project_dir)?;
    let (_, stem) = paper_entry(&root, main_tex_file.as_deref())?;
    let removed = clean_artifacts(&root, &stem);
    Ok(CleanArtifactsResult {
        removed,
        message: if removed == 0 {
            "没有需要清理的中间产物".into()
        } else {
            format!("已清理 {removed} 个中间产物（PDF 与源码保留）")
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_project(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "agentikz_{name}_{}_{}",
            std::process::id(),
            NEXT_BUILD_ID.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn preview_errors_include_the_relevant_tex_context() {
        let log = "package loaded\n! LaTeX Error: Can be used only in preamble.\nl.91 \\documentclass\nmore detail";
        assert_eq!(
            preview_log_excerpt(log),
            "! LaTeX Error: Can be used only in preamble.\nl.91 \\documentclass\nmore detail"
        );
        assert!(preview_log_excerpt("note: x\nerror: figure.tex:3: Undefined control sequence").starts_with("error:"));
        assert!(command_error(&std::io::Error::from(std::io::ErrorKind::TimedOut), 180).contains("超时"));
        assert!(failure_hint("error: failed to download ctex.sty").contains("联网"));
        assert!(failure_hint("! TeX capacity exceeded, sorry [main memory size=5000000].").contains("内存上限"));
        assert!(failure_hint("! Undefined control sequence.").is_empty());
    }

    #[test]
    fn missing_glyphs_are_not_a_successful_precision_preview() {
        assert!(missing_glyph_diagnostic("Output written on figure.pdf").is_none());
        let diagnostic = missing_glyph_diagnostic(
            "Missing character: There is no 中 (U+4E2D) in font lmroman!\n\
             Missing character: There is no γ (U+03B3) in font lmroman!\n",
        )
        .unwrap();
        assert!(diagnostic.contains("2 处") && diagnostic.contains("U+4E2D"));
        assert!(diagnostic.contains("U+03B3") && diagnostic.contains("agentikz-fonts"));
    }

    /// Minimal public fixture: real engine -> PDF -> outlined SVG.
    #[tokio::test]
    async fn bundled_engine_renders_complex_cjk_fixture_without_missing_glyphs() {
        if !engine::tests::use_staged_runtime() {
            eprintln!("skipped: the built-in TeX runtime is not staged");
            return;
        }
        let fixture = include_str!("../../../src/core/tex/__tests__/fixtures/complex-cjk-diagram.tex");
        // The frontend supplies this missing preamble package; the drawing stays verbatim.
        let source = fixture.replacen(
            "\\usepackage{tikz}",
            "\\usepackage{agentikz-fonts}\n\\usepackage{tikz}",
            1,
        );
        let root = temp_project("cjk_render");
        let preview = compile_preview_in(&root, &source, "xelatex", None).await;
        assert!(preview.ok, "{}", preview.message);
        let svg = preview.svg.unwrap();
        let log = fs::read_to_string(root.join("figure.log")).unwrap();
        assert!(missing_glyph_diagnostic(&log).is_none());
        assert!(svg.starts_with("<svg") && svg.matches("<path").count() > 20);
        assert!(!svg.contains("<text") && !svg.contains("font-family"));
        fs::remove_dir_all(root).unwrap();

        let incomplete = tex_compile_preview(
            "\\documentclass{standalone}\\begin{document}中文 γ\\end{document}".into(),
            None,
            None,
        )
        .await;
        assert!(!incomplete.ok && incomplete.svg.is_none());
        assert!(incomplete.message.contains("缺字"), "{}", incomplete.message);
    }

    #[test]
    fn failed_process_never_accepts_an_existing_pdf() {
        let root = temp_project("compile");
        let path = root.join("main.pdf");
        fs::write(&path, b"%PDF-old-output").unwrap();
        assert!(!paper_compile_succeeded(false, &path));
        assert!(paper_compile_succeeded(true, &path));
        fs::write(&path, b"").unwrap();
        assert!(!paper_compile_succeeded(true, &path));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cleaning_removes_build_files_but_keeps_sources_and_the_pdf() {
        let root = temp_project("clean");
        fs::create_dir_all(root.join(BUILD_DIR)).unwrap();
        for file in ["main.tex", "main.pdf", "main.aux", "main.synctex.gz", "other.aux", ".agentikz/build/main.log"] {
            fs::write(root.join(file), "x").unwrap();
        }
        assert_eq!(clean_artifacts(&root, "main"), 3);
        for kept in ["main.tex", "main.pdf", "other.aux"] {
            assert!(root.join(kept).is_file(), "{kept} must be kept");
        }
        assert!(!root.join("main.aux").exists() && !root.join(BUILD_DIR).exists());
        assert_eq!(clean_artifacts(&root, "main"), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fingerprint_tracks_sources_and_ignores_build_output() {
        let root = temp_project("fingerprint");
        fs::write(root.join("main.tex"), "a").unwrap();
        let before = source_fingerprint(&root, "main", "xelatex");
        fs::create_dir_all(root.join(BUILD_DIR)).unwrap();
        fs::write(root.join("main.pdf"), "pdf").unwrap();
        fs::write(root.join("main.synctex.gz"), "map").unwrap();
        fs::write(root.join(".agentikz/build/main.log"), "log").unwrap();
        assert_eq!(source_fingerprint(&root, "main", "xelatex"), before);
        fs::write(root.join("refs.bib"), "@book{}").unwrap();
        assert_ne!(source_fingerprint(&root, "main", "xelatex"), before);
        fs::remove_dir_all(root).unwrap();
    }

    /// Runs the real bundled engine, so it needs `npm run tex:stage` first.
    #[tokio::test]
    async fn bundled_engine_builds_figures_and_papers() {
        if !engine::tests::use_staged_runtime() {
            eprintln!("skipped: the built-in TeX runtime is not staged");
            return;
        }
        let figure = "\\documentclass[border=2pt]{standalone}\n\\usepackage{agentikz-fonts}\n\\usepackage{tikz,amsmath,amssymb}\n\\begin{document}\n\\begin{tikzpicture}\\node[draw] {中文 $x\\in\\mathbb{R}$};\\end{tikzpicture}\n\\end{document}\n";
        let preview = tex_compile_preview(figure.into(), Some("xelatex".into()), None).await;
        assert!(preview.ok, "{}", preview.message);
        let svg = preview.svg.unwrap();
        // Outlined glyphs: nothing in the SVG depends on an installed font.
        assert!(svg.starts_with("<svg") && svg.contains("viewBox") && svg.contains("<path"));
        assert!(!svg.contains("<text") && !svg.contains("font-family"));

        let broken = tex_compile_preview(figure.replace("\\node", "\\nodee"), None, None).await;
        assert!(!broken.ok && broken.message.contains("Undefined control sequence"), "{}", broken.message);
        assert!(!tex_compile_preview(figure.into(), Some("lualatex".into()), None).await.ok);

        let root = temp_project("paper");
        fs::create_dir_all(root.join("sections")).unwrap();
        fs::write(
            root.join("main.tex"),
            "\\documentclass{article}\n\\usepackage{agentikz-fonts}\n\\begin{document}\n\\section{Intro}\nFirst paragraph.\n\n\\input{sections/method}\n\\end{document}\n",
        )
        .unwrap();
        fs::write(root.join("sections/method.tex"), "\\section{方法}\n中文段落 with $x^2$.\n").unwrap();
        let dir = root.to_string_lossy().to_string();
        let build = |mode: &'static str| tex_compile_paper(dir.clone(), None, None, Some(mode.into()));

        let first = build("normal").await;
        assert!(first.ok, "{}\n{}", first.message, first.log_excerpt);
        let pdf = first.pdf_path.unwrap();
        assert!(root.join(".agentikz/build/main.log").is_file() && root.join("main.synctex.gz").is_file());
        // Build files stay out of the sources.
        assert!(!root.join("main.aux").exists() && !root.join("main.log").exists());

        let target = super::super::synctex::tex_synctex_forward(dir.clone(), pdf.clone(), "sections/method.tex".into(), 2, 1)
            .await
            .unwrap();
        assert!(target.page == 1 && target.x > 60.0 && target.y > 60.0, "{target:?}");
        let source = super::super::synctex::tex_synctex_backward(
            dir.clone(),
            pdf.clone(),
            target.page,
            target.x + 2.0,
            target.y + target.height / 2.0,
        )
        .await
        .unwrap();
        assert_eq!((source.relative_path.as_str(), source.line), ("sections/method.tex", 2));

        assert!(build("normal").await.message.contains("源码未变化"));
        assert!(build("force").await.message.contains("编译完成"));
        fs::write(root.join("sections/method.tex"), "\\section{方法}\n改动后的段落。\n").unwrap();
        assert!(build("normal").await.message.contains("编译完成"));

        let cleaned = tex_clean_artifacts(dir.clone(), None).await.unwrap();
        assert!(cleaned.removed >= 3, "{}", cleaned.message);
        assert!(root.join("main.pdf").is_file() && !root.join(".agentikz/build").exists());
        assert!(build("clean").await.ok);

        fs::write(root.join("main.tex"), "\\documentclass{article}\\begin{document}\\undefinedmacro\\end{document}").unwrap();
        let failed = build("normal").await;
        assert!(!failed.ok && failed.pdf_path.is_none());
        assert!(failed.errors.iter().any(|line| line.contains("Undefined control sequence")), "{:?}", failed.errors);
        fs::remove_dir_all(root).unwrap();

        // Imported repositories may keep the manuscript below latex/ while its
        // input files and figures are relative to that folder (or its parent).
        let nested = temp_project("nested_paper");
        fs::create_dir_all(nested.join("latex/sections")).unwrap();
        fs::write(nested.join("shared.tex"), "Shared parent resource.").unwrap();
        fs::write(nested.join("latex/sections/body.tex"), "Nested body.").unwrap();
        fs::write(nested.join("latex/paper.tex"), "\\documentclass{article}\n\\begin{document}\\input{sections/body}\\input{../shared}\\end{document}").unwrap();
        trial_compile(&nested, "latex/paper.tex").await.unwrap();
        let built = tex_compile_paper(nested.to_string_lossy().into(), Some("latex/paper.tex".into()), None, None).await;
        assert!(built.ok, "{}\n{}", built.message, built.log_excerpt);
        fs::remove_dir_all(nested).unwrap();
    }

    #[test]
    fn entry_file_must_stay_inside_the_project() {
        let root = temp_project("entry");
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("sub/paper.tex"), "x").unwrap();
        assert_eq!(paper_entry(&root, Some("sub/paper.tex")), Ok(("sub/paper.tex".into(), "paper".into())));
        assert!(paper_entry(&root, Some("../secret.tex")).is_err());
        assert!(paper_entry(&root, None).is_err());
        assert!(project_search_dirs(Some(root.to_str().unwrap())).contains(&root.join("sub")));
        fs::remove_dir_all(root).unwrap();
    }
}
