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
    togglePinRecentProject,
    removeRecentProject,
    revealInFileManager,
    errorMessage,
  } = useProjectStore();

  const [manualPath, setManualPath] = useState(
    projectDir || lastProjectDir || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpening, setIsOpening] = useState(false);

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
                Paper & Project Workspace
              </span>
              <span className="text-[11px] text-slate-300 font-mono">
                /{AGENTIKZ_FOLDER_NAME}/*.canvas.json
              </span>
            </div>
            <h2 className="text-lg font-bold tracking-tight mt-1.5 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-indigo-400" />
              选择论文或项目文件夹
            </h2>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              进入论文/项目目录后，AgenTikZ 会在该目录下建立专属{' '}
              <code className="px-1.5 py-0.5 rounded bg-white/10 text-indigo-200 font-mono">
                {AGENTIKZ_FOLDER_NAME}/
              </code>{' '}
              文件夹保存画布存档（一个画布一个文件），并自动读取同目录下的插图作为可拖拽素材。
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

        {/* Feature Highlights Bar */}
        <div className="grid grid-cols-3 gap-2 px-6 py-2.5 bg-slate-50 border-b border-slate-200/80 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>
              专属 <strong className="text-slate-800">{AGENTIKZ_FOLDER_NAME}/</strong> 目录，不污染论文主目录
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileCode2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              <strong className="text-slate-800">一画布一文件</strong>，自动同步导出 <code className="font-mono">.tikz</code>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Images className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              自动扫描同目录 <strong className="text-slate-800">PNG / SVG / JPG</strong> 作为画布素材
            </span>
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
                  若不存在将自动创建 {AGENTIKZ_FOLDER_NAME}/
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
              <span>当前处于临时模板模式（未关联本地文件夹）</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium transition-colors cursor-pointer"
            >
              {projectDir ? '返回画布' : '暂不关联文件夹（使用模板体验）'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
