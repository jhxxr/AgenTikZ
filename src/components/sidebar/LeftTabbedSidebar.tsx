import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useAgentStore } from '../../store/useAgentStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import {
  useProjectStore,
  AGENTIKZ_FOLDER_NAME,
  ProjectAssetItem,
} from '../../store/useProjectStore';
import { generateScientificIllustration } from '../../core/agent/illustration-prompt';
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
  FolderKanban,
  FolderOpen,
  FileText,
  Images,
  RefreshCw,
  Upload,
  Search,
  ExternalLink,
  Copy,
  Trash2,
  FilePlus2,
  Wand2,
  PanelLeftClose,
  PanelLeftOpen,
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

const MAX_AUTO_THUMBNAIL_BYTES = 8 * 1024 * 1024; // 8 MB

const AssetThumbnailCard: React.FC<{
  asset: ProjectAssetItem;
  dataUrl?: string;
  onInsert: (relPath: string) => void;
}> = React.memo(({ asset, dataUrl, onInsert }) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const hasDataUrl = Boolean(dataUrl);

  useEffect(() => {
    if (
      hasDataUrl ||
      asset.ext === 'pdf' ||
      (asset.sizeBytes > 0 && asset.sizeBytes > MAX_AUTO_THUMBNAIL_BYTES)
    ) {
      return;
    }

    const triggerLoad = () => {
      void useProjectStore.getState().ensureAssetDataUrl(asset.relativePath);
    };

    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      triggerLoad();
      return;
    }

    let didTrigger = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !didTrigger) {
          didTrigger = true;
          observer.disconnect();
          triggerLoad();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [asset.relativePath, asset.ext, asset.sizeBytes, hasDataUrl]);

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          'application/x-agentikz-asset',
          asset.relativePath
        );
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onInsert(asset.relativePath)}
      title={`点击或拖拽至画布: ${asset.relativePath}`}
      className="group rounded-xl border border-slate-200/90 bg-white hover:border-indigo-400 hover:shadow-xs overflow-hidden flex flex-col transition-all cursor-pointer"
    >
      <div className="h-20 bg-slate-50 border-b border-slate-100 flex items-center justify-center p-1.5 relative overflow-hidden">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={asset.fileName}
            loading="lazy"
            decoding="async"
            className="max-h-full max-w-full object-contain rounded-xs group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-400 gap-1">
            <Images className="w-5 h-5" />
            <span className="text-[9px] uppercase font-mono">{asset.ext}</span>
          </div>
        )}
        <span className="absolute top-1 right-1 px-1.5 py-0.2 rounded bg-slate-900/70 text-white text-[9px] font-mono uppercase">
          {asset.ext}
        </span>
        <div className="absolute inset-0 bg-indigo-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="px-2 py-1 rounded-md bg-white text-indigo-700 text-[10px] font-bold shadow-xs flex items-center gap-1">
            <Plus className="w-3 h-3" />
            加入画布
          </span>
        </div>
      </div>
      <div className="p-2">
        <div className="text-[11px] font-semibold text-slate-800 truncate">
          {asset.fileName}
        </div>
        <div className="text-[9.5px] font-mono text-slate-400 truncate mt-0.5">
          {asset.relativePath}
        </div>
      </div>
    </div>
  );
});

