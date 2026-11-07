import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useAgentStore } from '../../store/useAgentStore';
import {
  useProjectStore,
  AGENTIKZ_FOLDER_NAME,
  ProjectAssetItem,
} from '../../store/useProjectStore';
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

const AssetThumbnailCard: React.FC<{
  asset: ProjectAssetItem;
  dataUrl?: string;
  onEnsureDataUrl: (relPath: string) => void;
  onInsert: (relPath: string) => void;
}> = React.memo(({ asset, dataUrl, onEnsureDataUrl, onInsert }) => {
  useEffect(() => {
    if (!dataUrl && asset.ext !== 'pdf') {
      onEnsureDataUrl(asset.relativePath);
    }
  }, [asset.relativePath, asset.ext, dataUrl, onEnsureDataUrl]);

  return (
    <div
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
    highlightedLineRange,
    setLeftTab,
    addPrimitiveToCanvas,
    addImageAssetToCanvas,
    setAgentPanelCollapsed,
  } = useWorkspaceStore();
  const setTemplateReference = useAgentStore((state) => state.setTemplateReference);
  const referenceTemplateId = useAgentStore((state) =>
    state.sessions.find((session) => session.id === state.activeSessionId)?.templateReferenceId
  );

  const {
    projectDir,
    projectName,
    canvases,
    activeCanvasFileName,
    assets,
    assetDataUrls,
    isScanningAssets,
    setPickerOpen,
    switchCanvasFile,
    createNewCanvasFile,
    duplicateCurrentCanvasFile,
    deleteCanvasFile,
    refreshProjectAssets,
    ensureAssetDataUrl,
    registerLocalBrowserAssetFiles,
    revealInFileManager,
  } = useProjectStore();

  const [selectedCategory, setSelectedCategory] =
    useState<TemplateCategory>('all');
  const [assetFolderFilter, setAssetFolderFilter] = useState<string>('all');
  const [assetSearch, setAssetSearch] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <aside
      className={`${
        leftTab === 'code' ? 'w-[410px]' : 'w-[350px]'
      } h-full bg-sidebar-gradient border-r border-slate-200/80 flex flex-col shrink-0 transition-[width] duration-200 select-none`}
    >
      {/* 3-Tab Header */}
      <div className="p-1.5 bg-white/60 border-b border-slate-200/80 grid grid-cols-3 gap-1">
        <button
          onClick={() => setLeftTab('project')}
          className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
            leftTab === 'project'
              ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <FolderKanban className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">项目与素材</span>
        </button>

        <button
          onClick={() => setLeftTab('library')}
          className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
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
          className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
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

      {leftTab === 'code' ? (
        <div className="flex-1 overflow-hidden">
          <TikzCodePanel />
        </div>
      ) : leftTab === 'project' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {/* Section 1: Current Project Folder */}
            <div className="p-3 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {projectName}
                    </span>
                  </div>
                  <div className="text-[10.5px] font-mono text-slate-400 truncate mt-0.5">
                    {projectDir
                      ? `${projectDir}/${AGENTIKZ_FOLDER_NAME}`
                      : '尚未绑定本地论文/项目文件夹'}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {projectDir && (
                    <button
                      type="button"
                      onClick={() => void revealInFileManager()}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      title="在系统资源管理器中打开 agentikzfile 文件夹"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    {projectDir ? '切换目录' : '选择目录'}
                  </button>
                </div>
              </div>
            </div>

            {/* Section 2: Canvas Files in agentikzfile/ */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span>画布存档 ({canvases.length})</span>
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
                  <span>新建画布</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {canvases.map((c) => {
                  const isActive = c.fileName === activeCanvasFileName;
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
                          {AGENTIKZ_FOLDER_NAME}/{c.fileName}
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

            {/* Section 3: Project Image Asset Browser */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <Images className="w-3.5 h-3.5 text-amber-600" />
                  <span>同目录图像素材 ({assets.length})</span>
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
                        void registerLocalBrowserAssetFiles(e.target.files);
                        e.target.value = '';
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium transition-colors cursor-pointer"
                    title="从本地选择图片加入素材库"
                  >
                    <Upload className="w-3 h-3" />
                    <span>导入图片</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshProjectAssets()}
                    className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                    title="重新扫描项目目录中的图片素材"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${
                        isScanningAssets ? 'animate-spin text-indigo-600' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

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
                        placeholder="搜索同目录图片文件名或子目录..."
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
                      ? '当前项目文件夹下暂未扫描到图片文件'
                      : '尚未关联项目文件夹或导入图片'}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    将论文插图（<code className="font-mono">.png/.jpg/.svg</code>）放入项目目录（如{' '}
                    <code className="font-mono">figs/</code>），或点击上方「导入图片」，即可点击或拖拽进画布生成{' '}
                    <code className="font-mono">\includegraphics</code> 节点。
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {filteredAssets.map((asset) => (
                    <AssetThumbnailCard
                      key={asset.relativePath}
                      asset={asset}
                      dataUrl={assetDataUrls[asset.relativePath]}
                      onEnsureDataUrl={(relPath) =>
                        void ensureAssetDataUrl(relPath)
                      }
                      onInsert={(relPath) => addImageAssetToCanvas(relPath)}
                    />
                  ))}
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
