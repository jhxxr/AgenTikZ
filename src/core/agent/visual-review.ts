import { buildStandaloneLatexDocument } from '../tex/document';
import type { TexPreviewResult } from '../tex/preview';
import type { JournalThemeId } from '../../types/theme';
import { MAX_IMAGE_DATA_LENGTH } from './image-attachments';

export const VISUAL_REVIEW_GUIDANCE = `
=== BOUNDED VISUAL REVIEW ===
For figure creation or visual edits, use a render-and-inspect loop, not blind code generation:
1. Read get_canvas_source; plan the layout and use inspect_layout_diagnostics for cheap geometric checks.
2. Submit a pending proposal with propose_tikz_patch or propose_surgical_diff (never apply it).
3. Call render_canvas_preview with that proposalId. It compiles the exact proposal using TeX and returns a real PNG image plus diagnostics, without changing the user's canvas.
4. Inspect the image for clipped/overlapping labels, arrow routing, missing elements, spacing and visual hierarchy. Fix only concrete issues by updating the pending proposal, then render again.
Budget: at most 3 distinct renders per user request (initial preview plus up to 2 refinements). Repeated identical previews are cached. Stop earlier when adequate; do not endlessly polish.
Every surgical diff (and propose_layout_repair without proposalId) is based on the ORIGINAL live canvas, not the previous pending proposal. To refine a pending proposal, submit its full revised source with propose_tikz_patch (or pass proposalId to propose_layout_repair) and the original canvas revision/hash.
If TeX or image viewing is unavailable, report that limitation and use textual diagnostics only; never claim to have seen or visually verified a failed/missing preview.
Successful compilation is not proof of visual correctness. Summarize remaining issues and leave the final proposal for the host's review/application policy.
`;

/** Isolated compile: does not alter editor source, undo state or the on-screen preview. */
export async function renderAgentPreview(
  source: string, themeId: JournalThemeId,
  settings: { texEngine: string; projectDir: string | null },
): Promise<{ image: { data: string; mimeType: 'image/png' }; message: string }> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    throw new Error('真实预览需要桌面版（内置 TeX 引擎）；尚未进行视觉验证。');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<TexPreviewResult>('tex_compile_preview', {
    texSource: buildStandaloneLatexDocument(source, themeId), texEngine: settings.texEngine,
    projectDir: settings.projectDir,
  });
  if (!result.ok || !result.svg) throw new Error(result.message || 'TeX 未生成预览，尚未进行视觉验证。');
  return { image: { mimeType: 'image/png', data: await rasterizePreview(result.svg) }, message: result.message };
}

/** The viewBox carries the figure's size in points; width/height may be absent or scaled. */
export async function rasterizePreview(svg: string): Promise<string> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('TeX SVG 无效。');
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const width = viewBox?.length === 4 ? viewBox[2] : parseFloat(root.getAttribute('width') || '');
  const height = viewBox?.length === 4 ? viewBox[3] : parseFloat(root.getAttribute('height') || '');
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('TeX SVG 尺寸无效。');
  // Image decoding disables scripts; reject foreign/external resources rather than returning an incomplete image.
  if (doc.querySelector('script, foreignObject') || Array.from(root.querySelectorAll('*')).some((el) =>
    Array.from(el.attributes).some((attr) => /(^|:)href$/.test(attr.name) &&
      !attr.value.startsWith('#') && !/^data:image\/(?:png|jpeg|webp);base64,/.test(attr.value)))) {
    throw new Error('预览包含外部资源，无法保证完整渲染；请先将插图嵌入项目。');
  }
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => reject(new Error('预览图片解码超时。')), 10000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); reject(new Error('TeX 预览图片解码失败。')); };
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建预览画布。');
    let scale = Math.min(2, 1600 / Math.max(width, height));
    for (let attempt = 0; attempt < 6; attempt++, scale *= 0.75) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/png').split(',')[1];
      if (data && data.length <= MAX_IMAGE_DATA_LENGTH) return data;
    }
    throw new Error('渲染图片过大，请缩小图形复杂度。');
  } finally {
    URL.revokeObjectURL(url);
  }
}
