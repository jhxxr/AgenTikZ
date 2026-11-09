import { JournalThemeId } from '../../types/theme';
import { JOURNAL_THEMES } from '../themes/journal-presets';
import { normalizeFigurePath } from '../paper/figure-insertion';

export type ImageGenProviderId = 'openai' | 'gemini' | 'openrouter';

export interface IllustrationGenConfig {
  provider: ImageGenProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  autoRemoveWhiteBg: boolean;
  autoTrimAlpha: boolean;
  proxyUrl?: string;
}

export interface IllustrationGenRequest {
  projectDir?: string | null;
  nodeId?: string;
  userPrompt?: string;
  subjectPrompt?: string;
  activeThemeId?: JournalThemeId;
  themeId?: JournalThemeId;
  aspectRatio?: '1:1' | '4:3' | '16:9' | '3:2';
  config?: IllustrationGenConfig;
  // Flat call convenience fields
  provider?: ImageGenProviderId;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  transparentBackground?: boolean;
  autoRemoveWhiteBg?: boolean;
  autoTrimAlpha?: boolean;
  whiteThreshold?: number;
  targetRelativePath?: string;
  proxyUrl?: string;
}

export interface IllustrationGenResult {
  ok: boolean;
  error?: string;
  relativePath: string;
  savedRelativePath: string;
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  width: number;
  height: number;
  revisedPrompt: string;
  providerUsed: ImageGenProviderId;
  modelUsed: string;
  whiteBgRemoved: boolean;
  alphaTrimmed: boolean;
}

export const IMAGE_GEN_PROVIDER_PRESETS: Record<
  ImageGenProviderId,
  {
    label: string;
    defaultBaseUrl: string;
    defaultModel: string;
    recommendedModels: Array<{ id: string; label: string; badge: string }>;
    supportsNativeTransparentBg: boolean;
    description: string;
  }
> = {
  openai: {
    label: 'OpenAI (GPT Image 2 / 1)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-image-2',
    recommendedModels: [
      {
        id: 'gpt-image-2',
        label: 'gpt-image-2 (旗舰原生透明抠图)',
        badge: '原生 Alpha 透明',
      },
      {
        id: 'gpt-image-1',
        label: 'gpt-image-1 (高清透明科研图标)',
        badge: '原生 Alpha 透明',
      },
    ],
    supportsNativeTransparentBg: true,
    description:
      '支持 background="transparent" 原生输出带 Alpha 通道的抠图 PNG，适合科研立体微件、生物/物理示意图。',
  },
  gemini: {
    label: 'Google Gemini (Nano Banana / Imagen)',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash-image-preview',
    recommendedModels: [
      {
        id: 'gemini-2.5-flash-image-preview',
        label: 'gemini-2.5-flash-image-preview (极速科研插图)',
        badge: '自动白底抠图',
      },
      {
        id: 'gemini-3.1-flash-image-preview',
        label: 'gemini-3.1-flash-image-preview (Nano Banana 2)',
        badge: '自动白底抠图',
      },
      {
        id: 'imagen-3.0-generate-002',
        label: 'imagen-3.0-generate-002 (Imagen 3 高清)',
        badge: '自动白底抠图',
      },
    ],
    supportsNativeTransparentBg: false,
    description:
      '通过 Google Gemini 官方 API 生成纯白底高对比度科研插图，并由 AgenTikZ 边缘连通漫水填充算法自动抠除白底转为透明 PNG。',
  },
  openrouter: {
    label: 'OpenRouter (多供应商统一网关)',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.5-flash-image-preview',
    recommendedModels: [
      {
        id: 'google/gemini-2.5-flash-image-preview',
        label: 'google/gemini-2.5-flash-image-preview',
        badge: 'OpenRouter 多模态',
      },
      {
        id: 'openai/gpt-image-2',
        label: 'openai/gpt-image-2',
        badge: 'OpenRouter 路由',
      },
      {
        id: 'openai/gpt-5-image',
        label: 'openai/gpt-5-image',
        badge: 'OpenRouter 旗舰',
      },
      {
        id: 'black-forest-labs/flux.2-pro',
        label: 'black-forest-labs/flux.2-pro',
        badge: 'Flux 2 Pro',
      },
    ],
    supportsNativeTransparentBg: false,
    description:
      '一套 API Key 畅联 OpenAI、Gemini、Flux 等多供应商生图模型，自动执行边缘白底抠除与 Alpha 紧凑裁切。',
  },
};

