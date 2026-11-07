use serde::Serialize;
use std::fs;
use tokio::process::Command;

#[derive(Debug, Serialize)]
pub struct TexCompileResult {
    pub ok: bool,
    pub svg: Option<String>,
    pub message: String,
}

/// Compiles standalone TikZ/PGFPlots code using local TeX Live (`latex`/`pdflatex`/`xelatex` + `dvisvgm`)
/// when available on the user's machine.
///
/// Each compilation uses a unique temp subdirectory (based on timestamp) to avoid
/// race conditions when multiple compilations run concurrently.
/// Uses `tokio::process::Command` to avoid blocking the async runtime.
#[tauri::command]
pub async fn tex_compile_preview(
    tex_source: String,
    tex_engine: Option<String>,
    project_dir: Option<String>,
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

    let mut latex_cmd = Command::new(engine);
    #[cfg(target_os = "windows")]
    {
        latex_cmd.creation_flags(0x0800_0000);
    }
    if engine == "xelatex" {
        latex_cmd.arg("-no-pdf");
    }
    if let Some(ref proj) = project_dir {
        let trimmed = proj.trim();
        if !trimmed.is_empty() {
            let sep = if cfg!(windows) { ";" } else { ":" };
            let existing = std::env::var("TEXINPUTS").unwrap_or_default();
            let normalized = trimmed.replace('\\', "/");
            let clean_dir = normalized.trim_end_matches('/');
            latex_cmd.env("TEXINPUTS", format!("{}//{}{}", clean_dir, sep, existing));
        }
    }
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
            let mut dvisvgm_cmd = Command::new("dvisvgm");
            #[cfg(target_os = "windows")]
            {
                dvisvgm_cmd.creation_flags(0x0800_0000);
            }
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
                    message: "未检测到本地 dvisvgm 命令".into(),
                }
            }
        } else {
            TexCompileResult {
                ok: false,
                svg: None,
                message: format!("{} 编译失败，请检查 TikZ 源码", engine),
            }
        }
    } else {
        TexCompileResult {
            ok: false,
            svg: None,
            message: format!(
                "未检测到本地 {}/dvisvgm 命令，已使用内置高保真 SVG+KaTeX 矢量渲染引擎",
                engine
            ),
        }
    };

    // Clean up temp directory
    let _ = fs::remove_dir_all(&temp_dir);
    result
}