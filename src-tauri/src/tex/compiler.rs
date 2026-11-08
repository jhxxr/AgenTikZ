use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Output;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::process::Command;

static NEXT_BUILD_ID: AtomicU64 = AtomicU64::new(0);

pub(super) async fn run_bounded_command(cmd: &mut Command, seconds: u64) -> std::io::Result<Output> {
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

fn preview_command_error(command: &str, error: &std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::TimedOut {
        format!(
            "{} 编译超时（60 秒），请检查源码或减少图形复杂度。",
            command
        )
    } else if error.kind() == std::io::ErrorKind::NotFound {
        format!("未找到 {}。请在「设置 → 编辑器与 TeX」中配置 TeX Live bin 目录（需要 TeX 编译器和 dvisvgm）。", command)
    } else {
        format!("无法执行 {}：{}", command, error)
    }
}

#[derive(Debug, Serialize)]
pub struct TexCompileResult {
    pub ok: bool,
    pub svg: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexInstallationInfo {
    pub bin_dir: String,
    pub label: String,
    pub has_pdflatex: bool,
    pub has_xelatex: bool,
    pub has_dvisvgm: bool,
    pub has_bibtex: bool,
    pub version: Option<String>,
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

fn binary_exists_in_dir(dir: &Path, name: &str) -> Option<PathBuf> {
    let direct = dir.join(name);
    if direct.is_file() {
        return Some(direct);
    }
    #[cfg(target_os = "windows")]
    {
        let exe = dir.join(format!("{}.exe", name));
        if exe.is_file() {
            return Some(exe);
        }
        let bat = dir.join(format!("{}.bat", name));
        if bat.is_file() {
            return Some(bat);
        }
    }
    None
}

pub(super) fn build_tex_command(bin_name: &str, tex_live_bin_dir: Option<&str>) -> Command {
    let custom_dir = tex_live_bin_dir
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);

    let mut cmd = if let Some(ref dir) = custom_dir {
        if let Some(full_bin) = binary_exists_in_dir(dir, bin_name) {
            Command::new(full_bin)
        } else {
            Command::new(bin_name)
        }
    } else {
        Command::new(bin_name)
    };

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x0800_0000);
    }

    if let Some(dir) = custom_dir {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let existing_path = std::env::var("PATH").unwrap_or_default();
        cmd.env(
            "PATH",
            format!("{}{}{}", dir.to_string_lossy(), sep, existing_path),
        );
    }

    cmd
}

fn apply_project_texinputs(cmd: &mut Command, project_dir: Option<&str>) {
    if let Some(proj) = project_dir {
        let trimmed = proj.trim();
        if !trimmed.is_empty() {
            let sep = if cfg!(windows) { ";" } else { ":" };
            let existing = std::env::var("TEXINPUTS").unwrap_or_default();
            let normalized = trimmed.replace('\\', "/");
            let clean_dir = normalized.trim_end_matches('/');
            cmd.env("TEXINPUTS", format!("{}//{}{}", clean_dir, sep, existing));
        }
    }
}

