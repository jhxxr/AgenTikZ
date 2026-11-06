import { create } from 'zustand';
import {
  EdgeRouteType,
  ParsedTikzDocument,
  TikzChartElement,
  TikzEdgeElement,
} from '../types/tikz-ast';
import { JournalThemeId } from '../types/theme';
import { parseTikzDocument } from '../core/parser/parser';
import {
  deleteElementsFromSource,
  duplicateElementsInSource,
  formatCoordNum,
  insertTikzStatement,
  patchChartElement,
  patchChartLegendPosition,
  patchEdgeElement,
  patchElementsCoordinates,
  patchFigureCaptionAndLabel,
  patchNodeLabel,
  patchNodeOptions,
} from '../core/parser/patcher';
import {
  FULL_FIGURE_TEMPLATES,
  PRIMITIVE_LIBRARY,
} from '../core/templates/dl-templates';

export type LeftSidebarTab = 'library' | 'code';

export type CanvasTool =
  | 'select'
  | 'node'
  | 'mha'
  | 'cuboid'
  | 'op_circle'
  | 'container'
  | 'edge'
  | 'residual'
  | 'math'
  | 'caption'
  | 'chart';

export type PreviewMode = 'interactive' | 'tex_split' | 'tex_overlay';

export interface LastTikzChangeInfo {
  elementId: string;
  fieldLabel: string;
  oldValue?: string;
  newValue: string;
  lineRange: { startLine: number; endLine: number };
  valueSpan?: { from: number; to: number };
  timestamp: number;
}

interface WorkspaceState {
  tikzCode: string;
  parsedDoc: ParsedTikzDocument;
  activeThemeId: JournalThemeId;
  activeTemplateId: string;
  leftTab: LeftSidebarTab;
  activeTool: CanvasTool;
  selectedIds: string[];
  highlightedLineRange: { startLine: number; endLine: number } | null;
  lastChangeInfo: LastTikzChangeInfo | null;
  showGrid: boolean;
  snapToGrid: boolean;
  zoom: number;
  pan: { x: number; y: number };
  previewMode: PreviewMode;
  compiledSvg: string | null;
  isCompilingTex: boolean;
  texCompilerStatus: string | null;
  undoStack: string[];
  redoStack: string[];

