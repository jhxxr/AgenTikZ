import { useShallow } from 'zustand/react/shallow';
import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { getPaperWorkspaceVersion, useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { JOURNAL_THEMES } from '../../core/themes/journal-presets';
import { generateScientificIllustration } from '../../core/agent/illustration-prompt';
import { EdgeRouteType, PgfChartType } from '../../types/tikz-ast';
import { JournalThemeId } from '../../types/theme';
import {
  BarChart3,
  Box,
  ChevronLeft,
  Code2,
  Copy,
  Grid,
  Image as ImageIcon,
  LayoutTemplate,
  Magnet,
  Maximize2,
  Palette,
  Plus,
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';

function tikzRgb(hex: string) {
  return `{rgb,255:red,${parseInt(hex.slice(1, 3), 16)};green,${parseInt(hex.slice(3, 5), 16)};blue,${parseInt(hex.slice(5, 7), 16)}}`;
}

/**
 * Figma / Excalidraw-inspired Floating Contextual Selection Bar.
 * Surfaces 90% of daily node/edge/chart actions right above the canvas without eating permanent sidebar width.
 */
export const FloatingSelectionBar: React.FC = () => {
  const {
    parsedDoc,
    selectedIds,
    activeThemeId,
    isInspectorDrawerOpen,
    setInspectorDrawerOpen,
    updateNodeLabelById,
    updateNodeOptionsById,
    updateEdgeById,
    updateChartById,
    updatePathById,
    duplicateSelectedElements,
    deleteSelectedElements,
    setLeftTab,
  } = useWorkspaceStore(useShallow((s) => ({
    parsedDoc: s.parsedDoc,
    selectedIds: s.selectedIds,
    activeThemeId: s.activeThemeId,
    isInspectorDrawerOpen: s.isInspectorDrawerOpen,
    setInspectorDrawerOpen: s.setInspectorDrawerOpen,
    updateNodeLabelById: s.updateNodeLabelById,
    updateNodeOptionsById: s.updateNodeOptionsById,
    updateEdgeById: s.updateEdgeById,
    updateChartById: s.updateChartById,
    updatePathById: s.updatePathById,
    duplicateSelectedElements: s.duplicateSelectedElements,
    deleteSelectedElements: s.deleteSelectedElements,
    setLeftTab: s.setLeftTab,
  })));

  const firstId = selectedIds[0];
  const selectedNode = firstId
    ? parsedDoc.nodes.find((n) => n.id === firstId)
    : undefined;
  const selectedEdge = firstId
    ? parsedDoc.edges.find((e) => e.id === firstId)
    : undefined;
  const selectedChart = firstId
    ? parsedDoc.charts.find((c) => c.id === firstId)
    : undefined;

  const selectedPath = parsedDoc.paths?.find((path) => path.id === firstId);
  if (!selectedNode && !selectedEdge && !selectedChart && !selectedPath) return null;

  const theme = JOURNAL_THEMES[activeThemeId];

  return (
    <div
      className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 max-w-[95%] bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-lg px-2.5 py-1.5 flex items-center gap-2 select-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* NODE CONTEXTUAL CONTROLS */}
      {selectedPath && <>
        <span className="font-mono text-[10px] text-slate-600">{selectedPath.id}</span>
        <label className="flex items-center gap-1 whitespace-nowrap text-xs">填充
          <input aria-label="路径填充颜色" type="color" value={selectedPath.geometry.fill === 'none' ? '#ffffff' : selectedPath.geometry.fill}
            onChange={(event) => updatePathById(selectedPath.id, { options: { fill: tikzRgb(event.target.value) } })} className="h-5 w-7 border-0 bg-transparent" />
        </label>
        <label className="flex items-center gap-1 whitespace-nowrap text-xs">线条
          <input aria-label="路径线条颜色" type="color" value={selectedPath.geometry.stroke === 'none' ? '#000000' : selectedPath.geometry.stroke}
            onChange={(event) => updatePathById(selectedPath.id, { options: { draw: tikzRgb(event.target.value) } })} className="h-5 w-7 border-0 bg-transparent" />
        </label>
        <label className="flex items-center gap-1 whitespace-nowrap text-xs">线宽
          <input aria-label="路径线宽" type="number" min="0.1" step="0.1"
            value={Number((selectedPath.geometry.strokeWidth / (52 / 28.45274)).toFixed(2))}
            onChange={(event) => { const value = Number(event.target.value); if (value > 0) updatePathById(selectedPath.id, { options: { 'line width': `${value}pt` } }); }}
            className="w-14 rounded border border-slate-200 px-1 text-xs" />
        </label>
      </>}
      {selectedNode && (
        <>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] font-semibold shrink-0">
            {selectedNode.id}
          </span>

          <input
            type="text"
            value={selectedNode.label}
            disabled={!!selectedNode.macroSource && !selectedNode.labelSpan}
            onChange={(e) =>
              updateNodeLabelById(
                selectedNode.id,
                e.target.value,
                selectedNode.sublabel
              )
            }
            placeholder="节点标签/公式..."
            className="w-32 px-2 py-0.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:border-blue-500"
          />

          {selectedNode.subtype !== 'caption' &&
            selectedNode.subtype !== 'math' &&
            selectedNode.subtype !== 'image' && (
              <>
                <div className="w-px h-4 bg-slate-200 shrink-0" />
                {/* 1-Click Salience Role Pills (Nature 1+1+1 Budget) */}
                <div className="flex items-center gap-1 shrink-0">
                  {[
                    {
                      id: 'neutral' as const,
                      label: '⚪ 基线',
                      fill: theme.colorRoles.neutral.fill,
                      draw: theme.colorRoles.neutral.stroke,
                    },
                    {
                      id: 'signal' as const,
                      label: '📡 主干',
                      fill: theme.colorRoles.signal.fill,
                      draw: theme.colorRoles.signal.stroke,
                    },
                    {
                      id: 'hero' as const,
                      label: '🎯 主证据',
                      fill: theme.colorRoles.hero.fill,
                      draw: theme.colorRoles.hero.stroke,
                    },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        updateNodeOptionsById(selectedNode.id, {
                          role: r.id,
                          fill: r.fill,
                          draw: r.draw,
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                        selectedNode.salienceRole === r.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                      title={`切换为 ${r.label} 显著性层级`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                <div className="w-px h-4 bg-slate-200 shrink-0 hidden sm:block" />

                {/* Quick Theme Swatches */}
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  {theme.palette.slice(0, 6).map((tok) => (
                    <button
                      key={tok.name}
                      type="button"
                      onClick={() =>
                        updateNodeOptionsById(selectedNode.id, {
                          fill: tok.tikzFill,
                          draw: tok.tikzStroke,
                        })
                      }
                      className="w-4 h-4 rounded-full border transition-transform hover:scale-115 cursor-pointer"
                      style={{
                        backgroundColor: tok.fillHex,
                        borderColor: tok.strokeHex,
                        borderWidth: '1.5px',
                      }}
                      title={`${tok.label} (${tok.tikzFill})`}
                    />
                  ))}
                </div>
              </>
            )}

          {selectedNode.subtype === 'image' && (
            <button
              type="button"
              onClick={() => setInspectorDrawerOpen(true)}
              className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Wand2 className="w-3 h-3" />
              <span>AI 透明抠图 / 换图</span>
            </button>
          )}
        </>
      )}

      {/* EDGE CONTEXTUAL CONTROLS */}
      {selectedEdge && (
        <>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] font-semibold shrink-0">
            {selectedEdge.from} → {selectedEdge.to}
          </span>
          <select
            value={selectedEdge.routeType}
            onChange={(e) =>
              updateEdgeById(selectedEdge.id, {
                routeType: e.target.value as EdgeRouteType,
              })
            }
            className="px-1.5 py-0.5 text-xs bg-slate-50 border border-slate-200 rounded-md"
          >
            <option value="direct">直线 (--)</option>
            <option value="vh">正交 (|-)</option>
            <option value="hv">正交 (-|)</option>
            <option value="residual_right">右残差</option>
            <option value="residual_left">左残差</option>
            <option value="curved">弧线</option>
          </select>
          <input
            type="text"
            value={selectedEdge.label || ''}
            onChange={(e) =>
              updateEdgeById(selectedEdge.id, { label: e.target.value })
            }
            placeholder="连线标注..."
            className="w-28 px-2 py-0.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none"
          />
          <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={Boolean(selectedEdge.dashed)}
              onChange={(e) =>
                updateEdgeById(selectedEdge.id, { dashed: e.target.checked })
              }
            />
            <span>虚线</span>
          </label>
        </>
      )}

      {/* CHART CONTEXTUAL CONTROLS */}
      {selectedChart && (
        <>
          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10px] font-semibold shrink-0">
            📊 {selectedChart.id}
          </span>
          <select
            value={selectedChart.chartType}
            onChange={(e) =>
              updateChartById(selectedChart.id, {
                chartType: e.target.value as PgfChartType,
              })
            }
            className="px-1.5 py-0.5 text-xs bg-slate-50 border border-slate-200 rounded-md"
          >
            <option value="line">折线+误差带</option>
            <option value="bar">分组柱状图</option>
            <option value="heatmap">热力图</option>
            <option value="boxplot">箱线图</option>
          </select>
          <input
            type="text"
            value={selectedChart.title}
            onChange={(e) =>
              updateChartById(selectedChart.id, { title: e.target.value })
            }
            placeholder="图表标题..."
            className="w-32 px-2 py-0.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md"
          />
          <button
            type="button"
            onClick={() => setInspectorDrawerOpen(true)}
            className="px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[10.5px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <BarChart3 className="w-3 h-3" />
            <span>编辑数据表 (\addplot)</span>
          </button>
        </>
      )}

      <div className="w-px h-4 bg-slate-200 shrink-0" />

      {/* Common Quick Actions: Duplicate, Code, More Inspector Drawer, Delete */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={duplicateSelectedElements}
          className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
          title="复制 (Ctrl+D)"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setLeftTab('code')}
          className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
          title="定位 TikZ 源码行"
        >
          <Code2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setInspectorDrawerOpen(!isInspectorDrawerOpen)}
          className={`px-1.5 py-0.5 rounded text-[10.5px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
            isInspectorDrawerOpen
              ? 'bg-indigo-100 text-indigo-800'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="展开/收起完整坐标与参数检查器"
        >
          <Sliders className="w-3 h-3" />
          <span className="hidden md:inline">更多</span>
        </button>
        <button
          type="button"
          onClick={deleteSelectedElements}
          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
          title="删除 (Delete)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const PropertyPanel: React.FC = () => {
  const {
    parsedDoc,
    selectedIds,
    setSelectedIds,
    activeThemeId,
    setActiveTheme,
    canvasWidthCm,
    canvasHeightCm,
    setCanvasSizeCm,
    fitCanvasToContent,
    showGrid,
    setShowGrid,
    snapToGrid,
    setSnapToGrid,
    isInspectorDrawerOpen,
    setInspectorDrawerOpen,
    moveElementsByPosition,
    updateNodeLabelById,
    updateNodeOptionsById,
    updateImageNodePathById,
    updateFigureCaption,
    updateEdgeById,
    updateChartById,
    updatePathById,
    updateMacroArgumentById,
    moveChartLegend,
    duplicateSelectedElements,
    deleteSelectedElements,
    setLeftTab,
  } = useWorkspaceStore(useShallow((s) => ({
    parsedDoc: s.parsedDoc,
    selectedIds: s.selectedIds,
    setSelectedIds: s.setSelectedIds,
    activeThemeId: s.activeThemeId,
    setActiveTheme: s.setActiveTheme,
    canvasWidthCm: s.canvasWidthCm,
    canvasHeightCm: s.canvasHeightCm,
    setCanvasSizeCm: s.setCanvasSizeCm,
    fitCanvasToContent: s.fitCanvasToContent,
    showGrid: s.showGrid,
    setShowGrid: s.setShowGrid,
    snapToGrid: s.snapToGrid,
    setSnapToGrid: s.setSnapToGrid,
    isInspectorDrawerOpen: s.isInspectorDrawerOpen,
    setInspectorDrawerOpen: s.setInspectorDrawerOpen,
    moveElementsByPosition: s.moveElementsByPosition,
    updateNodeLabelById: s.updateNodeLabelById,
    updateNodeOptionsById: s.updateNodeOptionsById,
    updateImageNodePathById: s.updateImageNodePathById,
    updateFigureCaption: s.updateFigureCaption,
    updateEdgeById: s.updateEdgeById,
    updateChartById: s.updateChartById,
    updatePathById: s.updatePathById,
    updateMacroArgumentById: s.updateMacroArgumentById,
    moveChartLegend: s.moveChartLegend,
    duplicateSelectedElements: s.duplicateSelectedElements,
    deleteSelectedElements: s.deleteSelectedElements,
    setLeftTab: s.setLeftTab,
  })));

  const { assets, projectDir, registerGeneratedAsset } = useProjectStore(useShallow((s) => ({
    assets: s.assets,
    projectDir: s.projectDir,
    registerGeneratedAsset: s.registerGeneratedAsset,
  })));
  const settings = useSettingsStore();

  const [activeSeriesIdx, setActiveSeriesIdx] = useState(0);
  const [aiImgPrompt, setAiImgPrompt] = useState('');
  const [aiImgAspect, setAiImgAspect] = useState<'1:1' | '4:3' | '16:9'>('1:1');
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [aiImgStatus, setAiImgStatus] = useState<string | null>(null);

  // Reset series tab index when selection changes
  useEffect(() => {
    setActiveSeriesIdx(0);
    setAiImgStatus(null);
  }, [selectedIds[0]]);

  if (!isInspectorDrawerOpen) {
    return null;
  }

  const firstId = selectedIds[0];
  const selectedNode = firstId
    ? parsedDoc.nodes.find((n) => n.id === firstId)
    : undefined;
  const selectedEdge = firstId
    ? parsedDoc.edges.find((e) => e.id === firstId)
    : undefined;
  const selectedChart = firstId
    ? parsedDoc.charts.find((c) => c.id === firstId)
    : undefined;
  const selectedPath = parsedDoc.paths?.find((path) => path.id === firstId);
  const hasSelectedElement = Boolean(
    selectedNode || selectedEdge || selectedChart || selectedPath
  );
  const theme = JOURNAL_THEMES[activeThemeId];

  const canvasPresets = [
    { label: '单栏插图 (8.5 × 6.5 cm)', w: 8.5, h: 6.5 },
    { label: '双栏跨栏 (16.0 × 10.0 cm)', w: 16.0, h: 10.0 },
    { label: '宽幅海报 (20.0 × 12.0 cm)', w: 20.0, h: 12.0 },
    { label: '方形画布 (10.0 × 10.0 cm)', w: 10.0, h: 10.0 },
  ];

  return (
    <aside
      className="absolute top-0 right-0 bottom-0 w-[310px] bg-white/98 backdrop-blur-md border-l border-slate-200/90 shadow-2xl flex flex-col select-none overflow-hidden z-30"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Sticky Top Header Bar */}
      <div className="px-3 py-2.5 border-b border-slate-200/80 bg-slate-50/70 shrink-0 space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 truncate text-xs">
            <Sliders className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate">
              {!hasSelectedElement
                ? '画布与页面属性'
                : selectedNode
                  ? selectedNode.subtype === 'caption'
                    ? `子图图注属性 (${selectedNode.id})`
                    : selectedNode.subtype === 'image'
                      ? `图像素材属性 (${selectedNode.id})`
                      : `节点属性 (${selectedNode.id})`
                  : selectedEdge
                    ? `连线属性 (${selectedEdge.from} → ${selectedEdge.to})`
                    : selectedChart
                      ? `图表与数据编辑 (${selectedChart.id})`
                      : selectedPath ? `路径图元属性 (${selectedPath.id})` : `已选中 ${selectedIds.length} 项`}
            </span>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {hasSelectedElement && (
              <>
                <button
                  onClick={duplicateSelectedElements}
                  className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                  title="克隆复制选中图元 (Ctrl+D)"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setLeftTab('code')}
                  className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                  title="在左侧 TikZ 代码标签页中查看对应源码行"
                >
                  <Code2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={deleteSelectedElements}
                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                  title="删除选中图元 (Delete)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setInspectorDrawerOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded cursor-pointer ml-0.5"
              title="收起属性抽屉"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {hasSelectedElement && (
          <button
            onClick={() => setSelectedIds([])}
            className="w-full py-1 px-2 rounded-md bg-white hover:bg-blue-50/70 text-slate-600 hover:text-blue-700 border border-slate-200/80 hover:border-blue-200 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
            title="取消选中并返回画布与页面属性设置"
          >
            <ChevronLeft className="w-3 h-3" />
            <span>返回画布页面设置</span>
          </button>
        )}
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {/* 0. CANVAS & PAGE INSPECTOR (When no element is selected) */}
        {!hasSelectedElement && (
          <div className="space-y-3.5">
            {/* Section A: Adjustable Fixed Canvas Artboard */}
            <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                  <LayoutTemplate className="w-3.5 h-3.5 text-blue-600" />
                  固定画布尺寸调节 (Artboard)
                </span>
                <span className="text-[10px] text-slate-400">支持边缘拖拽</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">
                    画布宽度 (cm)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="4"
                    max="120"
                    value={canvasWidthCm}
                    onChange={(e) =>
                      setCanvasSizeCm(
                        parseFloat(e.target.value) || 16.0,
                        canvasHeightCm
                      )
                    }
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">
                    画布高度 (cm)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="4"
                    max="120"
                    value={canvasHeightCm}
                    onChange={(e) =>
                      setCanvasSizeCm(
                        canvasWidthCm,
                        parseFloat(e.target.value) || 10.0
                      )
                    }
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 2x2 Quick Preset Buttons */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  常用版面尺寸预设
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {canvasPresets.map((preset) => {
                    const isActive =
                      Math.abs(canvasWidthCm - preset.w) < 0.05 &&
                      Math.abs(canvasHeightCm - preset.h) < 0.05;
                    return (
                      <button
                        key={preset.label}
                        onClick={() => setCanvasSizeCm(preset.w, preset.h)}
                        className={`px-2 py-1.5 rounded-lg border text-[10.5px] font-medium text-left truncate transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-blue-50 border-blue-400 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                        }`}
                        title={preset.label}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fit to Content Button */}
              <button
                onClick={() => {
                  const bounds = document.getElementById('agentikz-canvas-svg')?.getBoundingClientRect();
                  fitCanvasToContent(0.5, bounds ? { width: bounds.width, height: bounds.height } : undefined);
                }}
                className="w-full py-1.5 px-2.5 rounded-lg bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                <span>自适应包裹画布内容 (Fit to Content)</span>
              </button>
            </div>

            {/* Section B: Grid, Snap & Journal Theme */}
            <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2.5">
              <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-blue-600" />
                网格、吸附与期刊主题
              </span>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    showGrid
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>显示网格</span>
                </button>
                <button
                  onClick={() => setSnapToGrid(!snapToGrid)}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    snapToGrid
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Magnet className="w-3.5 h-3.5" />
                  <span>坐标吸附</span>
                </button>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-1">
                  顶刊配色规范 (Journal Theme)
                </label>
                <select
                  value={activeThemeId}
                  onChange={(e) =>
                    setActiveTheme(e.target.value as JournalThemeId)
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  {Object.values(JOURNAL_THEMES).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.venueBadge})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Section C: Figure Caption & Label */}
            <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2">
              <span className="text-[11px] font-semibold text-slate-700 block">
                整图 Caption 与 Label (\caption / \label)
              </span>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">
                  论文图注 (\caption)
                </label>
                <input
                  type="text"
                  value={parsedDoc.figureCaption || ''}
                  placeholder="例如: Overview of our proposed architecture..."
                  onChange={(e) =>
                    updateFigureCaption(
                      e.target.value,
                      parsedDoc.figureLabel || 'fig:overview'
                    )
                  }
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">
                  引用标签 (\label)
                </label>
                <input
                  type="text"
                  value={parsedDoc.figureLabel || ''}
                  placeholder="例如: fig:overview"
                  onChange={(e) =>
                    updateFigureCaption(
                      parsedDoc.figureCaption || '',
                      e.target.value
                    )
                  }
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Section D: Elements & Charts Outline */}
            <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-700">
                  画布元素与图表快速导航
                </span>
                <span className="text-[10px] text-slate-400">
                  点击直接编辑
                </span>
              </div>

              {parsedDoc.charts.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-medium text-slate-400">
                    科研图表 ({parsedDoc.charts.length})
                  </div>
                  {parsedDoc.charts.map((chart) => (
                    <button
                      key={chart.id}
                      onClick={() => setSelectedIds([chart.id])}
                      className="w-full px-2 py-1.5 rounded-lg bg-white hover:bg-blue-50/80 border border-slate-200/90 hover:border-blue-300 flex items-center justify-between gap-1.5 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <BarChart3 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <div className="truncate">
                          <span className="font-mono font-medium text-slate-800">
                            {chart.id}
                          </span>
                          {chart.title && (
                            <span className="text-[10px] text-slate-400 ml-1">
                              · {chart.title}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/80 font-medium shrink-0">
                        图表数据编辑
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {parsedDoc.nodes.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-[10px] font-medium text-slate-400">
                    模块与节点 ({parsedDoc.nodes.length})
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
                    {parsedDoc.nodes.map((node) => (
                      <button
                        key={node.id}
                        onClick={() => setSelectedIds([node.id])}
                        className="w-full px-2 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200/70 hover:border-slate-300 flex items-center justify-between gap-1.5 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {node.subtype === 'image' ? (
                            <ImageIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                          ) : (
                            <Box className="w-3 h-3 text-slate-500 shrink-0" />
                          )}
                          <span className="font-mono text-[11px] text-slate-700 truncate">
                            {node.id}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate">
                            {node.label}
                          </span>
                        </div>
                        <span className="text-[9.5px] text-slate-400 font-mono shrink-0">
                          {node.subtype}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 1. NODE & SUBCAPTION & IMAGE INSPECTOR */}
        {selectedNode?.macroSource && <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="text-xs font-semibold text-slate-700">宏实例参数</div>
          {selectedNode.macroSource.args.map((arg, index) => <label key={`${selectedNode.id}:${index}:${arg.value}`} className="block text-[11px] text-slate-500">
            参数 {index + 1}
            <input aria-label={`宏参数 ${index + 1}`} defaultValue={arg.value}
              onBlur={(event) => { if (event.target.value !== arg.value) updateMacroArgumentById(selectedNode.id, index, event.target.value); }}
              className="mt-1 w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs" />
          </label>)}
          <p className="text-[11px] text-slate-500">移动、缩放、复制只作用于当前宏调用，保留共用宏定义。</p>
        </div>}
        {selectedPath && <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div className="text-xs font-semibold text-slate-700">坐标与尺寸 (cm)</div>
          <div className="grid grid-cols-2 gap-2">
            {(['x', 'y', 'width', 'height'] as const).map((field) => <label key={field} className="text-[11px] text-slate-500">
              {{ x: '中心 X', y: '中心 Y', width: '宽度', height: '高度' }[field]}
              <input aria-label={`路径${field}`} type="number" step="0.05" value={Number(selectedPath[field].toFixed(4))}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  if (field === 'x' || field === 'y') moveElementsByPosition([{ id: selectedPath.id, x: selectedPath.x, y: selectedPath.y, [field]: value }], true);
                  else if (value > 0) updatePathById(selectedPath.id, { [field]: value });
                }} className="mt-1 w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs" />
            </label>)}
          </div>
          <button className="text-xs text-blue-700" onClick={() => updatePathById(selectedPath.id, { options: { fill: 'none' } })}>移除填充</button>
          <p className="text-[11px] text-slate-500">在画布拖动八向控点缩放，蓝色圆点调整路径坐标及曲线控制点。</p>
        </div>}
        {selectedNode && !selectedNode.macroSource && (
          <div className="space-y-2.5">
            {/* Image Asset Inspector (\includegraphics) */}
            {selectedNode.subtype === 'image' && (
              <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-emerald-900 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                    图像素材属性 (\includegraphics)
                  </span>
                  <button
                    type="button"
                    onClick={() => settings.openSettings('illustration')}
                    className="text-[10px] text-emerald-700 hover:underline cursor-pointer"
                  >
                    引擎设置 ({settings.imageGenProvider})
                  </button>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">
                    图像相对路径 (Relative Path)
                  </label>
                  <input
                    type="text"
                    value={selectedNode.imagePath || ''}
                    placeholder="例如: figures/assets/ai/sample_vis.png"
                    onChange={(e) =>
                      updateImageNodePathById(selectedNode.id, e.target.value)
                    }
                    className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">
                    从项目素材库快速切换 ({assets.length} 个文件)
                  </label>
                  <select
                    value={selectedNode.imagePath || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        updateImageNodePathById(selectedNode.id, e.target.value);
                      }
                    }}
                    className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-500 font-mono"
                  >
                    <option value="">-- 选择项目内图像素材 --</option>
                    {assets.map((asset) => (
                      <option
                        key={asset.relativePath}
                        value={asset.relativePath}
                      >
                        {asset.fileName} ({asset.relativePath})
                      </option>
                    ))}
                  </select>
                </div>

                {/* AI Transparent Cutout Generator for this Image Node */}
                <div className="pt-2 border-t border-emerald-200/70 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-semibold text-emerald-950 flex items-center gap-1">
                      <Wand2 className="w-3 h-3 text-emerald-600" />
                      ✨ AI 生成透明抠图插图 (自动去背+紧致裁切)
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={aiImgPrompt}
                    onChange={(e) => setAiImgPrompt(e.target.value)}
                    placeholder="描述科研实物/生物器官/传感器/3D样本（如: 3D isometric microscope lens, clean scientific illustration）..."
                    className="w-full px-2 py-1 text-[11px] bg-white border border-emerald-200 rounded focus:outline-none focus:border-emerald-500 resize-none"
                  />
                  <div className="flex items-center gap-1.5">
                    <select
                      value={aiImgAspect}
                      onChange={(e) =>
                        setAiImgAspect(e.target.value as '1:1' | '4:3' | '16:9')
                      }
                      className="px-1.5 py-1 text-[10.5px] bg-white border border-emerald-200 rounded font-mono"
                    >
                      <option value="1:1">1:1 方形</option>
                      <option value="4:3">4:3 横版</option>
                      <option value="16:9">16:9 宽幅</option>
                    </select>
                    <button
                      type="button"
                      disabled={isGeneratingImg || !aiImgPrompt.trim()}
                      onClick={async () => {
                        if (!aiImgPrompt.trim() || isGeneratingImg) return;
                        setIsGeneratingImg(true);
                        setAiImgStatus('正在调用 AI 绘图引擎并执行边缘泛洪去背与 Alpha 裁切...');
                        const version = getPaperWorkspaceVersion();
                        const canvasFile = useProjectStore.getState().activeCanvasFileName;
                        const originalPath = selectedNode.imagePath;
                        try {
                          const targetRelPath =
                            selectedNode.imagePath &&
                            selectedNode.imagePath.startsWith('figures/assets/ai/')
                              ? selectedNode.imagePath
                              : `figures/assets/ai/${selectedNode.id}.png`;
                          const res = await generateScientificIllustration({
                            provider: settings.imageGenProvider,
                            apiKey: settings.imageGenApiKey,
                            baseUrl: settings.imageGenBaseUrl,
                            model: settings.imageGenModel,
                            subjectPrompt: aiImgPrompt.trim(),
                            themeId: activeThemeId,
                            aspectRatio: aiImgAspect,
                            transparentBackground: settings.imageGenAutoRemoveWhiteBg,
                            autoTrimAlpha: settings.imageGenAutoTrimAlpha,
                            projectDir,
                            targetRelativePath: targetRelPath,
                            proxyUrl: settings.proxyEnabled
                              ? settings.proxyUrl
                              : undefined,
                          });
                          if (getPaperWorkspaceVersion() !== version) return;
                          if (!res.ok || !res.dataUrl) {
                            setAiImgStatus(`❌ 生成失败: ${res.error || '未知错误'}`);
                          } else {
                            const finalRel = await registerGeneratedAsset(
                              res.savedRelativePath || targetRelPath,
                              res.dataUrl,
                              projectDir,
                            );
                            if (getPaperWorkspaceVersion() !== version) return;
                            const liveNode = useWorkspaceStore.getState().parsedDoc.nodes.find((node) => node.id === selectedNode.id);
                            if (useProjectStore.getState().activeCanvasFileName !== canvasFile ||
                                !liveNode || liveNode.subtype !== 'image' || liveNode.imagePath !== originalPath) {
                              setAiImgStatus(`素材已保存至 ${finalRel}；画布或节点已变化，未覆盖当前节点。`);
                              return;
                            }
                            updateImageNodePathById(selectedNode.id, finalRel);
                            setAiImgStatus(
                              `✅ 已生成透明抠图 (${res.width}×${res.height}px) 并绑定至 ${finalRel}`
                            );
                          }
                        } catch (err) {
                          if (getPaperWorkspaceVersion() === version) setAiImgStatus(`❌ 错误: ${String(err)}`);
                        } finally {
                          setIsGeneratingImg(false);
                        }
                      }}
                      className="flex-1 py-1 px-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-[10.5px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>
                        {isGeneratingImg ? '生成并抠图中...' : '生成透明 PNG'}
                      </span>
                    </button>
                  </div>
                  {aiImgStatus && (
                    <div className="text-[10px] text-emerald-900 bg-white/80 px-2 py-1 rounded border border-emerald-200/80 leading-snug">
                      {aiImgStatus}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Label & Formula */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500">
                {selectedNode.subtype === 'caption'
                  ? '子图图注内容 (支持 \\textbf{(a)} 与 $...$ 公式)'
                  : selectedNode.subtype === 'image'
                    ? '图像标题 / 占位说明标签'
                    : '文字 / LaTeX 公式标签 (支持双击画布直接改)'}
              </label>
              <input
                type="text"
                value={selectedNode.label}
                onChange={(e) =>
                  updateNodeLabelById(
                    selectedNode.id,
                    e.target.value,
                    selectedNode.sublabel
                  )
                }
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
              />
              {selectedNode.subtype !== 'caption' && (
                <input
                  type="text"
                  value={selectedNode.sublabel || ''}
                  placeholder={
                    selectedNode.subtype === 'image'
                      ? '底部子图注说明 (如 (a) Input RGB，留空则无)'
                      : '副标题公式 (如 $d_k=64$，留空则单行)'
                  }
                  onChange={(e) =>
                    updateNodeLabelById(
                      selectedNode.id,
                      selectedNode.label,
                      e.target.value
                    )
                  }
                  className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 font-mono mt-1"
                />
              )}
            </div>

            {/* Quick Subcaption Prefix Presets if subtype === 'caption' */}
            {selectedNode.subtype === 'caption' && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  快捷切换子图编号
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {['(a)', '(b)', '(c)', '(d)'].map((num) => (
                    <button
                      key={num}
                      onClick={() => {
                        const stripped = selectedNode.label
                          .replace(/^\s*\\textbf\{\([a-z0-9]+\)\}\s*/i, '')
                          .replace(/^\s*\([a-z0-9]+\)\s*/i, '');
                        updateNodeLabelById(
                          selectedNode.id,
                          `\\textbf{${num}} ${stripped}`,
                          selectedNode.sublabel
                        );
                      }}
                      className="py-1 text-[11px] font-semibold rounded border border-slate-200 hover:border-blue-400 hover:text-blue-600 bg-slate-50"
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Coordinates X, Y & Size W, H */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block">
                  X 坐标 (cm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={selectedNode.x}
                  onChange={(e) =>
                    moveElementsByPosition(
                      [
                        {
                          id: selectedNode.id,
                          x: parseFloat(e.target.value) || 0,
                          y: selectedNode.y,
                        },
                      ],
                      true
                    )
                  }
                  className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">
                  Y 坐标 (cm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={selectedNode.y}
                  onChange={(e) =>
                    moveElementsByPosition(
                      [
                        {
                          id: selectedNode.id,
                          x: selectedNode.x,
                          y: parseFloat(e.target.value) || 0,
                        },
                      ],
                      true
                    )
                  }
                  className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">
                  宽度 (cm · 支持画布拖拽控点)
                </label>
                <input
                  type="number"
                  step="0.2"
                  min="0.5"
                  value={selectedNode.width}
                  onChange={(e) =>
                    updateNodeOptionsById(selectedNode.id, {
                      'minimum width': `${parseFloat(e.target.value) || 2.0}cm`,
                    })
                  }
                  className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">
                  高度 (cm · 支持画布拖拽控点)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.4"
                  value={selectedNode.height}
                  onChange={(e) =>
                    updateNodeOptionsById(selectedNode.id, {
                      'minimum height': `${parseFloat(e.target.value) || 0.8}cm`,
                    })
                  }
                  className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                />
              </div>
            </div>

            {/* 3D Cuboid Specific Controls */}
            {selectedNode.subtype === 'cuboid' && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <div>
                  <label className="text-[10px] text-slate-500 block">
                    3D 通道厚度 (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.2"
                    max="2.2"
                    value={selectedNode.depth || 0.55}
                    onChange={(e) =>
                      updateNodeOptionsById(selectedNode.id, {
                        depth: `${parseFloat(e.target.value) || 0.55}cm`,
                      })
                    }
                    className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block">
                    张量维度标注
                  </label>
                  <input
                    type="text"
                    value={selectedNode.channels || ''}
                    onChange={(e) =>
                      updateNodeOptionsById(selectedNode.id, {
                        channels: e.target.value,
                      })
                    }
                    className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                  />
                </div>
              </div>
            )}

            {/* Publication Palette Swatches & Salience Role */}
            {selectedNode.subtype !== 'caption' &&
              selectedNode.subtype !== 'math' &&
              selectedNode.subtype !== 'image' && (
                <>
                  {/* Nature Skills Salience Role Selector */}
                  <div>
                    <label className="text-[10.5px] font-medium text-slate-500 block mb-1">
                      视觉显著性角色 (1 Neutral + 1 Signal + 1 Hero)
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        {
                          id: 'neutral' as const,
                          label: '基线 Neutral',
                          fill: theme.colorRoles.neutral.fill,
                          draw: theme.colorRoles.neutral.stroke,
                        },
                        {
                          id: 'signal' as const,
                          label: '主干 Signal',
                          fill: theme.colorRoles.signal.fill,
                          draw: theme.colorRoles.signal.stroke,
                        },
                        {
                          id: 'secondary' as const,
                          label: '从属 Aux',
                          fill: theme.colorRoles.secondary.fill,
                          draw: theme.colorRoles.secondary.stroke,
                        },
                        {
                          id: 'hero' as const,
                          label: '★ 创新 Hero',
                          fill: theme.colorRoles.hero.fill,
                          draw: theme.colorRoles.hero.stroke,
                        },
                      ].map((roleItem) => {
                        const isActiveRole =
                          selectedNode.salienceRole === roleItem.id;
                        return (
                          <button
                            key={roleItem.id}
                            type="button"
                            onClick={() =>
                              updateNodeOptionsById(selectedNode.id, {
                                role: roleItem.id,
                                fill: roleItem.fill,
                                draw: roleItem.draw,
                              })
                            }
                            className={`py-1 px-1 rounded border text-[10px] font-medium transition-colors cursor-pointer ${
                              isActiveRole
                                ? 'bg-indigo-50 border-indigo-400 text-indigo-800 font-semibold'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                            }`}
                          >
                            {roleItem.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1.5">
                      顶刊主题色板 ({theme.venueBadge})
                    </label>
                    <div className="grid grid-cols-6 gap-1.5">
                      {theme.palette.map((tok) => (
                        <button
                          key={tok.name}
                          onClick={() =>
                            updateNodeOptionsById(selectedNode.id, {
                              fill: tok.tikzFill,
                              draw: tok.tikzStroke,
                            })
                          }
                          className="h-6 rounded border transition-transform hover:scale-110 flex items-center justify-center cursor-pointer"
                          style={{
                            backgroundColor: tok.fillHex,
                            borderColor: tok.strokeHex,
                            borderWidth: '1.5px',
                          }}
                          title={`${tok.label} (${tok.tikzFill})`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Line Width & Rounded Corners */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        线宽 (Line Width)
                      </label>
                      <select
                        value={selectedNode.lineWidth || '0.7pt'}
                        onChange={(e) =>
                          updateNodeOptionsById(selectedNode.id, {
                            'line width': e.target.value,
                          })
                        }
                        className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs bg-white"
                      >
                        <option value="0.5pt">0.5pt (Nature 极细)</option>
                        <option value="0.7pt">0.7pt (NeurIPS 标准)</option>
                        <option value="0.85pt">0.85pt (CVPR 强调)</option>
                        <option value="1.0pt">1.0pt (加粗外框)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        圆角 (Corners)
                      </label>
                      <select
                        value={selectedNode.roundedCorners || '2.5pt'}
                        onChange={(e) =>
                          updateNodeOptionsById(selectedNode.id, {
                            'rounded corners': e.target.value,
                          })
                        }
                        className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs bg-white"
                      >
                        <option value="0pt">0pt (IEEE 直角)</option>
                        <option value="1.5pt">1.5pt (微圆角)</option>
                        <option value="2.5pt">2.5pt (顶刊标准)</option>
                        <option value="5pt">5.0pt (胶囊圆角)</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
          </div>
        )}

        {/* 2. EDGE INSPECTOR */}
        {selectedEdge && (
          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">
                连线路由类型 (TikZ Path Routing)
              </label>
              <select
                value={selectedEdge.routeType}
                onChange={(e) =>
                  updateEdgeById(selectedEdge.id, {
                    routeType: e.target.value as EdgeRouteType,
                  })
                }
                className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white"
              >
                <option value="direct">直线连接 (--)</option>
                <option value="vh">正交折线：先竖后横 (|-)</option>
                <option value="hv">正交折线：先横后竖 (-|)</option>
                <option value="residual_right">
                  右侧残差跳线 (-- ++(dx,0) |-)
                </option>
                <option value="residual_left">
                  左侧残差跳线 (-- ++(-dx,0) |-)
                </option>
                <option value="curved">平滑弧线 (to[bend left])</option>
              </select>
            </div>

            {(selectedEdge.routeType === 'residual_right' ||
              selectedEdge.routeType === 'residual_left') && (
              <div>
                <label className="text-[10px] text-slate-400 block">
                  残差旁路水平偏移距离 (cm · 可直接拖拽画布橙色控点)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="4.5"
                  value={selectedEdge.residualOffset || 1.35}
                  onChange={(e) =>
                    updateEdgeById(selectedEdge.id, {
                      residualOffset: parseFloat(e.target.value) || 1.35,
                    })
                  }
                  className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                />
              </div>
            )}

            {selectedEdge.routeType === 'curved' && (
              <div>
                <label className="text-[10px] text-slate-400 block">
                  弧线弯曲角度 (Bend Angle · 可直接拖拽画布橙色控点)
                </label>
                <input
                  type="number"
                  step="5"
                  min="-75"
                  max="75"
                  value={selectedEdge.bendAngle || 28}
                  onChange={(e) =>
                    updateEdgeById(selectedEdge.id, {
                      bendAngle: parseFloat(e.target.value) || 28,
                    })
                  }
                  className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">
                连线文字/公式标注 (支持在画布直接拖拽或双击修改)
              </label>
              <input
                type="text"
                value={selectedEdge.label || ''}
                placeholder="例如: Residual 或 \downarrow 2\times"
                onChange={(e) =>
                  updateEdgeById(selectedEdge.id, { label: e.target.value })
                }
                className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
              />
            </div>

            {selectedEdge.label && selectedEdge.label.trim() && (
              <div className="pt-1 border-t border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-medium text-slate-500">
                    连线文字偏移 (cm · 可直接在画布拖拽文字)
                  </label>
                  <button
                    onClick={() =>
                      updateEdgeById(selectedEdge.id, {
                        labelOffset: { x: 0, y: 0 },
                      })
                    }
                    className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                  >
                    重置居中
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {[
                    { label: '居中', x: 0, y: 0 },
                    { label: '偏左', x: -0.45, y: 0 },
                    { label: '偏右', x: 0.45, y: 0 },
                    { label: '偏上', x: 0, y: 0.28 },
                    { label: '偏下', x: 0, y: -0.28 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() =>
                        updateEdgeById(selectedEdge.id, {
                          labelOffset: { x: preset.x, y: preset.y },
                        })
                      }
                      className="px-1.5 py-0.5 text-[10px] rounded border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 text-slate-600 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block">
                      水平偏移 xshift (cm)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={selectedEdge.labelOffset?.x ?? 0}
                      onChange={(e) =>
                        updateEdgeById(selectedEdge.id, {
                          labelOffset: {
                            x: parseFloat(e.target.value) || 0,
                            y: selectedEdge.labelOffset?.y ?? 0,
                          },
                        })
                      }
                      className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block">
                      垂直偏移 yshift (cm)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={selectedEdge.labelOffset?.y ?? 0}
                      onChange={(e) =>
                        updateEdgeById(selectedEdge.id, {
                          labelOffset: {
                            x: selectedEdge.labelOffset?.x ?? 0,
                            y: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(selectedEdge.dashed)}
                  onChange={(e) =>
                    updateEdgeById(selectedEdge.id, {
                      dashed: e.target.checked,
                    })
                  }
                  className="rounded border-slate-300"
                />
                虚线箭头 (dashed)
              </label>
            </div>
          </div>
        )}

        {/* 3. PGFPLOTS CHART & FULL DATA TABLE INSPECTOR */}
        {selectedChart && (
          <div className="space-y-3">
            {/* Chart Type & Dimensions */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-500 block">
                科研图表类型与尺寸 (支持画布蓝框控点拖拽缩放)
              </label>
              <select
                value={selectedChart.chartType}
                onChange={(e) =>
                  updateChartById(selectedChart.id, {
                    chartType: e.target.value as PgfChartType,
                  })
                }
                className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white"
              >
                <option value="line">
                  折线图 + 误差阴影带 (Line + Error Band)
                </option>
                <option value="bar">分组对比柱状图 (Grouped ybar)</option>
                <option value="heatmap">注意力/混淆矩阵热力图 (Heatmap)</option>
                <option value="boxplot">多随机种子箱线图 (Boxplot)</option>
              </select>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <div>
                  <label className="text-[10px] text-slate-400 block">
                    图表宽度 (cm)
                  </label>
                  <input
                    type="number"
                    step="0.2"
                    min="3.0"
                    value={selectedChart.width}
                    onChange={(e) =>
                      updateChartById(selectedChart.id, {
                        width: parseFloat(e.target.value) || 5.6,
                      })
                    }
                    className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">
                    图表高度 (cm)
                  </label>
                  <input
                    type="number"
                    step="0.2"
                    min="2.5"
                    value={selectedChart.height}
                    onChange={(e) =>
                      updateChartById(selectedChart.id, {
                        height: parseFloat(e.target.value) || 4.2,
                      })
                    }
                    className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Titles, Axes Labels, and Subcaption */}
            <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">
                  标题 · 轴标签 · 子图注 (画布可拖拽/双击)
                </span>
                {(selectedChart.titleOffset ||
                  selectedChart.xlabelOffset ||
                  selectedChart.ylabelOffset) && (
                  <button
                    onClick={() =>
                      updateChartById(selectedChart.id, {
                        titleOffset: undefined,
                        xlabelOffset: undefined,
                        ylabelOffset: undefined,
                      })
                    }
                    className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                    title="重置标题与坐标轴标签偏移"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    重置位置
                  </button>
                )}
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block">
                  顶部主标题 (title)
                </label>
                <input
                  type="text"
                  value={selectedChart.title}
                  onChange={(e) =>
                    updateChartById(selectedChart.id, { title: e.target.value })
                  }
                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-[10px] text-slate-400 block">
                    X 轴标签 (xlabel)
                  </label>
                  <input
                    type="text"
                    value={selectedChart.xlabel}
                    onChange={(e) =>
                      updateChartById(selectedChart.id, {
                        xlabel: e.target.value,
                      })
                    }
                    className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">
                    Y 轴标签 (ylabel)
                  </label>
                  <input
                    type="text"
                    value={selectedChart.ylabel}
                    onChange={(e) =>
                      updateChartById(selectedChart.id, {
                        ylabel: e.target.value,
                      })
                    }
                    className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block">
                  图表底部内嵌子图注 (Subcaption，可选)
                </label>
                <input
                  type="text"
                  value={selectedChart.subcaption || ''}
                  placeholder="例如: \textbf{(b)} Ablation on Model Depth"
                  onChange={(e) =>
                    updateChartById(selectedChart.id, {
                      subcaption: e.target.value,
                    })
                  }
                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block">
                  误差带/统计显著性标注 (Nature 规范: n, SD/SE/95%CI)
                </label>
                <input
                  type="text"
                  value={selectedChart.uncertaintyNote || ''}
                  placeholder="例如: n=5, mean±SD"
                  onChange={(e) =>
                    updateChartById(selectedChart.id, {
                      uncertaintyNote: e.target.value || undefined,
                    })
                  }
                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                />
              </div>
            </div>

            {/* Grid & Legend Toggles + Direct End Labels */}
            <div className="pt-1.5 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-1.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedChart.showGrid}
                    onChange={(e) =>
                      updateChartById(selectedChart.id, {
                        showGrid: e.target.checked,
                      })
                    }
                    className="rounded border-slate-300"
                  />
                  显示网格 (grid)
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedChart.showLegend}
                    onChange={(e) =>
                      updateChartById(selectedChart.id, {
                        showLegend: e.target.checked,
                      })
                    }
                    className="rounded border-slate-300"
                  />
                  显示图例框 (legend)
                </label>
                {selectedChart.chartType === 'line' && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedChart.directEndLabels)}
                      onChange={(e) =>
                        updateChartById(selectedChart.id, {
                          directEndLabels: e.target.checked,
                        })
                      }
                      className="rounded border-slate-300"
                    />
                    曲线末端直接标签 (Nature 推荐)
                  </label>
                )}
              </div>

              {selectedChart.showLegend && (
                <div className="space-y-2 pt-0.5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-slate-500">
                        图例位置 (支持画布直接拖拽 / 双击改名)
                      </label>
                      <span className="text-[10px] font-mono text-slate-400">
                        ({(selectedChart.legendPos?.x ?? 0.04).toFixed(2)},{' '}
                        {(selectedChart.legendPos?.y ?? 0.94).toFixed(2)})
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { label: '左上', pos: { x: 0.04, y: 0.94 } },
                        { label: '右上', pos: { x: 0.48, y: 0.94 } },
                        { label: '左下', pos: { x: 0.04, y: 0.36 } },
                        { label: '右下', pos: { x: 0.48, y: 0.36 } },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() =>
                            moveChartLegend(selectedChart.id, preset.pos, true)
                          }
                          className="py-1 text-[10px] rounded border border-slate-200 hover:border-blue-400 hover:text-blue-600 bg-slate-50/60"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Legend Scale / Size Control */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-slate-500">
                        图例大小缩放 (支持拖拽图例右下角橙色控点)
                      </label>
                      <span className="text-[10px] font-mono text-blue-600 font-medium">
                        {Math.round((selectedChart.legendScale ?? 1.0) * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0.5"
                        max="1.8"
                        step="0.05"
                        value={selectedChart.legendScale ?? 1.0}
                        onChange={(e) =>
                          updateChartById(selectedChart.id, {
                            legendScale: parseFloat(e.target.value) || 1.0,
                          })
                        }
                        className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex gap-1 shrink-0">
                        {[
                          { label: '小', scale: 0.8 },
                          { label: '标准', scale: 1.0 },
                          { label: '大', scale: 1.25 },
                        ].map((sPreset) => {
                          const isCur =
                            Math.abs(
                              (selectedChart.legendScale ?? 1.0) - sPreset.scale
                            ) < 0.03;
                          return (
                            <button
                              key={sPreset.label}
                              onClick={() =>
                                updateChartById(selectedChart.id, {
                                  legendScale: sPreset.scale,
                                })
                              }
                              className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors cursor-pointer ${
                                isCur
                                  ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium'
                                  : 'bg-slate-50/60 border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'
                              }`}
                            >
                              {sPreset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Series & Data Table Editor for Line / Bar Charts */}
            {(selectedChart.chartType === 'line' ||
              selectedChart.chartType === 'bar') && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700">
                    数据序列与图例编辑 (\addplot)
                  </span>
                  <button
                    onClick={() => {
                      const nextIdx = selectedChart.series.length + 1;
                      const palette = theme.chartColors;
                      const newSeries = {
                        id: `series_${Date.now()}`,
                        name: `Method ${nextIdx}`,
                        color: palette[(nextIdx - 1) % palette.length],
                        mark: '*' as const,
                        dashed: false,
                        points: selectedChart.series[0]?.points.map((p) => ({
                          x: p.x,
                          y: Number((p.y - 2.5).toFixed(1)),
                          error: p.error,
                        })) || [
                          { x: 1, y: 70 },
                          { x: 2, y: 75 },
                          { x: 3, y: 80 },
                        ],
                      };
                      updateChartById(selectedChart.id, {
                        series: [...selectedChart.series, newSeries],
                      });
                      setActiveSeriesIdx(selectedChart.series.length);
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    新增序列
                  </button>
                </div>

                {/* Series Tabs */}
                <div className="flex gap-1 overflow-x-auto pb-0.5">
                  {selectedChart.series.map((s, idx) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSeriesIdx(idx)}
                      className={`px-2 py-1 rounded text-[10px] font-medium border flex items-center gap-1 shrink-0 ${
                        activeSeriesIdx === idx
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="truncate max-w-20">{s.name}</span>
                    </button>
                  ))}
                </div>

                {/* Active Series Editor */}
                {(() => {
                  const safeIdx = Math.min(
                    activeSeriesIdx,
                    selectedChart.series.length - 1
                  );
                  const curSeries = selectedChart.series[safeIdx];
                  if (!curSeries) return null;

                  const updateCurSeries = (
                    patch: Partial<typeof curSeries>
                  ) => {
                    const nextList = selectedChart.series.map((item, i) =>
                      i === safeIdx ? { ...item, ...patch } : item
                    );
                    updateChartById(selectedChart.id, { series: nextList });
                  };

                  return (
                    <div className="p-2 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={curSeries.name}
                          onChange={(e) =>
                            updateCurSeries({ name: e.target.value })
                          }
                          placeholder="图例名称"
                          className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                        />
                        <input
                          type="color"
                          value={
                            curSeries.color.startsWith('#')
                              ? curSeries.color
                              : '#2B5B84'
                          }
                          onChange={(e) =>
                            updateCurSeries({ color: e.target.value })
                          }
                          className="w-6 h-6 rounded border border-slate-200 cursor-pointer"
                          title="序列颜色"
                        />
                        {selectedChart.series.length > 1 && (
                          <button
                            onClick={() => {
                              const nextList = selectedChart.series.filter(
                                (_, i) => i !== safeIdx
                              );
                              setActiveSeriesIdx(0);
                              updateChartById(selectedChart.id, {
                                series: nextList,
                              });
                            }}
                            className="p-1 text-slate-400 hover:text-red-600"
                            title="删除此序列"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <label className="flex items-center gap-1 text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(curSeries.dashed)}
                            onChange={(e) =>
                              updateCurSeries({ dashed: e.target.checked })
                            }
                          />
                          虚线 (dashed)
                        </label>
                        <button
                          onClick={() => {
                            const lastPt =
                              curSeries.points[curSeries.points.length - 1];
                            const nextX =
                              typeof lastPt?.x === 'number'
                                ? lastPt.x + 1
                                : curSeries.points.length + 1;
                            updateCurSeries({
                              points: [
                                ...curSeries.points,
                                {
                                  x: nextX,
                                  y: lastPt ? lastPt.y + 1.5 : 80,
                                  error: lastPt?.error,
                                },
                              ],
                            });
                          }}
                          className="text-[10px] text-blue-600 hover:underline font-medium"
                        >
                          + 添加数据点
                        </button>
                      </div>

                      {/* Mini Spreadsheet for Points (X, Y, ±Error) */}
                      <div className="space-y-1 max-h-44 overflow-y-auto pr-0.5">
                        <div className="grid grid-cols-10 gap-1 text-[9.5px] text-slate-400 font-mono px-0.5">
                          <span className="col-span-3">X 坐标/类别</span>
                          <span className="col-span-3">Y 数值</span>
                          <span className="col-span-3">±误差带</span>
                          <span className="col-span-1"></span>
                        </div>
                        {curSeries.points.map((pt, ptIdx) => (
                          <div
                            key={ptIdx}
                            className="grid grid-cols-10 gap-1 items-center"
                          >
                            <input
                              type="text"
                              value={pt.x}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const num = Number(raw);
                                const nextPts = curSeries.points.map((p, i) =>
                                  i === ptIdx
                                    ? {
                                        ...p,
                                        x:
                                          isNaN(num) || raw === '' ? raw : num,
                                      }
                                    : p
                                );
                                updateCurSeries({ points: nextPts });
                              }}
                              className="col-span-3 px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px]"
                            />
                            <input
                              type="number"
                              step="0.5"
                              value={pt.y}
                              onChange={(e) => {
                                const nextPts = curSeries.points.map((p, i) =>
                                  i === ptIdx
                                    ? {
                                        ...p,
                                        y: parseFloat(e.target.value) || 0,
                                      }
                                    : p
                                );
                                updateCurSeries({ points: nextPts });
                              }}
                              className="col-span-3 px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px]"
                            />
                            <input
                              type="number"
                              step="0.2"
                              placeholder="无"
                              value={pt.error ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const nextPts = curSeries.points.map((p, i) =>
                                  i === ptIdx
                                    ? {
                                        ...p,
                                        error:
                                          val === ''
                                            ? undefined
                                            : parseFloat(val) || 0,
                                      }
                                    : p
                                );
                                updateCurSeries({ points: nextPts });
                              }}
                              className="col-span-3 px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px]"
                            />
                            <button
                              onClick={() => {
                                if (curSeries.points.length <= 1) return;
                                updateCurSeries({
                                  points: curSeries.points.filter(
                                    (_, i) => i !== ptIdx
                                  ),
                                });
                              }}
                              className="col-span-1 text-slate-400 hover:text-red-500 text-center"
                              title="删除数据点"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Footer Bar */}
      <div className="px-3 py-2 border-t border-slate-200/80 bg-slate-50/70 shrink-0 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="truncate">
          {hasSelectedElement ? (
            <>
              已绑定至右侧 Agent <code className="text-blue-600">@选中</code>{' '}
              上下文
            </>
          ) : (
            <>点击画布图元或上方列表可切换至对应属性编辑</>
          )}
        </span>
      </div>
    </aside>
  );
};