/// Scans standard system locations and an optional custom directory for TeX Live / MiKTeX / MacTeX installations.
#[tauri::command]
pub async fn tex_scan_installations(custom_bin_dir: Option<String>) -> Vec<TexInstallationInfo> {
    let mut candidates: Vec<(PathBuf, String)> = Vec::new();

    if let Some(custom) = custom_bin_dir {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            candidates.push((PathBuf::from(trimmed), "用户自定义 TeX Live 目录".into()));
        }
    }

    for year in ["2026", "2025", "2024", "2023", "2022"] {
        for drive in ["C", "D", "E", "F"] {
            candidates.push((
                PathBuf::from(format!(r"{}:\texlive\{}\bin\windows", drive, year)),
                format!("TeX Live {} ({}:\\)", year, drive),
            ));
            candidates.push((
                PathBuf::from(format!(r"{}:\texlive\{}\bin\win32", drive, year)),
                format!("TeX Live {} win32 ({}:\\)", year, drive),
            ));
        }
        candidates.push((
            PathBuf::from(format!("/usr/local/texlive/{}/bin/x86_64-linux", year)),
            format!("TeX Live {} (Linux x86_64)", year),
        ));
        candidates.push((
            PathBuf::from(format!("/usr/local/texlive/{}/bin/aarch64-linux", year)),
            format!("TeX Live {} (Linux ARM64)", year),
        ));
        candidates.push((
            PathBuf::from(format!("/usr/local/texlive/{}/bin/universal-darwin", year)),
            format!("MacTeX / TeX Live {}", year),
        ));
    }

    candidates.push((
        PathBuf::from("/Library/TeX/texbin"),
        "MacTeX (/Library/TeX/texbin)".into(),
    ));
    candidates.push((PathBuf::from("/usr/bin"), "System TeX (/usr/bin)".into()));
    candidates.push((
        PathBuf::from("/usr/local/bin"),
        "Local TeX (/usr/local/bin)".into(),
    ));

    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for (dir, label) in candidates {
        if !dir.is_dir() {
            continue;
        }
        let clean = dir.to_string_lossy().to_string();
        if !seen.insert(clean.to_lowercase()) {
            continue;
        }

        let has_pdflatex = binary_exists_in_dir(&dir, "pdflatex").is_some();
        let has_xelatex = binary_exists_in_dir(&dir, "xelatex").is_some();
        let has_dvisvgm = binary_exists_in_dir(&dir, "dvisvgm").is_some();
        let has_bibtex = binary_exists_in_dir(&dir, "bibtex").is_some();

        if !has_pdflatex && !has_xelatex && !has_dvisvgm {
            continue;
        }

        results.push(TexInstallationInfo {
            bin_dir: clean,
            label,
            has_pdflatex,
            has_xelatex,
            has_dvisvgm,
            has_bibtex,
            version: None,
        });
    }

    results
}

/// Compiles standalone TikZ/PGFPlots code using local TeX Live (`latex`/`pdflatex`/`xelatex` + `dvisvgm`)
/// when available on the user's machine, supporting custom `tex_live_bin_dir`.
#[tauri::command]
pub async fn tex_compile_preview(
    tex_source: String,
    tex_engine: Option<String>,
    project_dir: Option<String>,
    tex_live_bin_dir: Option<String>,
) -> TexCompileResult {
    let has_cjk = tex_source
        .chars()
        .any(|c| ('\u{4E00}'..='\u{9FFF}').contains(&c));
    let engine = match tex_engine.as_deref() {
        Some("pdflatex") => "pdflatex",
        Some("xelatex") => "xelatex",
        _ if has_cjk => "xelatex",
        _ => "latex",
    };

    let build_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let temp_dir = std::env::temp_dir().join(format!(
        "agentikz_build_{}_{}_{}",
        std::process::id(),
        build_id,
        NEXT_BUILD_ID.fetch_add(1, Ordering::Relaxed)
    ));

    if let Err(e) = fs::create_dir_all(&temp_dir) {
        return TexCompileResult {
            ok: false,
            svg: None,
            message: format!("无法创建临时编译目录: {}", e),
        };
    }

    let tex_path = temp_dir.join("figure.tex");
    let intermediate_file = match engine {
        "pdflatex" => "figure.pdf",
        "xelatex" => "figure.xdv",
        _ => "figure.dvi",
    };
    let intermediate_path = temp_dir.join(intermediate_file);
    let svg_path = temp_dir.join("figure.svg");

    if let Err(e) = fs::write(&tex_path, tex_source.as_bytes()) {
        let _ = fs::remove_dir_all(&temp_dir);
        return TexCompileResult {
            ok: false,
            svg: None,
            message: format!("写入临时 .tex 文件失败: {}", e),
        };
    }

    let mut latex_cmd = build_tex_command(engine, tex_live_bin_dir.as_deref());
    if engine == "xelatex" {
        latex_cmd.arg("-no-pdf");
    }
    apply_project_texinputs(&mut latex_cmd, project_dir.as_deref());
    latex_cmd
        .args([
            "-interaction=nonstopmode",
            "-file-line-error",
            "-halt-on-error",
            "-no-shell-escape",
            "figure.tex",
        ])
        .current_dir(&temp_dir);

    let latex_out = run_bounded_command(&mut latex_cmd, 60).await;

    let result = match latex_out {
        Ok(output) => {
            if output.status.success() && intermediate_path.exists() {
                let mut dvisvgm_cmd = build_tex_command("dvisvgm", tex_live_bin_dir.as_deref());
                if engine == "pdflatex" {
                    dvisvgm_cmd.arg("--pdf");
                }
                dvisvgm_cmd
                    .args([
                        "--no-fonts",
                        "--bbox=min",
                        intermediate_file,
                        "-o",
                        "figure.svg",
                    ])
                    .current_dir(&temp_dir);
                let dvisvgm_out = run_bounded_command(&mut dvisvgm_cmd, 60).await;

                match dvisvgm_out {
                    Ok(svg_res) => {
                        if svg_res.status.success() && svg_path.exists() {
                            if let Ok(svg_content) = fs::read_to_string(&svg_path) {
                                TexCompileResult {
                                    ok: true,
                                    svg: Some(svg_content),
                                    message: format!(
                                        "本地 TeX Live ({} + dvisvgm) 编译成功",
                                        engine
                                    ),
                                }
                            } else {
                                TexCompileResult {
                                    ok: false,
                                    svg: None,
                                    message: "dvisvgm 输出的 SVG 文件无法读取".into(),
                                }
                            }
                        } else {
                            TexCompileResult {
                                ok: false,
                                svg: None,
                                message: format!(
                                    "dvisvgm 转换失败：\n{}",
                                    preview_log_excerpt(&format!(
                                        "{}\n{}",
                                        String::from_utf8_lossy(&svg_res.stdout),
                                        String::from_utf8_lossy(&svg_res.stderr)
                                    ))
                                ),
                            }
                        }
                    }
                    Err(error) => TexCompileResult {
                        ok: false,
                        svg: None,
                        message: preview_command_error("dvisvgm", &error),
                    },
                }
            } else {
                TexCompileResult {
                    ok: false,
                    svg: None,
                    message: format!(
                        "{} 编译失败：\n{}",
                        engine,
                        preview_log_excerpt(
                            &fs::read_to_string(temp_dir.join("figure.log")).unwrap_or_else(
                                |_| format!(
                                    "{}\n{}",
                                    String::from_utf8_lossy(&output.stdout),
                                    String::from_utf8_lossy(&output.stderr)
                                )
                            )
                        )
                    ),
                }
            }
        }
        Err(error) => TexCompileResult {
            ok: false,
            svg: None,
            message: preview_command_error(engine, &error),
        },
    };

    let _ = fs::remove_dir_all(&temp_dir);
    result
}

