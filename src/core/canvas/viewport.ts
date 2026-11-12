import type { ParsedTikzDocument } from '../../types/tikz-ast';

export const CM_TO_PX = 52;
export const MIN_CANVAS_ZOOM = 0.01;
export const MAX_CANVAS_ZOOM = 8;

export interface CanvasView {
  zoom: number;
  pan: { x: number; y: number };
}

export interface CanvasViewport {
  width: number;
  height: number;
}

export interface CanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function clampCanvasZoom(zoom: number) {
  return Number.isFinite(zoom) ? Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, zoom)) : 1;
}

/** Bounds in SVG pixels before the camera's pan and zoom are applied. */
export function getCanvasContentBounds(doc: ParsedTikzDocument): CanvasBounds | null {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const include = (x: number, y: number, width: number, height: number) => {
    if (![x, y, width, height].every(Number.isFinite)) return;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  };
  for (const geometry of doc.coordinateScene?.elements || []) include(...geometry.bounds);
  for (const node of doc.nodes) {
    if (node.geometry || node.geometryGroup) continue;
    const depth = node.subtype === 'cuboid' ? node.depth || 0.55 : 0;
    include((node.x - node.width / 2) * CM_TO_PX,
      -(node.y + node.height / 2 + depth * 0.6) * CM_TO_PX,
      (node.width + depth * 0.75) * CM_TO_PX,
      (node.height + depth * 0.6 + (node.sublabel || node.channels ? 0.5 : 0)) * CM_TO_PX);
  }
  for (const chart of doc.charts) {
    include((chart.x - 1.1) * CM_TO_PX, -(chart.y + chart.height + 0.7) * CM_TO_PX,
      (chart.width + 1.6) * CM_TO_PX, (chart.height + (chart.subcaption ? 2 : 1.6)) * CM_TO_PX);
  }
  const nodes = new Map(doc.nodes.map((node) => [node.id, node]));
  for (const edge of doc.edges) {
    if (edge.geometry) continue;
    const from = nodes.get(edge.from), to = nodes.get(edge.to);
    if (!from || !to) continue;
    let x = (from.x + to.x) * CM_TO_PX / 2;
    let y = -(from.y + to.y) * CM_TO_PX / 2;
    if (edge.routeType === 'residual_right') {
      x = (Math.max(from.x + from.width / 2, to.x + to.width / 2) + (edge.residualOffset || 1.35)) * CM_TO_PX;
    } else if (edge.routeType === 'residual_left') {
      x = (Math.min(from.x - from.width / 2, to.x - to.width / 2) - (edge.residualOffset || 1.35)) * CM_TO_PX;
    } else if (edge.routeType === 'curved') {
      const dx = to.x - from.x, dy = from.y - to.y;
      const norm = Math.hypot(dx, dy) || 1;
      const offset = ((edge.bendAngle || 28) / 28) * 34;
      x -= dy / norm * offset;
      y += dx / norm * offset;
    }
    include(x - 4, y - 4, 8, 8);
    if (edge.label) {
      const labelWidth = Math.max(32, edge.label.length * 7);
      include(x + (edge.labelOffset?.x || 0) * CM_TO_PX - labelWidth / 2,
        y - (edge.labelOffset?.y || 0) * CM_TO_PX - 14, labelWidth, 28);
    }
  }
  return Number.isFinite(left) ? { left, top, width: right - left, height: bottom - top } : null;
}

export function centerCanvasView(bounds: CanvasBounds | null, viewport: CanvasViewport, zoom: number): CanvasView {
  return {
    zoom,
    pan: {
      x: viewport.width / (2 * zoom) - (bounds ? bounds.left + bounds.width / 2 : 0),
      y: viewport.height / (2 * zoom) - (bounds ? bounds.top + bounds.height / 2 : 0),
    },
  };
}

/** Keep the same world point under the screen anchor while changing magnification. */
export function zoomCanvasAt(view: CanvasView, zoom: number, anchor: { x: number; y: number }): CanvasView {
  const nextZoom = clampCanvasZoom(zoom);
  return {
    zoom: nextZoom,
    pan: {
      x: view.pan.x + anchor.x / nextZoom - anchor.x / view.zoom,
      y: view.pan.y + anchor.y / nextZoom - anchor.y / view.zoom,
    },
  };
}