  // Actions
  setLeftTab: (tab: LeftSidebarTab) => void;
  setActiveTool: (tool: CanvasTool) => void;
  setActiveTheme: (themeId: JournalThemeId) => void;
  setSelectedIds: (ids: string[]) => void;
  setShowGrid: (show: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setCompiledSvg: (svg: string | null, status?: string | null) => void;
  setIsCompilingTex: (compiling: boolean) => void;

  setTikzCode: (newCode: string, recordUndo?: boolean) => void;
  pushUndoSnapshot: () => void;
  undo: () => void;
  redo: () => void;

  moveElementsByPosition: (
    positions: Array<{ id: string; x: number; y: number }>,
    recordUndo?: boolean
  ) => void;
  updateNodeLabelById: (id: string, label: string, sublabel?: string) => void;
  updateNodeOptionsById: (
    id: string,
    optionPatches: Record<string, string | undefined>,
    recordUndo?: boolean
  ) => void;
  updateEdgeById: (
    id: string,
    updates: {
      routeType?: EdgeRouteType;
      residualOffset?: number;
      bendAngle?: number;
      label?: string;
      stroke?: string;
      lineWidth?: string;
      dashed?: boolean;
    },
    recordUndo?: boolean
  ) => void;
  updateChartById: (
    id: string,
    updates: Partial<
      Pick<
        TikzChartElement,
        | 'title'
        | 'xlabel'
        | 'ylabel'
        | 'subcaption'
        | 'chartType'
        | 'width'
        | 'height'
        | 'showGrid'
        | 'showLegend'
        | 'legendPos'
        | 'titleOffset'
        | 'xlabelOffset'
        | 'ylabelOffset'
        | 'series'
        | 'heatmapMatrix'
        | 'boxplots'
      >
    >,
    recordUndo?: boolean
  ) => void;
  moveChartLegend: (
    chartId: string,
    legendPos: { x: number; y: number },
    recordUndo?: boolean
  ) => void;
  updateFigureCaption: (caption: string, label?: string) => void;
  duplicateSelectedElements: () => void;
  nudgeSelectedElements: (dxCm: number, dyCm: number) => void;

  addPrimitiveToCanvas: (primitiveId: string, x?: number, y?: number) => void;
  addEdgeBetweenNodes: (
    fromId: string,
    toId: string,
    routeType?: EdgeRouteType
  ) => void;
  deleteSelectedElements: () => void;
  alignSelectedNodes: (
    mode:
      | 'align_x'
      | 'align_y'
      | 'distribute_y'
      | 'distribute_x'
  ) => void;
  loadTemplate: (templateId: string) => void;
}

const initialCode = FULL_FIGURE_TEMPLATES[0].tikzCode;
const initialParsed = parseTikzDocument(initialCode);

function computeLineRangeForSelection(
  doc: ParsedTikzDocument,
  selectedIds: string[]
): { startLine: number; endLine: number } | null {
  if (selectedIds.length === 0) return null;
  const target = doc.elements.find((el) => el.id === selectedIds[0]);
  if (!target) return null;
  return {
    startLine: target.span.startLine,
    endLine: target.span.endLine,
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  tikzCode: initialCode,
  parsedDoc: initialParsed,
  activeThemeId: 'neurips',
  activeTemplateId: FULL_FIGURE_TEMPLATES[0].id,
  leftTab: 'code',
  activeTool: 'select',
  selectedIds: ['mha'],
  highlightedLineRange: computeLineRangeForSelection(initialParsed, ['mha']),
  lastChangeInfo: null,
  showGrid: true,
  snapToGrid: true,
  zoom: 1,
  pan: FULL_FIGURE_TEMPLATES[0].recommendedPan || { x: 80, y: 495 },
  previewMode: 'interactive',
  compiledSvg: null,
  isCompilingTex: false,
  texCompilerStatus: null,
  undoStack: [],
  redoStack: [],

  setLeftTab: (leftTab) => set({ leftTab }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setActiveTheme: (activeThemeId) => set({ activeThemeId }),

  setSelectedIds: (selectedIds) => {
    const { parsedDoc } = get();
    set({
      selectedIds,
      highlightedLineRange: computeLineRangeForSelection(parsedDoc, selectedIds),
    });
  },

  setShowGrid: (showGrid) => set({ showGrid }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setZoom: (zoom) => set({ zoom: Math.max(0.35, Math.min(2.5, zoom)) }),
  setPan: (pan) => set({ pan }),
  setPreviewMode: (previewMode) => set({ previewMode }),
  setCompiledSvg: (compiledSvg, texCompilerStatus = null) =>
    set({ compiledSvg, texCompilerStatus }),
  setIsCompilingTex: (isCompilingTex) => set({ isCompilingTex }),

  pushUndoSnapshot: () => {
    const { tikzCode, undoStack } = get();
    if (undoStack[undoStack.length - 1] === tikzCode) return;
    set({
      undoStack: [...undoStack.slice(-39), tikzCode],
      redoStack: [],
    });
  },

  setTikzCode: (newCode, recordUndo = true) => {
    const { tikzCode, undoStack, selectedIds } = get();
    if (newCode === tikzCode) return;
    const nextDoc = parseTikzDocument(newCode);
    set({
      tikzCode: newCode,
      parsedDoc: nextDoc,
      highlightedLineRange: computeLineRangeForSelection(nextDoc, selectedIds),
      undoStack: recordUndo ? [...undoStack.slice(-39), tikzCode] : undoStack,
      redoStack: recordUndo ? [] : get().redoStack,
    });
  },

  undo: () => {
    const { undoStack, redoStack, tikzCode, selectedIds } = get();
    if (undoStack.length === 0) return;
    const prevCode = undoStack[undoStack.length - 1];
    const nextDoc = parseTikzDocument(prevCode);
    set({
      tikzCode: prevCode,
      parsedDoc: nextDoc,
      highlightedLineRange: computeLineRangeForSelection(nextDoc, selectedIds),
      undoStack: undoStack.slice(0, -1),
      redoStack: [tikzCode, ...redoStack.slice(0, 39)],
    });
  },

  redo: () => {
    const { undoStack, redoStack, tikzCode, selectedIds } = get();
    if (redoStack.length === 0) return;
    const nextCode = redoStack[0];
    const nextDoc = parseTikzDocument(nextCode);
    set({
      tikzCode: nextCode,
      parsedDoc: nextDoc,
      highlightedLineRange: computeLineRangeForSelection(nextDoc, selectedIds),
      undoStack: [...undoStack, tikzCode],
      redoStack: redoStack.slice(1),
    });
  },

  moveElementsByPosition: (positions, recordUndo = false) => {
    const { tikzCode, parsedDoc } = get();
    if (recordUndo) {
      get().pushUndoSnapshot();
    }
    const updates: Array<{
      element: any;
      x: number;
      y: number;
      oldCoordStr: string;
    }> = [];

    for (const pos of positions) {
      const node = parsedDoc.nodes.find((n) => n.id === pos.id);
      if (node) {
        updates.push({
          element: node,
          x: pos.x,
          y: pos.y,
          oldCoordStr: `${formatCoordNum(node.x)}, ${formatCoordNum(node.y)}`,
        });
        continue;
      }
      const chart = parsedDoc.charts.find((c) => c.id === pos.id);
      if (chart) {
        updates.push({
          element: chart,
          x: pos.x,
          y: pos.y,
          oldCoordStr: `${formatCoordNum(chart.x)}, ${formatCoordNum(chart.y)}`,
        });
      }
    }

    if (updates.length === 0) return;
    const patched = patchElementsCoordinates(tikzCode, updates);
    get().setTikzCode(patched, false);

    // Record exact span of changed coordinate in the updated AST
    const primary = updates[0];
    const nextDoc = get().parsedDoc;
    const updatedEl =
      nextDoc.nodes.find((n) => n.id === primary.element.id) ||
      nextDoc.charts.find((c) => c.id === primary.element.id);
    if (updatedEl) {
      const newCoordStr = `${formatCoordNum(primary.x)}, ${formatCoordNum(primary.y)}`;
      set({
        highlightedLineRange: {
          startLine: updatedEl.span.startLine,
          endLine: updatedEl.span.endLine,
        },
        lastChangeInfo: {
          elementId: updatedEl.id,
          fieldLabel: '坐标 at (x, y)',
          oldValue: primary.oldCoordStr,
          newValue: newCoordStr,
          lineRange: {
            startLine: updatedEl.span.startLine,
            endLine: updatedEl.span.endLine,
          },
          valueSpan: updatedEl.coordSpan
            ? { from: updatedEl.coordSpan.start, to: updatedEl.coordSpan.end }
            : undefined,
          timestamp: Date.now(),
        },
      });
    }
  },

  updateNodeLabelById: (id, label, sublabel) => {
    const { tikzCode, parsedDoc } = get();
    const node = parsedDoc.nodes.find((n) => n.id === id);
    if (!node) return;
    const oldLabel = node.label;
    const patched = patchNodeLabel(tikzCode, node, label, sublabel);
    get().setTikzCode(patched, true);

    const updatedNode = get().parsedDoc.nodes.find((n) => n.id === id);
    if (updatedNode) {
      set({
        highlightedLineRange: {
          startLine: updatedNode.span.startLine,
          endLine: updatedNode.span.endLine,
        },
        lastChangeInfo: {
          elementId: id,
          fieldLabel: '文本/公式标签',
          oldValue: oldLabel,
          newValue: label,
          lineRange: {
            startLine: updatedNode.span.startLine,
            endLine: updatedNode.span.endLine,
          },
          valueSpan: updatedNode.labelSpan
            ? {
                from: updatedNode.labelSpan.start,
                to: updatedNode.labelSpan.end,
              }
            : undefined,
          timestamp: Date.now(),
        },
      });
    }
  },

  updateNodeOptionsById: (id, optionPatches, recordUndo = true) => {
    const { tikzCode, parsedDoc } = get();
    const node = parsedDoc.nodes.find((n) => n.id === id);
    if (!node) return;
    const patched = patchNodeOptions(tikzCode, node, optionPatches);
    get().setTikzCode(patched, recordUndo);

    const nextDoc = get().parsedDoc;
    const updatedNode = nextDoc.nodes.find((n) => n.id === id);
    if (updatedNode) {
      const changedEntries = Object.entries(optionPatches)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`);
      const summaryNew = changedEntries.join(', ');

      // Locate exact substring of the first modified key inside optionsSpan if possible
      let valueSpan = updatedNode.optionsSpan
        ? {
            from: updatedNode.optionsSpan.start,
            to: updatedNode.optionsSpan.end,
          }
        : undefined;
      if (updatedNode.optionsSpan && changedEntries.length > 0) {
        const optSlice = nextDoc.fullSource.slice(
          updatedNode.optionsSpan.start,
          updatedNode.optionsSpan.end
        );
        const firstKey = Object.keys(optionPatches)[0];
        const keyIdx = optSlice.indexOf(firstKey);
        if (keyIdx !== -1) {
          const from = updatedNode.optionsSpan.start + keyIdx;
          const commaAfter = optSlice.indexOf(',', keyIdx);
          const to =
            commaAfter !== -1
              ? updatedNode.optionsSpan.start + commaAfter
              : updatedNode.optionsSpan.end;
          valueSpan = { from, to };
        }
      }

      set({
        highlightedLineRange: {
          startLine: updatedNode.span.startLine,
          endLine: updatedNode.span.endLine,
        },
        lastChangeInfo: {
          elementId: id,
          fieldLabel: '尺寸/样式属性',
          newValue: summaryNew || '样式已更新',
          lineRange: {
            startLine: updatedNode.span.startLine,
            endLine: updatedNode.span.endLine,
          },
          valueSpan,
          timestamp: Date.now(),
        },
      });
    }
  },

  updateEdgeById: (id, updates, recordUndo = true) => {
    const { tikzCode, parsedDoc } = get();
    const edge = parsedDoc.edges.find((e) => e.id === id);
    if (!edge) return;
    const patched = patchEdgeElement(tikzCode, edge, updates);
    get().setTikzCode(patched, recordUndo);

    const updatedEdge = get().parsedDoc.edges.find((e) => e.id === id);
    if (updatedEdge) {
      const desc =
        updates.residualOffset !== undefined
          ? `++(${updates.residualOffset}, 0)`
          : updates.bendAngle !== undefined
            ? `bend=${updates.bendAngle}`
            : updates.routeType || updates.label || '连线更新';
      set({
        highlightedLineRange: {
          startLine: updatedEdge.span.startLine,
          endLine: updatedEdge.span.endLine,
        },
        lastChangeInfo: {
          elementId: `${updatedEdge.from}→${updatedEdge.to}`,
          fieldLabel: '连线路由/属性',
          newValue: String(desc),
          lineRange: {
            startLine: updatedEdge.span.startLine,
            endLine: updatedEdge.span.endLine,
          },
          valueSpan: {
            from: updatedEdge.span.start,
            to: updatedEdge.span.end,
          },
          timestamp: Date.now(),
        },
      });
    }
  },

  updateChartById: (id, updates, recordUndo = true) => {
    const { tikzCode, parsedDoc } = get();
    const chart = parsedDoc.charts.find((c) => c.id === id);
    if (!chart) return;
    const patched = patchChartElement(tikzCode, chart, updates);
    get().setTikzCode(patched, recordUndo);

    const nextDoc = get().parsedDoc;
    const updatedChart = nextDoc.charts.find((c) => c.id === id);
    if (updatedChart) {
      let summary = '图表配置更新';
      let searchToken = '';
      if (updates.width !== undefined || updates.height !== undefined) {
        summary = `width=${updatedChart.width}cm, height=${updatedChart.height}cm`;
        searchToken = `width=${formatCoordNum(updatedChart.width)}cm, height=${formatCoordNum(updatedChart.height)}cm`;
      } else if (updates.title !== undefined) {
        summary = `title={${updates.title}}`;
        searchToken = `title={${updates.title}}`;
      } else if (updates.xlabel !== undefined) {
        summary = `xlabel={${updates.xlabel}}`;
        searchToken = `xlabel={${updates.xlabel}}`;
      } else if (updates.ylabel !== undefined) {
        summary = `ylabel={${updates.ylabel}}`;
        searchToken = `ylabel={${updates.ylabel}}`;
      } else if (updates.titleOffset !== undefined) {
        summary = `title_offset`;
        searchToken = `title_offset=`;
      } else if (updates.xlabelOffset !== undefined) {
        summary = `xlabel_offset`;
        searchToken = `xlabel_offset=`;
      } else if (updates.ylabelOffset !== undefined) {
        summary = `ylabel_offset`;
        searchToken = `ylabel_offset=`;
      } else if (updates.series !== undefined) {
        summary = `\\addplot 数据序列 (${updates.series.length}组)`;
        searchToken = `\\addplot`;
      }

      let valueSpan: { from: number; to: number } | undefined;
      if (searchToken) {
        const blockStr = nextDoc.fullSource.slice(
          updatedChart.span.start,
          updatedChart.span.end
        );
        const relIdx = blockStr.indexOf(searchToken);
        if (relIdx !== -1) {
          const from = updatedChart.span.start + relIdx;
          const lineEnd = blockStr.indexOf('\n', relIdx);
          const to =
            lineEnd !== -1
              ? updatedChart.span.start + lineEnd
              : from + searchToken.length;
          valueSpan = { from, to };
        }
      }

      set({
        highlightedLineRange: {
          startLine: updatedChart.span.startLine,
          endLine: updatedChart.span.endLine,
        },
        lastChangeInfo: {
          elementId: id,
          fieldLabel: 'PGFPlots 图表属性',
          newValue: summary,
          lineRange: {
            startLine: updatedChart.span.startLine,
            endLine: updatedChart.span.endLine,
          },
          valueSpan,
          timestamp: Date.now(),
        },
      });
    }
  },

  moveChartLegend: (chartId, legendPos, recordUndo = false) => {
    const { tikzCode, parsedDoc } = get();
    if (recordUndo) {
      get().pushUndoSnapshot();
    }
    const chart = parsedDoc.charts.find((c) => c.id === chartId);
    if (!chart) return;
    const oldPosStr = `${(chart.legendPos?.x ?? 0.04).toFixed(2)}, ${(chart.legendPos?.y ?? 0.94).toFixed(2)}`;
    const patched = patchChartLegendPosition(tikzCode, chart, legendPos);
    get().setTikzCode(patched, false);

    const updatedChart = get().parsedDoc.charts.find((c) => c.id === chartId);
    if (updatedChart) {
      const newPosStr = `${legendPos.x.toFixed(2)}, ${legendPos.y.toFixed(2)}`;
      const lineRange = updatedChart.legendCoordSpan
        ? {
            startLine: updatedChart.legendCoordSpan.startLine,
            endLine: updatedChart.legendCoordSpan.endLine,
          }
        : {
            startLine: updatedChart.span.startLine,
            endLine: updatedChart.span.endLine,
          };
      set({
        highlightedLineRange: lineRange,
        lastChangeInfo: {
          elementId: `${chartId}.legend`,
          fieldLabel: '图例坐标 at={(x, y)}',
          oldValue: oldPosStr,
          newValue: newPosStr,
          lineRange,
          valueSpan: updatedChart.legendCoordSpan
            ? {
                from: updatedChart.legendCoordSpan.start,
                to: updatedChart.legendCoordSpan.end,
              }
            : undefined,
          timestamp: Date.now(),
        },
      });
    }
  },

  updateFigureCaption: (caption, label) => {
    const { tikzCode } = get();
    const patched = patchFigureCaptionAndLabel(tikzCode, caption, label);
    get().setTikzCode(patched, true);
    const totalLines = patched.split('\n').length;
    set({
      highlightedLineRange: {
        startLine: Math.max(1, totalLines - 2),
        endLine: totalLines,
      },
      lastChangeInfo: {
        elementId: 'figure_caption',
        fieldLabel: '论文图注 \\caption',
        newValue: caption.slice(0, 32) + (caption.length > 32 ? '...' : ''),
        lineRange: {
          startLine: Math.max(1, totalLines - 2),
          endLine: totalLines,
        },
        timestamp: Date.now(),
      },
    });
  },

  duplicateSelectedElements: () => {
    const { tikzCode, parsedDoc, selectedIds } = get();
    if (selectedIds.length === 0) return;
    const toDup = [
      ...parsedDoc.nodes.filter((n) => selectedIds.includes(n.id)),
      ...parsedDoc.charts.filter((c) => selectedIds.includes(c.id)),
    ];
    if (toDup.length === 0) return;
    const seed = parsedDoc.nodes.length + parsedDoc.charts.length + 1;
    const { nextSource, newIds } = duplicateElementsInSource(
      tikzCode,
      toDup,
      seed
    );
    get().setTikzCode(nextSource, true);
    get().setSelectedIds(newIds);
  },

  nudgeSelectedElements: (dxCm, dyCm) => {
    const { parsedDoc, selectedIds } = get();
    if (selectedIds.length === 0) return;
    const moves: Array<{ id: string; x: number; y: number }> = [];
    for (const id of selectedIds) {
      const n = parsedDoc.nodes.find((item) => item.id === id);
      if (n) moves.push({ id: n.id, x: n.x + dxCm, y: n.y + dyCm });
      const c = parsedDoc.charts.find((item) => item.id === id);
      if (c) moves.push({ id: c.id, x: c.x + dxCm, y: c.y + dyCm });
    }
    if (moves.length > 0) {
      get().moveElementsByPosition(moves, true);
    }
  },

  addPrimitiveToCanvas: (primitiveId, x, y) => {
    const { tikzCode, parsedDoc } = get();
    const prim = PRIMITIVE_LIBRARY.find((p) => p.id === primitiveId);
    if (!prim) return;

    const count = parsedDoc.nodes.length + parsedDoc.charts.length + 1;
    const defaultX = x !== undefined ? x : 5.2;
    const defaultY = y !== undefined ? y : 4.5;
    const snippet = prim.generateSnippet(count, defaultX, defaultY);
    const nextCode = insertTikzStatement(tikzCode, snippet);
    get().setTikzCode(nextCode, true);

    // Select the newly created element
    const nextDoc = get().parsedDoc;
    const lastEl = nextDoc.elements[nextDoc.elements.length - 1];
    if (lastEl) {
      get().setSelectedIds([lastEl.id]);
    }
  },

  addEdgeBetweenNodes: (fromId, toId, routeType = 'direct') => {
    if (fromId === toId) return;
    const { tikzCode } = get();
    let stmt = '';
    if (routeType === 'residual_right') {
      stmt = `  \\draw[-Stealth, line width=0.7pt, draw=nips_sage!85!black] (${fromId}.east) -- ++(1.3, 0) |- node[midway, fill=white, inner sep=1.5pt, font=\\scriptsize] {Residual} (${toId}.east);`;
    } else if (routeType === 'vh') {
      stmt = `  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (${fromId}) |- (${toId});`;
    } else {
      stmt = `  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (${fromId}) -- (${toId});`;
    }
    const nextCode = insertTikzStatement(tikzCode, stmt);
    get().setTikzCode(nextCode, true);
  },

  deleteSelectedElements: () => {
    const { tikzCode, parsedDoc, selectedIds } = get();
    if (selectedIds.length === 0) return;

    const spansToDelete: Array<{ start: number; end: number }> = [];
    for (const el of parsedDoc.elements) {
      if (selectedIds.includes(el.id)) {
        spansToDelete.push(el.span);
      } else if (
        el.kind === 'edge' &&
        (selectedIds.includes(el.from) || selectedIds.includes(el.to))
      ) {
        // Also clean up dangling edges connected to deleted nodes
        spansToDelete.push(el.span);
      }
    }

    if (spansToDelete.length === 0) return;
    const nextCode = deleteElementsFromSource(tikzCode, spansToDelete);
    set({ selectedIds: [], highlightedLineRange: null });
    get().setTikzCode(nextCode, true);
  },

  alignSelectedNodes: (mode) => {
    const { parsedDoc, selectedIds } = get();
    const selectedNodes = parsedDoc.nodes.filter((n) =>
      selectedIds.includes(n.id)
    );
    if (selectedNodes.length < 2) return;

    if (mode === 'align_x') {
      const avgX =
        selectedNodes.reduce((acc, n) => acc + n.x, 0) / selectedNodes.length;
      get().moveElementsByPosition(
        selectedNodes.map((n) => ({ id: n.id, x: avgX, y: n.y })),
        true
      );
    } else if (mode === 'align_y') {
      const avgY =
        selectedNodes.reduce((acc, n) => acc + n.y, 0) / selectedNodes.length;
      get().moveElementsByPosition(
        selectedNodes.map((n) => ({ id: n.id, x: n.x, y: avgY })),
        true
      );
    } else if (mode === 'distribute_y') {
      const sorted = [...selectedNodes].sort((a, b) => a.y - b.y);
      const minY = sorted[0].y;
      const maxY = sorted[sorted.length - 1].y;
      const step = (maxY - minY) / Math.max(1, sorted.length - 1);
      get().moveElementsByPosition(
        sorted.map((n, i) => ({
          id: n.id,
          x: n.x,
          y: Number(formatCoordNum(minY + i * step)),
        })),
        true
      );
    } else if (mode === 'distribute_x') {
      const sorted = [...selectedNodes].sort((a, b) => a.x - b.x);
      const minX = sorted[0].x;
      const maxX = sorted[sorted.length - 1].x;
      const step = (maxX - minX) / Math.max(1, sorted.length - 1);
      get().moveElementsByPosition(
        sorted.map((n, i) => ({
          id: n.id,
          x: Number(formatCoordNum(minX + i * step)),
          y: n.y,
        })),
        true
      );
    }
  },

  loadTemplate: (templateId) => {
    const tpl = FULL_FIGURE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    set({
      activeThemeId: tpl.themeId,
      activeTemplateId: tpl.id,
      pan: tpl.recommendedPan || { x: 85, y: 490 },
      zoom: tpl.recommendedZoom || 1,
      lastChangeInfo: null,
    });
    get().setTikzCode(tpl.tikzCode, true);
    const nextDoc = get().parsedDoc;
    const primaryTarget =
      nextDoc.nodes.find((n) => n.subtype !== 'container') ||
      nextDoc.charts[0] ||
      nextDoc.elements[0];
    if (primaryTarget) {
      get().setSelectedIds([primaryTarget.id]);
    } else {
      get().setSelectedIds([]);
    }
  },
}));