/// Compiles the full academic paper (`main.tex` or specified `.tex` entry) inside `project_dir`
/// using the user's configured `tex_live_bin_dir` and returns the PDF preview data URL and log diagnostics.
#[tauri::command]
pub async fn tex_compile_paper(
    project_dir: String,
    main_tex_file: Option<String>,
    tex_engine: Option<String>,
    tex_live_bin_dir: Option<String>,
) -> PaperCompileResult {
    let root = PathBuf::from(project_dir.trim());
    if !root.is_dir() {
        return PaperCompileResult {
            ok: false,
            pdf_path: None,
            pdf_data_url: None,
            message: "请先绑定或新建本地论文项目文件夹后再执行 TeX Live 整篇论文编译".into(),
            log_excerpt: String::new(),
            errors: vec!["项目目录不存在".into()],
        };
    }

    let entry_rel = main_tex_file
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("main.tex");
    let entry_path = root.join(entry_rel);
    if !entry_path.is_file() {
        return PaperCompileResult {
            ok: false,
            pdf_path: None,
            pdf_data_url: None,
            message: format!("未找到论文入口文件: {}", entry_rel),
            log_excerpt: String::new(),
            errors: vec![format!("文件不存在: {}", entry_rel)],
        };
    }

    let source_str = fs::read_to_string(&entry_path).unwrap_or_default();
    let has_cjk = source_str
        .chars()
        .any(|c| ('\u{4E00}'..='\u{9FFF}').contains(&c));
    let engine = match tex_engine.as_deref() {
        Some("xelatex") => "xelatex",
        Some("pdflatex") => "pdflatex",
        _ if has_cjk => "xelatex",
        _ => "pdflatex",
    };

    let stem = Path::new(entry_rel)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("main");

    let run_pass = || async {
        let mut cmd = build_tex_command(engine, tex_live_bin_dir.as_deref());
        apply_project_texinputs(&mut cmd, Some(project_dir.as_str()));
        cmd.args([
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-synctex=1",
            entry_rel,
        ])
            .current_dir(&root);
        run_bounded_command(&mut cmd, 120).await
    };

    let first_pass = match run_pass().await {
        Ok(out) => out,
        Err(e) => {
            return PaperCompileResult {
                ok: false,
                pdf_path: None,
                pdf_data_url: None,
                message: format!(
                    "无法启动 {} 编译器 ({})。请在「设置 → TeX Live 环境」中配置您的 TeX Live bin 路径。",
                    engine, e
                ),
                log_excerpt: String::new(),
                errors: vec![format!("启动 {} 失败: {}", engine, e)],
            };
        }
    };

    let mut final_out = first_pass;
    let mut execution_errors = Vec::new();
    // Do not repeat a failed first pass or use an old PDF as evidence of success.
    // Optional BibTeX pass if references.bib exists and .aux has \citation.
    let aux_path = root.join(format!("{}.aux", stem));
    if final_out.status.success() && aux_path.is_file() {
        let aux_content = fs::read_to_string(&aux_path).unwrap_or_default();
        if aux_content.contains("\\citation") && root.join("references.bib").is_file() {
            let mut bib_cmd = build_tex_command("bibtex", tex_live_bin_dir.as_deref());
            bib_cmd.arg(stem).current_dir(&root);
            match run_bounded_command(&mut bib_cmd, 60).await {
                Ok(out) if out.status.success() => match run_pass().await {
                    Ok(out) => final_out = out,
                    Err(err) => execution_errors.push(format!("TeX pass failed: {}", err)),
                },
                Ok(out) => execution_errors.push(format!(
                    "BibTeX failed: {}",
                    String::from_utf8_lossy(&out.stdout)
                )),
                Err(err) => execution_errors.push(format!("BibTeX failed: {}", err)),
            }
        }
    }

    // Second pass to resolve cross-references (\ref{fig:overview}, \cite{...})
    if final_out.status.success() && execution_errors.is_empty() {
        match run_pass().await {
            Ok(out) => final_out = out,
            Err(err) => execution_errors.push(format!("TeX pass failed: {}", err)),
        }
    }
    let stdout_str = String::from_utf8_lossy(&final_out.stdout).to_string();

    let log_path = root.join(format!("{}.log", stem));
    let full_log = fs::read_to_string(&log_path).unwrap_or(stdout_str);

    let process_ok = final_out.status.success() && execution_errors.is_empty();
    let mut errors = execution_errors;
    for line in full_log.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("! ") || trimmed.starts_with("l.") {
            errors.push(trimmed.to_string());
        }
    }

    let log_lines: Vec<&str> = full_log.lines().collect();
    let tail_start = log_lines.len().saturating_sub(45);
    let log_excerpt = log_lines[tail_start..].join("\n");

    let pdf_path = root.join(format!("{}.pdf", stem));
    if paper_compile_succeeded(process_ok, &pdf_path) {
        PaperCompileResult {
            ok: true,
            pdf_path: Some(pdf_path.to_string_lossy().to_string()),
            pdf_data_url: None,
            message: format!("{} 编译完成 → {}.pdf", engine, stem),
            log_excerpt,
            errors,
        }
    } else {
        PaperCompileResult {
            ok: false,
            pdf_path: None,
            pdf_data_url: None,
            message: format!(
                "{} 编译失败或未生成有效 PDF，请查看编译日志定位错误",
                engine
            ),
            log_excerpt,
            errors,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_errors_include_the_relevant_tex_context() {
        let log = "package loaded\n! LaTeX Error: Can be used only in preamble.\nl.91 \\documentclass\nmore detail";
        assert_eq!(
            preview_log_excerpt(log),
            "! LaTeX Error: Can be used only in preamble.\nl.91 \\documentclass\nmore detail"
        );
        assert!(preview_command_error(
            "latex",
            &std::io::Error::from(std::io::ErrorKind::NotFound)
        )
        .contains("未找到"));
        assert!(preview_command_error(
            "latex",
            &std::io::Error::from(std::io::ErrorKind::TimedOut)
        )
        .contains("超时"));
    }

    #[test]
    fn failed_process_never_accepts_an_existing_pdf() {
        let path = std::env::temp_dir().join(format!(
            "agentikz_compile_test_{}_{}.pdf",
            std::process::id(),
            NEXT_BUILD_ID.fetch_add(1, Ordering::Relaxed)
        ));
        fs::write(&path, b"%PDF-old-output").unwrap();
        assert!(!paper_compile_succeeded(false, &path));
        assert!(paper_compile_succeeded(true, &path));
        fs::write(&path, b"").unwrap();
        assert!(!paper_compile_succeeded(true, &path));
        fs::remove_file(&path).unwrap();
        assert!(!paper_compile_succeeded(true, &path));
    }
}
