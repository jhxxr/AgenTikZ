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
  Save,
} from 'lucide-react';
import {
  useProjectStore,
  AGENTIKZ_FOLDER_NAME,
} from '../../store/useProjectStore';

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
  } = useProjectStore();

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

  return (
    <div className="h-9 bg-slate-100/90 border-b border-slate-200/80 px-2 flex items-center justify-between gap-2 shrink-0 select-none z-20">
      {/* Left: Canvas File Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0 flex-1 py-1">
        {canvases.map((canvas) => {
          const isActive = canvas.fileName === activeCanvasFileName;
          const isEditing = editingFileName === canvas.fileName;

          return (
            <div
              key={canvas.fileName}
              onClick={() => {
                if (!isActive && !isEditing) {
                  void switchCanvasFile(canvas.fileName);
                }
              }}
              onDoubleClick={() => startRename(canvas.fileName, canvas.name)}
              title={`${canvas.name}\n文件: ${AGENTIKZ_FOLDER_NAME}/${canvas.fileName}\n(双击可重命名)`}
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
                        title="重命名画布文件"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                      </button>
                      {canvases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => void deleteCanvasFile(canvas.fileName)}
                          className="p-0.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                          title="删除此画布存档"
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

        {/* New Canvas & Duplicate Buttons */}
        <button
          type="button"
          onClick={() => void handleCreateCanvas()}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-600 hover:text-indigo-700 hover:bg-white/80 transition-colors shrink-0 cursor-pointer"
          title="在当前项目新建一个独立画布文件"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建画布</span>
        </button>

        <button
          type="button"
          onClick={() => void duplicateCurrentCanvasFile()}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-white/80 transition-colors shrink-0 cursor-pointer"
          title="复制当前画布为新存档文件"
        >
          <Copy className="w-3 h-3" />
          <span className="hidden sm:inline">创建副本</span>
        </button>
      </div>

      {/* Right: Storage & Save Status Badge */}
      <div className="flex items-center gap-2 shrink-0">
        {projectDir ? (
          <button
            type="button"
            onClick={() => void saveActiveCanvasNow()}
            title="点击立即保存 (Ctrl+S)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/80 hover:bg-white border border-slate-200/80 text-[11px] text-slate-600 transition-colors cursor-pointer"
          >
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />
                <span className="text-indigo-700">正在写入...</span>
              </>
            )}
            {saveStatus === 'dirty' && (
              <>
                <Save className="w-3 h-3 text-amber-500" />
                <span className="text-amber-700 font-medium">
                  有改动 · 点击保存
                </span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span className="font-mono text-[10px] text-slate-500 truncate max-w-[200px]">
                  {AGENTIKZ_FOLDER_NAME}/{activeCanvasFileName}
                </span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertCircle className="w-3 h-3 text-rose-600" />
                <span className="text-rose-600 font-medium">保存失败</span>
              </>
            )}
            {saveStatus === 'local_only' && (
              <>
                <CheckCircle2 className="w-3 h-3 text-slate-400" />
                <span className="font-mono text-[10px] text-slate-500">
                  {AGENTIKZ_FOLDER_NAME}/{activeCanvasFileName}
                </span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 border border-amber-200/90 text-[11px] text-amber-800 font-medium transition-colors cursor-pointer"
          >
            <FolderOpen className="w-3 h-3 text-amber-600" />
            <span>关联论文/项目文件夹以存档</span>
          </button>
        )}
      </div>
    </div>
  );
};
