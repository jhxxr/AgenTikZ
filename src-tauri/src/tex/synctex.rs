//! Project-scoped PDF reads and SyncTeX lookups.
//! The `.synctex.gz` map written by the bundled engine is parsed here directly;
//! no external `synctex` tool is involved.
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
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
        return Err("没有 SyncTeX 映射，请重新编译论文".into());
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    VBox,
    HBox,
    Leaf,
}

#[derive(Debug, Clone)]
struct Node {
    kind: Kind,
    tag: u32,
    line: u32,
    page: u32,
    /// PDF points from the unrotated page's top-left corner; `y` is the baseline.
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    depth: f64,
    parent: Option<usize>,
}

#[derive(Debug, Default)]
struct SyncMap {
    inputs: HashMap<u32, String>,
    nodes: Vec<Node>,
}

/// TeX scaled points per PDF point (72 per inch).
const SP_PER_BP: f64 = 65781.76;

impl SyncMap {
    /// Records look like `(tag,line:h,v:W,H,D`; boxes nest, leaves do not.
    fn parse(text: &str) -> Self {
        let mut map = SyncMap::default();
        let (mut unit, mut magnification, mut x_offset, mut y_offset) = (1.0f64, 1000.0f64, 0.0, 0.0);
        let mut origin = 0.0;
        let mut in_content = false;
        let mut page = 0u32;
        let mut open: Vec<usize> = Vec::new();
        let number = |value: &str| value.trim().parse::<f64>().ok().filter(|v| v.is_finite());
        for line in text.lines() {
            if let Some(rest) = line.strip_prefix("Input:") {
                if let Some((tag, name)) = rest.split_once(':') {
                    if let Ok(tag) = tag.trim().parse() {
                        map.inputs.insert(tag, name.trim().to_string());
                    }
                }
                continue;
            }
            if !in_content {
                if let Some(v) = line.strip_prefix("Unit:").and_then(number) {
                    unit = v;
                } else if let Some(v) = line.strip_prefix("Magnification:").and_then(number) {
                    magnification = v;
                } else if let Some(v) = line.strip_prefix("X Offset:").and_then(number) {
                    x_offset = v;
                } else if let Some(v) = line.strip_prefix("Y Offset:").and_then(number) {
                    y_offset = v;
                } else if let Some(format) = line.strip_prefix("Output:") {
                    // DVI-family output is recorded relative to TeX's one-inch origin.
                    origin = if format.trim() == "pdf" { 0.0 } else { 72.0 };
                } else if line.starts_with("Content:") {
                    in_content = true;
                }
                continue;
            }
            let mut chars = line.chars();
            let Some(kind) = chars.next() else { continue };
            let rest = chars.as_str();
            match kind {
                '{' => {
                    page = rest.trim().parse().unwrap_or(0);
                    open.clear();
                }
                '}' => page = 0,
                ']' | ')' => {
                    open.pop();
                }
                '[' | '(' | 'h' | 'v' | 'x' | 'k' | 'g' | '$' if page > 0 => {
                    let mut fields = rest.split(':');
                    let mut link = fields.next().unwrap_or("").split(',');
                    let (Some(tag), Some(source_line)) = (
                        link.next().and_then(|v| v.trim().parse::<u32>().ok()),
                        link.next().and_then(|v| v.trim().parse::<u32>().ok()),
                    ) else {
                        continue;
                    };
                    let mut point = fields.next().unwrap_or("").split(',').map(number);
                    let (Some(Some(h)), Some(Some(v))) = (point.next(), point.next()) else {
                        continue;
                    };
                    let mut size = fields.next().unwrap_or("").split(',').map(number);
                    let mut dimension = || size.next().flatten().unwrap_or(0.0);
                    let (width, height, depth) = (dimension(), dimension(), dimension());
                    let scale = unit * magnification / 1000.0 / SP_PER_BP;
                    let is_box = matches!(kind, '[' | '(');
                    map.nodes.push(Node {
                        kind: match kind {
                            '[' => Kind::VBox,
                            '(' => Kind::HBox,
                            _ => Kind::Leaf,
                        },
                        tag,
                        line: source_line,
                        page,
                        x: (h + x_offset) * scale + origin,
                        y: (v + y_offset) * scale + origin,
                        width: (width * scale).abs(),
                        height: (height * scale).abs(),
                        depth: (depth * scale).abs(),
                        parent: open.last().copied(),
                    });
                    if is_box {
                        open.push(map.nodes.len() - 1);
                    }
                }
                _ => {}
            }
        }
        map
    }

