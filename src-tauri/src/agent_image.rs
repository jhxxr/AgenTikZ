//! Bounded, inline raster attachments shared by ACP and Pi.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentImage {
    pub name: String,
    pub mime_type: String,
    pub data: String,
}

pub fn validate_images(images: &[AgentImage]) -> Result<(), String> {
    if images.len() > 4 {
        return Err("最多附加 4 张图片。".into());
    }
    for image in images {
        let unpadded = image.data.trim_end_matches('=');
        if !matches!(image.mime_type.as_str(), "image/png" | "image/jpeg" | "image/webp")
            || image.name.len() > 800
            || image.data.is_empty()
            || image.data.len() > 1_400_000
            || image.data.len() % 4 != 0
            || image.data.len() - unpadded.len() > 2
            || unpadded.is_empty()
            || !unpadded.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/')
        {
            return Err("图片格式或大小无效，请重新粘贴 PNG、JPEG 或 WebP 图片。".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn image(mime: &str, data: &str) -> AgentImage {
        AgentImage { name: "reference.png".into(), mime_type: mime.into(), data: data.into() }
    }
    #[test]
    fn bounds_inline_raster_payloads() {
        assert!(validate_images(&[image("image/png", "aGVsbG8=")]).is_ok());
        for bad in [
            image("image/svg+xml", "aGVsbG8="), image("image/png", "data:image/png;base64,AAAA"),
            image("image/png", "a==a"), image("image/png", "===="),
            image("image/png", &"a".repeat(1_400_004)),
        ] { assert!(validate_images(&[bad]).is_err()); }
        assert!(validate_images(&vec![image("image/png", "AAAA"); 5]).is_err());
    }
}