/**
 * Compiles a raw user/Agent subject description into a publication-grade
 * scientific cutout illustration prompt aligned with the active journal theme.
 */
export function buildScientificCutoutPrompt(
  userSubject: string,
  activeThemeId: JournalThemeId,
  provider: ImageGenProviderId = 'openai'
): string {
  const theme = JOURNAL_THEMES[activeThemeId] || JOURNAL_THEMES.neurips;
  const paletteDesc = theme.palette
    .slice(0, 4)
    .map((p) => `${p.label} (${p.strokeHex})`)
    .join(', ');

  const bgInstruction =
    provider === 'openai'
      ? 'Isolated single scientific subject on a 100% transparent background (PNG alpha channel).'
      : 'Isolated single scientific subject centered on a pure, uniform, flat solid white background (#FFFFFF) with crisp outer contour edges and zero cast shadow on the background so it can be cleanly cut out.';

  return [
    `Scientific publication figure component illustration for ${theme.name}: ${userSubject.trim()}.`,
    `Style: Clean minimalist flat-vector or isometric scientific diagram icon, Nature/Cell/NeurIPS editorial infographic quality, crisp geometric edges, smooth matte shading.`,
    `Color palette constraint: Harmonize strictly with ${paletteDesc}.`,
    bgInstruction,
    `STRICT NEGATIVE CONSTRAINTS: NO text labels, NO letters, NO numbers, NO mathematical formulas, NO axis ticks, NO outer frame or bounding box, NO background grid or scenery, NO drop shadow, NO lens flare, NO photorealistic clutter.`,
  ].join(' ');
}

/**
 * Stage A: Edge-Connected Flood-Fill Background Removal on an RGBA pixel buffer.
 * Removes solid white / near-white backgrounds connected to the 4 outer borders
 * while preserving internal white details inside the subject.
 */
export function removeSolidBackgroundFloodFillRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 26
): { modified: boolean; removedPixels: number } {
  if (width <= 2 || height <= 2) return { modified: false, removedPixels: 0 };

  // Check if corners are already transparent
  const cornerCoords = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let transparentCorners = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let opaqueCorners = 0;

  for (const [cx, cy] of cornerCoords) {
    const idx = (cy * width + cx) * 4;
    const a = rgba[idx + 3];
    if (a < 20) {
      transparentCorners++;
    } else {
      rSum += rgba[idx];
      gSum += rgba[idx + 1];
      bSum += rgba[idx + 2];
      opaqueCorners++;
    }
  }

  // Already has a transparent background
  if (transparentCorners >= 2 || opaqueCorners === 0) {
    return { modified: false, removedPixels: 0 };
  }

  const bgR = Math.round(rSum / opaqueCorners);
  const bgG = Math.round(gSum / opaqueCorners);
  const bgB = Math.round(bSum / opaqueCorners);

  // Only strip if the outer background is light/white-ish (luminance > 210)
  if (bgR < 205 || bgG < 205 || bgB < 205) {
    return { modified: false, removedPixels: 0 };
  }

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const colorDist = (pixelIdx: number): number => {
    const dr = rgba[pixelIdx] - bgR;
    const dg = rgba[pixelIdx + 1] - bgG;
    const db = rgba[pixelIdx + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const tryEnqueue = (x: number, y: number) => {
    const pos = y * width + x;
    if (visited[pos]) return;
    const idx = pos * 4;
    if (rgba[idx + 3] > 0 && colorDist(idx) <= tolerance * 1.45) {
      visited[pos] = 1;
      queue[tail++] = pos;
    }
  };

  // Seed flood-fill from all 4 image borders
  for (let x = 0; x < width; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    tryEnqueue(0, y);
    tryEnqueue(width - 1, y);
  }

  let removedPixels = 0;
  while (head < tail) {
    const pos = queue[head++];
    const idx = pos * 4;
    rgba[idx + 3] = 0;
    removedPixels++;

    const x = pos % width;
    const y = (pos - x) / width;

    if (x > 0) tryEnqueue(x - 1, y);
    if (x < width - 1) tryEnqueue(x + 1, y);
    if (y > 0) tryEnqueue(x, y - 1);
    if (y < height - 1) tryEnqueue(x, y + 1);
  }

  // Feather 1px boundary halo around removed background pixels
  const softLimit = tolerance * 2.1;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const pos = y * width + x;
      if (visited[pos]) continue;
      const hasRemovedNeighbor =
        visited[pos - 1] ||
        visited[pos + 1] ||
        visited[pos - width] ||
        visited[pos + width];
      if (!hasRemovedNeighbor) continue;
      const idx = pos * 4;
      const dist = colorDist(idx);
      if (dist < softLimit) {
        const ratio = Math.max(0.15, (dist - tolerance) / (softLimit - tolerance));
        rgba[idx + 3] = Math.round(rgba[idx + 3] * Math.min(1, ratio));
      }
    }
  }

  return { modified: removedPixels > 0, removedPixels };
}

