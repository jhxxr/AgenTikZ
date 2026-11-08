import { useShallow } from 'zustand/react/shallow';
import React, { useState } from 'react';
import {
  FolderOpen,
  FolderCheck,
  Clock,
  Star,
  Trash2,
  ExternalLink,
  Search,
  Sparkles,
  FileCode2,
  Images,
  ArrowRight,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  useProjectStore,
  AGENTIKZ_FOLDER_NAME,
} from '../../store/useProjectStore';
import {
  PAPER_VENUE_TEMPLATES,
  type PaperVenueTemplateId,
} from '../../core/paper/paper-templates';

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return new Date(timestamp).toLocaleDateString();
}

export const ProjectPickerModal: React.FC = () => {
  const {
    isPickerOpen,
    setPickerOpen,
    projectDir,
    projectName,
    lastProjectDir,
    autoOpenLastProject,
    setAutoOpenLastProject,
    autoSyncTikz,
    setAutoSyncTikz,
    recentProjects,
    pickAndOpenDirectory,
    openProjectDirectory,
    initPaperWorkspace,
    setWorkbenchMode,
    togglePinRecentProject,
    removeRecentProject,
    revealInFileManager,
    errorMessage,
  } = useProjectStore(useShallow((s) => ({
    isPickerOpen: s.isPickerOpen,
    setPickerOpen: s.setPickerOpen,
    projectDir: s.projectDir,
    projectName: s.projectName,
    lastProjectDir: s.lastProjectDir,
    autoOpenLastProject: s.autoOpenLastProject,
    setAutoOpenLastProject: s.setAutoOpenLastProject,
    autoSyncTikz: s.autoSyncTikz,
    setAutoSyncTikz: s.setAutoSyncTikz,
    recentProjects: s.recentProjects,
    pickAndOpenDirectory: s.pickAndOpenDirectory,
    openProjectDirectory: s.openProjectDirectory,
    initPaperWorkspace: s.initPaperWorkspace,
    setWorkbenchMode: s.setWorkbenchMode,
    togglePinRecentProject: s.togglePinRecentProject,
    removeRecentProject: s.removeRecentProject,
    revealInFileManager: s.revealInFileManager,
    errorMessage: s.errorMessage,
  })));

  const [manualPath, setManualPath] = useState(
    projectDir || lastProjectDir || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpening, setIsOpening] = useState(false);
  const [pickerTab, setPickerTab] = useState<'open' | 'create_template'>('open');
  const [templateId, setTemplateId] = useState<PaperVenueTemplateId>('nature');
  const [paperTitle, setPaperTitle] = useState(
    'Unified Scientific Architecture and Experimental Analysis'
  );

  if (!isPickerOpen) return null;

  const sortedProjects = [...recentProjects]
    .filter((item) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.path.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return b.lastOpenedAt - a.lastOpenedAt;
    });

  const handlePickNativeFolder = async () => {
    setIsOpening(true);
    try {
      await pickAndOpenDirectory();
    } finally {
      setIsOpening(false);
    }
  };

  const handleOpenManualPath = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = manualPath.trim();
    if (!target) return;
    setIsOpening(true);
    try {
      await openProjectDirectory(target);
    } finally {
      setIsOpening(false);
    }
  };

  const handleCreatePaperFromTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = manualPath.trim() || projectDir || lastProjectDir;
    if (!target) return;
    setIsOpening(true);
    try {
      await initPaperWorkspace(target, templateId, paperTitle.trim());
      setWorkbenchMode('split');
    } finally {
      setIsOpening(false);
    }
  };

  const handleOpenRecent = async (dirPath: string) => {
    setIsOpening(true);
    try {
      await openProjectDirectory(dirPath);
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[88vh]">
        {/* Top Banner */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-[11px] font-semibold tracking-wide">
                One-Stop Paper & Figure Studio
              </span>
              <span className="text-[11px] text-slate-300 font-mono">
                main.tex + sections/ + figures/*.tikz + styles/agentikz-macros.sty
              </span>
            </div>
            <h2 className="text-lg font-bold tracking-tight mt-1.5 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-indigo-400" />
              导入已有论文工程 或 从顶刊模板新建论文
            </h2>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              论文所有相关文件（<code className="px-1 py-0.5 rounded bg-white/10 text-indigo-200 font-mono">main.tex</code>、章节、参考文献、可编辑配图代码包 <code className="px-1 py-0.5 rounded bg-white/10 text-indigo-200 font-mono">figures/*.tikz</code>、外部成品图 <code className="px-1 py-0.5 rounded bg-white/10 text-indigo-200 font-mono">figures/external/</code>）统一收纳在您的独立论文文件夹中，不与软件本体混杂。
            </p>
          </div>
          <button
            onClick={() => setPickerOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="px-6 pt-3 pb-2 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPickerTab('open')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                pickerTab === 'open'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              📂 打开 / 导入已有论文或项目目录
            </button>
            <button
              type="button"
              onClick={() => setPickerTab('create_template')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                pickerTab === 'create_template'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              ✨ 从顶刊 LaTeX 模板新建论文工程 (Nature / NeurIPS / CVPR / IEEE / arXiv)
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {pickerTab === 'create_template' ? (
            <form
              onSubmit={handleCreatePaperFromTemplate}
              className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                {PAPER_VENUE_TEMPLATES.map((tpl) => {
                  const active = tpl.id === templateId;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setTemplateId(tpl.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="text-[11px] font-bold">{tpl.badge}</div>
                      <div
                        className={`text-[10px] mt-0.5 line-clamp-2 ${
                          active ? 'text-indigo-100' : 'text-slate-400'
                        }`}
                      >
                        {tpl.name}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    论文标题 (Paper Title)
                  </label>
                  <input
                    type="text"
                    value={paperTitle}
                    onChange={(e) => setPaperTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                    placeholder="输入您的论文标题..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    论文独立存放目录路径 (自动创建规范子目录)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={manualPath}
                      onChange={(e) => setManualPath(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                      placeholder="例如: E:/Papers/Nature2026-MyPaper 或 /Users/name/papers/my-paper"
                    />
                    <button
                      type="button"
                      onClick={handlePickNativeFolder}
                      className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-indigo-700 font-semibold hover:bg-indigo-50 shrink-0 cursor-pointer"
                    >
                      浏览...
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-[11px] text-slate-500">
                  将自动生成：<code className="font-mono">main.tex</code>、
                  <code className="font-mono">sections/</code>、
                  <code className="font-mono">references.bib</code>、
                  <code className="font-mono">styles/agentikz-macros.sty</code>、
                  <code className="font-mono">figures/fig1_overview.tikz</code>
                </div>
                <button
                  type="submit"
                  disabled={isOpening || !(manualPath.trim() || projectDir)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  创建论文工程并进入同屏工作台
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Quick Resume Last Folder Card */}
              {lastProjectDir && (
                <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200/80 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold">
                        上次工作目录
                      </span>
                      {projectDir === lastProjectDir && (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          当前已打开
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-slate-800 mt-1 truncate">
                      {lastProjectDir.replace(/\\/g, '/').split('/').filter(Boolean).pop() ||
                        lastProjectDir}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                      {lastProjectDir}
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenRecent(lastProjectDir)}
                    disabled={isOpening}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all shrink-0 cursor-pointer"
                  >
                    <FolderCheck className="w-4 h-4" />
                    {projectDir === lastProjectDir ? '继续在此目录工作' : '直接进入上次文件夹'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Choose Folder & Direct Path Input */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
                <button
                  type="button"
                  onClick={handlePickNativeFolder}
                  disabled={isOpening}
                  className="md:col-span-4 p-3.5 rounded-xl border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/30 hover:bg-indigo-50/70 text-indigo-700 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer group"
                >
                  <FolderOpen className="w-6 h-6 text-indigo-600 group-hover:scale-105 transition-transform" />
                  <span className="text-xs font-bold">浏览并选择本地文件夹...</span>
                  <span className="text-[10px] text-slate-500">
                    打开系统文件夹选择器
                  </span>
                </button>

                <form
                  onSubmit={handleOpenManualPath}
                  className="md:col-span-8 p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between gap-2"
                >
                  <label className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                    <span>或直接输入 / 粘贴论文项目文件夹路径：</span>
                    <span className="text-[10px] font-normal text-slate-400">
                      自动识别 .tex / figures/*.tikz / {AGENTIKZ_FOLDER_NAME}/
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={manualPath}
                      onChange={(e) => setManualPath(e.target.value)}
                      placeholder="例如: E:/Papers/NeurIPS2026-AgentTikZ 或 /Users/name/paper"
                      className="flex-1 px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 text-slate-800"
                    />
                    <button
                      type="submit"
                      disabled={isOpening || !manualPath.trim()}
                      className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium transition-colors shrink-0 cursor-pointer"
                    >
                      进入文件夹
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          {/* Startup & Sync Preferences */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoOpenLastProject}
                onChange={(e) => setAutoOpenLastProject(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>启动软件时直接进入上次打开的文件夹</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSyncTikz}
                onChange={(e) => setAutoSyncTikz(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                保存画布时自动同步生成 <code className="font-mono text-[11px] text-indigo-700">{AGENTIKZ_FOLDER_NAME}/export/&lt;name&gt;.tikz</code>（方便 LaTeX <code className="font-mono text-[11px]">\input</code>）
              </span>
            </label>
          </div>

          {/* Recent & Pinned Folders List */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                最近使用与收藏的项目文件夹 ({recentProjects.length})
              </h3>
              {recentProjects.length > 2 && (
                <div className="relative w-52">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="筛选近期项目..."
                    className="w-full pl-8 pr-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                </div>
              )}
            </div>

            {sortedProjects.length === 0 ? (
              <div className="py-8 text-center rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                暂无历史项目文件夹记录，请点击上方按钮选择您的论文或科研项目文件夹。
              </div>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {sortedProjects.map((item) => {
                  const isCurrent = item.path === projectDir;
                  return (
                    <div
                      key={item.path}
                      onClick={() => handleOpenRecent(item.path)}
                      className={`group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-indigo-50/70 border-indigo-300'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isCurrent
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                          }`}
                        >
                          <FolderOpen className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {item.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium shrink-0">
                              {item.canvasCount} 个画布
                            </span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-semibold shrink-0">
                                当前项目
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                            {item.path}
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[10px] text-slate-400 mr-1.5">
                          {formatRelativeTime(item.lastOpenedAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePinRecentProject(item.path)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            item.pinned
                              ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                              : 'text-slate-300 hover:text-amber-500 hover:bg-slate-100'
                          }`}
                          title={item.pinned ? '取消置顶' : '置顶常用文件夹'}
                        >
                          <Star
                            className="w-3.5 h-3.5"
                            fill={item.pinned ? 'currentColor' : 'none'}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => void revealInFileManager(item.path)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          title="在系统资源管理器中打开"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRecentProject(item.path)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="从历史列表中移除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs">
          <div className="text-slate-500 truncate">
            {projectDir ? (
              <span>
                当前已关联：<strong className="text-slate-700">{projectName}</strong>{' '}
                <code className="text-[11px] font-mono text-slate-400">
                  ({projectDir}/{AGENTIKZ_FOLDER_NAME})
                </code>
              </span>
            ) : (
              <span>当前处于临时画布模式（未关联本地文件夹）</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium transition-colors cursor-pointer"
            >
              {projectDir ? '返回画布' : '暂不关联文件夹（从空白画布开始）'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
