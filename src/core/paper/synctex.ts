export interface PdfPoint { page: number; x: number; y: number }
export interface PdfLocation extends PdfPoint { width: number; height: number }
export interface SourceLocation { relativePath: string; line: number; column: number }
export interface PageGeometry { width: number; height: number; rotation: number }

export function validPdfLocation(target: PdfLocation): boolean {
  return Number.isInteger(target.page) && target.page > 0 &&
    [target.x, target.y, target.width, target.height].every(Number.isFinite) &&
    target.x >= 0 && target.y >= 0 && target.width >= 0 && target.height >= 0;
}

/** SyncTeX uses unrotated PDF points with a top-left origin; DOM uses rotated CSS pixels. */
export function pdfClickPoint(
  page: number, client: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
  geometry: PageGeometry,
): PdfPoint | null {
  if (box.width <= 0 || box.height <= 0 || geometry.width <= 0 || geometry.height <= 0) return null;
  const u = (client.x - box.left) / box.width;
  const v = (client.y - box.top) / box.height;
  if (![u, v].every(Number.isFinite) || u < 0 || u > 1 || v < 0 || v > 1) return null;
  const rotation = ((geometry.rotation % 360) + 360) % 360;
  const [x, y] = rotation === 90 ? [v, 1 - u] : rotation === 180 ? [1 - u, 1 - v] : rotation === 270 ? [1 - v, u] : [u, v];
  return { page, x: x * geometry.width, y: y * geometry.height };
}

export function pdfHighlightBox(target: PdfLocation, geometry: PageGeometry) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const x = clamp(target.x / geometry.width);
  const y = clamp(target.y / geometry.height);
  const right = clamp((target.x + Math.max(4, target.width)) / geometry.width);
  const bottom = clamp((target.y + Math.max(4, target.height)) / geometry.height);
  const rotation = ((geometry.rotation % 360) + 360) % 360;
  const points = [[x, y], [right, bottom]].map(([u, v]) =>
    rotation === 90 ? [1 - v, u] : rotation === 180 ? [1 - u, 1 - v] : rotation === 270 ? [v, 1 - u] : [u, v]
  );
  return {
    left: Math.min(points[0][0], points[1][0]) * 100,
    top: Math.min(points[0][1], points[1][1]) * 100,
    width: Math.abs(points[1][0] - points[0][0]) * 100,
    height: Math.abs(points[1][1] - points[0][1]) * 100,
  };
}

export async function syncTexForward(options: {
  projectDir: string; pdfPath: string; sourceFile: string;
  line: number; column: number; texLiveBinDir?: string;
}): Promise<PdfLocation> {
  const { invoke } = await import('@tauri-apps/api/core');
  const target = await invoke<PdfLocation>('tex_synctex_forward', options);
  if (!validPdfLocation(target)) throw new Error('SyncTeX 返回了无效的 PDF 位置');
  return target;
}

export async function syncTexBackward(options: {
  projectDir: string; pdfPath: string; page: number; x: number; y: number; texLiveBinDir?: string;
}): Promise<SourceLocation> {
  const { invoke } = await import('@tauri-apps/api/core');
  const target = await invoke<SourceLocation>('tex_synctex_backward', options);
  const path = target.relativePath.replace(/\\/g, '/');
  if (!path || path.startsWith('/') || path.includes(':') || path.split('/').some((p) => !p || p === '..' || p === '.') ||
    !/\.(tex|sty|cls|bib)$/i.test(path) ||
    !Number.isInteger(target.line) || target.line < 1 || !Number.isInteger(target.column) || target.column < 1) {
    throw new Error('SyncTeX 返回的源码位置不在当前论文内');
  }
  return { ...target, relativePath: path };
}
