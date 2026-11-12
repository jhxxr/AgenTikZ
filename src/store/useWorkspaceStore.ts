import { create } from 'zustand';
import {
  EdgeLineStyle,
  EdgeRouteType,
  ParsedTikzDocument,
  TikzChartElement,
  TikzEdgeElement,
  TikzNodeElement,
  TikzPathElement,
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
  patchImageNodePath,
  patchNodeLabel,
  patchNodeOptions,
} from '../core/parser/patcher';
import { PRIMITIVE_LIBRARY } from '../core/tikz/primitives';
import { EMPTY_TIKZ_CODE } from '../core/templates/blank-document';
import { JOURNAL_THEMES } from '../core/themes/journal-presets';
import { resolveTikzColor } from '../core/themes/journal-presets';
import { useSettingsStore } from './useSettingsStore';
import { patchElementGeometry, patchMacroGeometry, type GeometryEdit } from '../core/parser/path-patcher';

export type LeftSidebarTab = 'project' | 'library' | 'code';
export type ColumnGuideMode = 'none' | 'single' | 'double';

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
  sourceRevision: number;
  parsedDoc: ParsedTikzDocument;
  activeThemeId: JournalThemeId;
  leftTab: LeftSidebarTab;
  columnGuideMode: ColumnGuideMode;
  isInsertFigureModalOpen: boolean;
  activeTool: CanvasTool;
  selectedIds: string[];
  highlightedLineRange: { startLine: number; endLine: number } | null;
  lastChangeInfo: LastTikzChangeInfo | null;
  showGrid: boolean;
  snapToGrid: boolean;
  canvasWidthCm: number;
  canvasHeightCm: number;
  zoom: number;
  pan: { x: number; y: number };
  previewMode: PreviewMode;
  compiledSvg: string | null;
  isCompilingTex: boolean;
  texCompilerStatus: string | null;
  undoStack: string[];
  redoStack: string[];
  isAgentPanelCollapsed: boolean;
  isLeftSidebarCollapsed: boolean;
  isInspectorDrawerOpen: boolean;

  // Actions
  setLeftTab: (tab: LeftSidebarTab) => void;
  setColumnGuideMode: (mode: ColumnGuideMode) => void;
  setInsertFigureModalOpen: (open: boolean) => void;
  setAgentPanelCollapsed: (collapsed: boolean) => void;
  toggleAgentPanel: () => void;
  setLeftSidebarCollapsed: (collapsed: boolean) => void;
  toggleLeftSidebar: () => void;
  setInspectorDrawerOpen: (open: boolean) => void;
  toggleInspectorDrawer: () => void;
  setActiveTool: (tool: CanvasTool) => void;
  setActiveTheme: (themeId: JournalThemeId) => void;
  setSelectedIds: (ids: string[]) => void;
  setShowGrid: (show: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
  setCanvasSizeCm: (widthCm: number, heightCm: number) => void;
  fitCanvasToContent: (paddingCm?: number, viewport?: { width: number; height: number }) => void;
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
  updatePathById: (id: string, updates: {
    width?: number; height?: number; options?: Record<string, string>;
    point?: { index: number; x: number; y: number };
  }, recordUndo?: boolean) => void;
  updateMacroArgumentById: (id: string, index: number, value: string) => void;
  updateEdgeById: (
    id: string,
    updates: {
      routeType?: EdgeRouteType;
      residualOffset?: number;
      bendAngle?: number;
      label?: string;
      labelOffset?: { x: number; y: number };
      stroke?: string;
      lineWidth?: string;
      dashed?: boolean;
      dotted?: boolean;
      lineStyle?: EdgeLineStyle;
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
        | 'uncertaintyNote'
        | 'directEndLabels'
        | 'chartType'
        | 'width'
        | 'height'
        | 'showGrid'
        | 'showLegend'
        | 'legendPos'
        | 'legendScale'
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
  addImageAssetToCanvas: (
    relativePath: string,
    x?: number,
    y?: number,
    widthCm?: number,
    heightCm?: number
  ) => void;
  updateImageNodePathById: (id: string, newRelativePath: string) => void;
  applyCanvasDocumentState: (docState: {
    tikzCode: string;
    activeThemeId?: JournalThemeId;
    zoom?: number;
    pan?: { x: number; y: number };
    showGrid?: boolean;
    snapToGrid?: boolean;
    canvasWidthCm?: number;
    canvasHeightCm?: number;
  }) => void;
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
}

const initialThemeId: JournalThemeId = (
  useSettingsStore.getState().defaultThemeId in JOURNAL_THEMES
    ? useSettingsStore.getState().defaultThemeId
    : 'neurips'
) as JournalThemeId;
const initialCode = EMPTY_TIKZ_CODE;
const initialParsed = parseTikzDocument(initialCode, initialThemeId);

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
  sourceRevision: 0,
  parsedDoc: initialParsed,
  activeThemeId: initialThemeId,
  leftTab: 'code',
  columnGuideMode: 'none',
  isInsertFigureModalOpen: false,
  activeTool: 'select',
  selectedIds: [],
  highlightedLineRange: null,
  lastChangeInfo: null,
  showGrid: useSettingsStore.getState().showGridByDefault,
  snapToGrid: useSettingsStore.getState().snapToGridByDefault,
  canvasWidthCm: 16.0,
  canvasHeightCm: 10.0,
  zoom: 1,
  pan: { x: 80, y: 495 },
  previewMode: 'interactive',
  compiledSvg: null,
  isCompilingTex: false,
  texCompilerStatus: null,
  undoStack: [],
  redoStack: [],
  isAgentPanelCollapsed: false,
  isLeftSidebarCollapsed: false,
  isInspectorDrawerOpen: false,

  setLeftTab: (leftTab) => set({ leftTab, isLeftSidebarCollapsed: false }),
  setColumnGuideMode: (columnGuideMode) => set({ columnGuideMode }),
  setInsertFigureModalOpen: (isInsertFigureModalOpen) =>
    set({ isInsertFigureModalOpen }),
  setAgentPanelCollapsed: (isAgentPanelCollapsed) =>
    set({ isAgentPanelCollapsed }),
  toggleAgentPanel: () =>
    set((s) => ({ isAgentPanelCollapsed: !s.isAgentPanelCollapsed })),
  setLeftSidebarCollapsed: (isLeftSidebarCollapsed) =>
    set({ isLeftSidebarCollapsed }),
  toggleLeftSidebar: () =>
    set((s) => ({ isLeftSidebarCollapsed: !s.isLeftSidebarCollapsed })),
  setInspectorDrawerOpen: (isInspectorDrawerOpen) =>
    set({ isInspectorDrawerOpen }),
  toggleInspectorDrawer: () =>
    set((s) => ({ isInspectorDrawerOpen: !s.isInspectorDrawerOpen })),
  setActiveTool: (activeTool) => set({ activeTool }),
  setActiveTheme: (activeThemeId) => {
    const { tikzCode, activeThemeId: currentThemeId } = get();
    if (activeThemeId === currentThemeId) return;
    set({
      activeThemeId,
      parsedDoc: parseTikzDocument(tikzCode, activeThemeId),
      compiledSvg: null,
      texCompilerStatus: null,
    });
  },

  setSelectedIds: (selectedIds) => {
    const { parsedDoc } = get();
    set({
      selectedIds,
      highlightedLineRange: computeLineRangeForSelection(parsedDoc, selectedIds),
    });
  },

  setShowGrid: (showGrid) => set({ showGrid }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setCanvasSizeCm: (widthCm, heightCm) => {
    const w = Math.max(4.0, Math.min(120.0, Math.round(widthCm * 10) / 10));
    const h = Math.max(4.0, Math.min(120.0, Math.round(heightCm * 10) / 10));
    set({ canvasWidthCm: w, canvasHeightCm: h });
  },
  fitCanvasToContent: (paddingCm = 1.0, viewport) => {
    const { parsedDoc } = get();
    if (parsedDoc.coordinateScene && (parsedDoc.coordinateScene.transformed || parsedDoc.paths?.length || parsedDoc.nodes.some((node) => node.macroSource))) {
      const [left, top, width, height] = parsedDoc.coordinateScene.viewBox;
      const zoom = viewport ? Math.max(0.05, Math.min(1,
        (viewport.width - 100) / (width + paddingCm * 104),
        (viewport.height - 100) / (height + paddingCm * 104))) : get().zoom;
      set({
        canvasWidthCm: Math.max(4, Math.min(120, width / 52 + paddingCm * 2)),
        canvasHeightCm: Math.max(4, Math.min(120, height / 52 + paddingCm * 2)),
        zoom,
        pan: { x: (viewport ? (viewport.width / zoom - width) / 2 : 92) - left,
          y: (viewport ? (viewport.height / zoom - height) / 2 : 100) - top },
      });
      return;
    }
    if (parsedDoc.nodes.length === 0 && parsedDoc.charts.length === 0) {
      set({
        canvasWidthCm: 16.0,
        canvasHeightCm: 10.0,
        pan: { x: 90, y: 495 },
      });
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of parsedDoc.nodes) {
      const hw = node.width / 2;
      const hh = node.height / 2;
      const depthExtraX =
        node.subtype === 'cuboid' ? (node.depth || 0.55) * 0.75 : 0;
      const depthExtraY =
        node.subtype === 'cuboid' ? (node.depth || 0.55) * 0.6 : 0;
      const bottomExtraY = node.sublabel || node.channels ? 0.5 : 0;
      minX = Math.min(minX, node.x - hw);
      maxX = Math.max(maxX, node.x + hw + depthExtraX);
      minY = Math.min(minY, node.y - hh - bottomExtraY);
      maxY = Math.max(maxY, node.y + hh + depthExtraY);
    }

    for (const chart of parsedDoc.charts) {
      minX = Math.min(minX, chart.x - 1.1);
      maxX = Math.max(maxX, chart.x + chart.width + 0.5);
      minY = Math.min(minY, chart.y - (chart.subcaption ? 1.3 : 0.9));
      maxY = Math.max(maxY, chart.y + chart.height + 0.7);
    }

    // The fixed artboard top-left corner sits at (-1.0, 8.5) in TikZ coordinates.
    // Shift all elements so content's top-left starts at (-1.0 + paddingCm, 8.5 - paddingCm)
    const targetMinX = -1.0 + paddingCm;
    const targetMaxY = 8.5 - paddingCm;
    const dx = Number((targetMinX - minX).toFixed(2));
    const dy = Number((targetMaxY - maxY).toFixed(2));

    if (Math.abs(dx) >= 0.15 || Math.abs(dy) >= 0.15) {
      const moves: Array<{ id: string; x: number; y: number }> = [];
      for (const n of parsedDoc.nodes) {
        moves.push({ id: n.id, x: n.x + dx, y: n.y + dy });
      }
      for (const c of parsedDoc.charts) {
        moves.push({ id: c.id, x: c.x + dx, y: c.y + dy });
      }
      if (moves.length > 0) {
        get().moveElementsByPosition(moves, true);
      }
    }

    const contentSpanW = Math.max(2.0, maxX - minX);
    const contentSpanH = Math.max(2.0, maxY - minY);
    const nextW = Math.max(
      4.0,
      Math.min(40.0, Math.round((contentSpanW + paddingCm * 2) * 10) / 10)
    );
    const nextH = Math.max(
      4.0,
      Math.min(40.0, Math.round((contentSpanH + paddingCm * 2) * 10) / 10)
    );

    set({
      canvasWidthCm: nextW,
      canvasHeightCm: nextH,
      pan: {
        x: 92,
        y: 495,
      },
    });
  },
  setZoom: (zoom) => set({ zoom: Math.max(0.05, Math.min(2.5, zoom)) }),
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
    const { tikzCode, undoStack, selectedIds, activeThemeId } = get();
    if (newCode === tikzCode) return;
    const nextDoc = parseTikzDocument(newCode, activeThemeId);
    set({
      tikzCode: newCode,
      sourceRevision: get().sourceRevision + 1,
      compiledSvg: null,
      texCompilerStatus: null,
      parsedDoc: nextDoc,
      highlightedLineRange: computeLineRangeForSelection(nextDoc, selectedIds),
      undoStack: recordUndo ? [...undoStack.slice(-39), tikzCode] : undoStack,
      redoStack: recordUndo ? [] : get().redoStack,
    });
  },

  undo: () => {
    const { undoStack, redoStack, tikzCode, selectedIds, activeThemeId } = get();
    if (undoStack.length === 0) return;
    const prevCode = undoStack[undoStack.length - 1];
    const nextDoc = parseTikzDocument(prevCode, activeThemeId);
    set({
      tikzCode: prevCode,
      sourceRevision: get().sourceRevision + 1,
      compiledSvg: null,
      texCompilerStatus: null,
      parsedDoc: nextDoc,
      highlightedLineRange: computeLineRangeForSelection(nextDoc, selectedIds),
      undoStack: undoStack.slice(0, -1),
      redoStack: [tikzCode, ...redoStack.slice(0, 39)],
    });
  },

  redo: () => {
    const { undoStack, redoStack, tikzCode, selectedIds, activeThemeId } = get();
    if (redoStack.length === 0) return;
    const nextCode = redoStack[0];
    const nextDoc = parseTikzDocument(nextCode, activeThemeId);
    set({
      tikzCode: nextCode,
      sourceRevision: get().sourceRevision + 1,
      compiledSvg: null,
      texCompilerStatus: null,
      parsedDoc: nextDoc,
      highlightedLineRange: computeLineRangeForSelection(nextDoc, selectedIds),
      undoStack: [...undoStack.slice(-39), tikzCode],
      redoStack: redoStack.slice(1),
    });
  },

  moveElementsByPosition: (positions, recordUndo = false) => {
    const { tikzCode, parsedDoc } = get();
    const elementsById = new Map<string, TikzNodeElement | TikzChartElement | TikzPathElement>();
    for (const node of parsedDoc.nodes) {
      if (!elementsById.has(node.id)) elementsById.set(node.id, node);
    }
    for (const chart of parsedDoc.charts) {
      if (!elementsById.has(chart.id)) elementsById.set(chart.id, chart);
    }
    for (const path of parsedDoc.paths || []) elementsById.set(path.id, path);
    const updates: Array<{
      element: TikzNodeElement | TikzChartElement | TikzPathElement;
      x: number;
      y: number;
      oldCoordStr: string;
    }> = [];

    for (const pos of positions) {
      const element = elementsById.get(pos.id);
      if (element && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        updates.push({
          element,
          x: pos.x,
          y: pos.y,
          oldCoordStr: `${formatCoordNum(element.x)}, ${formatCoordNum(element.y)}`,
        });
      }
    }

    if (updates.length === 0) return;
    const patched = patchElementsCoordinates(tikzCode, updates);
    if (patched === tikzCode) return;
    if (recordUndo) get().pushUndoSnapshot();
    get().setTikzCode(patched, false);

    // Record exact span of changed coordinate in the updated AST
    const primary = updates[0];
    const nextDoc = get().parsedDoc;
    const updatedEl =
      nextDoc.nodes.find((n) => n.id === primary.element.id) ||
      nextDoc.charts.find((c) => c.id === primary.element.id) ||
      nextDoc.paths?.find((p) => p.id === primary.element.id);
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
          valueSpan: updatedEl.kind !== 'path' && updatedEl.coordSpan
            ? { from: updatedEl.coordSpan.start, to: updatedEl.coordSpan.end }
            : undefined,
          timestamp: Date.now(),
        },
      });
    }
  },

  updatePathById: (id, updates, recordUndo = true) => {
    const { tikzCode, parsedDoc } = get();
    const path = parsedDoc.paths?.find((item) => item.id === id);
    if (!path) return;
    const edit: GeometryEdit = { options: updates.options, point: updates.point };
    if ((updates.width !== undefined || updates.height !== undefined) && path.width > 0 && path.height > 0) {
      let x = updates.width !== undefined ? updates.width / path.width : 1;
      let y = updates.height !== undefined ? updates.height / path.height : 1;
      if (path.geometry.radius) x = y = Math.abs(x - 1) >= Math.abs(y - 1) ? x : y;
      edit.scale = { x, y, originX: path.x * 52, originY: -path.y * 52 };
    }
    const next = patchElementGeometry(tikzCode, path.geometry, edit);
    if (next === tikzCode) return;
    get().setTikzCode(next, recordUndo);
    get().setSelectedIds(get().selectedIds);
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

  updateMacroArgumentById: (id, index, value) => {
    const { tikzCode, parsedDoc } = get();
    const node = parsedDoc.nodes.find((item) => item.id === id);
    const argument = node?.macroSource?.args[index];
    if (!argument) return;
    get().setTikzCode(tikzCode.slice(0, argument.start) + value + tikzCode.slice(argument.end), true);
    get().setSelectedIds([id]);
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
            : updates.labelOffset !== undefined
              ? `xshift=${formatCoordNum(updates.labelOffset.x)}cm, yshift=${formatCoordNum(updates.labelOffset.y)}cm`
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
      } else if (updates.legendScale !== undefined) {
        summary = `图例缩放 ${Math.round(updates.legendScale * 100)}%`;
        searchToken = `legend style=`;
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
      ...(parsedDoc.paths || []).filter((p) => selectedIds.includes(p.id)),
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
    const created = get().parsedDoc.elements;
    get().setSelectedIds(newIds.every((id) => created.some((element) => element.id === id))
      ? newIds : created.slice(-toDup.length).map((element) => element.id));
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
      const p = parsedDoc.paths?.find((item) => item.id === id);
      if (p) moves.push({ id: p.id, x: p.x + dxCm, y: p.y + dyCm });
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
    let snippet = prim.generateSnippet(count, defaultX, defaultY);
    if (parsedDoc.coordinateScene) {
      // Tool placement is already in physical cm; do not reinterpret it using
      // an imported picture's x=... / y=... basis.
      snippet = snippet.replace(/\bat\s*\(\s*([-+\d.]+)\s*,\s*([-+\d.]+)\s*\)/g, 'at ($1cm, $2cm)')
        .replace(/\bshift\s*=\s*\{\(\s*([-+\d.]+)\s*,\s*([-+\d.]+)\s*\)\}/g, 'shift={($1cm, $2cm)}');
    }
    const nextCode = insertTikzStatement(tikzCode, snippet);
    get().setTikzCode(nextCode, true);

    // Select the newly created element
    const nextDoc = get().parsedDoc;
    const lastEl = nextDoc.elements[nextDoc.elements.length - 1];
    if (lastEl) {
      get().setSelectedIds([lastEl.id]);
    }
  },

  addImageAssetToCanvas: (
    relativePath,
    x = 4.5,
    y = 4.2,
    widthCm = 4.2,
    heightCm = 3.0
  ) => {
    const { tikzCode, parsedDoc } = get();
    const cleanRel = relativePath.replace(/\\/g, '/').trim();
    const imgCount =
      parsedDoc.nodes.filter((n) => n.subtype === 'image').length + 1;
    let nodeId = `img_${imgCount}`;
    while (parsedDoc.nodes.some((n) => n.id === nodeId)) {
      nodeId = `img_${Math.floor(Math.random() * 900 + 100)}`;
    }
    const xStr = formatCoordNum(x);
    const yStr = formatCoordNum(y);
    const wStr = `${formatCoordNum(widthCm)}cm`;
    const hStr = `${formatCoordNum(heightCm)}cm`;
    const snippet = `\\node[inner sep=0pt, minimum width=${wStr}, minimum height=${hStr}, draw=nips_slate!35, line width=0.5pt, rounded corners=2pt] (${nodeId}) at (${xStr}, ${yStr}) {\\includegraphics[width=${wStr}, height=${hStr}]{${cleanRel}}};`;
    const nextCode = insertTikzStatement(tikzCode, snippet);
    get().setTikzCode(nextCode, true);

    const nextDoc = get().parsedDoc;
    const created = nextDoc.nodes.find((n) => n.id === nodeId);
    if (created) {
      get().setSelectedIds([created.id]);
      set({
        highlightedLineRange: {
          startLine: created.span.startLine,
          endLine: created.span.endLine,
        },
        lastChangeInfo: {
          elementId: created.id,
          fieldLabel: '插入同目录图片素材',
          newValue: cleanRel,
          lineRange: {
            startLine: created.span.startLine,
            endLine: created.span.endLine,
          },
          timestamp: Date.now(),
        },
      });
    }
  },

  updateImageNodePathById: (id, newRelativePath) => {
    const { tikzCode, parsedDoc } = get();
    const node = parsedDoc.nodes.find((n) => n.id === id);
    if (!node) return;
    const oldPath = node.imagePath;
    const cleanRel = newRelativePath.replace(/\\/g, '/').trim();
    const patched = patchImageNodePath(tikzCode, node, cleanRel);
    get().setTikzCode(patched, true);

    const updated = get().parsedDoc.nodes.find((n) => n.id === id);
    if (updated) {
      set({
        highlightedLineRange: {
          startLine: updated.span.startLine,
          endLine: updated.span.endLine,
        },
        lastChangeInfo: {
          elementId: id,
          fieldLabel: '素材图片路径 \\includegraphics',
          oldValue: oldPath,
          newValue: cleanRel,
          lineRange: {
            startLine: updated.span.startLine,
            endLine: updated.span.endLine,
          },
          timestamp: Date.now(),
        },
      });
    }
  },

  applyCanvasDocumentState: (docState) => {
    const nextThemeId =
      docState.activeThemeId && docState.activeThemeId in JOURNAL_THEMES
        ? docState.activeThemeId
        : get().activeThemeId;
    const nextDoc = parseTikzDocument(docState.tikzCode, nextThemeId);
    const primaryTarget =
      nextDoc.nodes.find((n) => n.subtype !== 'container') ||
      nextDoc.charts[0] ||
      nextDoc.elements[0];
    const nextSelected = primaryTarget ? [primaryTarget.id] : [];
    set({
      tikzCode: docState.tikzCode,
      sourceRevision: get().sourceRevision + 1,
      parsedDoc: nextDoc,
      activeThemeId: nextThemeId,
      zoom: docState.zoom ?? 1,
      pan: docState.pan ?? { x: 80, y: 495 },
      showGrid: docState.showGrid ?? get().showGrid,
      snapToGrid: docState.snapToGrid ?? get().snapToGrid,
      canvasWidthCm: docState.canvasWidthCm ?? 16.0,
      canvasHeightCm: docState.canvasHeightCm ?? 10.0,
      selectedIds: nextSelected,
      highlightedLineRange: computeLineRangeForSelection(nextDoc, nextSelected),
      lastChangeInfo: null,
      undoStack: [],
      redoStack: [],
      compiledSvg: null,
      texCompilerStatus: null,
      previewMode: 'interactive',
    });
  },

  addEdgeBetweenNodes: (fromId, toId, routeType = 'direct') => {
    if (fromId === toId) return;
    const { tikzCode, parsedDoc } = get();
    let stmt = '';
    if (routeType === 'residual_right') {
      stmt = `  \\draw[-Stealth, line width=0.7pt, draw=nips_sage!85!black] (${fromId}.east) -- ++(1.3, 0) |- node[midway, fill=white, inner sep=1.5pt, font=\\scriptsize] {Residual} (${toId}.east);`;
    } else if (routeType === 'vh') {
      stmt = `  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (${fromId}) |- (${toId});`;
    } else {
      stmt = `  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (${fromId}) -- (${toId});`;
    }
    if (parsedDoc.coordinateScene) stmt = stmt.replace(/\+\+\(\s*([-+\d.]+)\s*,\s*([-+\d.]+)\s*\)/g, '++($1cm, $2cm)');
    if (parsedDoc.coordinateScene) {
      const hex = resolveTikzColor(routeType === 'residual_right' ? 'nips_sage!85!black' : 'nips_slate!85!black', 'stroke', get().activeThemeId);
      const rgb = `{rgb,255:red,${parseInt(hex.slice(1, 3), 16)};green,${parseInt(hex.slice(3, 5), 16)};blue,${parseInt(hex.slice(5, 7), 16)}}`;
      stmt = stmt.replace('-Stealth', '->').replace(/draw=nips_(?:sage|slate)!85!black/, `draw=${rgb}`);
    }
    let namedSource = tikzCode;
    const endpoints = parsedDoc.nodes.filter((node) => [fromId, toId].includes(node.id) && !node.namedInSource)
      .sort((a, b) => b.span.start - a.span.start);
    for (const node of endpoints) {
      if (node.macroSource) namedSource = patchMacroGeometry(namedSource, node, {});
      else {
        const at = node.optionsSpan ? node.optionsSpan.end + 1 : node.span.start + '\\node'.length;
        namedSource = namedSource.slice(0, at) + ` (${node.id})` + namedSource.slice(at);
      }
    }
    const nextCode = insertTikzStatement(namedSource, stmt);
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
    const selectedNodes = [...parsedDoc.nodes, ...(parsedDoc.paths || [])].filter((n) =>
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


}));
