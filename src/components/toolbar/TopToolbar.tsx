import { useShallow } from 'zustand/react/shallow';
import React, { useState, useEffect, useRef } from 'react';
import {
  CanvasTool,
  useWorkspaceStore,
} from '../../store/useWorkspaceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useProjectStore } from '../../store/useProjectStore';
import { JOURNAL_THEMES } from '../../core/themes/journal-presets';
import { JournalThemeId } from '../../types/theme';
import {
  buildPaperFigureEnvironment,
  buildStandaloneLatexDocument,
} from '../../core/tex/document';
import { getExactPreviewReasons } from '../../core/tex/source';
import { compileWorkspaceTexPreview } from '../../core/tex/preview';
import { hasDrawableFigure } from '../../core/paper/figure-insertion';
import {
  exportCleanCanvasSvg,
  exportSvgStringPng,
} from '../../core/export/svg-exporter';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowUpRight,
  BarChart3,
  BookOpenText,
  Box,
  CheckCircle2,
  ChevronDown,
  CirclePlus,
  CornerDownRight,
  Download,
  Eye,
  FileCode2,
  FileText,
  FolderOpen,
  Group,
  Image as ImageIcon,
  MousePointer,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Redo2,
  Save,
  Settings,
  Sigma,
  Sparkles,
  Square,
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const WorkbenchSwitcher: React.FC = () => {
  const mode = useProjectStore((s) => s.workbenchMode);
  const setMode = useProjectStore((s) => s.setWorkbenchMode);
  return (
    <nav aria-label="工作区" className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs">
      {([
        { id: 'paper', label: '论文', Icon: FileText },
        { id: 'figure', label: '绘图', Icon: ImageIcon },
      ] as const).map(({ id, label, Icon }) => (
        <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 cursor-pointer transition-colors ${
            mode === id ? 'bg-white text-slate-900 shadow-xs font-medium' : 'text-slate-500 hover:text-slate-800'
          }`}>
          <Icon className="h-3.5 w-3.5" />{label}
        </button>
      ))}
    </nav>
  );
};

const PaperTopToolbar: React.FC = () => {
  const projectName = useProjectStore((s) => s.projectName);
  const projectDir = useProjectStore((s) => s.projectDir);
  const setPickerOpen = useProjectStore((s) => s.setPickerOpen);
  const insertionNotice = useProjectStore((s) => s.figureInsertionError || s.lastExportedNotice);
  const openSettings = useSettingsStore((s) => s.openSettings);
  return (
    <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-4 shrink-0 select-none">
      <div className="flex items-center gap-2 shrink-0">
        <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" />
        <span className="text-sm font-semibold tracking-tight hidden sm:block">AgenTikZ</span>
      </div>
      <span className="h-5 w-px bg-slate-200" />
      <button type="button" onClick={() => setPickerOpen(true)}
        className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900 min-w-0 max-w-64 cursor-pointer"
        title={projectDir || '打开论文项目 (Ctrl+O)'}>
        <FolderOpen className="w-4 h-4 shrink-0 text-slate-400" />
        <span className="truncate">{projectDir ? projectName : '论文工作区'}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
      </button>
      <div className="flex-1" />
      {insertionNotice && <span className="hidden md:block max-w-xs truncate text-[11px] text-slate-600" title={insertionNotice} role="status">{insertionNotice}</span>}
      <WorkbenchSwitcher />
      <button type="button" onClick={() => openSettings('general')} title="设置 (Ctrl+,)"
        className="p-2 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">
        <Settings className="w-4 h-4" />
      </button>
    </header>
  );
};

const FigureTopToolbar: React.FC = () => {
  const {
    tikzCode, parsedDoc, activeTool, activeThemeId, selectedIds,
    previewMode, undoStack, redoStack, isCompilingTex,
    isAgentPanelCollapsed,
    setActiveTool, setActiveTheme, setPreviewMode,
    undo, redo, alignSelectedNodes, toggleAgentPanel,
  } = useWorkspaceStore(useShallow((s) => ({
    tikzCode: s.tikzCode,
    parsedDoc: s.parsedDoc,
    activeTool: s.activeTool,
    activeThemeId: s.activeThemeId,
    selectedIds: s.selectedIds,
    previewMode: s.previewMode,
    undoStack: s.undoStack,
    redoStack: s.redoStack,
    isCompilingTex: s.isCompilingTex,
    isAgentPanelCollapsed: s.isAgentPanelCollapsed,
    setActiveTool: s.setActiveTool,
    setActiveTheme: s.setActiveTheme,
    setPreviewMode: s.setPreviewMode,
    undo: s.undo,
    redo: s.redo,
    alignSelectedNodes: s.alignSelectedNodes,
    toggleAgentPanel: s.toggleAgentPanel,
  })));
  const { openSettings } = useSettingsStore(useShallow((s) => ({
    openSettings: s.openSettings,
  })));
  const {
    projectDir,
    projectName,
    activeCanvasFileName,
    saveStatus,
    lastExportedNotice,
    setInsertFigureModalOpen,
    quickInsertActiveFigureIntoPaper,
    isInsertingFigure,
    figureInsertionError,
    paperFiles,
    setPickerOpen,
    exportFileToProject,
  } = useProjectStore(useShallow((s) => ({
    projectDir: s.projectDir,
    projectName: s.projectName,
    activeCanvasFileName: s.activeCanvasFileName,
    saveStatus: s.saveStatus,
    lastExportedNotice: s.lastExportedNotice,
    setInsertFigureModalOpen: s.setInsertFigureModalOpen,
    quickInsertActiveFigureIntoPaper: s.quickInsertActiveFigureIntoPaper,
    isInsertingFigure: s.isInsertingFigure,
    figureInsertionError: s.figureInsertionError,
    paperFiles: s.paperFiles,
    setPickerOpen: s.setPickerOpen,
    exportFileToProject: s.exportFileToProject,
  })));

  const stem = activeCanvasFileName.replace(/\.canvas\.json$/i, '') || 'figure';
  const requiresExactPreview = getExactPreviewReasons(tikzCode).length > 0;

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
    if (useWorkspaceStore.getState().isCompilingTex) return;
    if (previewMode !== 'interactive' && !requiresExactPreview) {
      setPreviewMode('interactive');
      return;
    }
    await compileWorkspaceTexPreview();
  };

  const getFigureSvg = (): string | null => {
    const compiled = useWorkspaceStore.getState().compiledSvg;
    if (compiled) return compiled;
    const svgEl = document.getElementById(requiresExactPreview
      ? 'agentikz-vector-preview-svg' : 'agentikz-canvas-svg') as SVGSVGElement | null;
    if (svgEl) return exportCleanCanvasSvg(svgEl);
    void compileWorkspaceTexPreview();
    return null;
  };

  const handleExportSvg = () => {
    const svg = getFigureSvg();
    if (!svg) return;
    triggerFileDownload(`${stem}.svg`, svg, 'image/svg+xml;charset=utf-8');
    setShowExportMenu(false);
  };

  const handleExportPng = async () => {
    const svg = getFigureSvg();
    if (!svg) return;
    setShowExportMenu(false);
    try {
      const pngBlob = await exportSvgStringPng(svg, 3);
      const url = URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${stem}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export PNG:', err);
    }
  };

  const handleProjectExportTikz = async () => {
    setShowExportMenu(false);
    await exportFileToProject(`${stem}.tikz`, tikzCode, false);
  };

  const handleProjectExportSvg = async () => {
    const svg = getFigureSvg();
    if (!svg) return;
    setShowExportMenu(false);
    await exportFileToProject(`${stem}.svg`, svg, false);
  };

  const handleProjectExportPng = async () => {
    const svg = getFigureSvg();
    if (!svg) return;
    setShowExportMenu(false);
    try {
      const pngBlob = await exportSvgStringPng(svg, 3);
      const base64Data = await blobToBase64(pngBlob);
      await exportFileToProject(`${stem}.png`, base64Data, true);
    } catch (err) {
      console.error('Failed to export PNG to project:', err);
    }
  };

  const saveDotClass =
    saveStatus === 'saved'
      ? 'bg-emerald-500'
      : saveStatus === 'dirty' || saveStatus === 'saving'
      ? 'bg-blue-500 animate-pulse'
      : saveStatus === 'error'
      ? 'bg-rose-500'
      : 'bg-slate-400';

  return (
    <header className="min-h-12 bg-toolbar-gradient border-b border-slate-200/80 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0 select-none z-30">
      {/* Left: Brand + Project Pill (with Auto-Sync Dot) + Undo/Redo */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <img
            src="/icon.svg"
            alt="AgenTikZ"
            className="w-7 h-7 rounded-lg shadow-xs select-none"
          />
          <div className="leading-none hidden sm:block">
            <span className="font-bold text-[13px] tracking-tight text-slate-900">AgenTikZ</span>
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 border border-blue-200/60 font-medium">
              Studio
            </span>
          </div>
        </div>

        <div className="w-px h-5 bg-slate-200/80" />

        <button
          onClick={() => setPickerOpen(true)}
          title="切换或新建论文/项目工作区 (Ctrl+O) · 全程自动同步保存"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/80 hover:bg-white text-slate-700 border border-slate-200/80 shadow-xs transition-all cursor-pointer max-w-[175px]"
        >
          <FolderOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="truncate">{projectName || '未关联项目'}</span>
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${saveDotClass}`}
            title={
              saveStatus === 'saved'
                ? '所有更改已自动同步至磁盘'
                : saveStatus === 'saving' || saveStatus === 'dirty'
                ? '正在后台自动同步...'
                : '本地缓存模式'
            }
          />
        </button>

          <>
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
          </>
      </div>

      {/* Drawing tools */}
        <div className="flex max-w-full overflow-x-auto items-center gap-0.5 bg-white/60 border border-slate-200/70 rounded-xl p-0.5 shadow-sm">
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
      {/* Right: Workbench Switcher + 1-Click Split-Button Insert + Theme + Preview + Export + Agent Toggle */}
      <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
        {figureInsertionError && <span className="max-w-64 truncate text-[11px] text-amber-700" role="status" title={figureInsertionError}>{figureInsertionError}</span>}
        {lastExportedNotice && (
          <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium shadow-xs animate-fade-in">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="max-w-[200px] truncate">{lastExportedNotice}</span>
          </div>
        )}

        {/* One-Stop Workbench Mode Switcher */}
        <WorkbenchSwitcher />

        {/* 1-Click Split-Button: Direct Insert at Cursor + Advanced Dropdown */}
        <div className="hidden md:flex items-center rounded-lg bg-indigo-50 border border-indigo-200/80 shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => void quickInsertActiveFigureIntoPaper()}
            disabled={isInsertingFigure || !projectDir || !paperFiles.some((file) => /\.tex$/i.test(file.relativePath)) || !hasDrawableFigure(tikzCode)}
            title={!projectDir || !paperFiles.some((file) => /\.tex$/i.test(file.relativePath)) ? '请先打开或新建论文；右侧箭头可打开插图设置'
              : !hasDrawableFigure(tikzCode) ? '当前画布为空，请先绘图或通过右侧箭头选择已有图片'
              : '保存当前配图后插入目标章节的安全位置；重复点击只定位已有配图'}
            className="flex items-center gap-1 pl-2.5 pr-2 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer disabled:opacity-40"
          >
            <BookOpenText className="w-3.5 h-3.5 text-indigo-600" />
            <span>{isInsertingFigure ? '插入中…' : '插入当前配图'}</span>
          </button>
          <button
            type="button"
            onClick={() => setInsertFigureModalOpen(true)}
            disabled={isInsertingFigure}
            title="展开高级插图设置（切换单双栏、\includegraphics 外部图模式、自定义 Caption）"
            className="px-1.5 py-1.5 border-l border-indigo-200/80 text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

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
            <span>{isCompilingTex ? '编译中…' : requiresExactPreview ? '重新编译 TeX' : previewMode !== 'interactive' ? '退出预览' : 'TeX'}</span>
          </button>

        <button
          onClick={() => openSettings('agent')}
          title="打开设置中心 (Ctrl+,) — Agent (ACP) 与通用配置"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/70 text-slate-700 border border-slate-200/70 hover:bg-white shadow-sm transition-all cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5 text-slate-500" />
          <span>设置</span>
        </button>

        <div className="relative" ref={exportMenuRef}>
          <button onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white shadow-sm transition-all cursor-pointer">
            <Download className="w-3.5 h-3.5" />
            <span>导出</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200/80 rounded-2xl shadow-xl py-2 z-40 text-xs overflow-hidden">
              {projectDir && (
                <>
                  <div className="px-3.5 py-1.5 text-[10px] font-semibold text-blue-600 uppercase tracking-wider bg-blue-50/50">
                    一键导出至项目目录 (agentikzfile/export/)
                  </div>
                  {[
                    {
                      icon: <FileCode2 className="w-4 h-4 text-blue-600" />,
                      title: `${stem}.tikz (TikZ 源码)`,
                      desc: '直接保存到 agentikzfile/export/ 供论文 \\input',
                      action: () => void handleProjectExportTikz(),
                    },
                    {
                      icon: <ImageIcon className="w-4 h-4 text-amber-500" />,
                      title: `${stem}.svg (无背景纯矢量图)`,
                      desc: '直接保存纯矢量 SVG 到项目导出目录',
                      action: () => void handleProjectExportSvg(),
                    },
                    {
                      icon: <ImageIcon className="w-4 h-4 text-rose-500" />,
                      title: `${stem}.png (300DPI 高清位图)`,
                      desc: '直接保存高清透明 PNG 到项目导出目录',
                      action: () => void handleProjectExportPng(),
                    },
                  ].map((item, i) => (
                    <button
                      key={`proj-${i}`}
                      onClick={item.action}
                      className="w-full text-left px-3.5 py-2 hover:bg-blue-50/60 flex items-center gap-2.5 text-slate-700 transition-colors cursor-pointer"
                    >
                      {item.icon}
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{item.title}</div>
                        <div className="text-[10px] text-slate-400 truncate">{item.desc}</div>
                      </div>
                    </button>
                  ))}
                  <div className="my-1.5 border-t border-slate-100" />
                </>
              )}

              <div className="px-3.5 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                另存为下载文件
              </div>
              {[
                { icon: <FileCode2 className="w-4 h-4 text-blue-500" />, title: 'TikZ 代码 (.tikz)', desc: '可直接 \\input 嵌入论文',
                  action: () => { triggerFileDownload(`${stem}.tikz`, tikzCode, 'text/plain;charset=utf-8'); setShowExportMenu(false); } },
                { icon: <BookOpenText className="w-4 h-4 text-indigo-500" />, title: 'Figure 环境 (.tex)', desc: '含 \\caption + \\label',
                  action: () => { triggerFileDownload(`${stem}-env.tex`, buildPaperFigureEnvironment(tikzCode, parsedDoc.figureCaption, parsedDoc.figureLabel), 'text/plain;charset=utf-8'); setShowExportMenu(false); } },
                { icon: <FileText className="w-4 h-4 text-emerald-500" />, title: 'Standalone 文档 (.tex)', desc: '含导言区与色彩宏',
                  action: () => { triggerFileDownload(`${stem}-standalone.tex`, buildStandaloneLatexDocument(tikzCode, activeThemeId), 'text/plain;charset=utf-8'); setShowExportMenu(false); } },
                { icon: <ImageIcon className="w-4 h-4 text-amber-500" />, title: '矢量图 (.svg)', desc: '无网格透明背景 · 纯矢量公式',
                  action: handleExportSvg },
                { icon: <ImageIcon className="w-4 h-4 text-rose-500" />, title: '高清位图 (.png)', desc: '300DPI 透明背景 · PPT/文档即插即用',
                  action: handleExportPng },
                { icon: <Download className="w-4 h-4 text-purple-500" />, title: '打印 PDF (.pdf)', desc: '高清论文插图',
                  action: () => { setShowExportMenu(false); window.print(); } },
              ].map((item, i) => (
                <button key={i} onClick={item.action}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 transition-colors cursor-pointer">
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

        <button
          onClick={toggleAgentPanel}
          title="折叠/展开右侧 AI 绘图助手"
          className={`flex items-center justify-center p-1.5 rounded-lg border transition-all cursor-pointer ${
            isAgentPanelCollapsed
              ? 'bg-white/70 text-slate-600 border-slate-200/70 hover:bg-white shadow-sm'
              : 'bg-blue-50 text-blue-600 border-blue-200/80 hover:bg-blue-100/80 shadow-sm'
          }`}
        >
          {isAgentPanelCollapsed ? (
            <PanelRightOpen className="w-4 h-4" />
          ) : (
            <PanelRightClose className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  );
};

export const TopToolbar: React.FC = () => {
  const mode = useProjectStore((s) => s.workbenchMode);
  return mode === 'paper' ? <PaperTopToolbar /> : <FigureTopToolbar />;
};
