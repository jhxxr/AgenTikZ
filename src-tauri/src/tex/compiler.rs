use serde::Serialize;
use std::fs;
use tokio::process::Command;

#[derive(Debug, Serialize)]
pub struct TexCompileResult {
    pub ok: bool,
    pub svg: Option<String>,
    pub message: String,
}

/// Compiles standalone TikZ/PGFPlots code using local TeX Live (`latex` + `dvisvgm`)
/// when available on the user's machine.
///
/// Each compilation uses a unique temp subdirectory (based on timestamp) to avoid
/// race conditions when multiple compilations run concurrently.
/// Uses `tokio::process::Command` to avoid blocking the async runtime.
#[tauri::command]
pub async fn tex_compile_preview(tex_source: String) -> TexCompileResult {
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
    let dvi_path = temp_dir.join("figure.dvi");
    let svg_path = temp_dir.join("figure.svg");

    if let Err(e) = fs::write(&tex_path, tex_source.as_bytes()) {
        let _ = fs::remove_dir_all(&temp_dir);
        return TexCompileResult {
            ok: false,
            svg: None,
            message: format!("写入临时 .tex 文件失败: {}", e),
        };
    }

    // Use async tokio::process::Command to avoid blocking the Tokio runtime
    let latex_out = Command::new("latex")
        .args([
            "-interaction=nonstopmode",
            "-halt-on-error",
            "figure.tex",
        ])
        .current_dir(&temp_dir)
        .output()
        .await;

    let result = if let Ok(output) = latex_out {
        if output.status.success() && dvi_path.exists() {
            let dvisvgm_out = Command::new("dvisvgm")
                .args(["--no-fonts", "figure.dvi", "-o", "figure.svg"])
                .current_dir(&temp_dir)
                .output()
                .await;

            if let Ok(svg_res) = dvisvgm_out {
                if svg_res.status.success() && svg_path.exists() {
                    if let Ok(svg_content) = fs::read_to_string(&svg_path) {
                        TexCompileResult {
                            ok: true,
                            svg: Some(svg_content),
                            message: "本地 TeX Live (latex + dvisvgm) 编译成功".into(),
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
                message: "latex 编译失败，请检查 TikZ 源码".into(),
            }
        }
    } else {
        TexCompileResult {
            ok: false,
            svg: None,
            message: "未检测到本地 latex/dvisvgm 命令，已使用内置高保真 SVG+KaTeX 矢量渲染引擎".into(),
        }
    };

    // Clean up temp directory
    let _ = fs::remove_dir_all(&temp_dir);
    result
}