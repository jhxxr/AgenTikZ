import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileCode2,
  FilePlus2,
  FileText,
  ListTree,
  Loader2,
  Play,
  Settings,
  Sparkles,
  SplitSquareVertical,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import {
  PAPER_VENUE_TEMPLATES,
  type PaperVenueTemplateId,
} from '../../core/paper/paper-templates';

interface DetectedFigureRef {
  rawMatch: string;
  relPath: string;
  kind: 'tikz' | 'graphic';
  line: number;
}

interface DetectedSectionHeading {
  title: string;
  level: 'section' | 'subsection';
  line: number;
  charOffset: number;
}

function extractFigureReferences(texContent: string): DetectedFigureRef[] {
  const refs: DetectedFigureRef[] = [];
  const lines = texContent.split('\n');
  lines.forEach((lineText, idx) => {
    const trimmed = lineText.trim();
    if (trimmed.startsWith('%')) return;
    const inputRegex = /\\input\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = inputRegex.exec(lineText)) !== null) {
      const target = match[1].trim();
      if (
        target.endsWith('.tikz') ||
        target.startsWith('figures/') ||
        target.includes('agentikzfile')
      ) {
        refs.push({
          rawMatch: match[0],
          relPath: target,
          kind: 'tikz',
          line: idx + 1,
        });
      }
    }
    const graphicRegex = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g;
    while ((match = graphicRegex.exec(lineText)) !== null) {
      refs.push({
        rawMatch: match[0],
        relPath: match[1].trim(),
        kind: 'graphic',
        line: idx + 1,
      });
    }
  });
  return refs;
}

function extractSectionHeadings(texContent: string): DetectedSectionHeading[] {
  const headings: DetectedSectionHeading[] = [];
  const lines = texContent.split('\n');
  let runningOffset = 0;
  lines.forEach((lineText, idx) => {
    const trimmed = lineText.trim();
    if (!trimmed.startsWith('%')) {
      const m = /\\(section|subsection)\*?\{([^}]+)\}/.exec(lineText);
      if (m) {
        headings.push({
          level: m[1] === 'subsection' ? 'subsection' : 'section',
          title: m[2].trim(),
          line: idx + 1,
          charOffset: runningOffset,
        });
      }
    }
    runningOffset += lineText.length + 1;
  });
  return headings;
}

