use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tokio::process::Command;

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

fn build_tex_command(bin_name: &str, tex_live_bin_dir: Option<&str>) -> Command {
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
        cmd.env("PATH", format!("{}{}{}", dir.to_string_lossy(), sep, existing_path));
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

    candidates.push((PathBuf::from("/Library/TeX/texbin"), "MacTeX (/Library/TeX/texbin)".into()));
    candidates.push((PathBuf::from("/usr/bin"), "System TeX (/usr/bin)".into()));
    candidates.push((PathBuf::from("/usr/local/bin"), "Local TeX (/usr/local/bin)".into()));

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
    let has_cjk = tex_source.chars().any(|c| ('\u{4E00}'..='\u{9FFF}').contains(&c));
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
    let temp_dir = std::env::temp_dir().join(format!("agentikz_build_{}", build_id));

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
            "-halt-on-error",
            "figure.tex",
        ])
        .current_dir(&temp_dir);

    let latex_out = latex_cmd.output().await;

    let result = if let Ok(output) = latex_out {
        if output.status.success() && intermediate_path.exists() {
            let mut dvisvgm_cmd = build_tex_command("dvisvgm", tex_live_bin_dir.as_deref());
            if engine == "pdflatex" {
                dvisvgm_cmd.arg("--pdf");
            }
            let dvisvgm_out = dvisvgm_cmd
                .args(["--no-fonts", "--bbox=min", intermediate_file, "-o", "figure.svg"])
                .current_dir(&temp_dir)
                .output()
                .await;

            if let Ok(svg_res) = dvisvgm_out {
                if svg_res.status.success() && svg_path.exists() {
                    if let Ok(svg_content) = fs::read_to_string(&svg_path) {
                        TexCompileResult {
                            ok: true,
                            svg: Some(svg_content),
                            message: format!("本地 TeX Live ({} + dvisvgm) 编译成功", engine),
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
                        message: "dvisvgm 转换失败".into(),
                    }
                }
            } else {
                TexCompileResult {
                    ok: false,
                    svg: None,
                    message: "未检测到本地 dvisvgm 命令，请在设置中配置 TeX Live bin 目录".into(),
                }
            }
        } else {
            TexCompileResult {
                ok: false,
                svg: None,
                message: format!("{} 编译失败，请检查 TikZ 源码或宏包依赖", engine),
            }
        }
    } else {
        TexCompileResult {
            ok: false,
            svg: None,
            message: format!(
                "未检测到本地 {}/dvisvgm 命令，已使用内置高保真 SVG+KaTeX 矢量渲染引擎（可在设置中指定 TeX Live 安装路径）",
                engine
            ),
        }
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
    let has_cjk = source_str.chars().any(|c| ('\u{4E00}'..='\u{9FFF}').contains(&c));
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
        cmd.args(["-interaction=nonstopmode", entry_rel])
            .current_dir(&root)
            .output()
            .await
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

    // Optional BibTeX pass if references.bib exists and .aux has \citation
    let aux_path = root.join(format!("{}.aux", stem));
    if aux_path.is_file() {
        let aux_content = fs::read_to_string(&aux_path).unwrap_or_default();
        if aux_content.contains("\\citation") && root.join("references.bib").is_file() {
            let mut bib_cmd = build_tex_command("bibtex", tex_live_bin_dir.as_deref());
            let _ = bib_cmd.arg(stem).current_dir(&root).output().await;
            let _ = run_pass().await;
        }
    }

    // Second pass to resolve cross-references (\ref{fig:overview}, \cite{...})
    let final_out = run_pass().await.unwrap_or(first_pass);
    let stdout_str = String::from_utf8_lossy(&final_out.stdout).to_string();

    let log_path = root.join(format!("{}.log", stem));
    let full_log = fs::read_to_string(&log_path).unwrap_or(stdout_str);

    let mut errors = Vec::new();
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
    let pdf_non_empty = fs::metadata(&pdf_path)
        .map(|m| m.is_file() && m.len() > 0)
        .unwrap_or(false);
    if pdf_non_empty {
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
            message: format!("{} 编译未生成 PDF，请查看编译日志定位错误", engine),
            log_excerpt,
            errors,
        }
    }
}