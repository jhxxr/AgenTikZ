import { useShallow } from 'zustand/react/shallow';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { EMPTY_TIKZ_CODE } from '../../core/templates/blank-document';
import { TikzEdgeElement, TikzNodeElement } from '../../types/tikz-ast';
import {
  JOURNAL_THEMES,
  ptToPx,
  resolveTikzColor,
} from '../../core/themes/journal-presets';
import { getExactPreviewReasons } from '../../core/tex/source';
import { compileWorkspaceTexPreview } from '../../core/tex/preview';
import { buildVectorPreview } from '../../core/tex/vector-preview';
import { VectorPathPreview } from './VectorPathPreview';
import { LatexLabel } from './LatexLabel';
import { ChartSubTarget, PgfChartRenderer } from './PgfChartRenderer';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  Magnet,
  BookOpenText,
  Copy,
  Edit3,
} from 'lucide-react';

const CM_TO_PX = 52; // 1 TikZ cm = 52px at 100% zoom

type ResizeHandleDir =
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw'
  | 'cuboid_depth';

function getAnchorPoint(
  node: TikzNodeElement,
  anchor: string | undefined,
  originX: number,
  originY: number
): { x: number; y: number } {
  const cx = originX + node.x * CM_TO_PX;
  const cy = originY - node.y * CM_TO_PX;
  const hw = (node.width * CM_TO_PX) / 2;
  const hh = (node.height * CM_TO_PX) / 2;

  switch (anchor?.trim()) {
    case 'north':
      return { x: cx, y: cy - hh };
    case 'south':
      return { x: cx, y: cy + hh };
    case 'east':
      return { x: cx + hw, y: cy };
    case 'west':
      return { x: cx - hw, y: cy };
    default:
      return { x: cx, y: cy };
  }
}

function computeSmartBoundaryPoint(
  fromNode: TikzNodeElement,
  toNode: TikzNodeElement,
  explicitAnchor: string | undefined,
  isSource: boolean,
  originX: number,
  originY: number
): { x: number; y: number } {
  if (explicitAnchor) {
    return getAnchorPoint(
      isSource ? fromNode : toNode,
      explicitAnchor,
      originX,
      originY
    );
  }
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const target = isSource ? fromNode : toNode;

  if (Math.abs(dy) >= Math.abs(dx) * 0.75) {
    if (dy > 0) {
      return getAnchorPoint(
        target,
        isSource ? 'north' : 'south',
        originX,
        originY
      );
    } else {
      return getAnchorPoint(
        target,
        isSource ? 'south' : 'north',
        originX,
        originY
      );
    }
  } else {
    if (dx > 0) {
      return getAnchorPoint(
        target,
        isSource ? 'east' : 'west',
        originX,
        originY
      );
    } else {
      return getAnchorPoint(
        target,
        isSource ? 'west' : 'east',
        originX,
        originY
      );
    }
  }
}

