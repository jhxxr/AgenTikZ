//! Project-scoped PDF reads and real SyncTeX CLI queries.
//! Commands use separate arguments (never a shell command or `-x` editor action).
use super::compiler::{build_tex_command, run_bounded_command};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PdfLocation {
    pub page: u32,
    /// PDF points, from the unrotated page's top-left corner.
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceLocation {
    pub relative_path: String,
    pub line: u32,
    pub column: u32,
}

fn project_file(project_dir: &str, file: &str) -> Result<(PathBuf, PathBuf), String> {
    let root =
        fs::canonicalize(project_dir.trim()).map_err(|e| format!("无法读取论文目录: {e}"))?;
    let input = Path::new(file);
    let path = fs::canonicalize(if input.is_absolute() {
        input.to_path_buf()
    } else {
        root.join(input)
    })
    .map_err(|e| format!("无法读取项目文件: {e}"))?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err("定位目标不在当前论文项目内".into());
    }
    Ok((root, path))
}

fn paper_pdf(
    project_dir: &str,
    pdf_path: &str,
    needs_sync: bool,
) -> Result<(PathBuf, PathBuf), String> {
    let (root, path) = project_file(project_dir, pdf_path)?;
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
    {
        return Err("仅支持当前项目的 PDF 文件".into());
    }
    if needs_sync
        && !path.with_extension("synctex.gz").is_file()
        && !path.with_extension("synctex").is_file()
    {
        return Err("没有 SyncTeX 映射，请重新编译论文（已启用 -synctex=1）".into());
    }
    Ok((root, path))
}

#[tauri::command]
pub async fn tex_read_paper_pdf(
    project_dir: String,
    pdf_path: String,
) -> Result<tauri::ipc::Response, String> {
    let (_, path) = paper_pdf(&project_dir, &pdf_path, false)?;
    let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > 64 * 1024 * 1024 {
        return Err("PDF 超过 64 MB，无法载入内嵌预览".into());
    }
    fs::read(path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| format!("读取 PDF 失败: {e}"))
}

fn records(output: &str) -> Vec<HashMap<&str, &str>> {
    let mut result = Vec::new();
    let mut current = HashMap::new();
    for line in output.lines() {
        let Some((key, value)) = line.trim().split_once(':') else {
            continue;
        };
        let key = key.trim();
        if ![
            "Page", "x", "y", "h", "v", "W", "H", "Input", "Line", "Column",
        ]
        .contains(&key)
        {
            continue;
        }
        if (key == "Page" || key == "Input") && current.contains_key(key) {
            result.push(std::mem::take(&mut current));
        }
        current.insert(key, value.trim());
    }
    if !current.is_empty() {
        result.push(current);
    }
    result
}

fn parse_forward(output: &str) -> Option<PdfLocation> {
    records(output).iter().find_map(|record| {
        let number = |key: &str| {
            record
                .get(key)?
                .parse::<f64>()
                .ok()
                .filter(|v| v.is_finite())
        };
        let page = record.get("Page")?.parse::<u32>().ok().filter(|p| *p > 0)?;
        let width = number("W").unwrap_or(6.0).max(2.0);
        let height = number("H").unwrap_or(10.0).max(2.0);
        // `v` is the enclosing box's bottom/baseline, not its top edge.
        let x = number("h").or_else(|| number("x"))?.max(0.0);
        let y = number("v")
            .map(|v| v - height)
            .or_else(|| number("y"))?
            .max(0.0);
        Some(PdfLocation {
            page,
            x,
            y,
            width,
            height,
        })
    })
}

fn parse_backward(output: &str) -> Option<(String, u32, u32)> {
    records(output).iter().find_map(|record| {
        let path = record.get("Input")?.to_string();
        let line = record.get("Line")?.parse::<u32>().ok().filter(|n| *n > 0)?;
        // Some engines report -1 when a column is unavailable.
        let column = record
            .get("Column")
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(1)
            .clamp(1, u32::MAX as i64) as u32;
        Some((path, line, column))
    })
}