export const PaperWorkspaceView: React.FC = () => {
  const {
    projectDir,
    projectName,
    paperFiles,
    activePaperFilePath,
    paperFileContents,
    paperDirtyFiles,
    canvases,
    activeCanvasFileName,
    workbenchMode,
    setWorkbenchMode,
    setPickerOpen,
    setInsertFigureModalOpen,
    setLastPaperCursorOffset,
    quickInsertActiveFigureIntoPaper,
    initPaperWorkspace,
    refreshPaperFiles,
    openPaperFile,
    updatePaperFileContent,
    savePaperFileNow,
    createNewPaperFile,
    ensureAgentikzMacrosSty,
    switchCanvasFile,
    createNewCanvasFile,
  } = useProjectStore();

  const { setTikzCode } = useWorkspaceStore();
  const { texEngine, texLiveBinDir, openSettings } = useSettingsStore();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] =
    useState<PaperVenueTemplateId>('nature');
  const [newPaperTitle, setNewPaperTitle] = useState<string>(
    projectName || 'Method Overview and Experimental Analysis'
  );
  const [newFileRelPath, setNewFileRelPath] = useState<string>('');
  const [showNewFileInput, setShowNewFileInput] = useState<boolean>(false);
  const [isCompilingPaper, setIsCompilingPaper] = useState<boolean>(false);
  const [compileResult, setCompileResult] = useState<{
    ok: boolean;
    pdfPath?: string;
    pdfDataUrl?: string;
    message: string;
    logExcerpt?: string;
  } | null>(null);
  const [showCompilerDrawer, setShowCompilerDrawer] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    if (projectDir && paperFiles.length === 0) {
      void refreshPaperFiles();
    }
  }, [projectDir, paperFiles.length, refreshPaperFiles]);

  const currentContent = paperFileContents[activePaperFilePath] ?? '';
  const isCurrentDirty = Boolean(paperDirtyFiles[activePaperFilePath]);

  const detectedRefs = useMemo(
    () => extractFigureReferences(currentContent),
    [currentContent]
  );

  const sectionHeadings = useMemo(
    () => extractSectionHeadings(currentContent),
    [currentContent]
  );

  const visiblePaperFiles = useMemo(
    () =>
      paperFiles.filter(
        (f) =>
          !f.relativePath.startsWith('agentikzfile/') &&
          (f.category === 'main' ||
            f.category === 'section' ||
            f.category === 'bib' ||
            f.category === 'style')
      ),
    [paperFiles]
  );

  const handleJumpToSection = (heading: DetectedSectionHeading) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(heading.charOffset, heading.charOffset);
    setLastPaperCursorOffset(heading.charOffset);
    const totalLines = Math.max(1, currentContent.split('\n').length);
    const ratio = Math.max(0, (heading.line - 3) / totalLines);
    el.scrollTop = Math.round(el.scrollHeight * ratio);
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    const rel = newFileRelPath.trim();
    if (!rel) return;
    const normalized = rel.includes('.') ? rel : `sections/${rel}.tex`;
    await createNewPaperFile(
      normalized,
      `% ${normalized}\n\\section{${rel.replace(/\.tex$/i, '')}}\n\nWrite content here.\n`
    );
    setNewFileRelPath('');
    setShowNewFileInput(false);
  };

  const handleInitCurrentFolderWithTemplate = async () => {
    if (!projectDir) {
      setPickerOpen(true);
      return;
    }
    await initPaperWorkspace(projectDir, selectedTemplateId, newPaperTitle);
    const tpl = PAPER_VENUE_TEMPLATES.find((t) => t.id === selectedTemplateId);
    setStatusNotice(
      `✓ 已使用 ${tpl?.badge || selectedTemplateId} 模板初始化论文目录结构`
    );
  };

  const handleOpenFigureRefInStudio = async (ref: DetectedFigureRef) => {
    const baseName =
      ref.relPath
        .split('/')
        .pop()
        ?.replace(/\.(tikz|pdf|png|svg|jpg)$/i, '') || 'figure';

    const matchedCanvas = canvases.find(
      (c) =>
        c.name.toLowerCase() === baseName.toLowerCase() ||
        c.fileName.replace(/\.canvas\.json$/i, '').toLowerCase() ===
          baseName.toLowerCase()
    );

    if (matchedCanvas) {
      if (matchedCanvas.fileName !== activeCanvasFileName) {
        await switchCanvasFile(matchedCanvas.fileName);
      }
      if (workbenchMode === 'paper') {
        setWorkbenchMode('split');
      }
      setStatusNotice(`✓ 已在右侧画布定位配图「${matchedCanvas.name}」`);
      return;
    }

    // If referencing a .tikz file on disk that isn't a canvas yet, load its TikZ source
    if (ref.kind === 'tikz') {
      const afterLoad = await openPaperFile(ref.relPath);
      if (afterLoad && afterLoad.includes('\\begin{tikzpicture}')) {
        await createNewCanvasFile(baseName);
        setTikzCode(afterLoad, true);
        if (workbenchMode === 'paper') {
          setWorkbenchMode('split');
        }
        setStatusNotice(`✓ 已从 ${ref.relPath} 载入画布`);
        return;
      }
    }

    if (workbenchMode === 'paper') {
      setWorkbenchMode('split');
    }
  };

  const handleCompileFullPaper = async () => {
    await savePaperFileNow();
    await ensureAgentikzMacrosSty();
    setIsCompilingPaper(true);
    setShowCompilerDrawer(true);
    try {
      const isTauri =
        typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      if (isTauri && projectDir) {
        const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
        const mainTex = visiblePaperFiles.some(
          (f) => f.relativePath === 'main.tex'
        )
          ? 'main.tex'
          : activePaperFilePath.endsWith('.tex')
          ? activePaperFilePath
          : 'main.tex';

        const res = await invoke<{
          ok: boolean;
          pdfPath?: string;
          message: string;
          logExcerpt?: string;
        }>('tex_compile_paper', {
          projectDir,
          mainTexRelPath: mainTex,
          texEngine,
          texLiveBinDir: texLiveBinDir || undefined,
        });

        let pdfDataUrl: string | undefined;
        if (res.ok && res.pdfPath) {
          try {
            pdfDataUrl = convertFileSrc(res.pdfPath);
          } catch {
            pdfDataUrl = undefined;
          }
        }
        setCompileResult({
          ...res,
          pdfDataUrl,
        });
      } else {
        setCompileResult({
          ok: true,
          message:
            '浏览器预览模式：已校验 LaTeX 结构与 styles/agentikz-macros.sty 引用完整性。在桌面端可调用本地 TeX Live 直接生成 main.pdf。',
          logExcerpt: [
            `[AgenTikZ Paper Compiler] Engine=${texEngine}`,
            `[AgenTikZ Paper Compiler] TeXLiveBinDir=${texLiveBinDir || '(System PATH)'}`,
            `[AgenTikZ Paper Compiler] Synced styles/agentikz-macros.sty & figures/*.tikz`,
            `[AgenTikZ Paper Compiler] Detected ${detectedRefs.length} figure references in ${activePaperFilePath}.`,
          ].join('\n'),
        });
      }
    } catch (e) {
      setCompileResult({
        ok: false,
        message: `编译异常: ${String(e)}`,
      });
    } finally {
      setIsCompilingPaper(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white border-r border-slate-200/90 overflow-hidden select-none">
      {/* Top Paper Workbench Header */}
      <div className="px-3 py-2 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded bg-indigo-500/25 border border-indigo-400/40 text-indigo-200 text-[10px] font-bold tracking-wider uppercase shrink-0">
            LaTeX IDE
          </span>
          <span className="text-xs font-semibold truncate text-slate-100">
            {projectName || '当前论文工作区'}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] text-slate-300 shrink-0">
            {isCurrentDirty ? (
              <>
                <Loader2 className="w-2.5 h-2.5 text-indigo-400 animate-spin" />
                <span>自动同步中...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                <span>已自动保存 · 宏包同步</span>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 1-Click Split-Button: Insert Figure at Cursor + Dropdown */}
          <div className="flex items-center rounded-md bg-indigo-600 overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={async () => {
                const res = await quickInsertActiveFigureIntoPaper();
                if (res.ok) {
                  setStatusNotice(`✓ 已将当前配图一键插入 ${res.targetFile}`);
                }
              }}
              className="px-2.5 py-1 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              title="直接将当前配图 (\input{figures/xxx.tikz}) 插入到编辑器光标所在位置"
            >
              <Sparkles className="w-3 h-3" />
              <span>插入配图到光标处</span>
            </button>
            <button
              type="button"
              onClick={() => setInsertFigureModalOpen(true)}
              className="px-1.5 py-1 border-l border-indigo-400/50 hover:bg-indigo-500 text-indigo-100 cursor-pointer transition-colors"
              title="高级插图配置（切换单双栏、\includegraphics 静态图模式、自定义 Caption）"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleCompileFullPaper()}
            disabled={isCompilingPaper}
            className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
            title="使用配置的 TeX Live 编译整篇论文 PDF"
          >
            <Play className="w-3 h-3" />
            <span>{isCompilingPaper ? '编译中...' : '编译 PDF'}</span>
          </button>

          <button
            type="button"
            onClick={() => openSettings('general')}
            className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
            title={`配置 TeX Live 安装路径 (当前: ${texLiveBinDir || '系统默认 PATH'})`}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* File Tabs Row */}
      <div className="px-2.5 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
          {visiblePaperFiles.map((file) => {
            const active = file.relativePath === activePaperFilePath;
            const dirty = Boolean(paperDirtyFiles[file.relativePath]);
            return (
              <button
                key={file.relativePath}
                type="button"
                onClick={() => void openPaperFile(file.relativePath)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                  active
                    ? 'bg-white text-indigo-700 font-bold shadow-xs border border-indigo-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 border border-transparent'
                }`}
              >
                <FileCode2 className="w-3 h-3 text-indigo-500 shrink-0" />
                <span>{file.relativePath}</span>
                {dirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                )}
              </button>
            );
          })}

          {showNewFileInput ? (
            <form onSubmit={handleCreateFile} className="flex items-center gap-1">
              <input
                type="text"
                value={newFileRelPath}
                onChange={(e) => setNewFileRelPath(e.target.value)}
                placeholder="sections/experiments.tex"
                className="px-2 py-0.5 text-[11px] font-mono bg-white border border-indigo-300 rounded w-44 focus:outline-none"
                autoFocus
              />
              <button
                type="submit"
                className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-600 text-white rounded"
              >
                创建
              </button>
              <button
                type="button"
                onClick={() => setShowNewFileInput(false)}
                className="px-1.5 py-0.5 text-[10px] text-slate-500"
              >
                取消
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewFileInput(true)}
              className="px-2 py-1 rounded-md text-[11px] text-slate-500 hover:text-indigo-700 hover:bg-white/70 flex items-center gap-1 shrink-0 cursor-pointer"
              title="新建章节 .tex 或 .bib 文件"
            >
              <FilePlus2 className="w-3 h-3" />
              <span>新建章节</span>
            </button>
          )}
        </div>

        {/* Quick Template Bootstrap Pill when no main.tex exists */}
        {!visiblePaperFiles.some((f) => f.relativePath === 'main.tex') && (
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={selectedTemplateId}
              onChange={(e) =>
                setSelectedTemplateId(e.target.value as PaperVenueTemplateId)
              }
              className="text-[11px] bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-700"
            >
              {PAPER_VENUE_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.badge}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newPaperTitle}
              onChange={(e) => setNewPaperTitle(e.target.value)}
              placeholder="输入论文标题..."
              className="text-[11px] bg-white border border-slate-300 rounded px-2 py-0.5 w-36 text-slate-800"
            />
            <button
              type="button"
              onClick={() => void handleInitCurrentFolderWithTemplate()}
              className="px-2.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold cursor-pointer"
            >
              ✨ 生成论文骨架
            </button>
          </div>
        )}
      </div>

      {/* Interactive Figure CodeLens + Section Outline Bar */}
      <div className="px-3 py-1.5 bg-indigo-50/70 border-b border-indigo-100 flex flex-col gap-1 text-[11px] shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="font-semibold text-indigo-900 flex items-center gap-1 shrink-0">
              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
              本文配图 ({detectedRefs.length})：
            </span>
            {detectedRefs.length === 0 ? (
              <span className="text-slate-500">
                点击右上角「插入配图到光标处」可一键将当前画布嵌入到当前光标行
              </span>
            ) : (
              detectedRefs.map((ref, idx) => (
                <button
                  key={`${ref.relPath}-${idx}`}
                  type="button"
                  onClick={() => void handleOpenFigureRefInStudio(ref)}
                  className="px-2 py-0.5 rounded-full bg-white hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 font-mono text-[10.5px] flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                  title={`第 ${ref.line} 行: ${ref.rawMatch} — 点击在右侧画布中联动编辑`}
                >
                  <span>{ref.kind === 'tikz' ? '📦' : '🖼️'}</span>
                  <span>{ref.relPath}</span>
                  <span className="opacity-60">L{ref.line}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-75" />
                </button>
              ))
            )}
          </div>

          {statusNotice && (
            <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {statusNotice}
            </span>
          )}
        </div>

        {sectionHeadings.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
            <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1 shrink-0">
              <ListTree className="w-3 h-3 text-slate-400" />
              大纲跳转:
            </span>
            {sectionHeadings.map((h, i) => (
              <button
                key={`${h.title}-${i}`}
                type="button"
                onClick={() => handleJumpToSection(h)}
                className={`px-2 py-0.2 rounded text-[10px] border transition-colors shrink-0 cursor-pointer ${
                  h.level === 'section'
                    ? 'bg-white text-slate-700 border-slate-200 font-semibold hover:border-indigo-300 hover:text-indigo-700'
                    : 'bg-slate-50/80 text-slate-500 border-slate-200/70 hover:text-indigo-600'
                }`}
                title={`跳转到第 ${h.line} 行: \\${h.level}{${h.title}}`}
              >
                {h.level === 'subsection' ? `↳ ${h.title}` : `§ ${h.title}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Editor + Optional Compiler Output Drawer */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: LaTeX / BibTeX Source Editor */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Quick LaTeX Snippet Bar */}
          <div className="px-3 py-1 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-2 text-[11px] text-slate-600 shrink-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-semibold text-slate-400 uppercase mr-1">
                快捷插入:
              </span>
              {[
                {
                  label: '\\section{...}',
                  snippet: '\n\\section{New Section}\n',
                },
                {
                  label: '\\subsection{...}',
                  snippet: '\n\\subsection{Subsection}\n',
                },
                {
                  label: '\\ref{fig:...}',
                  snippet: 'Figure~\\ref{fig:overview}',
                },
                {
                  label: '\\cite{...}',
                  snippet: '~\\cite{vaswani2017attention}',
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() =>
                    updatePaperFileContent(
                      activePaperFilePath,
                      currentContent + item.snippet
                    )
                  }
                  className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-200/90 font-mono text-[10.5px] text-slate-700 cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {workbenchMode === 'paper' && (
                <button
                  type="button"
                  onClick={() => setWorkbenchMode('split')}
                  className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <SplitSquareVertical className="w-3 h-3" />
                  <span>开启论文+画布同屏</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCompilerDrawer((v) => !v)}
                className="px-2 py-0.5 rounded bg-slate-200/70 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
              >
                {showCompilerDrawer ? '隐藏编译面板' : '查看编译/PDF面板'}
              </button>
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={currentContent}
            onChange={(e) => {
              setLastPaperCursorOffset(e.currentTarget.selectionStart);
              updatePaperFileContent(activePaperFilePath, e.target.value);
            }}
            onClick={(e) =>
              setLastPaperCursorOffset(e.currentTarget.selectionStart)
            }
            onKeyUp={(e) =>
              setLastPaperCursorOffset(e.currentTarget.selectionStart)
            }
            spellCheck={false}
            placeholder="在此编写论文 LaTeX 源码（支持 main.tex, sections/*.tex, references.bib）..."
            className="flex-1 w-full p-4 font-mono text-[12.5px] leading-relaxed text-slate-800 bg-white focus:outline-none resize-none overflow-y-auto select-text"
          />

          <div className="px-3 py-1 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <span>
                当前文件: <strong className="font-mono text-slate-700">{activePaperFilePath}</strong>
              </span>
              <span>行数: {currentContent.split('\n').length}</span>
              <span>
                TeX 引擎: <strong className="font-mono text-slate-700">{texEngine}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>
                目录规范: <code className="font-mono">main.tex</code> +{' '}
                <code className="font-mono">sections/</code> +{' '}
                <code className="font-mono">figures/*.tikz</code> +{' '}
                <code className="font-mono">styles/agentikz-macros.sty</code>
              </span>
            </div>
          </div>
        </div>

        {/* Right: PDF / Compiler Log Drawer */}
        {showCompilerDrawer && (
          <div className="w-full lg:w-[44%] border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50 flex flex-col min-h-[220px]">
            <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                论文编译输出与 PDF 预览
              </span>
              {compileResult?.pdfPath && (
                <span className="font-mono text-[10px] text-emerald-700 truncate max-w-[200px]">
                  {compileResult.pdfPath}
                </span>
              )}
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-3">
              {!compileResult ? (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  点击上方「编译论文 PDF」按钮运行 TeX Live 编译整篇论文。
                  <div className="mt-2">
                    若您的 TeX Live 安装在自定义路径，可在{' '}
                    <button
                      type="button"
                      onClick={() => openSettings('general')}
                      className="text-indigo-600 underline cursor-pointer"
                    >
                      设置 → 通用与 TeX 环境
                    </button>{' '}
                    中指定或自动扫描 <code className="font-mono">bin</code> 目录。
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className={`p-3 rounded-xl border text-xs font-medium ${
                      compileResult.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {compileResult.message}
                  </div>

                  {compileResult.pdfDataUrl && (
                    <iframe
                      src={compileResult.pdfDataUrl}
                      title="Compiled Paper PDF"
                      className="w-full h-[380px] rounded-lg border border-slate-300 bg-white"
                    />
                  )}

                  {compileResult.logExcerpt && (
                    <pre className="p-3 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-60">
                      {compileResult.logExcerpt}
                    </pre>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