export const InteractiveCanvas: React.FC = () => {
  const {
    tikzCode,
    parsedDoc,
    activeThemeId,
    activeTool,
    selectedIds,
    showGrid,
    snapToGrid,
    columnGuideMode,
    canvasWidthCm,
    canvasHeightCm,
    zoom,
    pan,
    previewMode,
    compiledSvg,
    texCompilerStatus,
    isCompilingTex,
    setSelectedIds,
    setLeftTab,
    setAgentPanelCollapsed,
    setActiveTool,
    setShowGrid,
    setSnapToGrid,
    setColumnGuideMode,
    setCanvasSizeCm,
    fitCanvasToContent,
    setZoom,
    setPan,
    moveElementsByPosition,
    moveChartLegend,
    updateChartById,
    addPrimitiveToCanvas,
    addImageAssetToCanvas,
    addEdgeBetweenNodes,
    updateNodeLabelById,
    updateNodeOptionsById,
    updateEdgeById,
    updateFigureCaption,
    duplicateSelectedElements,
    nudgeSelectedElements,
    deleteSelectedElements,
    undo,
    redo,
  } = useWorkspaceStore(useShallow((s) => ({
    tikzCode: s.tikzCode,
    parsedDoc: s.parsedDoc,
    activeThemeId: s.activeThemeId,
    activeTool: s.activeTool,
    selectedIds: s.selectedIds,
    showGrid: s.showGrid,
    snapToGrid: s.snapToGrid,
    columnGuideMode: s.columnGuideMode,
    canvasWidthCm: s.canvasWidthCm,
    canvasHeightCm: s.canvasHeightCm,
    zoom: s.zoom,
    pan: s.pan,
    previewMode: s.previewMode,
    compiledSvg: s.compiledSvg,
    texCompilerStatus: s.texCompilerStatus,
    isCompilingTex: s.isCompilingTex,
    setSelectedIds: s.setSelectedIds,
    setLeftTab: s.setLeftTab,
    setAgentPanelCollapsed: s.setAgentPanelCollapsed,
    setActiveTool: s.setActiveTool,
    setShowGrid: s.setShowGrid,
    setSnapToGrid: s.setSnapToGrid,
    setColumnGuideMode: s.setColumnGuideMode,
    setCanvasSizeCm: s.setCanvasSizeCm,
    fitCanvasToContent: s.fitCanvasToContent,
    setZoom: s.setZoom,
    setPan: s.setPan,
    moveElementsByPosition: s.moveElementsByPosition,
    moveChartLegend: s.moveChartLegend,
    updateChartById: s.updateChartById,
    addPrimitiveToCanvas: s.addPrimitiveToCanvas,
    addImageAssetToCanvas: s.addImageAssetToCanvas,
    addEdgeBetweenNodes: s.addEdgeBetweenNodes,
    updateNodeLabelById: s.updateNodeLabelById,
    updateNodeOptionsById: s.updateNodeOptionsById,
    updateEdgeById: s.updateEdgeById,
    updateFigureCaption: s.updateFigureCaption,
    duplicateSelectedElements: s.duplicateSelectedElements,
    nudgeSelectedElements: s.nudgeSelectedElements,
    deleteSelectedElements: s.deleteSelectedElements,
    undo: s.undo,
    redo: s.redo,
  })));

  const { activeCanvasName, assetDataUrls, ensureAssetDataUrl } =
    useProjectStore(useShallow((s) => ({
    activeCanvasName: s.activeCanvasName,
    assetDataUrls: s.assetDataUrls,
    ensureAssetDataUrl: s.ensureAssetDataUrl,
  })));

  const svgRef = useRef<SVGSVGElement | null>(null);
  const exactPreviewReasons = useMemo(() => getExactPreviewReasons(tikzCode), [tikzCode]);
  const requiresExactPreview = exactPreviewReasons.length > 0;
  const vectorPreview = useMemo(() => requiresExactPreview ? buildVectorPreview(tikzCode) : null, [tikzCode, requiresExactPreview]);
  const { texEngine, texLiveBinDir, openSettings } = useSettingsStore(useShallow((s) => ({
    texEngine: s.texEngine,
    texLiveBinDir: s.texLiveBinDir,
    openSettings: s.openSettings,
  })));
  const { projectDir, activeCanvasFileName } = useProjectStore(useShallow((s) => ({
    projectDir: s.projectDir,
    activeCanvasFileName: s.activeCanvasFileName,
  })));
  const lastAttemptRef = useRef<string | null>(null);
  const theme = JOURNAL_THEMES[activeThemeId];
  const nodesById = useMemo(() => {
    const index = new Map<string, TikzNodeElement>();
    for (const node of parsedDoc.nodes) {
      if (!index.has(node.id)) index.set(node.id, node);
    }
    return index;
  }, [parsedDoc.nodes]);
  const sortedNodes = useMemo(
    () => [...parsedDoc.nodes].sort((a, b) =>
      Number(b.subtype === 'container') - Number(a.subtype === 'container')
    ),
    [parsedDoc.nodes]
  );

  // Complex drawings bypass the editable subset. Recompile after edits, and
  // retain real compiler errors rather than replacing them with an approximation.
  useEffect(() => {
    if (!requiresExactPreview && previewMode === 'interactive') {
      lastAttemptRef.current = null;
      return;
    }
    if (isCompilingTex) return;
    const key = JSON.stringify([tikzCode, activeThemeId, projectDir, activeCanvasFileName, texEngine, texLiveBinDir]);
    if (lastAttemptRef.current === key) return;
    // A manual compilation has already produced a result for this document.
    if (lastAttemptRef.current === null && texCompilerStatus) {
      lastAttemptRef.current = key;
      return;
    }
    const timer = window.setTimeout(() => {
      lastAttemptRef.current = key;
      void compileWorkspaceTexPreview();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [tikzCode, activeThemeId, requiresExactPreview, previewMode, isCompilingTex, projectDir, activeCanvasFileName, texEngine, texLiveBinDir, texCompilerStatus]);

  // Preload image data URLs for any `\includegraphics` nodes in the parsed AST
  useEffect(() => {
    const currentUrls = useProjectStore.getState().assetDataUrls;
    for (const node of parsedDoc.nodes) {
      if (node.subtype === 'image' && node.imagePath) {
        const cleanPath = node.imagePath.replace(/\\/g, '/').trim();
        if (cleanPath && !currentUrls[cleanPath]) {
          void ensureAssetDataUrl(cleanPath);
        }
      }
    }
  }, [parsedDoc.nodes, ensureAssetDataUrl]);

  // Unified drag state: move, pan, connect, resize_node, route_edge, move_edge_label, or resize_canvas
  const [dragState, setDragState] = useState<{
    mode:
      | 'move'
      | 'pan'
      | 'connect'
      | 'resize_node'
      | 'route_edge'
      | 'move_edge_label'
      | 'resize_canvas';
    startClientX: number;
    startClientY: number;
    initialPan: { x: number; y: number };
    initialPositions: Array<{ id: string; x: number; y: number }>;
    connectFromId?: string;
    connectCurrentPt?: { x: number; y: number };
    resizeTarget?: {
      id: string;
      dir: ResizeHandleDir;
      initX: number;
      initY: number;
      initW: number;
      initH: number;
      initDepth: number;
    };
    routeEdgeTarget?: {
      id: string;
      routeType: TikzEdgeElement['routeType'];
      initOffset: number;
      initBend: number;
    };
    edgeLabelTarget?: {
      id: string;
      initX: number;
      initY: number;
    };
    canvasResizeTarget?: {
      dir: 'e' | 's' | 'se';
      initW: number;
      initH: number;
    };
  } | null>(null);

  const [alignmentGuides, setAlignmentGuides] = useState<{
    xCm?: number;
    yCm?: number;
  }>({});

  // Universal Inline Editor Modal (supports Node Label, 3D Channels, Edge Label, Chart Title/Axes/Legend, or Figure Caption)
  const [inlineEditor, setInlineEditor] = useState<
    | {
        type: 'node';
        id: string;
        label: string;
        sublabel: string;
        channels?: string;
        isCuboid?: boolean;
      }
    | {
        type: 'edge';
        id: string;
        label: string;
      }
    | {
        type: 'chart_sub';
        chartId: string;
        target: ChartSubTarget;
        value: string;
      }
    | {
        type: 'figure_caption';
        caption: string;
        label: string;
      }
    | null
  >(null);

  const originX = pan.x;
  const originY = pan.y;
  const movingIds = useMemo(
    () => new Set(dragState?.initialPositions.map((p) => p.id)),
    [dragState]
  );

  const clientToTikzCm = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 3.0, y: 3.0, svgX: 0, svgY: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (clientX - rect.left) / zoom;
    const svgY = (clientY - rect.top) / zoom;
    const xCm = (svgX - originX) / CM_TO_PX;
    const yCm = (originY - svgY) / CM_TO_PX;
    return { x: xCm, y: yCm, svgX, svgY };
  };

  const handleElementPointerDown = (
    e: React.PointerEvent,
    elementId: string
  ) => {
    e.stopPropagation();

    if (activeTool === 'edge' || activeTool === 'residual') {
      if (selectedIds.length === 1 && selectedIds[0] !== elementId) {
        addEdgeBetweenNodes(
          selectedIds[0],
          elementId,
          activeTool === 'residual' ? 'residual_right' : 'direct'
        );
        setSelectedIds([elementId]);
        setActiveTool('select');
        return;
      }
      setSelectedIds([elementId]);
      return;
    }

    let nextSelection = selectedIds;
    if (e.shiftKey) {
      nextSelection = selectedIds.includes(elementId)
        ? selectedIds.filter((id) => id !== elementId)
        : [...selectedIds, elementId];
      setSelectedIds(nextSelection);
    } else if (!selectedIds.includes(elementId)) {
      nextSelection = [elementId];
      setSelectedIds(nextSelection);
    }

    useWorkspaceStore.getState().pushUndoSnapshot();

    const initialPositions: Array<{ id: string; x: number; y: number }> = [];
    for (const id of nextSelection) {
      const n = nodesById.get(id);
      if (n) initialPositions.push({ id: n.id, x: n.x, y: n.y });
      const c = parsedDoc.charts.find((item) => item.id === id);
      if (c) initialPositions.push({ id: c.id, x: c.x, y: c.y });
    }

    setDragState({
      mode: 'move',
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialPan: { ...pan },
      initialPositions,
    });
  };

  const handleStartNodeResize = (
    e: React.PointerEvent,
    node: TikzNodeElement,
    dir: ResizeHandleDir
  ) => {
    e.stopPropagation();
    useWorkspaceStore.getState().pushUndoSnapshot();
    setDragState({
      mode: 'resize_node',
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialPan: { ...pan },
      initialPositions: [],
      resizeTarget: {
        id: node.id,
        dir,
        initX: node.x,
        initY: node.y,
        initW: node.width,
        initH: node.height,
        initDepth: node.depth || 0.55,
      },
    });
  };

  const handleStartEdgeRouteDrag = (
    e: React.PointerEvent,
    edge: TikzEdgeElement
  ) => {
    e.stopPropagation();
    useWorkspaceStore.getState().pushUndoSnapshot();
    setDragState({
      mode: 'route_edge',
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialPan: { ...pan },
      initialPositions: [],
      routeEdgeTarget: {
        id: edge.id,
        routeType: edge.routeType,
        initOffset: edge.residualOffset || 1.35,
        initBend: edge.bendAngle || 28,
      },
    });
  };

  const handleStartCanvasResize = (
    e: React.PointerEvent,
    dir: 'e' | 's' | 'se'
  ) => {
    e.stopPropagation();
    setDragState({
      mode: 'resize_canvas',
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialPan: { ...pan },
      initialPositions: [],
      canvasResizeTarget: {
        dir,
        initW: canvasWidthCm,
        initH: canvasHeightCm,
      },
    });
  };

  const handlePortPointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    const pt = clientToTikzCm(e.clientX, e.clientY);
    setDragState({
      mode: 'connect',
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialPan: { ...pan },
      initialPositions: [],
      connectFromId: nodeId,
      connectCurrentPt: { x: pt.svgX, y: pt.svgY },
    });
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || e.altKey) {
      setDragState({
        mode: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialPan: { ...pan },
        initialPositions: [],
      });
      return;
    }

    const coords = clientToTikzCm(e.clientX, e.clientY);
    const snapX = snapToGrid ? Math.round(coords.x * 5) / 5 : coords.x;
    const snapY = snapToGrid ? Math.round(coords.y * 5) / 5 : coords.y;

    const toolToPrimMap: Partial<Record<typeof activeTool, string>> = {
      node: 'prim_ffn',
      mha: 'prim_mha',
      cuboid: 'prim_cuboid',
      op_circle: 'prim_op_add',
      container: 'prim_container',
      math: 'prim_math',
      caption: 'prim_caption',
      chart: 'chart_line',
    };

    const primId = toolToPrimMap[activeTool];
    if (primId) {
      addPrimitiveToCanvas(primId, snapX, snapY);
      setActiveTool('select');
      return;
    }

    // Left-click on empty canvas: just deselect, don't start panning.
    // Panning is reserved for middle-click / alt-click (handled above).
    setSelectedIds([]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;

    if (dragState.mode === 'pan') {
      const dx = (e.clientX - dragState.startClientX) / zoom;
      const dy = (e.clientY - dragState.startClientY) / zoom;
      setPan({
        x: dragState.initialPan.x + dx,
        y: dragState.initialPan.y + dy,
      });
      return;
    }

    if (dragState.mode === 'connect') {
      const pt = clientToTikzCm(e.clientX, e.clientY);
      setDragState({
        ...dragState,
        connectCurrentPt: { x: pt.svgX, y: pt.svgY },
      });
      return;
    }

    if (dragState.mode === 'resize_canvas' && dragState.canvasResizeTarget) {
      const { dir, initW, initH } = dragState.canvasResizeTarget;
      const dxCm = (e.clientX - dragState.startClientX) / zoom / CM_TO_PX;
      const dyCm = (e.clientY - dragState.startClientY) / zoom / CM_TO_PX;

      let nextW = initW;
      let nextH = initH;
      if (dir === 'e' || dir === 'se') {
        nextW = Math.max(4.0, Math.min(40.0, Math.round((initW + dxCm) * 10) / 10));
      }
      if (dir === 's' || dir === 'se') {
        nextH = Math.max(4.0, Math.min(40.0, Math.round((initH + dyCm) * 10) / 10));
      }
      setCanvasSizeCm(nextW, nextH);
      return;
    }

    if (dragState.mode === 'resize_node' && dragState.resizeTarget) {
      const { id, dir, initW, initH, initDepth } = dragState.resizeTarget;
      const dxCm = (e.clientX - dragState.startClientX) / zoom / CM_TO_PX;
      const dyCm = -(e.clientY - dragState.startClientY) / zoom / CM_TO_PX;

      if (dir === 'cuboid_depth') {
        const nextDepth = Math.max(
          0.2,
          Math.min(2.2, Number((initDepth + dxCm * 1.2).toFixed(2)))
        );
        updateNodeOptionsById(id, { depth: `${nextDepth}cm` }, false);
        return;
      }

      let nextW = initW;
      let nextH = initH;
      if (dir.includes('e')) nextW = Math.max(0.5, initW + dxCm * 2);
      if (dir.includes('w')) nextW = Math.max(0.5, initW - dxCm * 2);
      if (dir.includes('n')) nextH = Math.max(0.4, initH + dyCm * 2);
      if (dir.includes('s')) nextH = Math.max(0.4, initH - dyCm * 2);

      const wRounded = Number(nextW.toFixed(2));
      const hRounded = Number(nextH.toFixed(2));
      updateNodeOptionsById(
        id,
        {
          'minimum width': `${wRounded}cm`,
          'minimum height': `${hRounded}cm`,
        },
        false
      );
      return;
    }

    if (dragState.mode === 'route_edge' && dragState.routeEdgeTarget) {
      const { id, routeType, initOffset, initBend } = dragState.routeEdgeTarget;
      const dxCm = (e.clientX - dragState.startClientX) / zoom / CM_TO_PX;

      if (routeType === 'residual_right' || routeType === 'residual_left') {
        const signed = routeType === 'residual_right' ? dxCm : -dxCm;
        const nextOff = Math.max(
          0.4,
          Math.min(4.5, Number((initOffset + signed).toFixed(2)))
        );
        updateEdgeById(id, { residualOffset: nextOff }, false);
      } else if (routeType === 'curved') {
        const nextBend = Math.max(
          -75,
          Math.min(75, Math.round(initBend + dxCm * 18))
        );
        updateEdgeById(id, { bendAngle: nextBend }, false);
      }
      return;
    }

    if (dragState.mode === 'move_edge_label' && dragState.edgeLabelTarget) {
      const { id, initX, initY } = dragState.edgeLabelTarget;
      const dxCm = (e.clientX - dragState.startClientX) / zoom / CM_TO_PX;
      const dyCm = -(e.clientY - dragState.startClientY) / zoom / CM_TO_PX;
      let nextX = Number((initX + dxCm).toFixed(2));
      let nextY = Number((initY + dyCm).toFixed(2));
      if (Math.abs(nextX) < 0.04) nextX = 0;
      if (Math.abs(nextY) < 0.04) nextY = 0;
      updateEdgeById(id, { labelOffset: { x: nextX, y: nextY } }, false);
      return;
    }

    if (dragState.mode === 'move' && dragState.initialPositions.length > 0) {
      const dxPx = (e.clientX - dragState.startClientX) / zoom;
      const dyPx = (e.clientY - dragState.startClientY) / zoom;
      const dxCm = dxPx / CM_TO_PX;
      const dyCm = -dyPx / CM_TO_PX;

      const guides: { xCm?: number; yCm?: number } = {};

      const nextPositions = dragState.initialPositions.map((init) => {
        let nx = init.x + dxCm;
        let ny = init.y + dyCm;
        if (snapToGrid) {
          nx = Math.round(nx * 10) / 10;
          ny = Math.round(ny * 10) / 10;
        }
        for (const other of parsedDoc.nodes) {
          if (movingIds.has(other.id)) continue;
          if (Math.abs(other.x - nx) < 0.08) {
            nx = other.x;
            guides.xCm = other.x;
          }
          if (Math.abs(other.y - ny) < 0.08) {
            ny = other.y;
            guides.yCm = other.y;
          }
        }
        return { id: init.id, x: nx, y: ny };
      });

      setAlignmentGuides(guides);
      moveElementsByPosition(nextPositions, false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState?.mode === 'connect' && dragState.connectFromId) {
      const pt = clientToTikzCm(e.clientX, e.clientY);
      const targetNode = parsedDoc.nodes.find(
        (n) =>
          n.id !== dragState.connectFromId &&
          Math.abs(n.x - pt.x) <= n.width / 2 + 0.35 &&
          Math.abs(n.y - pt.y) <= n.height / 2 + 0.35
      );
      if (targetNode) {
        addEdgeBetweenNodes(dragState.connectFromId, targetNode.id, 'direct');
      }
    }
    setDragState(null);
    setAlignmentGuides({});
  };

  const renderEdge = (edge: TikzEdgeElement) => {
    const fromNode = nodesById.get(edge.from);
    const toNode = nodesById.get(edge.to);
    if (!fromNode || !toNode) return null;

    const isSelected = selectedIds.includes(edge.id);
    const origStrokeHex = resolveTikzColor(edge.stroke, 'stroke', activeThemeId);
    const strokeHex = isSelected ? '#2563EB' : origStrokeHex;
    const origStrokeW = ptToPx(edge.lineWidth, 0.7);
    const strokeW = origStrokeW + (isSelected ? 0.8 : 0);

    let pathD = '';
    let labelPos = { x: 0, y: 0 };

    if (
      edge.routeType === 'residual_right' ||
      edge.routeType === 'residual_left'
    ) {
      const isRight = edge.routeType === 'residual_right';
      const p1 = getAnchorPoint(
        fromNode,
        edge.fromAnchor || (isRight ? 'east' : 'west'),
        originX,
        originY
      );
      const p2 = getAnchorPoint(
        toNode,
        edge.toAnchor || (isRight ? 'east' : 'west'),
        originX,
        originY
      );
      const offsetPx =
        (edge.residualOffset || 1.35) * CM_TO_PX * (isRight ? 1 : -1);
      const baseEdgeX = isRight ? Math.max(p1.x, p2.x) : Math.min(p1.x, p2.x);
      const midX = baseEdgeX + offsetPx;
      pathD = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
      labelPos = { x: midX, y: (p1.y + p2.y) / 2 };
    } else if (edge.routeType === 'vh' || edge.routeType === 'hv') {
      const p1 = computeSmartBoundaryPoint(
        fromNode,
        toNode,
        edge.fromAnchor,
        true,
        originX,
        originY
      );
      const p2 = computeSmartBoundaryPoint(
        fromNode,
        toNode,
        edge.toAnchor,
        false,
        originX,
        originY
      );
      const corner =
        edge.routeType === 'vh' ? { x: p1.x, y: p2.y } : { x: p2.x, y: p1.y };
      pathD = `M ${p1.x} ${p1.y} L ${corner.x} ${corner.y} L ${p2.x} ${p2.y}`;
      labelPos = { x: corner.x, y: corner.y };
    } else if (edge.routeType === 'curved') {
      const p1 = computeSmartBoundaryPoint(
        fromNode,
        toNode,
        edge.fromAnchor,
        true,
        originX,
        originY
      );
      const p2 = computeSmartBoundaryPoint(
        fromNode,
        toNode,
        edge.toAnchor,
        false,
        originX,
        originY
      );
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const norm = Math.hypot(dx, dy) || 1;
      const bendOffset = ((edge.bendAngle || 28) / 28) * 34;
      const cx = mx - (dy / norm) * bendOffset;
      const cy = my + (dx / norm) * bendOffset;
      pathD = `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`;
      labelPos = { x: (mx + cx) / 2, y: (my + cy) / 2 };
    } else {
      const p1 = computeSmartBoundaryPoint(
        fromNode,
        toNode,
        edge.fromAnchor,
        true,
        originX,
        originY
      );
      const p2 = computeSmartBoundaryPoint(
        fromNode,
        toNode,
        edge.toAnchor,
        false,
        originX,
        originY
      );
      pathD = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
      labelPos = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }

    return (
      <g
        key={edge.id}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedIds([edge.id]);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setInlineEditor({
            type: 'edge',
            id: edge.id,
            label: edge.label || '',
          });
        }}
        className="cursor-pointer group"
      >
        <title data-export-ignore="true">
          点击选中连线 · 双击直接编辑连线文字/公式标注
        </title>
        <path
          d={pathD}
          fill="none"
          stroke="none"
          pointerEvents="stroke"
          strokeWidth={12}
          data-export-ignore="true"
        />
        <path
          d={pathD}
          fill="none"
          stroke={strokeHex}
          strokeWidth={strokeW}
          data-orig-stroke={origStrokeHex}
          data-orig-stroke-width={origStrokeW}
          data-orig-marker-end={edge.arrowEnd ? 'url(#tikz-arrow)' : ''}
          strokeLinejoin="round"
          strokeDasharray={
            edge.dotted
              ? '1.8 3.2'
              : edge.dashed
                ? '5.5 3.5'
                : undefined
          }
          markerEnd={
            edge.arrowEnd
              ? isSelected
                ? 'url(#tikz-arrow-selected)'
                : 'url(#tikz-arrow)'
              : undefined
          }
        />
        {edge.label && (() => {
          const offsetX = edge.labelOffset?.x ?? 0;
          const offsetY = edge.labelOffset?.y ?? 0;
          const shiftedX = labelPos.x + offsetX * CM_TO_PX;
          const shiftedY = labelPos.y - offsetY * CM_TO_PX;
          const hasOffset = Math.abs(offsetX) >= 0.01 || Math.abs(offsetY) >= 0.01;
          return (
            <>
              {isSelected && hasOffset && (
                <line
                  data-export-ignore="true"
                  x1={labelPos.x}
                  y1={labelPos.y}
                  x2={shiftedX}
                  y2={shiftedY}
                  stroke="#3B82F6"
                  strokeWidth={1}
                  strokeDasharray="2.5 2.5"
                />
              )}
              <g transform={`translate(${shiftedX}, ${shiftedY})`}>
                <foreignObject
                  x={-90}
                  y={-15}
                  width={180}
                  height={30}
                  style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                  <div className="w-full h-full flex items-center justify-center pointer-events-none">
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedIds([edge.id]);
                        useWorkspaceStore.getState().pushUndoSnapshot();
                        setDragState({
                          mode: 'move_edge_label',
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          initialPan: { ...pan },
                          initialPositions: [],
                          edgeLabelTarget: {
                            id: edge.id,
                            initX: offsetX,
                            initY: offsetY,
                          },
                        });
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIds([edge.id]);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setInlineEditor({
                          type: 'edge',
                          id: edge.id,
                          label: edge.label || '',
                        });
                      }}
                      title="按住直接拖拽移动连线文字位置 · 双击编辑公式/文字"
                      className="pointer-events-auto cursor-grab active:cursor-grabbing rounded-xs hover:ring-1 hover:ring-blue-500/60 transition-shadow"
                    >
                      <LatexLabel
                        text={edge.label}
                        fontSize={10}
                        color="#334155"
                        className="bg-white/95 px-1.5 py-0.5 rounded-xs"
                      />
                    </div>
                  </div>
                </foreignObject>
              </g>
            </>
          );
        })()}

        {/* Draggable Route Offset Handle when Edge is Selected */}
        {isSelected &&
          (edge.routeType === 'residual_right' ||
            edge.routeType === 'residual_left' ||
            edge.routeType === 'curved') && (
            <g
              transform={`translate(${labelPos.x}, ${labelPos.y})`}
              onPointerDown={(e) => handleStartEdgeRouteDrag(e, edge)}
              className="cursor-ew-resize"
              data-export-ignore="true"
            >
              <title>左右拖拽直接调节残差跳线跨度 / 弧线弯曲度</title>
              <circle
                cx={0}
                cy={0}
                r={5.5}
                fill="#F59E0B"
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
            </g>
          )}
      </g>
    );
  };

  const renderNode = (node: TikzNodeElement) => {
    const cx = originX + node.x * CM_TO_PX;
    const cy = originY - node.y * CM_TO_PX;
    const w = node.width * CM_TO_PX;
    const h = node.height * CM_TO_PX;
    const left = cx - w / 2;
    const top = cy - h / 2;

    const isSelected = selectedIds.includes(node.id);
    const fillHex = resolveTikzColor(node.fill, 'fill', activeThemeId);
    const strokeHex = resolveTikzColor(node.stroke, 'stroke', activeThemeId);
    const strokeW = ptToPx(node.lineWidth, 0.7);
    const rx = node.roundedCorners
      ? Math.min(12, parseFloat(node.roundedCorners) * 1.4)
      : 3.5;

    return (
      <g
        key={node.id}
        onPointerDown={(e) => handleElementPointerDown(e, node.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setInlineEditor({
            type: 'node',
            id: node.id,
            label: node.label,
            sublabel: node.sublabel || '',
            channels: node.channels || '',
            isCuboid: node.subtype === 'cuboid',
          });
        }}
        className="cursor-move group"
      >
        {/* 1. CONTAINER / STAGE DASHED BOX */}
        {node.subtype === 'container' && (
          <g>
            <rect
              x={left}
              y={top}
              width={w}
              height={h}
              rx={6}
              fill={fillHex}
              fillOpacity={0.55}
              stroke={isSelected ? '#2563EB' : strokeHex}
              strokeWidth={isSelected ? 1.6 : strokeW}
              data-orig-stroke={strokeHex}
              data-orig-stroke-width={strokeW}
              strokeDasharray="5 3.5"
            />
            <foreignObject
              x={left + 10}
              y={top - 14}
              width={Math.max(w - 20, 260)}
              height={28}
              style={{ overflow: 'visible' }}
            >
              <div className="w-full h-full flex items-center justify-start">
                <LatexLabel
                  text={node.label}
                  fontSize={10.5}
                  color="#334155"
                  className="bg-white px-2 py-0.5 rounded border border-slate-300/90 shadow-2xs font-medium"
                />
              </div>
            </foreignObject>
          </g>
        )}

        {/* 2. 3D FEATURE VOLUME / TENSOR CUBOID */}
        {node.subtype === 'cuboid' &&
          (() => {
            const depthPx = (node.depth || 0.55) * CM_TO_PX;
            const dx = depthPx * 0.68;
            const dy = -depthPx * 0.52;

            const topFace = `M ${left} ${top} L ${left + dx} ${top + dy} L ${left + w + dx} ${top + dy} L ${left + w} ${top} Z`;
            const rightFace = `M ${left + w} ${top} L ${left + w + dx} ${top + dy} L ${left + w + dx} ${top + h + dy} L ${left + w} ${top + h} Z`;

            return (
              <g>
                <path
                  d={topFace}
                  fill={fillHex}
                  stroke={isSelected ? '#2563EB' : strokeHex}
                  strokeWidth={strokeW}
                  data-orig-stroke={strokeHex}
                  data-orig-stroke-width={strokeW}
                  strokeLinejoin="round"
                />
                <path
                  d={rightFace}
                  fill={strokeHex}
                  fillOpacity={0.18}
                  stroke={isSelected ? '#2563EB' : strokeHex}
                  strokeWidth={strokeW}
                  data-orig-stroke={strokeHex}
                  data-orig-stroke-width={strokeW}
                  strokeLinejoin="round"
                />
                <rect
                  x={left}
                  y={top}
                  width={w}
                  height={h}
                  fill={fillHex}
                  stroke={isSelected ? '#2563EB' : strokeHex}
                  strokeWidth={isSelected ? 1.7 : strokeW}
                  data-orig-stroke={strokeHex}
                  data-orig-stroke-width={strokeW}
                />
                <foreignObject
                  x={left}
                  y={top}
                  width={w}
                  height={h}
                  style={{ overflow: 'visible' }}
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <LatexLabel text={node.label} fontSize={13} />
                  </div>
                </foreignObject>
                {node.channels && (
                  <foreignObject
                    x={cx - Math.max(w / 2 + 56, 96)}
                    y={top + h + 2}
                    width={Math.max(w + 112, 192)}
                    height={26}
                    style={{ overflow: 'visible' }}
                  >
                    <div className="w-full h-full flex items-center justify-center">
                      <LatexLabel
                        text={`$${node.channels.replace(/^\$+|\$+$/g, '')}$`}
                        fontSize={9.5}
                        color="#475569"
                      />
                    </div>
                  </foreignObject>
                )}
                {/* Dedicated 3D Depth Handle when Cuboid is Selected */}
                {isSelected && (
                  <circle
                    cx={left + w + dx}
                    cy={top + dy}
                    r={5}
                    fill="#F59E0B"
                    stroke="#FFFFFF"
                    strokeWidth={1.5}
                    className="cursor-ew-resize"
                    data-export-ignore="true"
                    onPointerDown={(e) =>
                      handleStartNodeResize(e, node, 'cuboid_depth')
                    }
                  >
                    <title>拖拽此琥珀色控制点可实时调节 3D 特征图厚度 (depth)</title>
                  </circle>
                )}
              </g>
            );
          })()}

        {/* 3. OPERATOR CIRCLE (\oplus / \otimes) */}
        {node.subtype === 'op_circle' && (
          <g>
            <circle
              cx={cx}
              cy={cy}
              r={Math.min(w, h) / 2}
              fill={fillHex}
              stroke={isSelected ? '#2563EB' : strokeHex}
              strokeWidth={isSelected ? 1.8 : strokeW}
              data-orig-stroke={strokeHex}
              data-orig-stroke-width={strokeW}
            />
            <foreignObject
              x={left}
              y={top}
              width={w}
              height={h}
              style={{ overflow: 'visible' }}
            >
              <div className="w-full h-full flex items-center justify-center">
                <LatexLabel text={node.label} fontSize={14} />
              </div>
            </foreignObject>
          </g>
        )}

        {/* 4. SUBFIGURE CAPTION `(a) ...` / `(b) ...` */}
        {node.subtype === 'caption' && (
          <g>
            <rect
              x={left}
              y={top}
              width={w}
              height={h}
              rx={3}
              fill="none"
              stroke={isSelected ? '#2563EB' : 'none'}
              strokeWidth={1.2}
              strokeDasharray="3 2"
              className="group-hover:stroke-blue-300"
              data-export-ignore="true"
            />
            <foreignObject
              x={cx - Math.max(w / 2 + 40, 180)}
              y={cy - Math.max(h / 2 + 10, 22)}
              width={Math.max(w + 80, 360)}
              height={Math.max(h + 20, 44)}
              style={{ overflow: 'visible' }}
            >
              <div
                className="w-full h-full flex items-center justify-center px-2"
                style={{ fontFamily: theme.fontFamily }}
              >
                <LatexLabel
                  text={node.label}
                  sublabel={node.sublabel}
                  fontSize={12.5}
                  color="#0F172A"
                />
              </div>
            </foreignObject>
          </g>
        )}

        {/* 5. STANDALONE MATH FORMULA */}
        {node.subtype === 'math' && (
          <g>
            <rect
              x={left - 4}
              y={top - 2}
              width={w + 8}
              height={h + 4}
              rx={3}
              fill="none"
              stroke={isSelected ? '#2563EB' : 'none'}
              strokeWidth={1.2}
              strokeDasharray="3 2"
              className="group-hover:stroke-blue-300"
              data-export-ignore="true"
            />
            <foreignObject
              x={cx - Math.max(w / 2 + 120, 220)}
              y={cy - Math.max(h / 2 + 24, 40)}
              width={Math.max(w + 240, 440)}
              height={Math.max(h + 48, 80)}
              style={{ overflow: 'visible' }}
            >
              <div className="w-full h-full flex items-center justify-center">
                <LatexLabel
                  text={node.label}
                  sublabel={node.sublabel}
                  fontSize={13}
                />
              </div>
            </foreignObject>
          </g>
        )}

        {/* 6. STANDARD DL BLOCK / MHA / ADDNORM / CONV */}
        {(node.subtype === 'block' ||
          node.subtype === 'mha' ||
          node.subtype === 'addnorm' ||
          node.subtype === 'conv') && (
          <g>
            <rect
              x={left}
              y={top}
              width={w}
              height={h}
              rx={rx}
              fill={fillHex}
              stroke={isSelected ? '#2563EB' : strokeHex}
              strokeWidth={isSelected ? 1.8 : strokeW}
              data-orig-stroke={strokeHex}
              data-orig-stroke-width={strokeW}
              strokeDasharray={node.dashed ? '4 2.5' : undefined}
            />
            {node.subtype === 'mha' && (
              <rect
                x={left + 2.5}
                y={top + 2.5}
                width={w - 5}
                height={h - 5}
                rx={Math.max(1, rx - 1)}
                fill="none"
                stroke={strokeHex}
                strokeOpacity={0.28}
                strokeWidth={0.75}
              />
            )}
            <foreignObject
              x={left + 4}
              y={top + 2}
              width={w - 8}
              height={h - 4}
              style={{ overflow: 'visible' }}
            >
              <div
                className="w-full h-full flex items-center justify-center px-1"
                style={{ fontFamily: theme.fontFamily }}
              >
                <LatexLabel
                  text={node.label}
                  sublabel={node.sublabel}
                  fontSize={node.subtype === 'addnorm' ? 11.5 : 12.5}
                />
              </div>
            </foreignObject>
          </g>
        )}

        {/* 7. PROJECT IMAGE ASSET NODE (\includegraphics) */}
        {node.subtype === 'image' &&
          (() => {
            const cleanPath = (node.imagePath || '').replace(/\\/g, '/').trim();
            const dataUrl = cleanPath ? assetDataUrls[cleanPath] : undefined;
            return (
              <g>
                <rect
                  x={left}
                  y={top}
                  width={w}
                  height={h}
                  rx={rx}
                  fill="#F8FAFC"
                  stroke={isSelected ? '#2563EB' : strokeHex}
                  strokeWidth={isSelected ? 1.8 : strokeW}
                  data-orig-stroke={strokeHex}
                  data-orig-stroke-width={strokeW}
                  strokeDasharray={node.dashed ? '4 2.5' : undefined}
                />
                {dataUrl ? (
                  <image
                    x={left + 1}
                    y={top + 1}
                    width={Math.max(2, w - 2)}
                    height={Math.max(2, h - 2)}
                    href={dataUrl}
                    preserveAspectRatio="none"
                  />
                ) : (
                  <g>
                    <rect
                      x={left + 4}
                      y={top + 4}
                      width={Math.max(8, w - 8)}
                      height={Math.max(8, h - 8)}
                      rx={Math.max(1, rx - 1)}
                      fill="#F1F5F9"
                      stroke="#CBD5E1"
                      strokeWidth={0.8}
                      strokeDasharray="3 2"
                    />
                    <g
                      transform={`translate(${cx}, ${cy - 8})`}
                      fill="none"
                      stroke="#64748B"
                      strokeWidth={1.3}
                    >
                      <rect x={-11} y={-9} width={22} height={16} rx={2} />
                      <circle cx={-5} cy={-4} r={1.8} fill="#64748B" />
                      <path d="M -9 5 L -3 -1 L 2 3 L 5 0 L 9 5" />
                    </g>
                    <text
                      x={cx}
                      y={cy + 12}
                      textAnchor="middle"
                      fontSize={9.5}
                      fontWeight={600}
                      fill="#334155"
                      fontFamily="sans-serif"
                    >
                      {node.label || 'Image'}
                    </text>
                    <text
                      x={cx}
                      y={cy + 23}
                      textAnchor="middle"
                      fontSize={8}
                      fill="#64748B"
                      fontFamily="monospace"
                    >
                      {cleanPath || '\\includegraphics'}
                    </text>
                  </g>
                )}
                {node.sublabel && (
                  <foreignObject
                    x={cx - Math.max(w / 2 + 30, 120)}
                    y={top + h + 2}
                    width={Math.max(w + 60, 240)}
                    height={26}
                    style={{ overflow: 'visible' }}
                  >
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ fontFamily: theme.fontFamily }}
                    >
                      <LatexLabel
                        text={node.sublabel}
                        fontSize={10.5}
                        color="#334155"
                      />
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })()}

        {/* Selection Bounding Frame + 8-Way Resize Handles */}
        {isSelected && (
          <g data-export-ignore="true">
            <rect
              x={left - 3}
              y={top - 3}
              width={w + 6}
              height={h + 6}
              rx={rx + 2}
              fill="none"
              stroke="#2563EB"
              strokeWidth={1.1}
              strokeDasharray="3 2"
              pointerEvents="none"
            />
            {/* Node ID & TikZ coordinate badge */}
            <g transform={`translate(${left}, ${top - 18})`}>
              <rect
                x={0}
                y={0}
                width={Math.max(70, node.id.length * 6.5 + 52)}
                height={15}
                rx={2.5}
                fill="#1E293B"
              />
              <text
                x={5}
                y={10.5}
                fontSize={9}
                fill="#FFFFFF"
                fontFamily="monospace"
              >
                ({node.id}) {node.x.toFixed(1)},{node.y.toFixed(1)}
              </text>
            </g>

            {/* 8-Way Resize Handles (N, S, E, W, NE, NW, SE, SW) */}
            {(
              [
                { dir: 'nw', hx: left - 3, hy: top - 3, cursor: 'nwse-resize' },
                { dir: 'n', hx: cx, hy: top - 3, cursor: 'ns-resize' },
                { dir: 'ne', hx: left + w + 3, hy: top - 3, cursor: 'nesw-resize' },
                { dir: 'e', hx: left + w + 3, hy: cy, cursor: 'ew-resize' },
                { dir: 'se', hx: left + w + 3, hy: top + h + 3, cursor: 'nwse-resize' },
                { dir: 's', hx: cx, hy: top + h + 3, cursor: 'ns-resize' },
                { dir: 'sw', hx: left - 3, hy: top + h + 3, cursor: 'nesw-resize' },
                { dir: 'w', hx: left - 3, hy: cy, cursor: 'ew-resize' },
              ] as Array<{
                dir: ResizeHandleDir;
                hx: number;
                hy: number;
                cursor: string;
              }>
            ).map((hItem) => (
              <rect
                key={hItem.dir}
                x={hItem.hx - 3.5}
                y={hItem.hy - 3.5}
                width={7}
                height={7}
                rx={1.5}
                fill="#FFFFFF"
                stroke="#2563EB"
                strokeWidth={1.5}
                style={{ cursor: hItem.cursor }}
                onPointerDown={(e) => handleStartNodeResize(e, node, hItem.dir)}
              >
                <title>拖拽直接缩放图元宽高</title>
              </rect>
            ))}
          </g>
        )}

        {/* 4 Interactive Connection Ports visible only in edge/residual/connect modes */}
        {(activeTool === 'edge' ||
          activeTool === 'residual' ||
          dragState?.mode === 'connect') &&
          node.subtype !== 'container' &&
          node.subtype !== 'caption' &&
          [
            { key: 'north', px: cx, py: top },
            { key: 'south', px: cx, py: top + h },
            { key: 'east', px: left + w, py: cy },
            { key: 'west', px: left, py: cy },
          ].map((port) => (
            <circle
              key={port.key}
              cx={port.px}
              cy={port.py}
              r={4}
              fill="#FFFFFF"
              stroke="#2563EB"
              strokeWidth={1.5}
              data-export-ignore="true"
              className="opacity-80 group-hover:opacity-100 hover:scale-125 transition-opacity cursor-crosshair"
              onPointerDown={(e) => handlePortPointerDown(e, node.id)}
            >
              <title>拖拽此锚点连线至其他节点</title>
            </circle>
          ))}
      </g>
    );
  };

  // Tavotto-style bounded Paper Artboard geometry in SVG coordinates:
  // Top-left anchored at (-1.0 cm, 8.5 cm) so resizing width/height expands rightward & downward cleanly
  const pageLeft = originX - 1.0 * CM_TO_PX;
  const pageTop = originY - 8.5 * CM_TO_PX;
  const pageW = canvasWidthCm * CM_TO_PX;
  const pageH = canvasHeightCm * CM_TO_PX;
  const pagePresetTag =
    Math.abs(canvasWidthCm - 8.5) < 0.2 && Math.abs(canvasHeightCm - 6.5) < 0.2
      ? '单栏插图'
      : Math.abs(canvasWidthCm - 16.0) < 0.2 &&
          Math.abs(canvasHeightCm - 10.0) < 0.2
        ? '双栏跨栏'
        : Math.abs(canvasWidthCm - 20.0) < 0.2 &&
            Math.abs(canvasHeightCm - 12.0) < 0.2
          ? '宽幅海报'
          : '可调画幅';

  return (
    <div
      className="relative flex-1 h-full bg-slate-200/80 overflow-hidden select-none flex flex-col"
      onKeyDown={(e) => {
        if (inlineEditor) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          deleteSelectedElements();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          duplicateSelectedElements();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          setSelectedIds(parsedDoc.elements.map((el) => el.id));
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setSelectedIds([]);
          setActiveTool('select');
          setInlineEditor(null);
        } else if (
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
        ) {
          e.preventDefault();
          const baseStep = useSettingsStore.getState().nudgeStepCm || 0.25;
          const step = e.shiftKey ? baseStep * 2 : baseStep;
          if (e.key === 'ArrowUp') nudgeSelectedElements(0, step);
          if (e.key === 'ArrowDown') nudgeSelectedElements(0, -step);
          if (e.key === 'ArrowLeft') nudgeSelectedElements(-step, 0);
          if (e.key === 'ArrowRight') nudgeSelectedElements(step, 0);
        }
      }}
      tabIndex={0}
    >
      {/* Main Interactive Vector Canvas (Tavotto Studio Stage + Bounded Paper Artboard) */}
      <div className="relative flex-1 w-full h-full flex">
        {tikzCode.trim() === EMPTY_TIKZ_CODE.trim() && activeTool === 'select' && previewMode === 'interactive' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-4">
            <div className="max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-sm pointer-events-auto">
              <h2 className="text-base font-semibold text-slate-800">从你的想法开始绘图</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">向 AI 描述模块、关系与数据，按需求生成新图。模板只是构图参考，也可主动选择以快速出图。</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button onClick={() => setAgentPanelCollapsed(false)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer">向 AI 描述需求</button>
                <button onClick={() => setLeftTab('library')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">浏览内置模板</button>
              </div>
            </div>
          </div>
        )}
        <svg
          id="agentikz-canvas-svg"
          ref={svgRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(e) => {
            e.preventDefault();
            const relPath = e.dataTransfer.getData(
              'application/x-agentikz-asset'
            );
            if (relPath) {
              const pt = clientToTikzCm(e.clientX, e.clientY);
              const snapX = snapToGrid ? Math.round(pt.x * 5) / 5 : pt.x;
              const snapY = snapToGrid ? Math.round(pt.y * 5) / 5 : pt.y;
              addImageAssetToCanvas(relPath, snapX, snapY);
            }
          }}
          className={requiresExactPreview ? 'hidden' : 'w-full h-full min-w-0 bg-slate-200/80'}
          style={{
            cursor:
              dragState?.mode === 'pan'
                ? 'grabbing'
                : activeTool !== 'select'
                  ? 'crosshair'
                  : 'default',
          }}
        >
          <defs>
            <pattern
              id="tikz-subgrid"
              width={CM_TO_PX / 4}
              height={CM_TO_PX / 4}
              patternUnits="userSpaceOnUse"
              data-export-ignore="true"
            >
              <circle cx={1} cy={1} r={0.65} fill="#E2E8F0" />
            </pattern>
            <pattern
              id="tikz-grid"
              width={CM_TO_PX}
              height={CM_TO_PX}
              patternUnits="userSpaceOnUse"
              patternTransform={`translate(${originX % CM_TO_PX}, ${originY % CM_TO_PX})`}
              data-export-ignore="true"
            >
              <rect
                width={CM_TO_PX}
                height={CM_TO_PX}
                fill="url(#tikz-subgrid)"
              />
              <path
                d={`M ${CM_TO_PX} 0 L 0 0 0 ${CM_TO_PX}`}
                fill="none"
                stroke="#F1F5F9"
                strokeWidth="1"
              />
            </pattern>

            <clipPath id="tikz-page-clip" data-export-ignore="true">
              <rect
                x={pageLeft}
                y={pageTop}
                width={pageW}
                height={pageH}
                rx={4}
              />
            </clipPath>

            <filter
              id="tikz-page-shadow"
              x="-8%"
              y="-8%"
              width="120%"
              height="120%"
              data-export-ignore="true"
            >
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="8"
                floodColor="#0F172A"
                floodOpacity="0.09"
              />
            </filter>

            <marker
              id="tikz-arrow"
              viewBox="0 0 10 8"
              refX="8.2"
              refY="4"
              markerWidth="6.2"
              markerHeight="5.2"
              orient="auto-start-reverse"
            >
              <path d="M 0 0.6 L 9.5 4 L 0 7.4 L 2.2 4 Z" fill="#334155" />
            </marker>
            <marker
              id="tikz-arrow-selected"
              viewBox="0 0 10 8"
              refX="8.2"
              refY="4"
              markerWidth="6.5"
              markerHeight="5.5"
              orient="auto-start-reverse"
              data-export-ignore="true"
            >
              <path d="M 0 0.6 L 9.5 4 L 0 7.4 L 2.2 4 Z" fill="#2563EB" />
            </marker>
          </defs>

          {/* Studio Desk Backdrop */}
          <rect
            width="100%"
            height="100%"
            fill="#E2E8F0"
            data-export-ignore="true"
            data-canvas-ui="true"
          />

          <g id="agentikz-scene-root" transform={`scale(${zoom})`}>
            {/* Bounded Paper Artboard Frame & Clipped Grid */}
            <g data-export-ignore="true" data-canvas-ui="true">
              <rect
                x={pageLeft}
                y={pageTop}
                width={pageW}
                height={pageH}
                rx={4}
                fill="#FFFFFF"
                stroke={
                  dragState?.mode === 'resize_canvas' ? '#2563EB' : '#CBD5E1'
                }
                strokeWidth={dragState?.mode === 'resize_canvas' ? 2 : 1.5}
                filter="url(#tikz-page-shadow)"
              />

              {showGrid && (
                <g clipPath="url(#tikz-page-clip)">
                  <rect
                    x={pageLeft}
                    y={pageTop}
                    width={pageW}
                    height={pageH}
                    fill="url(#tikz-grid)"
                  />
                  <g opacity={0.45} pointerEvents="none">
                    <line
                      x1={originX - 10}
                      y1={originY}
                      x2={originX + 10}
                      y2={originY}
                      stroke="#94A3B8"
                      strokeWidth={1}
                    />
                    <line
                      x1={originX}
                      y1={originY - 10}
                      x2={originX}
                      y2={originY + 10}
                      stroke="#94A3B8"
                      strokeWidth={1}
                    />
                    <text
                      x={originX + 4}
                      y={originY + 12}
                      fontSize={8.5}
                      fill="#94A3B8"
                      fontFamily="monospace"
                    >
                      (0,0)
                    </text>
                  </g>
                </g>
              )}

              {/* Tavotto-style Top-Left Artboard Header Badge + Quick Size Preset Pills */}
              <g transform={`translate(${pageLeft}, ${pageTop - 26})`}>
                <rect
                  x={0}
                  y={0}
                  width={238}
                  height={20}
                  rx={4}
                  fill="#FFFFFF"
                  fillOpacity={0.92}
                  stroke="#CBD5E1"
                  strokeWidth={1}
                />
                <text
                  x={8}
                  y={13.5}
                  fontSize={9.5}
                  fontWeight={600}
                  fill="#334155"
                  fontFamily="sans-serif"
                >
                  📄 {activeCanvasName.slice(0, 14)} ·{' '}
                  {canvasWidthCm.toFixed(1)}×{canvasHeightCm.toFixed(1)} cm (
                  {pagePresetTag})
                </text>

                {/* Quick Preset Pills on Artboard Header */}
                {[
                  { label: '单栏 8.5×6.5', w: 8.5, h: 6.5, xOff: 244, wPx: 72 },
                  {
                    label: '双栏 16×10',
                    w: 16.0,
                    h: 10.0,
                    xOff: 320,
                    wPx: 66,
                  },
                  {
                    label: '宽幅 20×12',
                    w: 20.0,
                    h: 12.0,
                    xOff: 390,
                    wPx: 66,
                  },
                ].map((preset) => {
                  const isActive =
                    Math.abs(canvasWidthCm - preset.w) < 0.15 &&
                    Math.abs(canvasHeightCm - preset.h) < 0.15;
                  return (
                    <g
                      key={preset.label}
                      transform={`translate(${preset.xOff}, 0)`}
                      className="cursor-pointer"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCanvasSizeCm(preset.w, preset.h);
                      }}
                    >
                      <rect
                        x={0}
                        y={0}
                        width={preset.wPx}
                        height={20}
                        rx={4}
                        fill={isActive ? '#2563EB' : '#FFFFFF'}
                        fillOpacity={isActive ? 1 : 0.85}
                        stroke={isActive ? '#1D4ED8' : '#CBD5E1'}
                        strokeWidth={1}
                      />
                      <text
                        x={preset.wPx / 2}
                        y={13.5}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={500}
                        fill={isActive ? '#FFFFFF' : '#475569'}
                        fontFamily="sans-serif"
                      >
                        {preset.label}
                      </text>
                    </g>
                  );
                })}

                {/* Fit to Content Pill */}
                <g
                  transform="translate(460, 0)"
                  className="cursor-pointer"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    fitCanvasToContent();
                  }}
                >
                  <rect
                    x={0}
                    y={0}
                    width={76}
                    height={20}
                    rx={4}
                    fill="#F8FAFC"
                    stroke="#94A3B8"
                    strokeWidth={1}
                  />
                  <text
                    x={38}
                    y={13.5}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill="#0F172A"
                    fontFamily="sans-serif"
                  >
                    自适应 (Fit)
                  </text>
                </g>
              </g>

              {/* East (Right Edge) Page Resize Handle */}
              <g
                transform={`translate(${pageLeft + pageW}, ${pageTop + pageH / 2})`}
                className="cursor-ew-resize"
                onPointerDown={(e) => handleStartCanvasResize(e, 'e')}
              >
                <title>左右拖拽直接调节画布纸张宽度 (cm)</title>
                <rect
                  x={-3.5}
                  y={-22}
                  width={7}
                  height={44}
                  rx={3.5}
                  fill="#FFFFFF"
                  stroke="#64748B"
                  strokeWidth={1.2}
                />
                <line
                  x1={0}
                  y1={-10}
                  x2={0}
                  y2={10}
                  stroke="#94A3B8"
                  strokeWidth={1.2}
                />
              </g>

              {/* South (Bottom Edge) Page Resize Handle */}
              <g
                transform={`translate(${pageLeft + pageW / 2}, ${pageTop + pageH})`}
                className="cursor-ns-resize"
                onPointerDown={(e) => handleStartCanvasResize(e, 's')}
              >
                <title>上下拖拽直接调节画布纸张高度 (cm)</title>
                <rect
                  x={-22}
                  y={-3.5}
                  width={44}
                  height={7}
                  rx={3.5}
                  fill="#FFFFFF"
                  stroke="#64748B"
                  strokeWidth={1.2}
                />
                <line
                  x1={-10}
                  y1={0}
                  x2={10}
                  y2={0}
                  stroke="#94A3B8"
                  strokeWidth={1.2}
                />
              </g>

              {/* South-East (Bottom-Right Corner) Page Resize Handle */}
              <g
                transform={`translate(${pageLeft + pageW}, ${pageTop + pageH})`}
                className="cursor-nwse-resize"
                onPointerDown={(e) => handleStartCanvasResize(e, 'se')}
              >
                <title>拖拽右下角同时调节画布宽高 (cm)</title>
                <rect
                  x={-5.5}
                  y={-5.5}
                  width={11}
                  height={11}
                  rx={2.5}
                  fill="#2563EB"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
              </g>
            </g>

            {alignmentGuides.xCm !== undefined && (
              <line
                x1={originX + alignmentGuides.xCm * CM_TO_PX}
                y1={0}
                x2={originX + alignmentGuides.xCm * CM_TO_PX}
                y2={2000}
                stroke="#3B82F6"
                strokeWidth={1}
                strokeDasharray="4 3"
                data-export-ignore="true"
              />
            )}
            {alignmentGuides.yCm !== undefined && (
              <line
                x1={0}
                y1={originY - alignmentGuides.yCm * CM_TO_PX}
                x2={2400}
                y2={originY - alignmentGuides.yCm * CM_TO_PX}
                stroke="#3B82F6"
                strokeWidth={1}
                strokeDasharray="4 3"
                data-export-ignore="true"
              />
            )}

            {/* Publication Column Width Reference Frame (89mm Single / 183mm Double) */}
            {columnGuideMode !== 'none' &&
              (() => {
                const colWidthCm =
                  (columnGuideMode === 'single'
                    ? theme.columnWidthMm.single
                    : theme.columnWidthMm.double) / 10;
                const colWidthPx = colWidthCm * CM_TO_PX;
                const guideLeft = originX - 0.5 * CM_TO_PX;
                const guideRight = guideLeft + colWidthPx;
                return (
                  <g data-export-ignore="true" pointerEvents="none">
                    <rect
                      x={guideLeft}
                      y={pageTop + 8}
                      width={colWidthPx}
                      height={pageH - 16}
                      fill="none"
                      stroke="#E11D48"
                      strokeWidth={1.1}
                      strokeDasharray="6 4"
                      opacity={0.7}
                    />
                    <rect
                      x={guideRight - 142}
                      y={pageTop + 12}
                      width={138}
                      height={17}
                      rx={3}
                      fill="#FFF1F2"
                      stroke="#FECDD3"
                      strokeWidth={0.8}
                    />
                    <text
                      x={guideRight - 73}
                      y={pageTop + 23.5}
                      textAnchor="middle"
                      fontSize={8.5}
                      fontWeight={600}
                      fill="#BE123C"
                      fontFamily="sans-serif"
                    >
                      {theme.venueBadge}{' '}
                      {columnGuideMode === 'single' ? '单栏' : '双栏'}参考线 (
                      {Math.round(colWidthCm * 10)}mm)
                    </text>
                  </g>
                );
              })()}

            {/* Multi-Panel Pragma Region Guides (% @panel a role=mechanism ...) */}
            {parsedDoc.panels &&
              parsedDoc.panels.length > 0 &&
              parsedDoc.panels.map((panel, pIdx) => {
                const minX = panel.bbox ? panel.bbox[0] : pIdx * 6.5;
                const minY = panel.bbox ? panel.bbox[1] : 0;
                const maxX = panel.bbox ? panel.bbox[2] : minX + 5.8;
                const maxY = panel.bbox ? panel.bbox[3] : minY + 4.5;
                const px = originX + minX * CM_TO_PX;
                const py = originY - maxY * CM_TO_PX;
                const pw = Math.max(1.0, maxX - minX) * CM_TO_PX;
                const ph = Math.max(1.0, maxY - minY) * CM_TO_PX;
                const isHeroPanel =
                  panel.role === 'mechanism' ||
                  panel.role === 'primary_quant';
                return (
                  <g
                    key={`panel_${panel.id}`}
                    data-export-ignore="true"
                    pointerEvents="none"
                  >
                    <rect
                      x={px}
                      y={py}
                      width={pw}
                      height={ph}
                      rx={5}
                      fill="none"
                      stroke={isHeroPanel ? '#D97706' : '#64748B'}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      opacity={0.45}
                    />
                    <text
                      x={px + 6}
                      y={py + 14}
                      fontSize={12}
                      fontWeight={700}
                      fill="#0F172A"
                      fontFamily={theme.fontFamily}
                    >
                      {panel.id}
                    </text>
                    <text
                      x={px + 20}
                      y={py + 13}
                      fontSize={8.5}
                      fontWeight={600}
                      fill={isHeroPanel ? '#B45309' : '#475569'}
                      fontFamily="sans-serif"
                    >
                      [{panel.role.toUpperCase()}] {panel.title || ''}
                    </text>
                  </g>
                );
              })}

            {/* Layer 1: Background Stage Containers */}
            {sortedNodes
              .filter((n) => n.subtype === 'container')
              .map(renderNode)}

            {/* Layer 2: Edges & Residual Skip Connections */}
            {parsedDoc.edges.map(renderEdge)}

            {/* Layer 3: Foreground Neural Blocks, 3D Cubes, Operators, Sub-captions, Math */}
            {sortedNodes
              .filter((n) => n.subtype !== 'container')
              .map(renderNode)}

            {/* Layer 4: PGFPlots Scientific Data Charts */}
            {parsedDoc.charts.map((chart) => (
              <PgfChartRenderer
                key={chart.id}
                chart={chart}
                activeThemeId={activeThemeId}
                cmToPx={CM_TO_PX}
                originX={originX}
                originY={originY}
                zoom={zoom}
                selected={selectedIds.includes(chart.id)}
                onPointerDown={handleElementPointerDown}
                onMoveLegend={moveChartLegend}
                onUpdateChart={updateChartById}
                onEditSubTarget={(chartId, target) =>
                  setInlineEditor({
                    type: 'chart_sub',
                    chartId,
                    target,
                    value: target.currentText,
                  })
                }
              />
            ))}

            {dragState?.mode === 'connect' &&
              dragState.connectFromId &&
              dragState.connectCurrentPt &&
              (() => {
                const src = nodesById.get(dragState.connectFromId);
                if (!src) return null;
                const sx = originX + src.x * CM_TO_PX;
                const sy = originY - src.y * CM_TO_PX;
                return (
                  <line
                    x1={sx}
                    y1={sy}
                    x2={dragState.connectCurrentPt.x}
                    y2={dragState.connectCurrentPt.y}
                    stroke="#2563EB"
                    strokeWidth={1.6}
                    strokeDasharray="4 2"
                    markerEnd="url(#tikz-arrow-selected)"
                    data-export-ignore="true"
                  />
                );
              })()}
          </g>
        </svg>

        {/* Optional TeX Live Exact Preview Overlay or Split View */}
        {(requiresExactPreview || previewMode === 'tex_overlay' || previewMode === 'tex_split') && (
          <div
            className={`${
              requiresExactPreview
                ? 'w-full min-w-0 bg-slate-50/40'
                : previewMode === 'tex_split'
                ? 'w-1/2 shrink-0 border-l border-slate-200 bg-slate-50/40'
                : 'absolute inset-0 bg-white/85 pointer-events-none'
            } flex flex-col items-center p-4 overflow-auto`}
          >
            <div className="text-xs font-medium text-slate-600 mb-3 flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-2xs shrink-0">
              <span className={`w-2 h-2 shrink-0 rounded-full ${isCompilingTex ? 'bg-blue-500 animate-pulse' : compiledSvg ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="whitespace-pre-wrap select-text">
                {compiledSvg || !vectorPreview
                  ? texCompilerStatus || '准备 TeX 精确预览…'
                  : isCompilingTex ? 'SVG 兼容预览 · 正在编译 TeX 精确版本…' : 'SVG 兼容预览 · TeX 尚未编译成功'}
              </span>
            </div>
            {compiledSvg ? (
              <div
                className="w-full flex-1 min-h-0 flex items-center justify-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs overflow-auto [&_svg]:m-auto [&_svg]:block [&_svg]:max-w-full [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:h-auto"
                dangerouslySetInnerHTML={{
                  __html: compiledSvg
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ''),
                }}
              />
            ) : vectorPreview ? (
              <div className="w-full flex-1 min-h-0 flex flex-col bg-white p-4 rounded-xl border border-slate-200 overflow-auto">
                <VectorPathPreview scene={vectorPreview} />
                {!isCompilingTex && texCompilerStatus && (
                  <details className="text-xs text-slate-500 shrink-0 mt-3 select-text">
                    <summary className="cursor-pointer">TeX 编译详情</summary>
                    <p className="whitespace-pre-wrap mt-2">{texCompilerStatus}</p>
                    <button onClick={() => openSettings('editor')} className="text-blue-600 cursor-pointer mt-2">配置 TeX Live</button>
                  </details>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-600 text-center max-w-md bg-white border border-slate-200 rounded-lg p-5">
                <p>{requiresExactPreview ? `此图包含${exactPreviewReasons.join('、')}，将通过 TeX 编译显示完整图形。` : '通过本地 TeX 编译显示精确图形。'}</p>
                {!isCompilingTex && (
                  <div className="mt-4 flex justify-center gap-3">
                    <button onClick={() => void compileWorkspaceTexPreview()} className="text-blue-600 cursor-pointer">重新编译</button>
                    <button onClick={() => openSettings('editor')} className="text-blue-600 cursor-pointer">配置 TeX Live</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Publication Figure Caption Bar (`\caption{...}`) — Clickable to Edit */}
      <div className="no-print mx-auto mb-11 max-w-3xl w-[calc(100%-32px)] z-10 pointer-events-auto">
        <div
          onClick={() =>
            setInlineEditor({
              type: 'figure_caption',
              caption: parsedDoc.figureCaption,
              label: parsedDoc.figureLabel,
            })
          }
          className="group bg-white/95 hover:bg-blue-50/30 border border-slate-200 hover:border-blue-400 rounded-lg px-3.5 py-2 shadow-2xs cursor-pointer transition-all flex items-start justify-between gap-3"
          title="点击直接编辑论文整图图注 (\caption) 与引用标签 (\label)"
        >
          <div
            className="text-xs text-slate-800 leading-relaxed flex-1"
            style={{ fontFamily: theme.fontFamily }}
          >
            <strong className="font-bold text-slate-900 mr-1.5">
              Figure 1:
            </strong>
            <span>{parsedDoc.figureCaption || '点击添加图注'}</span>
            {parsedDoc.figureLabel && (
              <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                {parsedDoc.figureLabel}
              </span>
            )}
          </div>
          <span className="text-[11px] text-blue-600 opacity-70 group-hover:opacity-100 flex items-center gap-1 shrink-0 mt-0.5">
            <Edit3 className="w-3 h-3" />
            编辑图注
          </span>
        </div>
      </div>

      {/* Universal Inline Editor Modal (Node / Edge / Chart Title·Axes·Legend / Figure Caption) */}
      {inlineEditor && (
        <div
          className="absolute inset-0 bg-slate-900/15 backdrop-blur-[1px] flex items-center justify-center z-40"
          onClick={() => setInlineEditor(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-xl shadow-lg p-4 w-[420px] space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            {inlineEditor.type === 'node' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    编辑图元文字 / 子图图注 / LaTeX 公式 ({inlineEditor.id})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    支持 $...$ 与 \textbf&#123;...&#125;
                  </span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      主文字 / 图注内容
                    </label>
                    <input
                      type="text"
                      value={inlineEditor.label}
                      onChange={(e) =>
                        setInlineEditor({
                          ...inlineEditor,
                          label: e.target.value,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      副标题 / 第二行公式 (可选)
                    </label>
                    <input
                      type="text"
                      value={inlineEditor.sublabel}
                      onChange={(e) =>
                        setInlineEditor({
                          ...inlineEditor,
                          sublabel: e.target.value,
                        })
                      }
                      placeholder="例如: \text{Softmax}(QK^\top / \sqrt{d_k})V"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  {inlineEditor.isCuboid && (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        3D 特征图维度标注 (Channels C×H×W)
                      </label>
                      <input
                        type="text"
                        value={inlineEditor.channels || ''}
                        onChange={(e) =>
                          setInlineEditor({
                            ...inlineEditor,
                            channels: e.target.value,
                          })
                        }
                        placeholder="例如: 64\times 64\times 256"
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setInlineEditor(null)}
                    className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      updateNodeLabelById(
                        inlineEditor.id,
                        inlineEditor.label,
                        inlineEditor.sublabel
                      );
                      if (inlineEditor.isCuboid && inlineEditor.channels !== undefined) {
                        updateNodeOptionsById(inlineEditor.id, {
                          channels: inlineEditor.channels,
                        });
                      }
                      setInlineEditor(null);
                    }}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                  >
                    保存并同步 TikZ
                  </button>
                </div>
              </>
            )}

            {inlineEditor.type === 'edge' && (
              <>
                <div className="text-xs font-semibold text-slate-800">
                  编辑连线文字 / 公式标注 ({inlineEditor.id})
                </div>
                <input
                  type="text"
                  value={inlineEditor.label}
                  onChange={(e) =>
                    setInlineEditor({ ...inlineEditor, label: e.target.value })
                  }
                  placeholder="例如: Residual 或 \downarrow 2\times (留空则移除标注)"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                  autoFocus
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setInlineEditor(null)}
                    className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      updateEdgeById(inlineEditor.id, {
                        label: inlineEditor.label,
                      });
                      setInlineEditor(null);
                    }}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                  >
                    保存连线标注
                  </button>
                </div>
              </>
            )}

            {inlineEditor.type === 'chart_sub' && (
              <>
                <div className="text-xs font-semibold text-slate-800">
                  {inlineEditor.target.kind === 'title'
                    ? '编辑图表主标题 (PGFPlots title)'
                    : inlineEditor.target.kind === 'xlabel'
                      ? '编辑 X 轴标签 (xlabel)'
                      : inlineEditor.target.kind === 'ylabel'
                        ? '编辑 Y 轴标签 (ylabel)'
                        : inlineEditor.target.kind === 'subcaption'
                          ? '编辑图表底部子图注 (Subcaption)'
                          : '编辑图例项名称 (\\addlegendentry)'}
                </div>
                <input
                  type="text"
                  value={inlineEditor.value}
                  onChange={(e) =>
                    setInlineEditor({ ...inlineEditor, value: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                  autoFocus
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setInlineEditor(null)}
                    className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      const chart = parsedDoc.charts.find(
                        (c) => c.id === inlineEditor.chartId
                      );
                      if (chart) {
                        const t = inlineEditor.target;
                        if (t.kind === 'title') {
                          updateChartById(chart.id, {
                            title: inlineEditor.value,
                          });
                        } else if (t.kind === 'xlabel') {
                          updateChartById(chart.id, {
                            xlabel: inlineEditor.value,
                          });
                        } else if (t.kind === 'ylabel') {
                          updateChartById(chart.id, {
                            ylabel: inlineEditor.value,
                          });
                        } else if (t.kind === 'subcaption') {
                          updateChartById(chart.id, {
                            subcaption: inlineEditor.value,
                          });
                        } else if (t.kind === 'series_name') {
                          const nextSeries = chart.series.map((s, idx) =>
                            idx === t.seriesIndex
                              ? { ...s, name: inlineEditor.value }
                              : s
                          );
                          updateChartById(chart.id, { series: nextSeries });
                        }
                      }
                      setInlineEditor(null);
                    }}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                  >
                    保存并同步 TikZ
                  </button>
                </div>
              </>
            )}

            {inlineEditor.type === 'figure_caption' && (
              <>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <BookOpenText className="w-4 h-4 text-blue-600" />
                  <span>编辑论文整图图注 (\caption) 与引用标签 (\label)</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      整图图注内容 (\caption&#123;...&#125;)
                    </label>
                    <textarea
                      rows={3}
                      value={inlineEditor.caption}
                      onChange={(e) =>
                        setInlineEditor({
                          ...inlineEditor,
                          caption: e.target.value,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      LaTeX 引用标签 (\label&#123;...&#125;)
                    </label>
                    <input
                      type="text"
                      value={inlineEditor.label}
                      onChange={(e) =>
                        setInlineEditor({
                          ...inlineEditor,
                          label: e.target.value,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setInlineEditor(null)}
                    className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      updateFigureCaption(
                        inlineEditor.caption,
                        inlineEditor.label
                      );
                      setInlineEditor(null);
                    }}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                  >
                    更新图注与标签
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bottom Floating Status & Canvas Controls Bar */}
      <div className="no-print absolute bottom-2.5 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 bg-white/95 border border-slate-200/90 shadow-xs rounded-lg px-2 py-1 pointer-events-auto">
          <button
            onClick={() => setZoom(zoom - 0.1)}
            className="p-1 text-slate-600 hover:bg-slate-100 rounded"
            title="缩小画布"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-slate-700 w-11 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(zoom + 0.1)}
            className="p-1 text-slate-600 hover:bg-slate-100 rounded"
            title="放大画布"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 90, y: 510 });
            }}
            className="p-1 text-slate-600 hover:bg-slate-100 rounded"
            title="重置视图 (100%)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3.5 bg-slate-200 mx-0.5" />
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
              showGrid
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
            title="显示/隐藏科研网格"
          >
            <Grid className="w-3 h-3" />
            网格
          </button>
          <button
            onClick={() => setSnapToGrid(!snapToGrid)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
              snapToGrid
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
            title="0.1cm 坐标对齐吸附"
          >
            <Magnet className="w-3 h-3" />
            吸附
          </button>
          <div className="w-px h-3.5 bg-slate-200 mx-0.5" />
          <button
            onClick={() =>
              setColumnGuideMode(
                columnGuideMode === 'none'
                  ? 'single'
                  : columnGuideMode === 'single'
                    ? 'double'
                    : 'none'
              )
            }
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
              columnGuideMode !== 'none'
                ? 'bg-rose-50 text-rose-700 font-medium border border-rose-200'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
            title="切换顶刊单栏 (89mm) / 双栏 (183mm) 版面宽度参考线"
          >
            {columnGuideMode === 'none'
              ? '📏 栏宽参考线'
              : columnGuideMode === 'single'
                ? `📏 单栏 ${Math.round(theme.columnWidthMm.single)}mm`
                : `📏 双栏 ${Math.round(theme.columnWidthMm.double)}mm`}
          </button>
          {selectedIds.length > 0 && (
            <>
              <div className="w-px h-3.5 bg-slate-200 mx-0.5" />
              <button
                onClick={duplicateSelectedElements}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-slate-600 hover:bg-slate-100"
                title="克隆选中图元 (Ctrl+D)"
              >
                <Copy className="w-3 h-3" />
                克隆
              </button>
            </>
          )}
        </div>

        <div className="bg-white/95 border border-slate-200/90 shadow-xs rounded-lg px-2.5 py-1 text-[11px] text-slate-500 flex items-center gap-3 pointer-events-auto">
          <span>支持双击任意文字/轴标签/图注原地编辑 · 8向控点拖拽缩放</span>
          <span className="text-emerald-600 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            AST 无损同步
          </span>
        </div>
      </div>
    </div>
  );
};