async fn query(root: &Path, bin_dir: Option<&str>, args: &[String]) -> Result<String, String> {
    let mut cmd = build_tex_command("synctex", bin_dir);
    cmd.args(args).current_dir(root);
    let out = run_bounded_command(&mut cmd, 15).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "找不到 synctex，请在 TeX 设置中选择包含 synctex 的 TeX Live / MiKTeX bin 目录".into()
        } else {
            format!("SyncTeX 定位失败: {e}")
        }
    })?;
    if !out.status.success() {
        return Err(format!(
            "SyncTeX 定位失败，请重新编译论文。{}",
            String::from_utf8_lossy(&out.stderr)
                .chars()
                .take(400)
                .collect::<String>()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[tauri::command]
pub async fn tex_synctex_forward(
    project_dir: String,
    pdf_path: String,
    source_file: String,
    line: u32,
    column: u32,
    tex_live_bin_dir: Option<String>,
) -> Result<PdfLocation, String> {
    if line == 0 || column == 0 {
        return Err("源码行列必须大于 0".into());
    }
    let (root, pdf) = paper_pdf(&project_dir, &pdf_path, true)?;
    let (_, source) = project_file(&project_dir, &source_file)?;
    // Canonical Windows paths may contain the \\?\ prefix, which SyncTeX does
    // not match against its input records. A relative source avoids that prefix
    // and drive-letter colons in the line:column:file argument.
    let source = source
        .strip_prefix(&root)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let output = query(
        &root,
        tex_live_bin_dir.as_deref(),
        &[
            "view".into(),
            "-i".into(),
            format!("{line}:{column}:{source}"),
            "-o".into(),
            display_path(&pdf),
        ],
    )
    .await?;
    parse_forward(&output)
        .ok_or_else(|| "当前源码行没有 PDF 对应位置，请选择正文或重新编译论文".into())
}

#[tauri::command]
pub async fn tex_synctex_backward(
    project_dir: String,
    pdf_path: String,
    page: u32,
    x: f64,
    y: f64,
    tex_live_bin_dir: Option<String>,
) -> Result<SourceLocation, String> {
    if page == 0 || !x.is_finite() || !y.is_finite() || x < 0.0 || y < 0.0 {
        return Err("无效的 PDF 页码或坐标".into());
    }
    let (root, pdf) = paper_pdf(&project_dir, &pdf_path, true)?;
    let output = query(
        &root,
        tex_live_bin_dir.as_deref(),
        &[
            "edit".into(),
            "-o".into(),
            format!("{page}:{x}:{y}:{}", display_path(&pdf)),
        ],
    )
    .await?;
    let (source, line, column) = parse_backward(&output)
        .ok_or_else(|| "此 PDF 位置没有源码映射，请选择正文区域".to_string())?;
    let (_, source) = project_file(&project_dir, &source)?;
    let relative = source.strip_prefix(&root).map_err(|e| e.to_string())?;
    Ok(SourceLocation {
        relative_path: relative.to_string_lossy().replace('\\', "/"),
        line,
        column,
    })
}

fn display_path(path: &Path) -> String {
    // TeX utilities use ordinary Windows paths, not NT extended-length prefixes.
    let path = path.to_string_lossy();
    if let Some(unc) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        path.strip_prefix(r"\\?\").unwrap_or(&path).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_pdf_boxes_in_points_and_converts_the_baseline_to_top_left() {
        let out = "SyncTeX result begin\nPage:2\nx:120\ny:300\nh:100\nv:310\nW:250\nH:12\nSyncTeX result end";
        assert_eq!(
            parse_forward(out),
            Some(PdfLocation {
                page: 2,
                x: 100.0,
                y: 298.0,
                width: 250.0,
                height: 12.0
            })
        );
        assert!(parse_forward("Page:0\nx:NaN\ny:2").is_none());
        assert!(parse_forward("Page:1\nx:NaN\ny:2").is_none());
    }

    #[test]
    fn handles_windows_paths_spaces_and_missing_columns() {
        assert_eq!(
            parse_backward("Input:C:/My Paper/sections/method.tex\nLine:42\nColumn:-1"),
            Some(("C:/My Paper/sections/method.tex".into(), 42, 1))
        );
        assert!(parse_backward("Input:main.tex\nLine:0").is_none());
        assert_eq!(
            display_path(Path::new(r"\\?\C:\My Paper\main.pdf")),
            r"C:\My Paper\main.pdf"
        );
    }

    #[test]
    fn skips_invalid_matches_instead_of_returning_bad_coordinates() {
        let out = "Page:0\nx:4\ny:5\nPage:3\nx:10\ny:20\n";
        assert_eq!(parse_forward(out).unwrap().page, 3);
    }

    #[test]
    fn rejects_files_outside_the_project_and_requires_a_sync_map() {
        let root = std::env::temp_dir().join(format!("agentikz_synctex_{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let pdf = root.join("main.pdf");
        fs::write(&pdf, b"%PDF-test").unwrap();
        assert!(paper_pdf(root.to_str().unwrap(), "main.pdf", false).is_ok());
        assert!(paper_pdf(root.to_str().unwrap(), "main.pdf", true).is_err());
        let outside = root
            .parent()
            .unwrap()
            .join(format!("agentikz_outside_{}.tex", std::process::id()));
        fs::write(&outside, "private").unwrap();
        assert!(project_file(root.to_str().unwrap(), outside.to_str().unwrap()).is_err());
        fs::remove_file(outside).unwrap();
        fs::remove_file(pdf).unwrap();
        fs::remove_dir(root).unwrap();
    }
}
