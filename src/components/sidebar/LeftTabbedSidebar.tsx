import React, { useMemo, useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import {
  FULL_FIGURE_TEMPLATES,
  PRIMITIVE_LIBRARY,
  TemplateCategory,
  FullFigureTemplate,
} from '../../core/templates/dl-templates';
import { parseTikzDocument } from '../../core/parser/parser';
import { resolveTikzColor } from '../../core/themes/journal-presets';
import {
  LiveCodeSyncBanner,
  TikzCodePanel,
} from '../editor/TikzCodePanel';
import {
  Blocks,
  Code2,
  Layers,
  BarChart3,
  BookOpen,
  Plus,
  Sparkles,
  CheckCircle2,
  FileCode2,
  Cpu,
  Eye,
  Zap,
  FlaskConical,
} from 'lucide-react';

// --- Venue color accent for template card top band ---
const VENUE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'NeurIPS / ICLR': { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700' },
  'ICLR / ICML': { bg: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-700' },
  'CVPR / ICCV': { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-700' },
  'CVPR / NeurIPS': { bg: 'bg-cyan-50', border: 'border-cyan-300', text: 'text-cyan-700' },
  'ICML / NeurIPS': { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700' },
  'Nature / Science': { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700' },
};

const CATEGORY_TABS: Array<{ id: TemplateCategory; label: string; icon: React.ReactNode }> = [
  { id: 'all', label: `全部 (${FULL_FIGURE_TEMPLATES.length})`, icon: <BookOpen className="w-3 h-3" /> },
  { id: 'transformer', label: 'Transformer', icon: <Cpu className="w-3 h-3" /> },
  { id: 'vision_multimodal', label: 'CV / 多模态', icon: <Eye className="w-3 h-3" /> },
  { id: 'generative', label: '生成/扩散', icon: <Zap className="w-3 h-3" /> },
  { id: 'data_charts', label: '实验图表', icon: <FlaskConical className="w-3 h-3" /> },
];

/**
 * Renders a tiny SVG topology minimap from the template's parsed AST.
 * Shows nodes as colored rectangles and edges as lines.
 */
const TemplateMinimap: React.FC<{ tpl: FullFigureTemplate }> = React.memo(({ tpl }) => {
  const data = useMemo(() => {
    const doc = parseTikzDocument(tpl.tikzCode);
    if (doc.nodes.length === 0 && doc.charts.length === 0) return null;

    const allX = [...doc.nodes.map(n => n.x), ...doc.charts.map(c => c.x)];
    const allY = [...doc.nodes.map(n => n.y), ...doc.charts.map(c => c.y)];
    const minX = Math.min(...allX) - 1;
    const maxX = Math.max(...allX) + 1;
    const minY = Math.min(...allY) - 1;
    const maxY = Math.max(...allY) + 1;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const W = 140;
    const H = 56;
    const toSvg = (x: number, y: number) => ({
      sx: ((x - minX) / rangeX) * (W - 12) + 6,
      sy: H - (((y - minY) / rangeY) * (H - 8) + 4), // flip Y
    });

    return { doc, toSvg, W, H };
  }, [tpl.tikzCode]);

  if (!data) return <div className="w-full h-14 bg-slate-50 rounded" />;
  const { doc, toSvg, W, H } = data;

  return (
    <svg width={W} height={H} className="w-full rounded bg-slate-50/80 border border-slate-100">
      {/* Edges */}
      {doc.edges.map((e, i) => {
        const fromNode = doc.nodes.find(n => n.id === e.from);
        const toNode = doc.nodes.find(n => n.id === e.to);
        if (!fromNode || !toNode) return null;
        const p1 = toSvg(fromNode.x, fromNode.y);
        const p2 = toSvg(toNode.x, toNode.y);
        return (
          <line key={`e${i}`} x1={p1.sx} y1={p1.sy} x2={p2.sx} y2={p2.sy}
            stroke="#94A3B8" strokeWidth={0.7} opacity={0.5} />
        );
      })}
      {/* Nodes */}
      {doc.nodes.filter(n => n.subtype !== 'container' && n.subtype !== 'math' && n.subtype !== 'caption').map(n => {
        const { sx, sy } = toSvg(n.x, n.y);
        const fill = resolveTikzColor(n.fill, 'fill', tpl.themeId);
        const stroke = resolveTikzColor(n.stroke, 'stroke', tpl.themeId);
        const w = Math.min(18, Math.max(6, n.width * 4));
        const h = Math.min(12, Math.max(4, n.height * 4));
        if (n.subtype === 'op_circle') {
          return <circle key={n.id} cx={sx} cy={sy} r={3} fill={fill} stroke={stroke} strokeWidth={0.6} />;
        }
        return <rect key={n.id} x={sx - w / 2} y={sy - h / 2} width={w} height={h}
          rx={1.5} fill={fill} stroke={stroke} strokeWidth={0.6} />;
      })}
      {/* Charts */}
      {doc.charts.map(c => {
        const { sx, sy } = toSvg(c.x, c.y);
        return <rect key={c.id} x={sx - 8} y={sy - 6} width={16} height={12}
          rx={1} fill="#FEF3C7" stroke="#D97706" strokeWidth={0.6} />;
      })}
    </svg>
  );
});

export const LeftTabbedSidebar: React.FC = () => {
  const {
    leftTab,
    activeTemplateId,
    highlightedLineRange,
    setLeftTab,
    addPrimitiveToCanvas,
    loadTemplate,
  } = useWorkspaceStore();

  const [selectedCategory, setSelectedCategory] =
    useState<TemplateCategory>('all');

  const dlPrimitives = PRIMITIVE_LIBRARY.filter((p) => p.category === 'dl');
  const chartPrimitives = PRIMITIVE_LIBRARY.filter((p) => p.category === 'chart');

  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'all') return FULL_FIGURE_TEMPLATES;
    return FULL_FIGURE_TEMPLATES.filter((t) => t.category === selectedCategory);
  }, [selectedCategory]);

  const templateStats = useMemo(() => {
    const map: Record<string, { nodes: number; edges: number; charts: number }> = {};
    for (const tpl of FULL_FIGURE_TEMPLATES) {
      const parsed = parseTikzDocument(tpl.tikzCode);
      map[tpl.id] = { nodes: parsed.nodes.length, edges: parsed.edges.length, charts: parsed.charts.length };
    }
    return map;
  }, []);

  return (
    <aside
      className={`${
        leftTab === 'code' ? 'w-[420px]' : 'w-[360px]'
      } h-full bg-sidebar-gradient border-r border-slate-200/80 flex flex-col shrink-0 transition-[width] duration-200 select-none`}
    >
      {/* Tab Header */}
      <div className="p-1.5 bg-white/60 border-b border-slate-200/80 grid grid-cols-2 gap-1">
        <button
          onClick={() => setLeftTab('code')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
            leftTab === 'code'
              ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>TikZ 代码面板</span>
          {highlightedLineRange && (
            <span className="ml-0.5 px-1 py-0.2 text-[10px] rounded bg-blue-50 text-blue-700 font-mono">
              L{highlightedLineRange.startLine}
            </span>
          )}
        </button>
        <button
          onClick={() => setLeftTab('library')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
            leftTab === 'library'
              ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Blocks className="w-3.5 h-3.5" />
          <span>组件与模板库</span>
          <span className="px-1 py-0.2 text-[10px] rounded bg-slate-200/70 text-slate-600 font-mono">
            {FULL_FIGURE_TEMPLATES.length}
          </span>
        </button>
      </div>

      {leftTab === 'code' ? (
        <div className="flex-1 overflow-hidden"><TikzCodePanel /></div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {/* Section A: Templates */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                  <span>顶刊整图预设模板</span>
                </div>
                <span className="text-[10px] text-slate-400 italic">Publication-Grade</span>
              </div>

              {/* Category Pills with Icons */}
              <div className="flex items-center gap-1 overflow-x-auto pb-2.5 mb-1 no-scrollbar">
                {CATEGORY_TABS.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-medium shrink-0 transition-all cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                    }`}
                  >
                    {cat.icon}
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Template Cards */}
              <div className="space-y-3">
                {filteredTemplates.map((tpl) => {
                  const isActive = activeTemplateId === tpl.id;
                  const stats = templateStats[tpl.id];
                  const venueStyle = VENUE_COLORS[tpl.venue] || VENUE_COLORS['NeurIPS / ICLR'];
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => loadTemplate(tpl.id)}
                      className={`rounded-xl border overflow-hidden transition-all cursor-pointer group ${
                        isActive
                          ? 'border-blue-500 shadow-md ring-1 ring-blue-200'
                          : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                      }`}
                    >
                      {/* Venue Color Band */}
                      <div className={`px-3 py-1.5 flex items-center justify-between ${venueStyle.bg} border-b ${venueStyle.border}`}>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${venueStyle.text}`}>
                          {tpl.venue}
                        </span>
                        <div className="flex items-center gap-2">
                          {stats && (
                            <span className="text-[9.5px] font-mono text-slate-400">
                              {stats.nodes}N · {stats.edges}E{stats.charts > 0 ? ` · ${stats.charts}C` : ''}
                            </span>
                          )}
                          {isActive ? (
                            <span className="text-[10px] text-blue-600 font-bold flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3" /> 当前
                            </span>
                          ) : (
                            <span className="text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 font-medium flex items-center gap-0.5">
                              <Sparkles className="w-3 h-3" /> 载入
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Body with Minimap */}
                      <div className="p-2.5">
                        <div className="flex gap-2.5">
                          {/* Minimap */}
                          <div className="shrink-0 w-[140px]">
                            <TemplateMinimap tpl={tpl} />
                          </div>
                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <div className="text-[11.5px] font-semibold text-slate-800 leading-snug mb-1 line-clamp-2">
                              {tpl.title}
                            </div>
                            <p className="text-[10.5px] text-slate-500 leading-relaxed line-clamp-2">
                              {tpl.description}
                            </p>
                          </div>
                        </div>

                        {/* Tags + Code Button */}
                        <div className="flex items-center justify-between mt-2 gap-1.5">
                          <div className="flex flex-wrap gap-1 min-w-0">
                            {tpl.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                {tag}
                              </span>
                            ))}
                            {tpl.tags.length > 3 && (
                              <span className="text-[9.5px] px-1 py-0.5 text-slate-400">+{tpl.tags.length - 3}</span>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); loadTemplate(tpl.id); setLeftTab('code'); }}
                            className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-500 flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <FileCode2 className="w-3 h-3" />
                            <span>代码</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section B: DL Primitives */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>深度学习架构组件</span>
                </div>
                <span className="text-[10px] text-slate-400">点击追加至画布</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {dlPrimitives.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addPrimitiveToCanvas(item.id)}
                    className="group text-left p-2 rounded-lg border border-slate-200/90 bg-white hover:border-blue-400 hover:bg-blue-50/25 transition-all flex flex-col justify-between cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                        {item.badge}
                      </span>
                      <Plus className="w-3 h-3 text-slate-400 group-hover:text-blue-600" />
                    </div>
                    <div className="text-xs font-medium text-slate-800 leading-snug">{item.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 leading-tight">{item.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Section C: Charts */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <BarChart3 className="w-3.5 h-3.5 text-amber-600" />
                  <span>科研数据图表 (PGFPlots)</span>
                </div>
                <span className="text-[10px] text-slate-400">axis 环境</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {chartPrimitives.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addPrimitiveToCanvas(item.id, 7.2, 2.2)}
                    className="group text-left p-2 rounded-lg border border-slate-200/90 bg-white hover:border-amber-400 hover:bg-amber-50/20 transition-all flex flex-col justify-between cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{item.badge}</span>
                      <Plus className="w-3 h-3 text-slate-400 group-hover:text-amber-600" />
                    </div>
                    <div className="text-xs font-medium text-slate-800 leading-snug">{item.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 leading-tight">{item.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Docked Live Code Sync */}
          <div className="border-t border-slate-200 shrink-0">
            <LiveCodeSyncBanner compact onExpandCodeTab={() => setLeftTab('code')} />
          </div>
        </div>
      )}
    </aside>
  );
};
