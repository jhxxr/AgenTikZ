import { useShallow } from 'zustand/react/shallow';
import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Copy,
  Pencil,
  Trash2,
  Check,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FolderOpen,
  Sliders,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export const CanvasTabsBar: React.FC = () => {
  const {
    projectDir,
    canvases,
    activeCanvasFileName,
    saveStatus,
    switchCanvasFile,
    createNewCanvasFile,
    duplicateCurrentCanvasFile,
    renameCanvasFile,
    deleteCanvasFile,
    saveActiveCanvasNow,
    setPickerOpen,
  } = useProjectStore(useShallow((s) => ({
    projectDir: s.projectDir,
    canvases: s.canvases,
    activeCanvasFileName: s.activeCanvasFileName,
    saveStatus: s.saveStatus,
    switchCanvasFile: s.switchCanvasFile,
    createNewCanvasFile: s.createNewCanvasFile,
    duplicateCurrentCanvasFile: s.duplicateCurrentCanvasFile,
    renameCanvasFile: s.renameCanvasFile,
    deleteCanvasFile: s.deleteCanvasFile,
    saveActiveCanvasNow: s.saveActiveCanvasNow,
    setPickerOpen: s.setPickerOpen,
  })));

  const {
    isInspectorDrawerOpen,
    toggleInspectorDrawer,
  } = useWorkspaceStore(useShallow((s) => ({
    isInspectorDrawerOpen: s.isInspectorDrawerOpen,
    toggleInspectorDrawer: s.toggleInspectorDrawer,
  })));

  const [editingFileName, setEditingFileName] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const startRename = (fileName: string, currentName: string) => {
    setEditingFileName(fileName);
    setEditingTitle(currentName);
  };

  const commitRename = async () => {
    if (!editingFileName) return;
    const targetFile = editingFileName;
    const nextName = editingTitle.trim();
    setEditingFileName(null);
    if (nextName) {
      await renameCanvasFile(targetFile, nextName);
    }
  };

  const handleCreateCanvas = async () => {
    const nextIndex = canvases.length + 1;
    await createNewCanvasFile(`Fig ${nextIndex} - New Figure`);
  };

  const activeStem =
    activeCanvasFileName.replace(/\.canvas\.json$/i, '') || 'fig1-architecture';

  return (
    <div className="h-9 bg-slate-100/90 border-b border-slate-200/80 px-2 flex items-center justify-between gap-2 shrink-0 select-none z-20">
      {/* Left: Unified Figure Tabs (figures/*.tikz) */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0 flex-1 py-1">
        {canvases.map((canvas) => {
          const isActive = canvas.fileName === activeCanvasFileName;
          const isEditing = editingFileName === canvas.fileName;
          const stem = canvas.fileName.replace(/\.canvas\.json$/i, '');

          return (
            <div
              key={canvas.fileName}
              onClick={() => {
                if (!isActive && !isEditing) {
                  void switchCanvasFile(canvas.fileName);
                }
              }}
              onDoubleClick={() => startRename(canvas.fileName, canvas.name)}
              title={`${canvas.name}\n论文配图路径: figures/${stem}.tikz\n(双击可重命名)`}
              className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer shrink-0 border ${
                isActive
                  ? 'bg-white text-indigo-700 font-semibold border-slate-200/90 shadow-2xs'
                  : 'bg-transparent hover:bg-white/60 text-slate-600 border-transparent'
              }`}
            >
              <FileText
                className={`w-3.5 h-3.5 shrink-0 ${
                  isActive ? 'text-indigo-600' : 'text-slate-400'
                }`}
              />

              {isEditing ? (
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename();
                      if (e.key === 'Escape') setEditingFileName(null);
                    }}
                    autoFocus
                    className="w-32 px-1.5 py-0.5 text-xs bg-indigo-50/60 border border-indigo-300 rounded text-slate-800 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void commitRename()}
                    className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingFileName(null)}
                    className="p-0.5 text-slate-400 hover:bg-slate-100 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="max-w-[150px] truncate">{canvas.name}</span>
                  {isActive && (
                    <div
                      className="flex items-center gap-0.5 ml-0.5 opacity-75 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          startRename(canvas.fileName, canvas.name)
                        }
                        className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                        title="重命名配图"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                      </button>
                      {canvases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => void deleteCanvasFile(canvas.fileName)}
                          className="p-0.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                          title="删除此配图"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* New Figure & Duplicate Buttons */}
        <button
          type="button"
          onClick={() => void handleCreateCanvas()}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-600 hover:text-indigo-700 hover:bg-white/80 transition-colors shrink-0 cursor-pointer"
          title="在 figures/ 下新建一张独立科研配图"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建配图</span>
        </button>

        <button
          type="button"
          onClick={() => void duplicateCurrentCanvasFile()}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-white/80 transition-colors shrink-0 cursor-pointer"
          title="复制当前配图为新配图"
        >
          <Copy className="w-3 h-3" />
          <span className="hidden sm:inline">创建副本</span>
        </button>
      </div>

      {/* Right: Auto-Sync Status Badge & On-Demand Inspector Drawer Toggle */}
      <div className="flex items-center gap-1.5 shrink-0">
        {projectDir ? (
          <button
            type="button"
            onClick={() => void saveActiveCanvasNow()}
            title="已开启 500ms 防抖无感自动保存 · 点击可立即刷新同步 (Ctrl+S)"
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/70 hover:bg-white border border-slate-200/80 text-[10.5px] text-slate-600 transition-colors cursor-pointer"
          >
            {(saveStatus === 'saving' || saveStatus === 'dirty') && (
              <>
                <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />
                <span className="text-indigo-700">自动同步中...</span>
              </>
            )}
            {(saveStatus === 'saved' || saveStatus === 'local_only') && (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span className="font-mono text-[10px] text-slate-500 truncate max-w-[180px]">
                  figures/{activeStem}.tikz
                </span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertCircle className="w-3 h-3 text-rose-600" />
                <span className="text-rose-600 font-medium">同步异常</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 hover:bg-amber-100 border border-amber-200/90 text-[10.5px] text-amber-800 font-medium transition-colors cursor-pointer"
          >
            <FolderOpen className="w-3 h-3 text-amber-600" />
            <span>关联论文目录以自动同步</span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleInspectorDrawer}
          title="展开/收起画布属性、整图 Caption 与详细参数抽屉"
          className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10.5px] font-medium transition-colors cursor-pointer ${
            isInspectorDrawerOpen
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
              : 'bg-white/80 hover:bg-white text-slate-600 border-slate-200/80'
          }`}
        >
          <Sliders className="w-3 h-3" />
          <span className="hidden md:inline">
            画布属性 · 无限
          </span>
        </button>
      </div>
    </div>
  );
};
