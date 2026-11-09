import type { AgentImageAttachment } from '../../types/acp';

export const MAX_AGENT_IMAGES = 4;
export const MAX_IMAGE_DATA_LENGTH = 1_400_000;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function imageDataUrl(image: Pick<AgentImageAttachment, 'mimeType' | 'data'>): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

export function validateAgentImages(images: AgentImageAttachment[]): void {
  if (images.length > MAX_AGENT_IMAGES) throw new Error(`最多附加 ${MAX_AGENT_IMAGES} 张图片。`);
  for (const image of images) {
    if (!MIME_TYPES.has(image.mimeType) || !image.data || image.data.length > MAX_IMAGE_DATA_LENGTH ||
        image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) {
      throw new Error('图片格式或大小无效，请重新粘贴 PNG、JPEG 或 WebP 图片。');
    }
  }
}

/** Clipboard files only; ordinary text paste must retain the browser's default behavior. */
export function clipboardImages(clipboard: Pick<DataTransfer, 'items' | 'files'>): File[] {
  const items = Array.from(clipboard.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile()).filter((file): file is File => !!file);
  return items.length ? items : Array.from(clipboard.files || []).filter((file) => file.type.startsWith('image/'));
}

/** Decode and re-encode to bounded raster data; never upload clipboard HTML or SVG. */
export async function prepareAgentImage(file: File): Promise<AgentImageAttachment> {
  if (!MIME_TYPES.has(file.type)) throw new Error('仅支持 PNG、JPEG 和 WebP 图片。');
  if (file.size > MAX_INPUT_BYTES) throw new Error('单张原图不能超过 10 MB。');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片读取失败，请重新截图或选择图片。'));
      img.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight ||
        image.naturalWidth * image.naturalHeight > 40_000_000) {
      throw new Error('图片尺寸过大或无效，请裁剪后重试。');
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前环境无法处理图片。');
    let scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    for (let attempt = 0; attempt < 6; attempt++, scale *= 0.75) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/png').split(',')[1];
      if (data && data.length <= MAX_IMAGE_DATA_LENGTH) {
        return { id: crypto.randomUUID(), name: (file.name || '粘贴的图片').slice(0, 200), mimeType: 'image/png', data };
      }
    }
    throw new Error('图片压缩后仍过大，请裁剪后重试。');
  } finally {
    URL.revokeObjectURL(url);
  }
}