/**
 * Stage B: Computes the tight non-transparent bounding box of an RGBA buffer.
 */
export function computeAlphaTightBoundingBox(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 10,
  paddingPx = 4
): { x: number; y: number; w: number; h: number; trimmed: boolean } {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, w: width, h: height, trimmed: false };
  }

  const cropX = Math.max(0, minX - paddingPx);
  const cropY = Math.max(0, minY - paddingPx);
  const cropRight = Math.min(width - 1, maxX + paddingPx);
  const cropBottom = Math.min(height - 1, maxY + paddingPx);
  const cropW = Math.max(1, cropRight - cropX + 1);
  const cropH = Math.max(1, cropBottom - cropY + 1);
  const trimmed =
    cropX > 0 || cropY > 0 || cropW < width || cropH < height;

  return { x: cropX, y: cropY, w: cropW, h: cropH, trimmed };
}

/**
 * Runs Stage A (Flood-Fill Solid White Background Removal) and Stage B (Alpha Tight Crop)
 * on a PNG/WebP/JPEG dataUrl in the browser using HTML5 Canvas.
 */
export async function postProcessCutoutDataUrl(
  rawDataUrl: string,
  options: { autoRemoveWhiteBg: boolean; autoTrimAlpha: boolean }
): Promise<{
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  whiteBgRemoved: boolean;
  alphaTrimmed: boolean;
}> {
  if (typeof document === 'undefined') {
    throw new Error('当前环境不能解码和处理图片，未生成假定尺寸的 PNG。');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error('图片没有有效尺寸，无法保存。');
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('图片处理画布不可用，未保存未处理图片。');
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      let whiteBgRemoved = false;
      if (options.autoRemoveWhiteBg) {
        const res = removeSolidBackgroundFloodFillRgba(imageData.data, w, h);
        whiteBgRemoved = res.modified;
      }

      let finalX = 0;
      let finalY = 0;
      let finalW = w;
      let finalH = h;
      let alphaTrimmed = false;

      if (options.autoTrimAlpha) {
        const bbox = computeAlphaTightBoundingBox(imageData.data, w, h, 10, 4);
        finalX = bbox.x;
        finalY = bbox.y;
        finalW = bbox.w;
        finalH = bbox.h;
        alphaTrimmed = bbox.trimmed;
      }

      ctx.putImageData(imageData, 0, 0);

      if (alphaTrimmed) {
        const outCanvas = document.createElement('canvas');
        outCanvas.width = finalW;
        outCanvas.height = finalH;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) throw new Error('图片裁切画布不可用，未保存不完整的处理结果。');
        if (outCtx) {
          outCtx.drawImage(
            canvas,
            finalX,
            finalY,
            finalW,
            finalH,
            0,
            0,
            finalW,
            finalH
          );
          resolve({
            dataUrl: outCanvas.toDataURL('image/png'),
            widthPx: finalW,
            heightPx: finalH,
            whiteBgRemoved,
            alphaTrimmed,
          });
          return;
        }
      }

      resolve({
        dataUrl: canvas.toDataURL('image/png'),
        widthPx: finalW,
        heightPx: finalH,
        whiteBgRemoved,
        alphaTrimmed,
      });
      } catch (error) { reject(error); }
    };
    img.onerror = () => {
      reject(new Error('生成结果无法解码为图片，未保存或插入占位图。'));
    };
    img.src = rawDataUrl;
  });
}

