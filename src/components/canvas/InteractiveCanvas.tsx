import React, { useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { TikzEdgeElement, TikzNodeElement } from '../../types/tikz-ast';
import {
  JOURNAL_THEMES,
  ptToPx,
  resolveTikzColor,
} from '../../core/themes/journal-presets';
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
    parsedDoc,
    activeThemeId,
    activeTool,
    selectedIds,
    showGrid,
    snapToGrid,
    zoom,
    pan,
    previewMode,
    compiledSvg,
    setSelectedIds,
    setActiveTool,
    setShowGrid,
    setSnapToGrid,
    setZoom,
    setPan,
    moveElementsByPosition,
    moveChartLegend,
    updateChartById,
    addPrimitiveToCanvas,
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
  } = useWorkspaceStore();

  const svgRef = useRef<SVGSVGElement | null>(null);
  const theme = JOURNAL_THEMES[activeThemeId];

  // Unified drag state: move, pan, connect, resize_node, or route_edge
  const [dragState, setDragState] = useState<{
    mode: 'move' | 'pan' | 'connect' | 'resize_node' | 'route_edge';
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
      const n = parsedDoc.nodes.find((item) => item.id === id);
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
          if (dragState.initialPositions.some((p) => p.id === other.id))
            continue;
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

  const sortedNodes = [...parsedDoc.nodes].sort((a, b) => {
    if (a.subtype === 'container' && b.subtype !== 'container') return -1;
    if (a.subtype !== 'container' && b.subtype === 'container') return 1;
    return 0;
  });

  const renderEdge = (edge: TikzEdgeElement) => {
    const fromNode = parsedDoc.nodes.find((n) => n.id === edge.from);
    const toNode = parsedDoc.nodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) return null;

    const isSelected = selectedIds.includes(edge.id);
    const strokeHex = isSelected
      ? '#2563EB'
      : resolveTikzColor(edge.stroke, 'stroke', activeThemeId);
    const strokeW = ptToPx(edge.lineWidth, 0.7) + (isSelected ? 0.8 : 0);

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
        <title>点击选中连线 · 双击直接编辑连线文字/公式标注</title>
        <path d={pathD} fill="none" stroke="transparent" strokeWidth={12} />
        <path
          d={pathD}
          fill="none"
          stroke={strokeHex}
          strokeWidth={strokeW}
          strokeLinejoin="round"
          strokeDasharray={edge.dashed ? '4 2.5' : undefined}
          markerEnd={
            edge.arrowEnd
              ? isSelected
                ? 'url(#tikz-arrow-selected)'
                : 'url(#tikz-arrow)'
              : undefined
          }
        />
        {edge.label && (
          <g transform={`translate(${labelPos.x}, ${labelPos.y})`}>
            <rect
              x={-36}
              y={-9}
              width={72}
              height={18}
              rx={2}
              fill="#FFFFFF"
              fillOpacity={0.95}
              stroke={isSelected ? '#93C5FD' : 'transparent'}
              strokeWidth={0.8}
            />
            <foreignObject x={-52} y={-10} width={104} height={20}>
              <LatexLabel text={edge.label} fontSize={10} color="#334155" />
            </foreignObject>
          </g>
        )}

        {/* Draggable Route Offset Handle when Edge is Selected */}
        {isSelected &&
          (edge.routeType === 'residual_right' ||
            edge.routeType === 'residual_left' ||
            edge.routeType === 'curved') && (
            <g
              transform={`translate(${labelPos.x}, ${labelPos.y})`}
              onPointerDown={(e) => handleStartEdgeRouteDrag(e, edge)}
              className="cursor-ew-resize"
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
              strokeDasharray="5 3.5"
            />
            <foreignObject x={left + 10} y={top - 11} width={w - 20} height={22}>
              <div className="flex items-center justify-start">
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
                  strokeLinejoin="round"
                />
                <path
                  d={rightFace}
                  fill={strokeHex}
                  fillOpacity={0.18}
                  stroke={isSelected ? '#2563EB' : strokeHex}
                  strokeWidth={strokeW}
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
                />
                <line
                  x1={left + w * 0.33}
                  y1={top}
                  x2={left + w * 0.33}
                  y2={top + h}
                  stroke={strokeHex}
                  strokeOpacity={0.22}
                  strokeWidth={0.7}
                />
                <line
                  x1={left + w * 0.66}
                  y1={top}
                  x2={left + w * 0.66}
                  y2={top + h}
                  stroke={strokeHex}
                  strokeOpacity={0.22}
                  strokeWidth={0.7}
                />
                <foreignObject x={left} y={top} width={w} height={h}>
                  <div className="w-full h-full flex items-center justify-center">
                    <LatexLabel text={node.label} fontSize={13} />
                  </div>
                </foreignObject>
                {node.channels && (
                  <foreignObject
                    x={left - 28}
                    y={top + h + 3}
                    width={w + 56}
                    height={20}
                  >
                    <LatexLabel
                      text={`$${node.channels}$`}
                      fontSize={9.5}
                      color="#475569"
                    />
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
            />
            <foreignObject x={left} y={top} width={w} height={h}>
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
              fill="#FFFFFF"
              fillOpacity={0.9}
              stroke={isSelected ? '#2563EB' : 'transparent'}
              strokeWidth={1.2}
              strokeDasharray="3 2"
              className="group-hover:stroke-blue-300"
            />
            <foreignObject x={left} y={top} width={w} height={h}>
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
              fill="#FFFFFF"
              fillOpacity={0.85}
              stroke={isSelected ? '#2563EB' : 'transparent'}
              strokeWidth={1.2}
              strokeDasharray="3 2"
              className="group-hover:stroke-blue-300"
            />
            <foreignObject x={left - 20} y={top} width={w + 40} height={h}>
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
            <foreignObject x={left + 4} y={top + 2} width={w - 8} height={h - 4}>
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

        {/* Selection Bounding Frame + 8-Way Resize Handles */}
        {isSelected && (
          <g>
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

        {/* 4 Interactive Connection Ports visible on hover */}
        {node.subtype !== 'container' &&
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
              className="opacity-0 group-hover:opacity-100 hover:scale-125 transition-opacity cursor-crosshair"
              onPointerDown={(e) => handlePortPointerDown(e, node.id)}
            >
              <title>拖拽此锚点连线至其他节点</title>
            </circle>
          ))}
      </g>
    );
  };

  return (
    <div
      className="relative flex-1 h-full bg-white overflow-hidden select-none flex flex-col"
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
        } else if (
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
        ) {
          e.preventDefault();
          const step = e.shiftKey ? 0.25 : 0.05;
          if (e.key === 'ArrowUp') nudgeSelectedElements(0, step);
          if (e.key === 'ArrowDown') nudgeSelectedElements(0, -step);
          if (e.key === 'ArrowLeft') nudgeSelectedElements(-step, 0);
          if (e.key === 'ArrowRight') nudgeSelectedElements(step, 0);
        }
      }}
      tabIndex={0}
    >
      {/* Main Interactive Vector Canvas (Pure White #FFFFFF) */}
      <div className="relative flex-1 w-full h-full flex">
        <svg
          id="agenttikz-canvas-svg"
          ref={svgRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-full h-full bg-white"
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
            >
              <circle cx={1} cy={1} r={0.65} fill="#E2E8F0" />
            </pattern>
            <pattern
              id="tikz-grid"
              width={CM_TO_PX}
              height={CM_TO_PX}
              patternUnits="userSpaceOnUse"
              patternTransform={`translate(${originX % CM_TO_PX}, ${originY % CM_TO_PX})`}
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
            >
              <path d="M 0 0.6 L 9.5 4 L 0 7.4 L 2.2 4 Z" fill="#2563EB" />
            </marker>
          </defs>

          <rect width="100%" height="100%" fill="#FFFFFF" />

          <g transform={`scale(${zoom})`}>
            {showGrid && <rect width={9999} height={9999} fill="url(#tikz-grid)" />}
            {showGrid && (
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
            )}

            {alignmentGuides.xCm !== undefined && (
              <line
                x1={originX + alignmentGuides.xCm * CM_TO_PX}
                y1={0}
                x2={originX + alignmentGuides.xCm * CM_TO_PX}
                y2={2000}
                stroke="#3B82F6"
                strokeWidth={1}
                strokeDasharray="4 3"
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
              />
            )}

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
                const src = parsedDoc.nodes.find(
                  (n) => n.id === dragState.connectFromId
                );
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
                  />
                );
              })()}
          </g>
        </svg>

        {/* Optional TeX Live Exact Preview Overlay or Split View */}
        {(previewMode === 'tex_overlay' || previewMode === 'tex_split') && (
          <div
            className={`${
              previewMode === 'tex_split'
                ? 'w-1/2 border-l border-slate-200 bg-white'
                : 'absolute inset-0 bg-white/80 pointer-events-none'
            } flex flex-col items-center justify-center p-4 overflow-auto`}
          >
            <div className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {compiledSvg
                ? '本地 TeX Live 精确编译输出 (standalone + tikz + pgfplots)'
                : '高保真学术论文白纸打印预览 (Vector Print View)'}
            </div>
            {compiledSvg ? (
              <div
                className="bg-white p-4 rounded border border-slate-200 shadow-xs"
                dangerouslySetInnerHTML={{
                  __html: compiledSvg
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ''),
                }}
              />
            ) : (
              <div className="text-xs text-slate-500 text-center max-w-sm bg-slate-50/80 border border-slate-200 rounded-lg p-4">
                当前采用内置矢量 SVG + KaTeX 引擎 1:1 渲染顶刊视觉效果。
              </div>
            )}
          </div>
        )}
      </div>

      {/* Publication Figure Caption Bar (`\caption{...}`) — Clickable to Edit */}
      <div className="mx-auto mb-11 max-w-3xl w-[calc(100%-32px)] z-10 pointer-events-auto">
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
            <span>{parsedDoc.figureCaption}</span>
            <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              \{parsedDoc.figureLabel}
            </span>
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
      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between pointer-events-none">
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
