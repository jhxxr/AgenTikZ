import { afterEach, describe, expect, it, vi } from 'vitest';
import * as attachments from '../image-attachments';
import {
  canvasToSketchAttachment,
  composeSketchLayers,
  drawContainedImage,
  drawStroke,
  renderSketchStrokes,
  SKETCH_CANVAS_HEIGHT,
  SKETCH_CANVAS_WIDTH,
  type SketchStroke,
} from '../sketch-attachments';

function fakeContext() {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const savedModes: GlobalCompositeOperation[] = [];
  const paintedModes: GlobalCompositeOperation[] = [];
  const context = {
    globalCompositeOperation: 'source-over',
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    save: () => { savedModes.push(context.globalCompositeOperation); calls.push({ name: 'save', args: [] }); },
    restore: () => { context.globalCompositeOperation = savedModes.pop()!; calls.push({ name: 'restore', args: [] }); },
    clearRect: (...args: unknown[]) => calls.push({ name: 'clearRect', args }),
    fillRect: (...args: unknown[]) => calls.push({ name: 'fillRect', args }),
    beginPath: () => calls.push({ name: 'beginPath', args: [] }),
    moveTo: (...args: unknown[]) => calls.push({ name: 'moveTo', args }),
    lineTo: (...args: unknown[]) => calls.push({ name: 'lineTo', args }),
    arc: (...args: unknown[]) => calls.push({ name: 'arc', args }),
    fill: () => { paintedModes.push(context.globalCompositeOperation); calls.push({ name: 'fill', args: [] }); },
    stroke: () => { paintedModes.push(context.globalCompositeOperation); calls.push({ name: 'stroke', args: [] }); },
    drawImage: (...args: unknown[]) => calls.push({ name: 'drawImage', args }),
  } as unknown as CanvasRenderingContext2D;
  return { context, calls, paintedModes };
}

const stroke: SketchStroke = {
  tool: 'pen', color: '#dc2626', lineWidth: 8,
  points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
};

describe('sketch attachments', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('renders pen and eraser strokes with the expected canvas modes', () => {
    const pen = fakeContext();
    drawStroke(pen.context, stroke);
    expect(pen.calls.map((call) => call.name)).toEqual([
      'save', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'restore',
    ]);
    expect(pen.context.globalCompositeOperation).toBe('source-over');

    const eraser = fakeContext();
    drawStroke(eraser.context, { ...stroke, tool: 'eraser' });
    expect(eraser.paintedModes).toEqual(['destination-out']);
    expect(eraser.context.globalCompositeOperation).toBe('source-over');
  });

  it('clears and replays all strokes on a fixed-size transparent ink layer', () => {
    const { context, calls } = fakeContext();
    renderSketchStrokes(context, [stroke]);
    expect(calls[0]).toEqual({ name: 'clearRect', args: [0, 0, SKETCH_CANVAS_WIDTH, SKETCH_CANVAS_HEIGHT] });
    expect(calls.filter((call) => call.name === 'stroke')).toHaveLength(1);
  });

  it('fits a reference image inside the white sketch frame', () => {
    const { context, calls } = fakeContext();
    drawContainedImage(context, { width: 600, height: 300 } as unknown as CanvasImageSource);
    expect(calls.slice(0, 2)).toEqual([
      { name: 'clearRect', args: [0, 0, SKETCH_CANVAS_WIDTH, SKETCH_CANVAS_HEIGHT] },
      { name: 'fillRect', args: [0, 0, SKETCH_CANVAS_WIDTH, SKETCH_CANVAS_HEIGHT] },
    ]);
    expect(calls.at(-1)).toEqual({ name: 'drawImage', args: [expect.anything(), 24, 162, 1152, 576] });
  });

  it('undoing an eraser stroke redraws the original ink without touching the background', () => {
    const { context, paintedModes, calls } = fakeContext();
    const strokes: SketchStroke[] = [stroke, { ...stroke, tool: 'eraser' }];
    renderSketchStrokes(context, strokes);
    expect(paintedModes).toEqual(['source-over', 'destination-out']);
    paintedModes.length = 0;
    renderSketchStrokes(context, strokes.slice(0, -1));
    expect(paintedModes).toEqual(['source-over']);
    expect(calls.some((call) => call.name === 'drawImage' || call.name === 'fillRect')).toBe(false);
  });

  it('flattens background and transparent ink in order onto an opaque white PNG canvas', () => {
    const { context, calls } = fakeContext();
    const output = { getContext: () => context } as unknown as HTMLCanvasElement;
    const background = { width: 1200, height: 900 } as HTMLCanvasElement;
    const ink = { width: 1200, height: 900 } as HTMLCanvasElement;
    vi.stubGlobal('document', { createElement: () => output });
    expect(composeSketchLayers(background, ink)).toBe(output);
    expect(output.width).toBe(1200);
    expect(output.height).toBe(900);
    expect(calls).toEqual([
      { name: 'fillRect', args: [0, 0, 1200, 900] },
      { name: 'drawImage', args: [background, 0, 0] },
      { name: 'drawImage', args: [ink, 0, 0] },
    ]);
  });

  it('passes the generated PNG through the same bounded preparation as uploaded references', async () => {
    const prepared = { id: 'sketch', name: '草图.png', mimeType: 'image/png' as const, data: 'cGl4ZWxz' };
    const prepare = vi.spyOn(attachments, 'prepareAgentImage').mockResolvedValue(prepared);
    const blob = new Blob(['png bytes'], { type: 'image/png' });
    const canvas = { toBlob: (callback: BlobCallback) => callback(blob) } as HTMLCanvasElement;
    expect(await canvasToSketchAttachment(canvas, '草图.png')).toBe(prepared);
    const file = prepare.mock.calls[0][0];
    expect(file.name).toBe('草图.png');
    expect(file.type).toBe('image/png');
    expect(await file.text()).toBe('png bytes');
    expect(() => attachments.validateAgentImages(Array(5).fill(prepared))).toThrow();
  });

  it('reports PNG export failure without creating an empty attachment', async () => {
    const prepare = vi.spyOn(attachments, 'prepareAgentImage');
    const canvas = { toBlob: (callback: BlobCallback) => callback(null) } as HTMLCanvasElement;
    await expect(canvasToSketchAttachment(canvas, '草图.png')).rejects.toThrow('草图导出失败');
    expect(prepare).not.toHaveBeenCalled();
  });
});
