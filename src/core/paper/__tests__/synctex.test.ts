import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pdfClickPoint, pdfHighlightBox, syncTexBackward, syncTexForward, validPdfLocation } from '../synctex';

const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke }));

describe('SyncTeX geometry and native bridge', () => {
  beforeEach(() => bridge.invoke.mockReset());
  const box = { left: 20, top: 10, width: 300, height: 400 };
  const page = { width: 600, height: 800, rotation: 0 };

  it('maps zoomed screen clicks to PDF points, not CSS pixels', () => {
    expect(pdfClickPoint(2, { x: 95, y: 110 }, box, page)).toEqual({ page: 2, x: 150, y: 200 });
    expect(pdfClickPoint(2, { x: 0, y: 0 }, box, page)).toBeNull();
    expect(pdfClickPoint(2, { x: 0, y: 0 }, { ...box, width: 0 }, page)).toBeNull();
  });

  it.each([0, 90, 180, 270])('round-trips a highlighted point on a %s° page', (rotation) => {
    const geometry = { ...page, rotation };
    const target = { page: 1, x: 150, y: 200, width: 60, height: 80 };
    const highlight = pdfHighlightBox(target, geometry);
    const point = pdfClickPoint(1, {
      x: box.left + (highlight.left + highlight.width / 2) / 100 * box.width,
      y: box.top + (highlight.top + highlight.height / 2) / 100 * box.height,
    }, box, geometry)!;
    expect(point.x).toBeCloseTo(180);
    expect(point.y).toBeCloseTo(240);
  });

  it('rejects bad locations and keeps highlight rectangles inside the page', () => {
    expect(validPdfLocation({ page: 0, x: 0, y: 0, width: 1, height: 1 })).toBe(false);
    expect(validPdfLocation({ page: 1, x: NaN, y: 0, width: 1, height: 1 })).toBe(false);
    const box = pdfHighlightBox({ page: 1, x: 599, y: 799, width: 200, height: 100 }, page);
    expect(box.left + box.width).toBeLessThanOrEqual(100);
    expect(box.top + box.height).toBeLessThanOrEqual(100);
  });

  it('forwards the actual source cursor and configured TeX binary directory', async () => {
    const target = { page: 3, x: 10, y: 20, width: 100, height: 10 };
    bridge.invoke.mockResolvedValue(target);
    const options = { projectDir: 'E:/Paper', pdfPath: 'E:/Paper/main.pdf', sourceFile: 'sections/method.tex', line: 42, column: 7 };
    expect(await syncTexForward(options)).toEqual(target);
    expect(bridge.invoke).toHaveBeenCalledWith('tex_synctex_forward', options);
  });

  it('supports cross-file reverse lookup but rejects paths that escape the paper', async () => {
    const options = { projectDir: 'E:/Paper', pdfPath: 'E:/Paper/main.pdf', page: 2, x: 50, y: 100 };
    bridge.invoke.mockResolvedValue({ relativePath: 'sections/method.tex', line: 24, column: 1 });
    expect((await syncTexBackward(options)).relativePath).toBe('sections/method.tex');
    for (const relativePath of ['../private.tex', 'C:/private.tex', '/private.tex', 'figures/image.png']) {
      bridge.invoke.mockResolvedValue({ relativePath, line: 1, column: 1 });
      await expect(syncTexBackward(options)).rejects.toThrow('当前论文');
    }
  });
});
