import React, { useState } from 'react';
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
    tikzCode,
    parsedDoc,
    activeTool,
    activeThemeId,
    selectedIds,
    previewMode,
    undoStack,
    redoStack,
    isCompilingTex,
    setActiveTool,
    setActiveTheme,
    setPreviewMode,
    setCompiledSvg,
    setIsCompilingTex,
    undo,
    redo,
    alignSelectedNodes,
  } = useWorkspaceStore();

  const [showExportMenu, setShowExportMenu] = useState(false);

  const tools: Array<{
    id: CanvasTool;
    label: string;
    icon: React.ReactNode;
    tip: string;
  }> = [
    {
      id: 'select',
      label: '选择',
      icon: <MousePointer className="w-3.5 h-3.5" />,
      tip: '选择与拖拽图元 (支持 Shift 多选)',
    },
    {
      id: 'node',
      label: '模块层',
      icon: <Square className="w-3.5 h-3.5" />,
      tip: '在画布点击放置神经网络层',
    },
    {
      id: 'mha',
      label: '注意力',
      icon: <Sparkles className="w-3.5 h-3.5" />,
      tip: '在画布点击放置 Multi-Head Attention 模块',
    },
    {
      id: 'cuboid',
      label: '3D张量',
      icon: <Box className="w-3.5 h-3.5" />,
      tip: '在画布点击放置 3D 特征图立方体 (C×H×W)',
    },
    {
      id: 'op_circle',
      label: '算子⊕',
      icon: <CirclePlus className="w-3.5 h-3.5" />,
      tip: '在画布点击放置残差相加 ⊕ 或相乘 ⊗ 算子圆节点',
    },
    {
      id: 'edge',
      label: '连线',
      icon: <ArrowUpRight className="w-3.5 h-3.5" />,
      tip: '依次点击两个节点创建 -Stealth 箭头连接',
    },
    {
      id: 'residual',
      label: '残差跳线',
      icon: <CornerDownRight className="w-3.5 h-3.5" />,
      tip: '依次点击两个节点创建正交残差旁路跳线 (-- ++(dx,0) |-)',
    },
    {
      id: 'container',
      label: '分组框',
      icon: <Group className="w-3.5 h-3.5" />,
      tip: '在画布点击放置虚线 Stage 分组容器',
    },
    {
      id: 'math',
      label: '公式',
      icon: <Sigma className="w-3.5 h-3.5" />,
      tip: '在画布点击放置独立 LaTeX 数学公式标注',
    },
    {
      id: 'caption',
      label: '子图注(a)',
      icon: <BookOpenText className="w-3.5 h-3.5" />,
      tip: '在画布点击放置子图图注 (a) / (b) 说明文字',
    },
    {
      id: 'chart',
      label: '数据图表',
      icon: <BarChart3 className="w-3.5 h-3.5" />,
      tip: '在画布点击放置 PGFPlots 科研数据图表',
    },
  ];

  const handleCompileTex = async () => {
    setIsCompilingTex(true);
    try {
      const fullTex = buildStandaloneLatexDocument(tikzCode, activeThemeId);
      const isTauri =
        typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<{
          ok: boolean;
          svg?: string;
          message: string;
        }>('tex_compile_preview', {
          texSource: fullTex,
        });
        if (res.ok && res.svg) {
          setCompiledSvg(res.svg, res.message);
          setPreviewMode('tex_split');
          setIsCompilingTex(false);
          return;
        }
      }
      // Fallback: snapshot current high-precision vector canvas SVG for side-by-side print inspection
      const svgEl = document.getElementById('agenttikz-canvas-svg');
      if (svgEl) {
        setCompiledSvg(svgEl.outerHTML, '内置高保真矢量引擎渲染');
      }
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
    const serializer = new XMLSerializer();
    const rawSvg = serializer.serializeToString(svgEl);
    triggerFileDownload(
      'agenttikz-figure.svg',
      rawSvg,
      'image/svg+xml;charset=utf-8'
    );
    setShowExportMenu(false);
  };

  const handleExportPdfPrint = () => {
    setShowExportMenu(false);
    window.print();
  };

  return (
    <header className="h-12 bg-white border-b border-slate-200 px-3 flex items-center justify-between gap-2 shrink-0 select-none z-30">
      {/* Left: Brand Logo + Undo/Redo */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center font-serif font-bold text-sm shadow-2xs">
            T
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs tracking-tight text-slate-900">
                AgentTikZ
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                Research Studio
              </span>
            </div>
          </div>
        </div>

        <div className="w-px h-5 bg-slate-200" />

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
            title="撤销 (Undo)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
            title="重做 (Redo)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center: Canvas Drawing Tools + Alignment Helpers */}
      <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/80 rounded-lg p-1 overflow-x-auto no-scrollbar">
        {tools.map((t) => {
          const active = activeTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              title={t.tip}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all shrink-0 cursor-pointer ${
                active
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}

        {selectedIds.length >= 2 && (
          <>
            <div className="w-px h-4 bg-slate-200 mx-0.5" />
            <button
              onClick={() => alignSelectedNodes('align_x')}
              className="p-1 rounded text-blue-700 bg-blue-50 hover:bg-blue-100"
              title="水平中心对齐选中节点"
            >
              <AlignCenterHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => alignSelectedNodes('align_y')}
              className="p-1 rounded text-blue-700 bg-blue-50 hover:bg-blue-100"
              title="垂直中心对齐选中节点"
            >
              <AlignCenterVertical className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => alignSelectedNodes('distribute_y')}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100"
              title="等距分布选中节点"
            >
              等距分布
            </button>
          </>
        )}
      </div>

      {/* Right: Publication Theme Selector + TeX Preview + Export Menu */}
      <div className="flex items-center gap-2">
        {/* Journal Theme Selector */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
          <Palette className="w-3.5 h-3.5 text-slate-500" />
          <select
            value={activeThemeId}
            onChange={(e) => setActiveTheme(e.target.value as JournalThemeId)}
            className="text-xs font-medium text-slate-800 bg-transparent focus:outline-none cursor-pointer"
            title="切换顶刊配色与线宽规范"
          >
            {Object.values(JOURNAL_THEMES).map((th) => (
              <option key={th.id} value={th.id}>
                主题: {th.venueBadge}
              </option>
            ))}
          </select>
        </div>

        {/* TeX Live Exact Preview / Split Toggle */}
        <button
          onClick={handleCompileTex}
          disabled={isCompilingTex}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            previewMode !== 'interactive'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
          title="调用本地 TeX Live 编译或开启分屏白纸打印校准视图"
        >
          {previewMode !== 'interactive' ? (
            <Eye className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Play className="w-3.5 h-3.5 text-slate-600" />
          )}
          <span>{previewMode !== 'interactive' ? '退出分屏预览' : 'TeX 预览'}</span>
        </button>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出</span>
          </button>

          {showExportMenu && (
            <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40 text-xs">
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase">
                论文插图与代码导出
              </div>
              <button
                onClick={() => {
                  triggerFileDownload(
                    'figure.tikz',
                    tikzCode,
                    'text/plain;charset=utf-8'
                  );
                  setShowExportMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
              >
                <FileCode2 className="w-4 h-4 text-blue-600" />
                <div>
                  <div className="font-medium">干净 TikZ 代码 (.tikz)</div>
                  <div className="text-[10px] text-slate-400">
                    可直接 \input&#123;figure.tikz&#125; 嵌入论文
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  const figEnv = buildPaperFigureEnvironment(
                    tikzCode,
                    parsedDoc.figureCaption,
                    parsedDoc.figureLabel
                  );
                  triggerFileDownload(
                    'figure-environment.tex',
                    figEnv,
                    'text/plain;charset=utf-8'
                  );
                  setShowExportMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
              >
                <BookOpenText className="w-4 h-4 text-indigo-600" />
                <div>
                  <div className="font-medium">
                    含 \caption 的论文 Figure 环境 (.tex)
                  </div>
                  <div className="text-[10px] text-slate-400">
                    包含 \begin&#123;figure&#125; + \caption + \label
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  const fullTex = buildStandaloneLatexDocument(
                    tikzCode,
                    activeThemeId
                  );
                  triggerFileDownload(
                    'figure-standalone.tex',
                    fullTex,
                    'text/plain;charset=utf-8'
                  );
                  setShowExportMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
              >
                <FileText className="w-4 h-4 text-emerald-600" />
                <div>
                  <div className="font-medium">完整 Standalone 文档 (.tex)</div>
                  <div className="text-[10px] text-slate-400">
                    含完整导言区、宏包与顶刊色彩定义
                  </div>
                </div>
              </button>

              <button
                onClick={handleExportSvg}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
              >
                <ImageIcon className="w-4 h-4 text-amber-600" />
                <div>
                  <div className="font-medium">无损矢量图 (.svg)</div>
                  <div className="text-[10px] text-slate-400">
                    可用于 Illustrator / Keynote / 网页展示
                  </div>
                </div>
              </button>

              <button
                onClick={handleExportPdfPrint}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 border-t border-slate-100 mt-1 pt-2"
              >
                <Download className="w-4 h-4 text-purple-600" />
                <div>
                  <div className="font-medium">导出矢量 PDF (.pdf)</div>
                  <div className="text-[10px] text-slate-400">
                    生成高清论文插图 PDF
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