    /// The line box around `index`, as a top-left rectangle.
    fn location(&self, index: usize) -> PdfLocation {
        let mut current = index;
        while self.nodes[current].kind != Kind::HBox {
            match self.nodes[current].parent {
                Some(parent) => current = parent,
                None => break,
            }
        }
        // A page-level vertical box is not a useful highlight for a leaf.
        let node = if self.nodes[current].kind == Kind::HBox {
            &self.nodes[current]
        } else {
            &self.nodes[index]
        };
        PdfLocation {
            page: node.page,
            x: node.x.max(0.0),
            y: (node.y - node.height).max(0.0),
            width: node.width.max(6.0),
            height: (node.height + node.depth).max(10.0),
        }
    }

    /// Source line to PDF: the requested line, else the next typeset line, else the previous one.
    fn forward(&self, tags: &[u32], line: u32) -> Option<PdfLocation> {
        self.nodes
            .iter()
            .enumerate()
            .filter(|(_, node)| node.line > 0 && tags.contains(&node.tag))
            .min_by_key(|(index, node)| {
                (node.line < line, node.line.abs_diff(line), node.kind != Kind::HBox, *index)
            })
            .map(|(index, _)| self.location(index))
    }

    /// PDF point to source: the closest record on the page, preferring the line
    /// box under the point.
    fn backward(&self, page: u32, x: f64, y: f64) -> Option<(&str, u32)> {
        let gap = |node: &Node| {
            let dx = (node.x - x).max(x - (node.x + node.width)).max(0.0);
            let dy = (node.y - node.height - y)
                .max(y - (node.y + node.depth))
                .max(0.0);
            dx.hypot(dy)
        };
        let inside = |node: &Node| {
            x >= node.x && x <= node.x + node.width && y >= node.y - node.height && y <= node.y + node.depth
        };
        let (line_box, _) = self
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, node)| node.page == page && node.kind == Kind::HBox && node.line > 0)
            .min_by(|(_, a), (_, b)| {
                // The tightest box containing the point wins; otherwise the nearest one.
                let key = |n: &Node| (!inside(n), gap(n), n.width * (n.height + n.depth));
                key(a).partial_cmp(&key(b)).unwrap_or(std::cmp::Ordering::Equal)
            })?;
        let hit = self
            .nodes
            .iter()
            .filter(|node| node.parent == Some(line_box) && node.line > 0)
            .min_by(|a, b| {
                let key = |n: &Node| (n.x > x, (n.x - x).abs());
                key(a).partial_cmp(&key(b)).unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap_or(&self.nodes[line_box]);
        Some((self.inputs.get(&hit.tag)?.as_str(), hit.line))
    }

    /// Input records may be absolute, project-relative or `./`-prefixed.
    fn tags_for(&self, relative_source: &str) -> Vec<u32> {
        let normalize = |path: &str| path.replace('\\', "/").trim_start_matches("./").to_lowercase();
        let wanted = normalize(relative_source);
        let mut tags: Vec<u32> = self
            .inputs
            .iter()
            .filter(|(_, name)| {
                let name = normalize(name);
                name == wanted || name.ends_with(&format!("/{wanted}"))
            })
            .map(|(tag, _)| *tag)
            .collect();
        tags.sort_unstable();
        tags
    }
}

fn load_map(pdf: &Path) -> Result<SyncMap, String> {
    const LIMIT: u64 = 256 * 1024 * 1024;
    let unreadable = |e: std::io::Error| format!("读取 SyncTeX 映射失败，请重新编译论文: {e}");
    let mut text = Vec::new();
    let packed = pdf.with_extension("synctex.gz");
    if packed.is_file() {
        let file = fs::File::open(&packed).map_err(unreadable)?;
        flate2::read::GzDecoder::new(file)
            .take(LIMIT)
            .read_to_end(&mut text)
            .map_err(unreadable)?;
    } else {
        let file = fs::File::open(pdf.with_extension("synctex")).map_err(unreadable)?;
        file.take(LIMIT).read_to_end(&mut text).map_err(unreadable)?;
    }
    Ok(SyncMap::parse(&String::from_utf8_lossy(&text)))
}

