import { beforeEach, describe, expect, it } from 'vitest';
import { parseTikzDocument } from '../../parser/parser';
import { useWorkspaceStore as store } from '../../../store/useWorkspaceStore';
import { getCanvasContentBounds, zoomCanvasAt } from '../viewport';

describe('infinite canvas camera', () => {
  beforeEach(() => store.setState(store.getInitialState()));

  it.each([0.01, 0.4, 2, 8, 100])('keeps the cursor over the same world point at zoom %s', (zoom) => {
    const view = { zoom: 0.7, pan: { x: -1234, y: 5678 } };
    const anchor = { x: 351, y: 219 };
    const next = zoomCanvasAt(view, zoom, anchor);
    expect(anchor.x / next.zoom - next.pan.x).toBeCloseTo(anchor.x / view.zoom - view.pan.x);
    expect(anchor.y / next.zoom - next.pan.y).toBeCloseTo(anchor.y / view.zoom - view.pan.y);
  });

  it('frames distant negative and positive coordinates without moving nodes or changing history', () => {
    const source = String.raw`\begin{tikzpicture}
% These handwritten positions must survive Fit unchanged.
\node[dl_block] (left) at (-42,-18) {Left};
\node[dl_block] (right) at (63,47) {Right};
\draw[->] (left) -- (right);
\end{tikzpicture}`;
    store.getState().setTikzCode(source);
    store.getState().setSelectedIds(['right']);
    const before = store.getState();
    const bounds = getCanvasContentBounds(before.parsedDoc)!;
    store.getState().fitCanvasToContent(0.5, { width: 900, height: 600 });
    const after = store.getState();
    expect(after.tikzCode).toBe(source);
    expect(after.parsedDoc).toBe(before.parsedDoc);
    expect(after.sourceRevision).toBe(before.sourceRevision);
    expect(after.undoStack).toBe(before.undoStack);
    expect(after.redoStack).toBe(before.redoStack);
    expect(after.selectedIds).toBe(before.selectedIds);
    expect(after.canvasWidthCm).toBe(before.canvasWidthCm);
    expect(after.canvasHeightCm).toBe(before.canvasHeightCm);
    expect((bounds.left + after.pan.x) * after.zoom).toBeGreaterThan(0);
    expect((bounds.top + after.pan.y) * after.zoom).toBeGreaterThan(0);
    expect((bounds.left + bounds.width + after.pan.x) * after.zoom).toBeLessThan(900);
    expect((bounds.top + bounds.height + after.pan.y) * after.zoom).toBeLessThan(600);
  });

  it('includes charts outside imported geometry bounds', () => {
    const doc = parseTikzDocument(String.raw`\begin{tikzpicture}[x=0.25mm,y=-0.25mm]
\fill[blue] (0,0) rectangle (100,100);
\begin{scope}[shift={(20cm,30cm)}]
\begin{axis}[width=4cm,height=3cm]\addplot coordinates {(0,0) (1,1)};\end{axis}
\end{scope}
\end{tikzpicture}`, 'neurips');
    const bounds = getCanvasContentBounds(doc)!;
    expect(doc.charts).toHaveLength(1);
    expect(bounds.left + bounds.width).toBeGreaterThan((doc.charts[0].x + 4) * 52);
    expect(bounds.top).toBeLessThan(-(doc.charts[0].y + 3) * 52);
  });

  it('centers an empty canvas safely without changing source', () => {
    const before = store.getState();
    store.getState().fitCanvasToContent(0.5, { width: 800, height: 600 });
    expect(store.getState().pan).toEqual({ x: 400, y: 300 });
    expect(store.getState().zoom).toBe(1);
    expect(store.getState().tikzCode).toBe(before.tikzCode);
    store.getState().fitCanvasToContent(0.5, { width: 0, height: 0 });
    expect(store.getState().pan).toEqual({ x: 400, y: 300 });
  });
});