export const LeftTabbedSidebar: React.FC = () => {
  const {
    leftTab,
    activeTemplateId,
    activeThemeId,
    highlightedLineRange,
    isLeftSidebarCollapsed,
    setLeftTab,
    toggleLeftSidebar,
    addPrimitiveToCanvas,
    addImageAssetToCanvas,
    setAgentPanelCollapsed,
  } = useWorkspaceStore();
  const setTemplateReference = useAgentStore((state) => state.setTemplateReference);
  const referenceTemplateId = useAgentStore((state) =>
    state.sessions.find((session) => session.id === state.activeSessionId)?.templateReferenceId
  );
  const settings = useSettingsStore();

  const {
    projectDir,
    projectName,
    workbenchMode,
    paperFiles,
    activePaperFilePath,
    canvases,
    activeCanvasFileName,
    assets,
    assetDataUrls,
    isScanningAssets,
    setPickerOpen,
    setWorkbenchMode,
    openPaperFile,
    createNewPaperFile,
    refreshPaperFiles,
    switchCanvasFile,
    createNewCanvasFile,
    duplicateCurrentCanvasFile,
    deleteCanvasFile,
    refreshProjectAssets,
    registerLocalBrowserAssetFiles,
    registerGeneratedAsset,
    revealInFileManager,
  } = useProjectStore();

  const [selectedCategory, setSelectedCategory] =
    useState<TemplateCategory>('all');
  const [assetFolderFilter, setAssetFolderFilter] = useState<string>('all');
  const [assetSearch, setAssetSearch] = useState<string>('');
  const [visibleAssetLimit, setVisibleAssetLimit] = useState<number>(24);
  const [showAiGenerator, setShowAiGenerator] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiAspect, setAiAspect] = useState<'1:1' | '4:3' | '16:9'>('1:1');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const handleInsertAsset = useCallback(
    (relPath: string) => {
      addImageAssetToCanvas(relPath);
    },
    [addImageAssetToCanvas]
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const externalFigInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (leftTab === 'project' && paperFiles.length === 0) {
      void refreshPaperFiles();
    }
  }, [leftTab, paperFiles.length, refreshPaperFiles]);

  const manuscriptFiles = useMemo(
    () => paperFiles.filter((pf) => pf.category !== 'figure_tikz'),
    [paperFiles]
  );

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

  const assetFolders = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) {
      set.add(a.folder || '.');
    }
    return ['all', ...Array.from(set)];
  }, [assets]);

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      if (assetFolderFilter !== 'all' && a.folder !== assetFolderFilter) {
        return false;
      }
      if (assetSearch.trim()) {
        const q = assetSearch.trim().toLowerCase();
        return (
          a.fileName.toLowerCase().includes(q) ||
          a.relativePath.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [assets, assetFolderFilter, assetSearch]);

  if (isLeftSidebarCollapsed) {
    return (
      <aside className="w-11 h-full bg-slate-50/95 border-r border-slate-200/80 flex flex-col items-center py-2.5 justify-between shrink-0 select-none z-20">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={toggleLeftSidebar}
            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
            title="展开左侧资源与代码栏"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>

          <div className="w-5 h-px bg-slate-200 my-0.5" />

          <button
            type="button"
            onClick={() => setLeftTab('project')}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              leftTab === 'project'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'text-slate-500 hover:text-slate-900 hover:bg-white'
            }`}
            title="论文手稿、配图与素材"
          >
            <FolderKanban className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setLeftTab('library')}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              leftTab === 'library'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-slate-500 hover:text-slate-900 hover:bg-white'
            }`}
            title="科研原语与顶刊模板库"
          >
            <Blocks className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setLeftTab('code')}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              leftTab === 'code'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-slate-500 hover:text-slate-900 hover:bg-white'
            }`}
            title="TikZ 源码编辑器"
          >
            <Code2 className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={toggleLeftSidebar}
          className="text-[10.5px] font-semibold text-slate-400 hover:text-indigo-600 tracking-widest cursor-pointer py-2"
          style={{ writingMode: 'vertical-rl' }}
          title="展开左侧面板"
        >
          项目 · 模板 · 源码
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`${
        leftTab === 'code' ? 'w-[390px]' : 'w-[330px]'
      } h-full bg-sidebar-gradient border-r border-slate-200/80 flex flex-col shrink-0 transition-[width] duration-200 select-none`}
    >
      {/* 3-Tab Header + Collapse Button */}
      <div className="p-1.5 bg-white/60 border-b border-slate-200/80 flex items-center gap-1">
        <div className="grid grid-cols-3 gap-1 flex-1 min-w-0">
          <button
            onClick={() => setLeftTab('project')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              leftTab === 'project'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">目录与素材</span>
          </button>

          <button
            onClick={() => setLeftTab('library')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              leftTab === 'library'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Blocks className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">组件与模板</span>
          </button>

          <button
            onClick={() => setLeftTab('code')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              leftTab === 'code'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">TikZ 代码</span>
            {highlightedLineRange && (
              <span className="px-1 py-0.2 text-[9px] rounded bg-blue-50 text-blue-700 font-mono">
                L{highlightedLineRange.startLine}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={toggleLeftSidebar}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-white/80 shrink-0 cursor-pointer"
          title="折叠左侧栏以扩大中心视野"
        >
          <PanelLeftClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {leftTab === 'code' ? (
        <div className="flex-1 overflow-hidden">
          <TikzCodePanel />
        </div>
      ) : leftTab === 'project' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* Section 1: Compact Project Summary */}
            <div className="px-3 py-2 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800 truncate">
                    {projectName}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  {projectDir || '本地暂存工作区 · 点击右侧关联目录'}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {projectDir && (
                  <button
                    type="button"
                    onClick={() => void revealInFileManager(projectDir)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title="在系统资源管理器中打开论文目录"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10.5px] font-semibold transition-colors cursor-pointer"
                >
                  {projectDir ? '切换' : '关联目录'}
                </button>
              </div>
            </div>

            {/* Section 1.5: Paper Manuscript Files (main.tex, sections/*.tex, references.bib) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <FileCode2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>论文手稿 ({manuscriptFiles.length})</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const name = window.prompt(
                        '新建论文章节或宏包相对路径（例如 sections/discussion.tex）：',
                        'sections/discussion.tex'
                      );
                      if (name && name.trim()) {
                        void createNewPaperFile(
                          name.trim(),
                          `% ${name.trim()}\n\\section{Discussion}\n\n`
                        );
                        if (workbenchMode === 'figure') {
                          setWorkbenchMode('split');
                        }
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-medium transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>新建章节</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshPaperFiles()}
                    className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                    title="刷新论文目录下的 .tex / .bib / .sty 文件"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
                {manuscriptFiles.map((pf) => {
                  const isCurPaper =
                    pf.relativePath === activePaperFilePath &&
                    workbenchMode !== 'figure';
                  return (
                    <button
                      key={pf.relativePath}
                      type="button"
                      onClick={() => {
                        void openPaperFile(pf.relativePath);
                        if (workbenchMode === 'figure') {
                          setWorkbenchMode('split');
                        }
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isCurPaper
                          ? 'bg-blue-50/90 border-blue-300 text-blue-900'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileCode2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            pf.category === 'main'
                              ? 'text-blue-600'
                              : pf.category === 'bib'
                                ? 'text-amber-600'
                                : pf.category === 'style'
                                  ? 'text-purple-600'
                                  : 'text-slate-500'
                          }`}
                        />
                        <span className="text-[11px] font-mono truncate">
                          {pf.relativePath}
                        </span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 uppercase font-mono shrink-0">
                        {pf.category === 'main'
                          ? '主文档'
                          : pf.category === 'bib'
                            ? 'BibTeX'
                            : pf.category === 'style'
                              ? '宏包'
                              : '章节'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Unified Scientific Figures (figures/*.tikz) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span>科研配图 figures/*.tikz ({canvases.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void createNewCanvasFile(
                      `Fig ${canvases.length + 1} - New Figure`
                    )
                  }
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[10.5px] font-medium transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>新建配图</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {canvases.map((c) => {
                  const isActive = c.fileName === activeCanvasFileName;
                  const stem = c.fileName.replace(/\.canvas\.json$/i, '');
                  return (
                    <div
                      key={c.fileName}
                      onClick={() => void switchCanvasFile(c.fileName)}
                      className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50/70 border-indigo-300 shadow-2xs'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs truncate ${
                              isActive
                                ? 'font-bold text-indigo-900'
                                : 'font-medium text-slate-700'
                            }`}
                          >
                            {c.name}
                          </span>
                          {isActive && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-600 text-white text-[9px] font-semibold shrink-0">
                              当前
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                          figures/{stem}.tikz
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isActive && (
                          <button
                            type="button"
                            onClick={() => void duplicateCurrentCanvasFile()}
                            className="p-1 rounded hover:bg-white text-slate-400 hover:text-indigo-600"
                            title="复制此画布"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        )}
                        {canvases.length > 1 && (
                          <button
                            type="button"
                            onClick={() => void deleteCanvasFile(c.fileName)}
                            className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                            title="删除此画布"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Project Image Assets, AI Cutout Generator & External Figure Import */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <Images className="w-3.5 h-3.5 text-amber-600" />
                  <span>图像素材与外部成品图 ({assets.length})</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        void registerLocalBrowserAssetFiles(
                          e.target.files,
                          'figures/assets'
                        );
                        e.target.value = '';
                      }
                    }}
                  />
                  <input
                    ref={externalFigInputRef}
                    type="file"
                    accept=".pdf,.svg,.png,.jpg,.jpeg,.webp"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      if (e.target.files) {
                        const imported = await registerLocalBrowserAssetFiles(
                          e.target.files,
                          'figures/external'
                        );
                        e.target.value = '';
                        if (imported.length > 0 && imported[0].ext !== 'pdf') {
                          addImageAssetToCanvas(imported[0].relativePath);
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAiGenerator(!showAiGenerator)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                      showAiGenerator
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                    }`}
                    title="使用 gpt-image-2 / Gemini / OpenRouter 生成透明抠图科研插图"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>AI 抠图</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => externalFigInputRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium transition-colors cursor-pointer"
                    title="导入外部画好的成品图 (.pdf/.svg/.png) 到 figures/external/"
                  >
                    <Upload className="w-3 h-3" />
                    <span>导入外部图</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshProjectAssets()}
                    className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                    title="刷新专属目录 (figures/assets/ 与 figures/external/) 中的图片素材"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${
                        isScanningAssets ? 'animate-spin text-indigo-600' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Collapsible AI Cutout Illustration Generator */}
              {showAiGenerator && (
                <div className="mb-3 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-950 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      AI 透明抠图科研插图生成器
                    </span>
                    <button
                      type="button"
                      onClick={() => settings.openSettings('illustration')}
                      className="text-[10px] text-emerald-700 hover:underline cursor-pointer"
                    >
                      配置 API ({settings.imageGenProvider})
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="例如: 3D isometric robotic arm holding a silicon wafer, clean scientific illustration..."
                    className="w-full px-2 py-1.5 text-xs bg-white border border-emerald-200 rounded-lg focus:outline-none focus:border-emerald-500 resize-none"
                  />
                  <div className="flex items-center gap-1.5">
                    <select
                      value={aiAspect}
                      onChange={(e) =>
                        setAiAspect(e.target.value as '1:1' | '4:3' | '16:9')
                      }
                      className="px-2 py-1 text-[10.5px] bg-white border border-emerald-200 rounded-md font-mono"
                    >
                      <option value="1:1">1:1</option>
                      <option value="4:3">4:3</option>
                      <option value="16:9">16:9</option>
                    </select>
                    <button
                      type="button"
                      disabled={isGeneratingAi || !aiPrompt.trim()}
                      onClick={async () => {
                        if (!aiPrompt.trim() || isGeneratingAi) return;
                        setIsGeneratingAi(true);
                        setAiMessage('正在生成并执行边缘泛洪去背 + Alpha 紧致裁切...');
                        try {
                          const slug = aiPrompt
                            .trim()
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '_')
                            .replace(/^_|_$/g, '')
                            .slice(0, 24) || 'cutout';
                          const targetRel = `figures/assets/ai/${slug}_${Date.now().toString().slice(-4)}.png`;
                          const res = await generateScientificIllustration({
                            provider: settings.imageGenProvider,
                            apiKey: settings.imageGenApiKey,
                            baseUrl: settings.imageGenBaseUrl,
                            model: settings.imageGenModel,
                            subjectPrompt: aiPrompt.trim(),
                            themeId: activeThemeId,
                            aspectRatio: aiAspect,
                            transparentBackground: settings.imageGenAutoRemoveWhiteBg,
                            autoTrimAlpha: settings.imageGenAutoTrimAlpha,
                            projectDir,
                            targetRelativePath: targetRel,
                            proxyUrl: settings.proxyEnabled
                              ? settings.proxyUrl
                              : undefined,
                          });
                          if (!res.ok || !res.dataUrl) {
                            setAiMessage(`❌ 失败: ${res.error || '未知错误'}`);
                          } else {
                            const savedRel = await registerGeneratedAsset(
                              res.savedRelativePath || targetRel,
                              res.dataUrl
                            );
                            addImageAssetToCanvas(savedRel);
                            setAiMessage(`✅ 已生成并插入画布: ${savedRel}`);
                          }
                        } catch (err) {
                          setAiMessage(`❌ 错误: ${String(err)}`);
                        } finally {
                          setIsGeneratingAi(false);
                        }
                      }}
                      className="flex-1 py-1 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <Wand2 className="w-3 h-3" />
                      <span>
                        {isGeneratingAi ? '正在生成抠图...' : '生成并嵌入画布'}
                      </span>
                    </button>
                  </div>
                  {aiMessage && (
                    <div className="text-[10px] text-emerald-900 bg-white/90 px-2 py-1 rounded border border-emerald-200">
                      {aiMessage}
                    </div>
                  )}
                </div>
              )}

              {/* Folder Filter Pills & Search */}
              {assets.length > 0 && (
                <div className="space-y-2 mb-2.5">
                  {assetFolders.length > 2 && (
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
                      {assetFolders.map((folder) => (
                        <button
                          key={folder}
                          type="button"
                          onClick={() => setAssetFolderFilter(folder)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono shrink-0 transition-colors cursor-pointer ${
                            assetFolderFilter === folder
                              ? 'bg-slate-800 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {folder === 'all'
                            ? `全部 (${assets.length})`
                            : folder === '.'
                              ? '根目录 (.)'
                              : folder}
                        </button>
                      ))}
                    </div>
                  )}

                  {assets.length > 4 && (
                    <div className="relative">
                      <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={assetSearch}
                        onChange={(e) => setAssetSearch(e.target.value)}
                        placeholder="搜索专属素材目录图片文件名..."
                        className="w-full pl-7 pr-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                  )}
                </div>
              )}

              {filteredAssets.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-white/60 text-center space-y-2">
                  <Images className="w-6 h-6 text-slate-300 mx-auto" />
                  <div className="text-[11px] font-medium text-slate-600">
                    {projectDir
                      ? '专属素材目录下暂无生成或导入的图片'
                      : '尚未关联项目文件夹或导入图片'}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    点击上方「AI 抠图」生成透明插图（保存在{' '}
                    <code className="font-mono">figures/assets/ai/</code>），或点击「导入外部图」将画好的{' '}
                    <code className="font-mono">.pdf/.svg/.png</code> 放入{' '}
                    <code className="font-mono">figures/external/</code>，即可插入论文或拖拽进画布。
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {filteredAssets.slice(0, visibleAssetLimit).map((asset) => (
                      <AssetThumbnailCard
                        key={asset.relativePath}
                        asset={asset}
                        dataUrl={assetDataUrls[asset.relativePath]}
                        onInsert={handleInsertAsset}
                      />
                    ))}
                  </div>
                  {filteredAssets.length > visibleAssetLimit && (
                    <button
                      type="button"
                      onClick={() => setVisibleAssetLimit((n) => n + 24)}
                      className="w-full py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      显示更多素材（剩余 {filteredAssets.length - visibleAssetLimit} 项）
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Docked Live Code Sync */}
          <div className="border-t border-slate-200 shrink-0">
            <LiveCodeSyncBanner
              compact
              onExpandCodeTab={() => setLeftTab('code')}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {/* Section A: Templates */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                  <span>构图参考与快速模板</span>
                </div>
                <span className="text-[10px] text-slate-400">内置 {FULL_FIGURE_TEMPLATES.length} 组</span>
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                AI 借鉴构图思路，按你的需求重新绘制；快速出图可从模板新建，不覆盖当前画布。图表中的数值仅为示例。
              </p>

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
                  const isReference = referenceTemplateId === tpl.id;
                  const stats = templateStats[tpl.id];
                  const venueStyle = VENUE_COLORS[tpl.venue] || VENUE_COLORS['NeurIPS / ICLR'];
                  return (
                    <div
                      key={tpl.id}
                      className={`rounded-xl border overflow-hidden transition-all group ${
                        isReference
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
                          {isReference ? (
                            <span className="text-[10px] text-blue-600 font-bold flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3" /> AI 参考
                            </span>
                          ) : isActive ? (
                            <span className="text-[10px] text-slate-500">当前模板</span>
                          ) : null}
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

                        <details className="mt-2 text-[10.5px] text-slate-500 leading-relaxed">
                          <summary className="cursor-pointer text-slate-600">可借鉴的绘图思路</summary>
                          <p className="mt-1">{tpl.designGuide.intent}</p>
                          <ul className="list-disc pl-4 mt-1 space-y-1">
                            {[...tpl.designGuide.layout, ...tpl.designGuide.adapt].map((idea) => <li key={idea}>{idea}</li>)}
                          </ul>
                        </details>

                        {/* Reference never mutates the canvas; quick start creates a separate file. */}
                        <div className="flex flex-wrap items-center justify-between mt-2 gap-1.5">
                          <div className="flex flex-wrap gap-1 min-w-0">
                            {tpl.tags.slice(0, 2).map((tag) => (
                              <span key={tag} className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void createNewCanvasFile(tpl.title, tpl.id);
                              }}
                              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 flex items-center gap-1 transition-colors cursor-pointer"
                              title="基于此模板在当前项目中新建一个画布文件"
                            >
                              <FilePlus2 className="w-3 h-3" />
                              <span>快速新建</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTemplateReference(tpl.id);
                                setAgentPanelCollapsed(false);
                              }}
                              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 flex items-center gap-1 transition-colors cursor-pointer"
                              title="只附加构图思路；在右侧输入你的绘图需求后发送"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>给 AI 参考</span>
                            </button>
                          </div>
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