#[tauri::command]
pub async fn tex_synctex_forward(
    project_dir: String,
    pdf_path: String,
    source_file: String,
    line: u32,
    column: u32,
) -> Result<PdfLocation, String> {
    if line == 0 || column == 0 {
        return Err("源码行列必须大于 0".into());
    }
    let (root, pdf) = paper_pdf(&project_dir, &pdf_path, true)?;
    let (_, source) = project_file(&project_dir, &source_file)?;
    // SyncTeX records the path the engine was invoked with, not the canonical one.
    let source = source
        .strip_prefix(&root)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    tokio::task::spawn_blocking(move || {
        let map = load_map(&pdf)?;
        map.forward(&map.tags_for(&source), line)
            .ok_or_else(|| "当前源码行没有 PDF 对应位置，请选择正文或重新编译论文".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tex_synctex_backward(
    project_dir: String,
    pdf_path: String,
    page: u32,
    x: f64,
    y: f64,
) -> Result<SourceLocation, String> {
    if page == 0 || !x.is_finite() || !y.is_finite() || x < 0.0 || y < 0.0 {
        return Err("无效的 PDF 页码或坐标".into());
    }
    let (root, pdf) = paper_pdf(&project_dir, &pdf_path, true)?;
    let (source, line) = tokio::task::spawn_blocking(move || {
        let map = load_map(&pdf)?;
        map.backward(page, x, y)
            .map(|(source, line)| (source.to_string(), line))
            .ok_or_else(|| "此 PDF 位置没有源码映射，请选择正文区域".to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    // Positions inside the engine's own files are not openable in the editor.
    let (_, source) = project_file(&project_dir, &source)
        .map_err(|_| "此 PDF 位置对应的源码不在当前论文项目内".to_string())?;
    let relative = source.strip_prefix(&root).map_err(|e| e.to_string())?;
    Ok(SourceLocation {
        relative_path: relative.to_string_lossy().replace('\\', "/"),
        line,
        column: 1,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every length below is PDF points * 65781.76 sp, so 1.9734528e7 sp = 300 pt.
    const SAMPLE: &str = "SyncTeX Version:1\nInput:1:C:/My Paper/./main.tex\nInput:2:sections/method.tex\nOutput:pdf\nMagnification:1000\nUnit:1\nX Offset:0\nY Offset:0\nContent:\n!100\n{1\n[1,3:6578176,65781760:19734528,59203584,0\n(1,5:6578176,13156352:19734528,657818,131564\nx1,5:6578176,13156352\ng1,5:9867264,13156352\n)\n(2,9:6578176,19734528:19734528,657818,0\nx2,9:6578176,19734528\nx2,10:13156352,19734528\n)\n]\n}1\n{2\n(2,40:6578176,13156352:6578176,657818,0\n)\n}2\nPostamble:\nCount:9\n";

    #[test]
    fn maps_source_lines_to_line_boxes_in_top_left_points() {
        let map = SyncMap::parse(SAMPLE);
        assert_eq!(map.tags_for("main.tex"), vec![1]);
        let hit = map.forward(&[1], 5).unwrap();
        assert_eq!(hit.page, 1);
        assert!((hit.x - 100.0).abs() < 0.01 && (hit.y - 190.0).abs() < 0.01, "{hit:?}");
        assert!((hit.width - 300.0).abs() < 0.01, "{hit:?}");
        assert!((hit.height - 12.0).abs() < 0.01, "{hit:?}");
        // Windows separators, `./` prefixes and nesting all resolve to the same tag.
        let method = map.tags_for("sections\\method.tex");
        assert_eq!(method, vec![2]);
        assert_eq!(map.forward(&method, 20).unwrap().page, 2);
        assert_eq!(map.forward(&method, 9).unwrap().page, 1);
        assert!(map.forward(&[], 5).is_none());
    }

    #[test]
    fn maps_pdf_points_back_to_the_nearest_record() {
        let map = SyncMap::parse(SAMPLE);
        assert_eq!(map.backward(1, 120.0, 195.0), Some(("C:/My Paper/./main.tex", 5)));
        assert_eq!(map.backward(1, 150.0, 295.0), Some(("sections/method.tex", 9)));
        assert_eq!(map.backward(1, 250.0, 295.0), Some(("sections/method.tex", 10)));
        // Clicks outside every box snap to the closest line instead of failing.
        assert_eq!(map.backward(2, 400.0, 400.0), Some(("sections/method.tex", 40)));
        assert!(map.backward(3, 10.0, 10.0).is_none());
    }

    #[test]
    fn dvi_family_output_is_shifted_by_the_one_inch_origin() {
        let map = SyncMap::parse(&SAMPLE.replace("Output:pdf", "Output:xdv"));
        let hit = map.forward(&[1], 5).unwrap();
        assert!((hit.x - 172.0).abs() < 0.01 && (hit.y - 262.0).abs() < 0.01, "{hit:?}");
        assert!(SyncMap::parse("garbage\n(1,2:x").nodes.is_empty());
    }

    #[test]
    fn reads_gzip_maps_next_to_the_pdf() {
        use std::io::Write;
        let root = std::env::temp_dir().join(format!("agentikz_syncmap_{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        gz.write_all(SAMPLE.as_bytes()).unwrap();
        fs::write(root.join("main.synctex.gz"), gz.finish().unwrap()).unwrap();
        assert_eq!(load_map(&root.join("main.pdf")).unwrap().nodes.len(), 8);
        assert!(load_map(&root.join("other.pdf")).is_err());
        fs::remove_dir_all(root).unwrap();
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
