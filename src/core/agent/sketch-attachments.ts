import type { AgentImageAttachment } from '../../types/acp';
import { prepareAgentImage } from './image-attachments';

export const SKETCH_CANVAS_WIDTH = 1200;
export const SKETCH_CANVAS_HEIGHT = 900;

export interface SketchPoint {
  x: number;
  y: number;
}

export interface SketchStroke {
  tool: 'pen' | 'eraser';
  color: string;
  lineWidth: number;
  points: SketchPoint[];
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: SketchStroke): void {
  if (!stroke.points.length) return;
  ctx.save();
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  if (stroke.points.length === 1) {
    ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width = SKETCH_CANVAS_WIDTH,
  height = SKETCH_CANVAS_HEIGHT,
  padding = 24,
): void {
  const dimensions = image as CanvasImageSource & {
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
    width?: number;
    height?: number;
  };
  const sourceWidth = dimensions.naturalWidth || dimensions.videoWidth || dimensions.displayWidth || dimensions.width || 0;
  const sourceHeight = dimensions.naturalHeight || dimensions.videoHeight || dimensions.displayHeight || dimensions.height || 0;
  if (!sourceWidth || !sourceHeight) throw new Error('参考图尺寸无效。');

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

export function renderSketchStrokes(ctx: CanvasRenderingContext2D, strokes: SketchStroke[]): void {
  ctx.clearRect(0, 0, SKETCH_CANVAS_WIDTH, SKETCH_CANVAS_HEIGHT);
  for (const stroke of strokes) drawStroke(ctx, stroke);
}

/** Keep erasing on the ink canvas; flatten the two layers only when attaching. */
export function composeSketchLayers(background: HTMLCanvasElement, ink: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = background.width;
  canvas.height = background.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境无法导出草图。');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(background, 0, 0);
  ctx.drawImage(ink, 0, 0);
  return canvas;
}

export async function canvasToSketchAttachment(
  canvas: HTMLCanvasElement,
  name: string,
): Promise<AgentImageAttachment> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('草图导出失败，请重试。'));
    }, 'image/png');
  });
  return prepareAgentImage(new File([blob], name, { type: 'image/png' }));
}
