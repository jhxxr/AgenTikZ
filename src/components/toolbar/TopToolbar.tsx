import React, { useState, useEffect, useRef } from 'react';
import {
  CanvasTool,
  useWorkspaceStore,
} from '../../store/useWorkspaceStore';
import { JOURNAL_THEMES } from '../../core/themes/journal-presets';
import { JournalThemeId } from '../../types/theme';
import {
  buildPaperFigureEnvironment,
  buildStandaloneLatexDocument,
} from '../editor/TikzCodePanel';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowUpRight,
  BarChart3,
  BookOpenText,
  Box,
  CirclePlus,
  CornerDownRight,
  Download,
  Eye,
  FileCode2,
  FileText,
  Group,
  Image as ImageIcon,
  MousePointer,
  Palette,
  Play,
  Redo2,
  Sigma,
  Square,
  Sparkles,
  Undo2,
  ChevronDown,
} from 'lucide-react';

function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const TopToolbar: React.FC = () => {
  const {
    tikzCode, parsedDoc, activeTool, activeThemeId, selectedIds,
    previewMode, undoStack, redoStack, isCompilingTex,
    setActiveTool, setActiveTheme, setPreviewMode, setCompiledSvg,
    setIsCompilingTex, undo, redo, alignSelectedNodes,
  } = useWorkspaceStore();

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showExportMenu]);

  const toolGroups: Array<{
    label: string;
    tools: Array<{ id: CanvasTool; label: string; icon: React.ReactNode; tip: string }>;
  }> = [
    {
      label: '基础',
      tools: [
        { id: 'select', label: '选择', icon: <MousePointer className="w-3.5 h-3.5" />, tip: '选择与拖拽 (Shift 多选)' },
        { id: 'edge', label: '连线', icon: <ArrowUpRight className="w-3.5 h-3.5" />, tip: '点击两个节点创建箭头' },
        { id: 'residual', label: '残差', icon: <CornerDownRight className="w-3.5 h-3.5" />, tip: '正交残差旁路跳线' },
      ],
    },
    {
      label: '模块',
      tools: [
        { id: 'node', label: '层', icon: <Square className="w-3.5 h-3.5" />, tip: '神经网络层' },
        { id: 'mha', label: 'Attn', icon: <Sparkles className="w-3.5 h-3.5" />, tip: 'Multi-Head Attention' },
        { id: 'cuboid', label: '3D', icon: <Box className="w-3.5 h-3.5" />, tip: '3D 特征图 (C×H×W)' },
        { id: 'op_circle', label: '⊕', icon: <CirclePlus className="w-3.5 h-3.5" />, tip: '算子圆节点' },
        { id: 'container', label: '框', icon: <Group className="w-3.5 h-3.5" />, tip: '虚线分组框' },
      ],
    },
    {
      label: '标注',
      tools: [
        { id: 'math', label: '公式', icon: <Sigma className="w-3.5 h-3.5" />, tip: 'LaTeX 公式' },
        { id: 'caption', label: '(a)', icon: <BookOpenText className="w-3.5 h-3.5" />, tip: '子图图注' },
        { id: 'chart', label: '图表', icon: <BarChart3 className="w-3.5 h-3.5" />, tip: 'PGFPlots 数据图表' },
      ],
    },
  ];

  const handleCompileTex = async () => {
    setIsCompilingTex(true);
    try {
      const fullTex = buildStandaloneLatexDocument(tikzCode, activeThemeId);
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<{ ok: boolean; svg?: string; message: string }>('tex_compile_preview', { texSource: fullTex });
        if (res.ok && res.svg) {
          setCompiledSvg(res.svg, res.message);
          setPreviewMode('tex_split');
          setIsCompilingTex(false);
          return;
        }
      }
      const svgEl = document.getElementById('agenttikz-canvas-svg');
      if (svgEl) setCompiledSvg(svgEl.outerHTML, '内置高保真矢量引擎渲染');
      setPreviewMode(previewMode === 'tex_split' ? 'interactive' : 'tex_split');
    } catch {
      setPreviewMode(previewMode === 'tex_split' ? 'interactive' : 'tex_split');
    } finally {
      setIsCompilingTex(false);
    }
  };

  const handleExportSvg = () => {
    const svgEl = document.getElementById('agenttikz-canvas-svg');
    if (!svgEl) return;
    triggerFileDownload('agenttikz-figure.svg', new XMLSerializer().serializeToString(svgEl), 'image/svg+xml;charset=utf-8');
    setShowExportMenu(false);
  };

  return (
    <header className="h-12 bg-toolbar-gradient border-b border-slate-200/80 px-3 flex items-center justify-between gap-2 shrink-0 select-none z-30">
      {/* Left: Brand + Undo/Redo */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 text-white flex items-center justify-center font-serif font-bold text-sm shadow-sm">
            T
          </div>
          <div className="leading-none">
            <span className="font-bold text-[13px] tracking-tight text-slate-900">AgentTikZ</span>
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 border border-blue-200/60 font-medium">
              Studio
            </span>
          </div>
        </div>

        <div className="w-px h-5 bg-slate-200/80" />

        <div className="flex items-center gap-0.5">
          <button onClick={undo} disabled={undoStack.length === 0}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-white/80 disabled:opacity-30 transition-colors cursor-pointer" title="撤销">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={redo} disabled={redoStack.length === 0}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-white/80 disabled:opacity-30 transition-colors cursor-pointer" title="重做">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center: Grouped Tools */}
      <div className="flex items-center gap-0.5 bg-white/60 border border-slate-200/70 rounded-xl p-0.5 shadow-sm">
        {toolGroups.map((group, gi) => (
          <React.Fragment key={group.label}>
            {gi > 0 && <div className="w-px h-5 bg-slate-200/60 mx-0.5" />}
            {group.tools.map((t) => {
              const active = activeTool === t.id;
              return (
                <button key={t.id} onClick={() => setActiveTool(t.id)} title={t.tip}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all shrink-0 cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-white'
                  }`}>
                  {t.icon}
                  <span className="hidden xl:inline">{t.label}</span>
                </button>
              );
            })}
          </React.Fragment>
        ))}

        {selectedIds.length >= 2 && (
          <>
            <div className="w-px h-5 bg-slate-200/60 mx-0.5" />
            <button onClick={() => alignSelectedNodes('align_x')} className="p-1.5 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors" title="水平对齐">
              <AlignCenterHorizontal className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => alignSelectedNodes('align_y')} className="p-1.5 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors" title="垂直对齐">
              <AlignCenterVertical className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Right: Theme + Preview + Export */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 bg-white/70 border border-slate-200/70 rounded-lg px-2 py-1 shadow-sm">
          <Palette className="w-3.5 h-3.5 text-slate-400" />
          <select value={activeThemeId} onChange={(e) => setActiveTheme(e.target.value as JournalThemeId)}
            className="text-[11px] font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer pr-1">
            {Object.values(JOURNAL_THEMES).map((th) => (
              <option key={th.id} value={th.id}>{th.venueBadge}</option>
            ))}
          </select>
        </div>

        <button onClick={handleCompileTex} disabled={isCompilingTex}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
            previewMode !== 'interactive'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm'
              : 'bg-white/70 text-slate-600 border-slate-200/70 hover:bg-white shadow-sm'
          }`}>
          {previewMode !== 'interactive' ? <Eye className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{previewMode !== 'interactive' ? '退出预览' : 'TeX'}</span>
        </button>

        <div className="relative" ref={exportMenuRef}>
          <button onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white shadow-sm transition-all cursor-pointer">
            <Download className="w-3.5 h-3.5" />
            <span>导出</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200/80 rounded-2xl shadow-xl py-2 z-40 text-xs overflow-hidden">
              <div className="px-3.5 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                论文插图导出
              </div>
              {[
                { icon: <FileCode2 className="w-4 h-4 text-blue-500" />, title: 'TikZ 代码 (.tikz)', desc: '可直接 \\input 嵌入论文',
                  action: () => { triggerFileDownload('figure.tikz', tikzCode, 'text/plain;charset=utf-8'); setShowExportMenu(false); } },
                { icon: <BookOpenText className="w-4 h-4 text-indigo-500" />, title: 'Figure 环境 (.tex)', desc: '含 \\caption + \\label',
                  action: () => { triggerFileDownload('figure-env.tex', buildPaperFigureEnvironment(tikzCode, parsedDoc.figureCaption, parsedDoc.figureLabel), 'text/plain;charset=utf-8'); setShowExportMenu(false); } },
                { icon: <FileText className="w-4 h-4 text-emerald-500" />, title: 'Standalone 文档 (.tex)', desc: '含导言区与色彩宏',
                  action: () => { triggerFileDownload('figure-standalone.tex', buildStandaloneLatexDocument(tikzCode, activeThemeId), 'text/plain;charset=utf-8'); setShowExportMenu(false); } },
                { icon: <ImageIcon className="w-4 h-4 text-amber-500" />, title: '矢量图 (.svg)', desc: 'Illustrator / Keynote',
                  action: handleExportSvg },
                { icon: <Download className="w-4 h-4 text-purple-500" />, title: '打印 PDF (.pdf)', desc: '高清论文插图',
                  action: () => { setShowExportMenu(false); window.print(); } },
              ].map((item, i) => (
                <button key={i} onClick={item.action}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 transition-colors">
                  {item.icon}
                  <div>
                    <div className="font-medium text-slate-800">{item.title}</div>
                    <div className="text-[10px] text-slate-400">{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
