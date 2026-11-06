import React, { useMemo, useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import {
  FULL_FIGURE_TEMPLATES,
  PRIMITIVE_LIBRARY,
  TemplateCategory,
} from '../../core/templates/dl-templates';
import { parseTikzDocument } from '../../core/parser/parser';
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
} from 'lucide-react';

const CATEGORY_TABS: Array<{ id: TemplateCategory; label: string }> = [
  { id: 'all', label: '全部 (6)' },
  { id: 'transformer', label: 'Transformer' },
  { id: 'vision_multimodal', label: 'CV / 多模态' },
  { id: 'generative', label: '生成/扩散' },
  { id: 'data_charts', label: '实验图表' },
];

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
  const chartPrimitives = PRIMITIVE_LIBRARY.filter(
    (p) => p.category === 'chart'
  );

  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'all') return FULL_FIGURE_TEMPLATES;
    return FULL_FIGURE_TEMPLATES.filter((t) => t.category === selectedCategory);
  }, [selectedCategory]);

  // Precompute element statistics for each template so users can see complexity at a glance
  const templateStats = useMemo(() => {
    const map: Record<
      string,
      { nodes: number; edges: number; charts: number }
    > = {};
    for (const tpl of FULL_FIGURE_TEMPLATES) {
      const parsed = parseTikzDocument(tpl.tikzCode);
      map[tpl.id] = {
        nodes: parsed.nodes.length,
        edges: parsed.edges.length,
        charts: parsed.charts.length,
      };
    }
    return map;
  }, []);

  return (
    <aside
      className={`${
        leftTab === 'code' ? 'w-[420px]' : 'w-[350px]'
      } h-full bg-white border-r border-slate-200 flex flex-col shrink-0 transition-[width] duration-150 select-none`}
    >
      {/* Top Switchable Tab Header: [📝 TikZ 代码面板 (默认)] | [🧩 组件与模板库] */}
      <div className="p-1.5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 gap-1">
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

      {/* Tab Content 1 (Default): Full-Height Lossless TikZ Code Panel */}
      {leftTab === 'code' ? (
        <div className="flex-1 overflow-hidden">
          <TikzCodePanel />
        </div>
      ) : (
        /* Tab Content 2: Publication Templates & Component Library + Docked Live Code Sync Monitor */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {/* Section A: Publication Full-Figure Templates (Moved to Top & Categorized) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                  <span>顶刊整图预设模板 ({FULL_FIGURE_TEMPLATES.length} 套)</span>
                </div>
                <span className="text-[10px] text-slate-400">无重叠精排</span>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-1 no-scrollbar">
                {CATEGORY_TABS.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2 py-1 rounded-md text-[10.5px] font-medium shrink-0 transition-colors cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2.5">
                {filteredTemplates.map((tpl) => {
                  const isActive = activeTemplateId === tpl.id;
                  const stats = templateStats[tpl.id];
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => loadTemplate(tpl.id)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer group ${
                        isActive
                          ? 'border-blue-500 bg-blue-50/20 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/60">
                            {tpl.venue}
                          </span>
                          {stats && (
                            <span className="text-[10px] font-mono text-slate-400">
                              {stats.nodes}节点 · {stats.edges}连线
                              {stats.charts > 0 ? ` · ${stats.charts}图表` : ''}
                            </span>
                          )}
                        </div>
                        {isActive ? (
                          <span className="text-[10.5px] text-blue-600 font-semibold flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> 当前模板
                          </span>
                        ) : (
                          <span className="text-[10.5px] text-blue-600 opacity-0 group-hover:opacity-100 font-medium flex items-center gap-0.5">
                            <Sparkles className="w-3 h-3" /> 一键载入
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-semibold text-slate-800 mb-1">
                        {tpl.title}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
                        {tpl.description}
                      </p>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          {tpl.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            loadTemplate(tpl.id);
                            setLeftTab('code');
                          }}
                          className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 flex items-center gap-1 transition-colors cursor-pointer"
                          title="载入该模板并立即切换到 TikZ 代码面板"
                        >
                          <FileCode2 className="w-3 h-3" />
                          <span>载入并看代码</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section B: Deep Learning Architecture Primitives */}
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
                    <div className="text-xs font-medium text-slate-800 leading-snug">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 leading-tight">
                      {item.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Section C: PGFPlots Scientific Data Charts */}
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
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                        {item.badge}
                      </span>
                      <Plus className="w-3 h-3 text-slate-400 group-hover:text-amber-600" />
                    </div>
                    <div className="text-xs font-medium text-slate-800 leading-snug">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 leading-tight">
                      {item.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Docked Real-Time Code Block & Value Change Monitor */}
          <div className="border-t border-slate-200 shrink-0">
            <LiveCodeSyncBanner
              compact
              onExpandCodeTab={() => setLeftTab('code')}
            />
          </div>
        </div>
      )}
    </aside>
  );
};
