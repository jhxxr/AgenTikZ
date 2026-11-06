import React, { useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { JOURNAL_THEMES } from '../../core/themes/journal-presets';
import { EdgeRouteType, PgfChartType } from '../../types/tikz-ast';
import {
  Code2,
  Copy,
  Plus,
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';

export const PropertyPanel: React.FC = () => {
  const {
    parsedDoc,
    selectedIds,
    activeThemeId,
    moveElementsByPosition,
    updateNodeLabelById,
    updateNodeOptionsById,
    updateEdgeById,
    updateChartById,
    moveChartLegend,
    duplicateSelectedElements,
    deleteSelectedElements,
    setLeftTab,
  } = useWorkspaceStore();

  const [activeSeriesIdx, setActiveSeriesIdx] = useState(0);

  if (selectedIds.length === 0) return null;

  const firstId = selectedIds[0];
  const selectedNode = parsedDoc.nodes.find((n) => n.id === firstId);
  const selectedEdge = parsedDoc.edges.find((e) => e.id === firstId);
  const selectedChart = parsedDoc.charts.find((c) => c.id === firstId);
  const theme = JOURNAL_THEMES[activeThemeId];

  return (
    <div
      className="absolute top-3 right-3 w-80 bg-white/98 border border-slate-200/95 rounded-xl shadow-md p-3 z-20 text-xs space-y-2.5 max-h-[calc(100%-68px)] overflow-y-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 truncate">
          <Sliders className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="truncate">
            {selectedNode
              ? selectedNode.subtype === 'caption'
                ? `子图图注属性 (${selectedNode.id})`
                : `节点属性 (${selectedNode.id})`
              : selectedEdge
                ? `连线属性 (${selectedEdge.from} → ${selectedEdge.to})`
                : selectedChart
                  ? `图表与数据编辑 (${selectedChart.id})`
                  : `已选中 ${selectedIds.length} 项`}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={duplicateSelectedElements}
            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="克隆复制选中图元 (Ctrl+D)"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setLeftTab('code')}
            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="在左侧 TikZ 代码标签页中查看对应源码行"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={deleteSelectedElements}
            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="删除选中图元 (Delete)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 1. NODE & SUBCAPTION INSPECTOR */}
      {selectedNode && (
        <div className="space-y-2.5">
          {/* Label & Formula */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500">
              {selectedNode.subtype === 'caption'
                ? '子图图注内容 (支持 \\textbf{(a)} 与 $...$ 公式)'
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
                placeholder="副标题公式 (如 $d_k=64$，留空则单行)"
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

          {/* Publication Palette Swatches */}
          {selectedNode.subtype !== 'caption' &&
            selectedNode.subtype !== 'math' && (
              <>
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
              连线文字/公式标注 (支持在画布双击连线直接修改)
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

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(selectedEdge.dashed)}
                onChange={(e) =>
                  updateEdgeById(selectedEdge.id, { dashed: e.target.checked })
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
              <option value="line">折线图 + 误差阴影带 (Line + Error Band)</option>
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
          </div>

          {/* Grid & Legend Toggles + Legend Preset Positions */}
          <div className="pt-1.5 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
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
            </div>

            {selectedChart.showLegend && (
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
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
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
                                  ? { ...p, x: isNaN(num) || raw === '' ? raw : num }
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
                                  ? { ...p, y: parseFloat(e.target.value) || 0 }
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

      {/* Footer Hint */}
      <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span>
          已绑定至右侧 Agent <code className="text-blue-600">@选中</code> 上下文
        </span>
      </div>
    </div>
  );
};