/**
 * Generates an illustration via Tauri backend (`img_generate_illustration`) or direct
 * browser fetch fallback, then applies Stage A & Stage B post-processing and saves
 * the final transparent PNG to `figures/assets/ai/<slug>.png`.
 */
export async function generateScientificIllustration(
  req: IllustrationGenRequest
): Promise<IllustrationGenResult> {
  const provider: ImageGenProviderId =
    req.config?.provider || req.provider || 'openai';
  const preset = IMAGE_GEN_PROVIDER_PRESETS[provider] || IMAGE_GEN_PROVIDER_PRESETS.openai;
  const config: IllustrationGenConfig = req.config || {
    provider,
    baseUrl: req.baseUrl || preset.defaultBaseUrl,
    apiKey: req.apiKey || '',
    model: req.model || preset.defaultModel,
    autoRemoveWhiteBg:
      req.autoRemoveWhiteBg ?? req.transparentBackground ?? true,
    autoTrimAlpha: req.autoTrimAlpha ?? true,
    proxyUrl: req.proxyUrl,
  };
  const activeThemeId: JournalThemeId =
    req.activeThemeId || req.themeId || 'neurips';
  const userPrompt = (req.userPrompt || req.subjectPrompt || '').trim();
  const requestedPath = req.targetRelativePath ? normalizeFigurePath(req.targetRelativePath) : undefined;
  if (requestedPath && (!requestedPath.startsWith('figures/assets/ai/') || !/\.png$/i.test(requestedPath))) {
    throw new Error('生成图片请保存在 figures/assets/ai/ 内，并使用 PNG 文件名。');
  }
  const nodeId = req.nodeId || requestedPath?.split('/').pop()!.replace(/\.png$/i, '') || `ai_cutout_${crypto.randomUUID().slice(0, 8)}`;
  const projectDir = req.projectDir || undefined;
  const normalizedAspect: '1:1' | '4:3' | '16:9' =
    req.aspectRatio === '16:9'
      ? '16:9'
      : req.aspectRatio === '4:3' || req.aspectRatio === '3:2'
      ? '4:3'
      : '1:1';

  if (!config.apiKey || !config.apiKey.trim()) {
    throw new Error(
      `请先在「偏好设置 → AI 透明插图引擎」中配置 ${preset.label} 的 API Key`
    );
  }

  const compiledPrompt = buildScientificCutoutPrompt(
    userPrompt,
    activeThemeId,
    config.provider
  );

  let rawDataUrl = '';
  const isTauri =
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    const backendRes = await invoke<{
      dataUrl: string;
      relativePath: string;
    }>('img_generate_illustration', {
      projectDir: projectDir || null,
      nodeId,
      prompt: compiledPrompt,
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      aspectRatio: normalizedAspect,
      proxyUrl: config.proxyUrl || null,
    });
    rawDataUrl = backendRes.dataUrl;
  } else {
    rawDataUrl = await fetchIllustrationInBrowser(
      compiledPrompt,
      config,
      normalizedAspect
    );
  }

  // Run Stage A (Flood-Fill White BG Removal) & Stage B (Alpha Tight Crop)
  const processed = await postProcessCutoutDataUrl(rawDataUrl, {
    autoRemoveWhiteBg: config.autoRemoveWhiteBg,
    autoTrimAlpha: config.autoTrimAlpha,
  });

  const cleanSlug =
    nodeId
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'ai_cutout';
  let relativePath =
    requestedPath ||
    `figures/assets/ai/${cleanSlug}_${Date.now().toString(36)}.png`;

  if (isTauri && projectDir) {
    const { invoke } = await import('@tauri-apps/api/core');
    const saved = await invoke<{ relativePath: string }>(
      'img_save_processed_asset',
      {
        projectDir,
        nodeId: cleanSlug,
        targetRelativePath: relativePath,
        dataUrl: processed.dataUrl,
        prompt: userPrompt,
        compiledPrompt,
        provider: config.provider,
        model: config.model,
        themeId: activeThemeId,
        widthPx: processed.widthPx,
        heightPx: processed.heightPx,
      }
    );
    relativePath = saved.relativePath;
  }

  return {
    ok: true,
    relativePath,
    savedRelativePath: relativePath,
    dataUrl: processed.dataUrl,
    widthPx: processed.widthPx,
    heightPx: processed.heightPx,
    width: processed.widthPx,
    height: processed.heightPx,
    revisedPrompt: compiledPrompt,
    providerUsed: config.provider,
    modelUsed: config.model,
    whiteBgRemoved: processed.whiteBgRemoved,
    alphaTrimmed: processed.alphaTrimmed,
  };
}

