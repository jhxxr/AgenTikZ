use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IllustrationBackendResult {
    pub data_url: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedIllustrationAsset {
    pub relative_path: String,
    pub full_path: String,
    pub meta_path: String,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn sanitize_slug(raw: &str) -> String {
    let s: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = s.trim_matches('_');
    if trimmed.is_empty() {
        "ai_cutout".to_string()
    } else {
        trimmed.to_string()
    }
}

fn decode_base64_bytes(input: &str) -> Result<Vec<u8>, String> {
    fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' | b'-' => Some(62),
            b'/' | b'_' => Some(63),
            _ => None,
        }
    }
    let clean: Vec<u8> = input
        .bytes()
        .filter(|b| !b.is_ascii_whitespace())
        .collect();
    if clean.is_empty() {
        return Err("Base64 数据为空".into());
    }
    let mut padded = clean;
    while padded.len() % 4 != 0 {
        padded.push(b'=');
    }
    let mut out = Vec::with_capacity(padded.len() / 4 * 3);
    for chunk in padded.chunks(4) {
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

fn encode_base64_bytes(bytes: &[u8]) -> String {
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

/// Stage A (Rust native RGBA implementation): Edge-connected flood-fill background removal.
/// Removes solid white / light backgrounds connected to the 4 outer image borders while
/// preserving white regions inside the subject.
pub fn remove_solid_background_floodfill(
    rgba: &mut [u8],
    width: usize,
    height: usize,
    tolerance: f32,
) -> usize {
    if width <= 2 || height <= 2 || rgba.len() < width * height * 4 {
        return 0;
    }

    let corners = [
        (0usize, 0usize),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
    ];
    let mut transparent_corners = 0usize;
    let mut r_sum = 0u32;
    let mut g_sum = 0u32;
    let mut b_sum = 0u32;
    let mut opaque_corners = 0u32;

    for (cx, cy) in corners {
        let idx = (cy * width + cx) * 4;
        if rgba[idx + 3] < 20 {
            transparent_corners += 1;
        } else {
            r_sum += rgba[idx] as u32;
            g_sum += rgba[idx + 1] as u32;
            b_sum += rgba[idx + 2] as u32;
            opaque_corners += 1;
        }
    }

    if transparent_corners >= 2 || opaque_corners == 0 {
        return 0;
    }

    let bg_r = (r_sum / opaque_corners) as f32;
    let bg_g = (g_sum / opaque_corners) as f32;
    let bg_b = (b_sum / opaque_corners) as f32;

    if bg_r < 205.0 || bg_g < 205.0 || bg_b < 205.0 {
        return 0;
    }

    let mut visited = vec![false; width * height];
    let mut queue = VecDeque::new();

    let color_dist = |r: u8, g: u8, b: u8| -> f32 {
        let dr = r as f32 - bg_r;
        let dg = g as f32 - bg_g;
        let db = b as f32 - bg_b;
        (dr * dr + dg * dg + db * db).sqrt()
    };

    let mut try_enqueue = |x: usize, y: usize, rgba_buf: &[u8]| {
        let pos = y * width + x;
        if visited[pos] {
            return;
        }
        let idx = pos * 4;
        if rgba_buf[idx + 3] > 0
            && color_dist(rgba_buf[idx], rgba_buf[idx + 1], rgba_buf[idx + 2]) <= tolerance * 1.45
        {
            visited[pos] = true;
            queue.push_back(pos);
        }
    };

    for x in 0..width {
        try_enqueue(x, 0, rgba);
        try_enqueue(x, height - 1, rgba);
    }
    for y in 1..(height - 1) {
        try_enqueue(0, y, rgba);
        try_enqueue(width - 1, y, rgba);
    }

    let mut removed = 0usize;
    while let Some(pos) = queue.pop_front() {
        let idx = pos * 4;
        rgba[idx + 3] = 0;
        removed += 1;

        let x = pos % width;
        let y = pos / width;
        if x > 0 {
            try_enqueue(x - 1, y, rgba);
        }
        if x + 1 < width {
            try_enqueue(x + 1, y, rgba);
        }
        if y > 0 {
            try_enqueue(x, y - 1, rgba);
        }
        if y + 1 < height {
            try_enqueue(x, y + 1, rgba);
        }
    }

    removed
}

/// Stage B (Rust native RGBA implementation): Computes tight non-transparent bounding box.
pub fn auto_trim_alpha_margins(
    rgba: &[u8],
    width: usize,
    height: usize,
    alpha_threshold: u8,
    padding_px: usize,
) -> (usize, usize, usize, usize) {
    if width == 0 || height == 0 || rgba.len() < width * height * 4 {
        return (0, 0, width, height);
    }

    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0usize;
    let mut max_y = 0usize;
    let mut found = false;

    for y in 0..height {
        for x in 0..width {
            let a = rgba[(y * width + x) * 4 + 3];
            if a > alpha_threshold {
                found = true;
                if x < min_x {
                    min_x = x;
                }
                if x > max_x {
                    max_x = x;
                }
                if y < min_y {
                    min_y = y;
                }
                if y > max_y {
                    max_y = y;
                }
            }
        }
    }

    if !found {
        return (0, 0, width, height);
    }

    let crop_x = min_x.saturating_sub(padding_px);
    let crop_y = min_y.saturating_sub(padding_px);
    let crop_right = (max_x + padding_px).min(width - 1);
    let crop_bottom = (max_y + padding_px).min(height - 1);
    let crop_w = (crop_right - crop_x + 1).max(1);
    let crop_h = (crop_bottom - crop_y + 1).max(1);

    (crop_x, crop_y, crop_w, crop_h)
}

async fn execute_curl_json(
    url: &str,
    headers: &[(&str, String)],
    body: &Value,
    proxy_url: Option<&str>,
) -> Result<Value, String> {
    let temp_dir = std::env::temp_dir();
    let req_file = temp_dir.join(format!("agentikz_img_req_{}_{}.json", std::process::id(), now_millis()));
    let body_bytes = serde_json::to_vec(body).map_err(|e| format!("序列化请求失败: {}", e))?;
    fs::write(&req_file, &body_bytes).map_err(|e| format!("写入临时请求文件失败: {}", e))?;

    let mut cmd = Command::new("curl");
    cmd.args([
        "-sS",
        "-L",
        "--max-time",
        "120",
        "-X",
        "POST",
        url,
        "-H",
        "Content-Type: application/json",
    ]);

    if let Some(proxy) = proxy_url {
        let p = proxy.trim();
        if !p.is_empty() {
            cmd.args(["--proxy", p]);
        }
    }

    for (k, v) in headers {
        cmd.args(["-H", &format!("{}: {}", k, v)]);
    }

    let req_arg = format!("@{}", req_file.to_string_lossy());
    cmd.args(["--data-binary", &req_arg]);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x0800_0000);

    let output = cmd.output().await;
    let _ = fs::remove_file(&req_file);

    let output = output.map_err(|e| format!("调用 curl 请求绘图接口失败: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("网络请求失败: {}", stderr.trim()));
    }

    let raw_resp = String::from_utf8_lossy(&output.stdout);
    let parsed: Value = serde_json::from_str(&raw_resp).map_err(|e| {
        let preview: String = raw_resp.chars().take(240).collect();
        format!("解析绘图接口 JSON 失败 ({}): {}", e, preview)
    })?;

    if let Some(err_obj) = parsed.get("error") {
        let msg = err_obj
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("API 返回错误");
        return Err(format!("绘图模型接口报错: {}", msg));
    }

    Ok(parsed)
}

async fn download_url_as_data_url(url: &str, proxy_url: Option<&str>) -> Result<String, String> {
    if url.starts_with("data:image/") {
        return Ok(url.to_string());
    }
    let mut cmd = Command::new("curl");
    cmd.args(["-sS", "-L", "--max-time", "60", url]);
    if let Some(proxy) = proxy_url {
        let p = proxy.trim();
        if !p.is_empty() {
            cmd.args(["--proxy", p]);
        }
    }
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x0800_0000);

    let out = cmd
        .output()
        .await
        .map_err(|e| format!("下载生成图片失败: {}", e))?;
    if !out.status.success() || out.stdout.is_empty() {
        return Err("下载生成图片为空或失败".into());
    }
    let b64 = encode_base64_bytes(&out.stdout);
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Calls OpenAI (`gpt-image-2` / `gpt-image-1`), Google Gemini (`gemini-2.5-flash-image-preview` / `imagen-3`),
/// or OpenRouter (`openai/gpt-image-2`, `google/gemini-2.5-flash-image-preview`) to generate a scientific illustration.
#[tauri::command]
pub async fn img_generate_illustration(
    project_dir: Option<String>,
    node_id: String,
    prompt: String,
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    aspect_ratio: String,
    proxy_url: Option<String>,
) -> Result<IllustrationBackendResult, String> {
    let base = base_url.trim().trim_end_matches('/');
    let key = api_key.trim();
    if key.is_empty() {
        return Err("API Key 不能为空，请在设置中配置绘图模型密钥".into());
    }

    let proxy_ref = proxy_url.as_deref();
    let prov = provider.trim().to_ascii_lowercase();

    let data_url = if prov == "gemini" {
        let clean_model = model
            .trim()
            .strip_prefix("models/")
            .unwrap_or(model.trim());
        let model_id = if clean_model.is_empty() {
            "gemini-2.5-flash-image-preview"
        } else {
            clean_model
        };
        let endpoint = format!(
            "{}/models/{}:generateContent?key={}",
            base, model_id, key
        );
        let payload = json!({
            "contents": [{
                "parts": [{ "text": prompt }]
            }],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"]
            }
        });
        let resp = execute_curl_json(&endpoint, &[], &payload, proxy_ref).await?;
        let mut found_data_url = None;
        if let Some(parts) = resp
            .pointer("/candidates/0/content/parts")
            .and_then(|v| v.as_array())
        {
            for part in parts {
                let inline = part.get("inlineData").or_else(|| part.get("inline_data"));
                if let Some(inl) = inline {
                    if let Some(b64) = inl.get("data").and_then(|v| v.as_str()) {
                        let mime = inl
                            .get("mimeType")
                            .or_else(|| inl.get("mime_type"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("image/png");
                        found_data_url = Some(format!("data:{};base64,{}", mime, b64.trim()));
                        break;
                    }
                }
            }
        }
        found_data_url.ok_or_else(|| "Gemini 接口未返回图像 inlineData 数据".to_string())?
    } else if prov == "openrouter" {
        let endpoint = format!("{}/chat/completions", base);
        let model_id = if model.trim().is_empty() {
            "google/gemini-2.5-flash-image-preview"
        } else {
            model.trim()
        };
        let payload = json!({
            "model": model_id,
            "messages": [
                { "role": "user", "content": prompt }
            ],
            "modalities": ["image", "text"]
        });
        let headers = vec![
            ("Authorization", format!("Bearer {}", key)),
            ("HTTP-Referer", "https://github.com/jhxxr/AgenTikZ".to_string()),
            ("X-Title", "AgenTikZ Scientific Studio".to_string()),
        ];
        let resp = execute_curl_json(&endpoint, &headers, &payload, proxy_ref).await?;
        let img_url = resp
            .pointer("/choices/0/message/images/0/image_url/url")
            .or_else(|| resp.pointer("/choices/0/message/images/0/url"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "OpenRouter 响应中未找到生成的图像数据".to_string())?;
        download_url_as_data_url(img_url, proxy_ref).await?
    } else {
        // Default: OpenAI compatible (/v1/images/generations with gpt-image-2 / gpt-image-1)
        let endpoint = format!("{}/images/generations", base);
        let model_id = if model.trim().is_empty() {
            "gpt-image-2"
        } else {
            model.trim()
        };
        let size = match aspect_ratio.as_str() {
            "16:9" | "4:3" => "1536x1024",
            _ => "1024x1024",
        };
        let payload = json!({
            "model": model_id,
            "prompt": prompt,
            "n": 1,
            "size": size,
            "background": "transparent",
            "output_format": "png"
        });
        let headers = vec![("Authorization", format!("Bearer {}", key))];
        let resp = execute_curl_json(&endpoint, &headers, &payload, proxy_ref).await?;
        if let Some(b64) = resp.pointer("/data/0/b64_json").and_then(|v| v.as_str()) {
            format!("data:image/png;base64,{}", b64.trim())
        } else if let Some(url) = resp.pointer("/data/0/url").and_then(|v| v.as_str()) {
            download_url_as_data_url(url, proxy_ref).await?
        } else {
            return Err("OpenAI Images 接口未返回 b64_json 或 url".into());
        }
    };

    let slug = sanitize_slug(&node_id);
    let rel_path = format!("figures/assets/ai/{}.png", slug);

    // Also write initial raw asset if project_dir is provided
    if let Some(dir) = project_dir.as_deref() {
        let root = PathBuf::from(dir.trim());
        if root.is_dir() {
            if let Some((_, raw_b64)) = data_url.split_once(";base64,") {
                if let Ok(bytes) = decode_base64_bytes(raw_b64) {
                    let full = root.join("figures").join("assets").join("ai").join(format!("{}.png", slug));
                    if let Some(p) = full.parent() {
                        let _ = fs::create_dir_all(p);
                    }
                    let _ = fs::write(&full, &bytes);
                }
            }
        }
    }

    Ok(IllustrationBackendResult {
        data_url,
        relative_path: rel_path,
    })
}

/// Saves the post-processed (white-bg removed & alpha-trimmed) PNG and its `.meta.json`
/// into `<project_dir>/figures/assets/ai/<slug>.png`.
#[tauri::command]
pub async fn img_save_processed_asset(
    project_dir: String,
    node_id: String,
    data_url: String,
    prompt: String,
    compiled_prompt: String,
    provider: String,
    model: String,
    theme_id: String,
    width_px: u32,
    height_px: u32,
) -> Result<SavedIllustrationAsset, String> {
    let root = PathBuf::from(project_dir.trim());
    if !root.is_dir() {
        return Err("项目目录不存在".into());
    }

    let slug = sanitize_slug(&node_id);
    let ai_dir = root.join("figures").join("assets").join("ai");
    fs::create_dir_all(&ai_dir).map_err(|e| format!("无法创建 figures/assets/ai 目录: {}", e))?;

    let raw_b64 = data_url
        .split_once(";base64,")
        .map(|(_, b)| b)
        .unwrap_or(&data_url);
    let png_bytes = decode_base64_bytes(raw_b64)?;

    let png_name = format!("{}.png", slug);
    let meta_name = format!("{}.meta.json", slug);
    let png_path = ai_dir.join(&png_name);
    let meta_path = ai_dir.join(&meta_name);

    fs::write(&png_path, &png_bytes).map_err(|e| format!("保存透明抠图 PNG 失败: {}", e))?;

    let meta_json = json!({
        "nodeId": node_id,
        "slug": slug,
        "prompt": prompt,
        "compiledPrompt": compiled_prompt,
        "provider": provider,
        "model": model,
        "themeId": theme_id,
        "widthPx": width_px,
        "heightPx": height_px,
        "updatedAt": now_millis(),
    });
    if let Ok(meta_str) = serde_json::to_string_pretty(&meta_json) {
        let _ = fs::write(&meta_path, meta_str.as_bytes());
    }

    let rel_path = format!("figures/assets/ai/{}", png_name);
    Ok(SavedIllustrationAsset {
        relative_path: rel_path,
        full_path: png_path.to_string_lossy().to_string(),
        meta_path: meta_path.to_string_lossy().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_floodfill_removes_outer_white_but_keeps_inner_white() {
        // 5x5 image: outer border is white (255,255,255,255),
        // ring at (1..=3, 1..=3) is blue (40,80,160,255),
        // center pixel (2,2) is white (255,255,255,255).
        let w = 5usize;
        let h = 5usize;
        let mut rgba = vec![255u8; w * h * 4];
        for y in 1..=3 {
            for x in 1..=3 {
                if x == 2 && y == 2 {
                    continue; // inner white eye/highlight
                }
                let idx = (y * w + x) * 4;
                rgba[idx] = 40;
                rgba[idx + 1] = 80;
                rgba[idx + 2] = 160;
                rgba[idx + 3] = 255;
            }
        }

        let removed = remove_solid_background_floodfill(&mut rgba, w, h, 24.0);
        assert_eq!(removed, 16, "all 16 outer border white pixels must be removed");

        // Outer corner (0,0) must now be transparent
        assert_eq!(rgba[3], 0);
        // Inner white pixel (2,2) enclosed by blue ring must remain opaque!
        let center_idx = (2 * w + 2) * 4;
        assert_eq!(rgba[center_idx + 3], 255);

        // Stage B tight crop should crop to the 3x3 blue subject (with 0 padding)
        let (cx, cy, cw, ch) = auto_trim_alpha_margins(&rgba, w, h, 10, 0);
        assert_eq!((cx, cy, cw, ch), (1, 1, 3, 3));
    }
}