async function fetchIllustrationInBrowser(
  compiledPrompt: string,
  config: IllustrationGenConfig,
  aspectRatio: '1:1' | '4:3' | '16:9'
): Promise<string> {
  const base = config.baseUrl.replace(/\/+$/, '');
  const key = config.apiKey.trim();

  if (config.provider === 'openai') {
    const size =
      aspectRatio === '16:9'
        ? '1536x1024'
        : aspectRatio === '4:3'
          ? '1536x1024'
          : '1024x1024';
    const resp = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: config.model || 'gpt-image-2',
        prompt: compiledPrompt,
        n: 1,
        size,
        background: 'transparent',
        output_format: 'png',
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI Image API 错误 (${resp.status}): ${errText.slice(0, 240)}`);
    }
    const json = await resp.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (b64) return `data:image/png;base64,${b64}`;
    const url = json?.data?.[0]?.url;
    if (url) return url;
    throw new Error('OpenAI Image API 未返回有效的 b64_json 或 url');
  }

  if (config.provider === 'gemini') {
    const modelName = (config.model || 'gemini-2.5-flash-image-preview').replace(
      /^models\//,
      ''
    );
    const endpoint = `${base}/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: compiledPrompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gemini Image API 错误 (${resp.status}): ${errText.slice(0, 240)}`);
    }
    const json = await resp.json();
    const parts = json?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      const inline = part.inlineData || part.inline_data;
      if (inline?.data) {
        const mime = inline.mimeType || inline.mime_type || 'image/png';
        return `data:${mime};base64,${inline.data}`;
      }
    }
    throw new Error('Gemini API 响应中未找到 inlineData 图像数据');
  }

  // OpenRouter unified multimodal endpoint
  const resp = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://github.com/jhxxr/AgenTikZ',
      'X-Title': 'AgenTikZ Scientific Studio',
    },
    body: JSON.stringify({
      model: config.model || 'google/gemini-2.5-flash-image-preview',
      messages: [{ role: 'user', content: compiledPrompt }],
      modalities: ['image', 'text'],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenRouter Image API 错误 (${resp.status}): ${errText.slice(0, 240)}`);
  }
  const json = await resp.json();
  const msg = json?.choices?.[0]?.message;
  const imgUrl =
    msg?.images?.[0]?.image_url?.url ||
    msg?.images?.[0]?.url ||
    (Array.isArray(msg?.content)
      ? msg.content.find((c: any) => c.type === 'image_url')?.image_url?.url
      : undefined);
  if (imgUrl) return imgUrl;
  throw new Error('OpenRouter 响应中未包含生成的图像 URL 或 Base64 数据');
}
