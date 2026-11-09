import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, FileCode2, FilePlus2, FileText, Folder, FolderOpen, ImagePlus, ListTree, Loader2, PanelLeftClose, PanelLeftOpen, Play, Plus, RefreshCw, Settings, X,
} from 'lucide-react';
import { useProjectStore, type PaperFileItem } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { usePaperBuildStore } from '../../store/usePaperBuildStore';
import { syncTexBackward, syncTexForward, type PdfPoint, type SourceLocation } from '../../core/paper/synctex';
import type { PaperPdfPreviewHandle } from './PaperPdfPreview';
import './PaperWorkspaceView.css';

const PaperPdfPreview = lazy(() => import('./PaperPdfPreview').then((module) => ({ default: module.PaperPdfPreview })));

type ViewMode = 'both' | 'source' | 'preview';
interface Heading { title: string; level: string; offset: number; line: number }

function findHeadings(source: string): Heading[] {
  let offset = 0;
  const headings: Heading[] = [];
  source.split('\n').forEach((line, index) => {
    const uncommented = line.replace(/(?<!\\)%.*/, '');
    const match = /\\(section|subsection|subsubsection)\*?\{([^}]+)\}/.exec(uncommented);
    if (match) headings.push({ title: match[2], level: match[1], offset, line: index + 1 });
    offset += line.length + 1;
  });
  return headings;
}

interface FileNode { name: string; path: string; file?: PaperFileItem; children: FileNode[] }
function fileTree(files: PaperFileItem[]): FileNode[] {
  const root: FileNode = { name: '', path: '', children: [] };
  for (const file of files) {
    const parts = file.relativePath.split('/');
    let parent = root;
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/');
      let node = parent.children.find((child) => child.path === path);
      if (!node) { node = { name, path, children: [] }; parent.children.push(node); }
      if (i === parts.length - 1) node.file = file;
      parent = node;
    });
  }
  const sort = (nodes: FileNode[]): FileNode[] => nodes.sort((a, b) => {
    if (a.path === 'main.tex') return -1;
    if (b.path === 'main.tex') return 1;
    if (!!a.file !== !!b.file) return a.file ? 1 : -1;
    return a.name.localeCompare(b.name);
  }).map((node) => ({ ...node, children: sort(node.children) }));
  return sort(root.children);
}

const FileBranch: React.FC<{
  node: FileNode; active: string; dirty: Record<string, boolean>;
  onOpen: (path: string) => void; depth?: number;
}> = ({ node, active, dirty, onOpen, depth = 0 }) => {
  const [expanded, setExpanded] = useState(true);
  const isFile = Boolean(node.file);
  const Icon = isFile ? (node.file?.category === 'bib' ? BookOpen : FileCode2) : expanded ? FolderOpen : Folder;
  return (
    <li>
      <button type="button" className={`paper-file-row ${active === node.path ? 'is-active' : ''}`}
        style={{ paddingLeft: 12 + depth * 14 }} title={node.path}
        aria-current={active === node.path ? 'page' : undefined}
        aria-expanded={isFile ? undefined : expanded}
        onClick={() => isFile ? onOpen(node.path) : setExpanded(!expanded)}>
        {!isFile ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="paper-tree-spacer" />}
        <Icon size={14} className={isFile ? '' : 'paper-folder-icon'} />
        <span className="paper-truncate">{node.name}</span>
        {node.path === 'main.tex' && <span className="paper-main-label">主文件</span>}
        {dirty[node.path] && <span className="paper-dirty-dot" aria-label="未保存" />}
      </button>
      {!isFile && expanded && <ul>{node.children.map((child) => (
        <FileBranch key={child.path} node={child} active={active} dirty={dirty} onOpen={onOpen} depth={depth + 1} />
      ))}</ul>}
    </li>
  );
};

const editorExtensions = [EditorView.lineWrapping, EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: '#ffffff' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, "SFMono-Regular", monospace', lineHeight: '1.85' },
  '.cm-content': { padding: '20px 0' },
  '.cm-line': { padding: '0 20px 0 12px' },
  '.cm-gutters': { backgroundColor: '#fff', color: '#a1a8b5', border: 'none', minWidth: '44px' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#f6f8fc' },
  '&.cm-focused': { outline: 'none' },
})];

export const PaperWorkspaceView: React.FC = () => {
  const {
    projectDir, paperFiles, activePaperFilePath, paperFileContents, paperDirtyFiles, paperEditRevision,
    errorMessage, setPickerOpen, setInsertFigureModalOpen, setLastPaperCursorOffset,
    refreshPaperFiles, openPaperFile, updatePaperFileContent, createNewPaperFile,
  } = useProjectStore(useShallow((s) => ({
    projectDir: s.projectDir, paperFiles: s.paperFiles, activePaperFilePath: s.activePaperFilePath,
    paperFileContents: s.paperFileContents, paperDirtyFiles: s.paperDirtyFiles, paperEditRevision: s.paperEditRevision, errorMessage: s.errorMessage,
    setPickerOpen: s.setPickerOpen, setInsertFigureModalOpen: s.setInsertFigureModalOpen,
    setLastPaperCursorOffset: s.setLastPaperCursorOffset, refreshPaperFiles: s.refreshPaperFiles,
    openPaperFile: s.openPaperFile, updatePaperFileContent: s.updatePaperFileContent,
    createNewPaperFile: s.createNewPaperFile,
  })));
  const { texEngine, texLiveBinDir, openSettings } = useSettingsStore(useShallow((s) => ({
    texEngine: s.texEngine, texLiveBinDir: s.texLiveBinDir, openSettings: s.openSettings,
  })));
  const editorRef = useRef<EditorView | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const navigationId = useRef(0);
  const pdfRef = useRef<PaperPdfPreviewHandle | null>(null);
  const editorPath = useRef('');
  const [pdfReady, setPdfReady] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ error: boolean; message: string } | null>(null);
  const [sourceTarget, setSourceTarget] = useState<SourceLocation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'files' | 'outline'>('files');
  const [viewMode, setViewMode] = useState<ViewMode>('both');
  const [sourceWidth, setSourceWidth] = useState(58);
  const [resizing, setResizing] = useState(false);
  const [openTabs, setOpenTabs] = useState<string[]>([activePaperFilePath]);
  const [newFilePath, setNewFilePath] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [fileError, setFileError] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const { compileResult, compiledRevision, isCompiling, runBuild } = usePaperBuildStore(useShallow((s) => ({
    compileResult: s.projectId === projectDir ? s.result : null,
    compiledRevision: s.projectId === projectDir ? s.compiledRevision : -1,
    isCompiling: s.projectId === projectDir && s.status === 'running',
    runBuild: s.run,
  })));

  const source = paperFileContents[activePaperFilePath] ?? '';
  const insertion = useProjectStore((s) => s.paperInsertionLocation);
  useEffect(() => {
    if (!insertion || insertion.projectId !== projectDir) return;
    if (insertion.path !== activePaperFilePath) {
      useProjectStore.getState().clearPaperInsertionLocation();
      return;
    }
    const frame = requestAnimationFrame(() => {
      const view = editorRef.current;
      if (!view || editorPath.current !== insertion.path || view.state.doc.toString() !== source) return;
      const offset = Math.min(insertion.offset, view.state.doc.length);
      view.dispatch({ selection: { anchor: offset }, effects: EditorView.scrollIntoView(offset, { y: 'center' }) });
      view.focus();
      useProjectStore.getState().clearPaperInsertionLocation();
    });
    return () => cancelAnimationFrame(frame);
  }, [insertion, projectDir, activePaperFilePath, source]);
  const files = useMemo(() => paperFiles.filter((file) =>
    !file.relativePath.startsWith('agentikzfile/') && /\.(tex|bib|sty|cls|tikz)$/i.test(file.relativePath)
  ), [paperFiles]);
  const tree = useMemo(() => fileTree(files), [files]);
  const headings = useMemo(() => findHeadings(source), [source]);
  const tabs = openTabs.filter((path) => files.some((file) => file.relativePath === path));
  const hasPaper = files.some((file) => /\.tex$/i.test(file.relativePath));
  const dirty = Object.values(paperDirtyFiles).some(Boolean);

  useEffect(() => {
    setShowLogs(false);
    setOpenTabs([]);
    setFileError('');
    setShowNewFile(false);
    setPdfReady(false); setSyncNotice(null); setSourceTarget(null);
    navigationId.current += 1; setSyncBusy(false);
    return () => { navigationId.current += 1; };
  }, [projectDir]);

  useEffect(() => {
    setPdfReady(false);
    setShowLogs(Boolean(compileResult && !compileResult.ok));
    navigationId.current += 1; setSyncBusy(false); setSyncNotice(null);
  }, [compileResult]);

  useEffect(() => {
    setOpenTabs((paths) => paths.includes(activePaperFilePath) ? paths : [...paths, activePaperFilePath]);
    setLastPaperCursorOffset(null);
    setCursor({ line: 1, column: 1 });
  }, [activePaperFilePath, projectDir, setLastPaperCursorOffset]);

  useEffect(() => {
    if (!sourceTarget || activePaperFilePath !== sourceTarget.relativePath) return;
    const frame = requestAnimationFrame(() => {
      const view = editorRef.current;
      if (!view || editorPath.current !== sourceTarget.relativePath || view.state.doc.toString() !== source) return;
      const line = view.state.doc.line(Math.min(sourceTarget.line, view.state.doc.lines));
      const offset = Math.min(line.to, line.from + sourceTarget.column - 1);
      view.dispatch({ selection: { anchor: offset }, effects: EditorView.scrollIntoView(offset, { y: 'center' }) });
      view.focus();
      setSourceTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [sourceTarget, activePaperFilePath, source]);

  useEffect(() => {
    if (!syncNotice) return;
    const timer = setTimeout(() => setSyncNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [syncNotice]);

  const pdfStale = compiledRevision !== paperEditRevision;
  const canSync = Boolean(projectDir && compileResult?.ok && compileResult.pdfPath && pdfReady && !isCompiling && !pdfStale);
  const syncUnavailable = isCompiling ? '正在编译，请稍候'
    : !compileResult?.pdfPath ? '请先编译论文，生成 PDF 与 SyncTeX 映射'
    : pdfStale ? '源码已更新，请重新编译后定位'
    : !pdfReady ? 'PDF 尚未就绪' : '';

  const locatePdf = async () => {
    const view = editorRef.current;
    if (!canSync || !projectDir || !compileResult?.pdfPath || !view || syncBusy) return;
    if (!/\.tex$/i.test(activePaperFilePath)) {
      setSyncNotice({ error: true, message: '请先选择需要定位的 .tex 论文源码' }); return;
    }
    const request = ++navigationId.current;
    const file = activePaperFilePath;
    const revision = paperEditRevision;
    const offset = view.state.selection.main.head;
    const line = view.state.doc.lineAt(offset);
    setSyncBusy(true);
    try {
      const target = await syncTexForward({
        projectDir, pdfPath: compileResult.pdfPath, sourceFile: file,
        line: line.number, column: offset - line.from + 1, texLiveBinDir: texLiveBinDir || undefined,
      });
      const current = useProjectStore.getState();
      if (request !== navigationId.current || current.activePaperFilePath !== file || current.paperEditRevision !== revision) return;
      pdfRef.current?.navigate(target);
      setSyncNotice({ error: false, message: `已在 PDF 第 ${target.page} 页定位当前源码` });
    } catch (error) {
      if (request === navigationId.current) setSyncNotice({ error: true, message: String(error) });
    } finally {
      if (request === navigationId.current) setSyncBusy(false);
    }
  };

  const locateSource = async (point?: PdfPoint) => {
    if (!canSync || !projectDir || !compileResult?.pdfPath || syncBusy) return;
    const position = point || pdfRef.current?.currentPoint();
    if (!position) { setSyncNotice({ error: true, message: '请先在 PDF 正文中点击一个位置' }); return; }
    const request = ++navigationId.current;
    const revision = paperEditRevision;
    const file = activePaperFilePath;
    setSyncBusy(true);
    try {
      const target = await syncTexBackward({
        projectDir, pdfPath: compileResult.pdfPath, page: position.page, x: position.x, y: position.y,
        texLiveBinDir: texLiveBinDir || undefined,
      });
      const current = useProjectStore.getState();
      if (request !== navigationId.current || current.paperEditRevision !== revision || current.activePaperFilePath !== file) return;
      const content = await openPaperFile(target.relativePath);
      if (request !== navigationId.current || useProjectStore.getState().paperEditRevision !== revision) return;
      if (!content && useProjectStore.getState().paperFileContents[target.relativePath] === undefined) throw new Error('无法读取定位到的源码文件');
      setViewMode('both');
      setSourceTarget(target);
      setSyncNotice({ error: false, message: `已定位到 ${target.relativePath} 第 ${target.line} 行` });
    } catch (error) {
      if (request === navigationId.current) setSyncNotice({ error: true, message: String(error) });
    } finally {
      if (request === navigationId.current) setSyncBusy(false);
    }
  };

  const jumpToHeading = (heading: Heading) => {
    if (viewMode === 'preview') setViewMode('both');
    requestAnimationFrame(() => {
      const view = editorRef.current;
      if (!view) return;
      const position = Math.min(heading.offset, view.state.doc.length);
      view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) });
      view.focus();
    });
  };

  const createFile = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = newFilePath.trim().replace(/\\/g, '/');
    if (!input) return;
    const path = input.includes('.') ? input : `sections/${input}.tex`;
    if (path.startsWith('/') || path.includes(':') || path.split('/').some((part) => !part || part === '..' || part === '.')) {
      setFileError('请输入项目内的相对路径'); return;
    }
    if (paperFiles.some((file) => file.relativePath.toLowerCase() === path.toLowerCase())) {
      setFileError('文件已存在，请换一个名称'); return;
    }
    if (await createNewPaperFile(path, '')) {
      setShowNewFile(false); setNewFilePath(''); setFileError('');
    } else setFileError(useProjectStore.getState().errorMessage || '文件创建失败');
  };

  const compilePaper = async () => {
    if (isCompiling) return;
    navigationId.current += 1; setSyncBusy(false); setSyncNotice(null);
    if (viewMode === 'source') setViewMode('both');
    await runBuild();
  };

  return (
    <section className="paper-workspace" aria-label="论文编辑工作区">
      {sidebarOpen && (
        <aside className="paper-navigation" aria-label="论文导航">
          <div className="paper-nav-heading">
            <span><FileText size={15} />我的论文</span>
            <button type="button" className="paper-icon-button" title="收起论文导航" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={15} /></button>
          </div>
          <div className="paper-project-actions">
            <button type="button" className="paper-new-project" onClick={() => setPickerOpen(true, 'create_template')}><Plus size={14} />新建论文</button>
            <button type="button" className="paper-icon-button" title="打开已有论文" onClick={() => setPickerOpen(true)}><FolderOpen size={15} /></button>
          </div>
          <div className="paper-navigation-tabs" role="tablist" aria-label="论文导航内容">
            <button type="button" role="tab" aria-selected={sidebarTab === 'files'} onClick={() => setSidebarTab('files')}><Folder size={13} />文件</button>
            <button type="button" role="tab" aria-selected={sidebarTab === 'outline'} onClick={() => setSidebarTab('outline')}><ListTree size={13} />大纲</button>
          </div>
          <div className="paper-nav-content">
            {sidebarTab === 'files' ? (
              <>
                <div className="paper-section-heading"><span>项目文件</span><div>
                  <button type="button" className="paper-icon-button" title="新建文件" onClick={() => setShowNewFile(!showNewFile)} disabled={!hasPaper}><FilePlus2 size={14} /></button>
                  <button type="button" className="paper-icon-button" title="刷新文件" onClick={() => void refreshPaperFiles()}><RefreshCw size={13} /></button>
                </div></div>
                {showNewFile && <form className="paper-new-file" onSubmit={createFile}>
                  <label htmlFor="paper-new-file">文件路径</label>
                  <input id="paper-new-file" autoFocus value={newFilePath} onChange={(e) => setNewFilePath(e.target.value)} placeholder="sections/method.tex" />
                  {fileError && <p role="alert">{fileError}</p>}
                  <div><button type="submit">创建</button><button type="button" onClick={() => setShowNewFile(false)}>取消</button></div>
                </form>}
                <ul className="paper-tree">{tree.map((node) => <FileBranch key={node.path} node={node} active={activePaperFilePath} dirty={paperDirtyFiles} onOpen={(path) => void openPaperFile(path)} />)}</ul>
                {files.length === 0 && <p className="paper-nav-empty">打开或新建论文后，文件将显示在这里。</p>}
              </>
            ) : (
              <><div className="paper-section-heading"><span>当前文件大纲</span><span>{headings.length}</span></div>
                {headings.length === 0 ? <p className="paper-nav-empty">当前文件中还没有章节标题。</p> : <ul className="paper-outline">{headings.map((heading) => (
                  <li key={heading.offset}><button type="button" onClick={() => jumpToHeading(heading)} title={`第 ${heading.line} 行`}
                    style={{ paddingLeft: heading.level === 'section' ? 16 : heading.level === 'subsection' ? 28 : 40 }}>
                    <span className="paper-truncate">{heading.title}</span><span>{heading.line}</span>
                  </button></li>
                ))}</ul>}
              </>
            )}
          </div>
          <div className="paper-nav-footer"><span className="paper-connection-dot" /><span className="paper-truncate" title={projectDir || ''}>{projectDir ? '本地项目' : '未关联文件夹'}</span></div>
        </aside>
      )}
      <div className="paper-main">
        <div className="paper-command-bar">
          {!sidebarOpen && <button type="button" className="paper-icon-button" title="展开论文导航" onClick={() => setSidebarOpen(true)}><PanelLeftOpen size={16} /></button>}
          <span className="paper-breadcrumb"><FileCode2 size={14} /><span className="paper-truncate">{hasPaper ? activePaperFilePath : '论文编辑'}</span></span>
          <span className="paper-save-state">{dirty ? <><span className="paper-dirty-dot" />保存中</> : <><Check size={12} />{projectDir ? '已保存' : '本地暂存'}</>}</span>
          <div className="paper-command-spacer" />
          <div className="paper-view-switch" role="group" aria-label="论文视图">
            {([{ id: 'source', label: '源码' }, { id: 'both', label: '源码与 PDF' }, { id: 'preview', label: 'PDF' }] as const).map((view) => (
              <button key={view.id} type="button" aria-pressed={viewMode === view.id} onClick={() => setViewMode(view.id)}>{view.label}</button>
            ))}
          </div>
          <button type="button" className="paper-secondary-button paper-insert-button" disabled={!hasPaper} onClick={() => setInsertFigureModalOpen(true)} title="选择配图并插入论文，不打开绘图画布"><ImagePlus size={14} />插入配图</button>
          <button type="button" className="paper-compile-button" disabled={isCompiling || !hasPaper} onClick={() => void compilePaper()}>
            {isCompiling ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} fill="currentColor" />}{isCompiling ? '编译中' : '编译 PDF'}
          </button>
        </div>
        {errorMessage && <div className="paper-error" role="alert">{errorMessage}</div>}
        {syncNotice && <div className={`paper-sync-notice ${syncNotice.error ? 'is-error' : ''}`} role={syncNotice.error ? 'alert' : 'status'}>{syncNotice.message}</div>}
        {!hasPaper ? (
          <div className="paper-empty-workspace">
            <div className="paper-empty-icon"><FileText size={27} strokeWidth={1.4} /></div>
            <h1>专注写好你的论文</h1>
            <p>从论文模板开始，或打开已有 LaTeX 项目。<br />源码与 PDF 在这里并排呈现。</p>
            <div><button type="button" className="paper-compile-button" onClick={() => setPickerOpen(true, 'create_template')}><Plus size={14} />新建论文</button>
              <button type="button" className="paper-secondary-button" onClick={() => setPickerOpen(true)}><FolderOpen size={14} />打开项目</button></div>
          </div>
        ) : (
          <div className={`paper-desk ${resizing ? 'is-resizing' : ''}`} ref={splitRef}>
            <div className="paper-source" style={{ display: viewMode === 'preview' ? 'none' : undefined, flexBasis: viewMode === 'both' ? `${sourceWidth}%` : '100%' }}>
              <div className="paper-file-tabs" role="tablist" aria-label="已打开文件">
                {tabs.map((path) => <div key={path} className={`paper-tab ${path === activePaperFilePath ? 'is-active' : ''}`}>
                  <button type="button" role="tab" aria-selected={path === activePaperFilePath} title={path} onClick={() => void openPaperFile(path)}><FileCode2 size={13} /><span>{path.split('/').pop()}</span>{paperDirtyFiles[path] && <span className="paper-dirty-dot" />}</button>
                  {tabs.length > 1 && <button type="button" className="paper-tab-close" title={`关闭 ${path}`} onClick={() => {
                    setOpenTabs((paths) => paths.filter((p) => p !== path));
                    if (path === activePaperFilePath) void openPaperFile(tabs.filter((p) => p !== path).at(-1)!);
                  }}><X size={11} /></button>}
                </div>)}
              </div>
              <div className="paper-editor-host">
                <CodeMirror key={`${projectDir}:${activePaperFilePath}`} value={source} height="100%" extensions={editorExtensions}
                  aria-label={`论文源码 ${activePaperFilePath}`} placeholder="在这里编写 LaTeX…"
                  basicSetup={{ foldGutter: false, highlightActiveLine: true, lineNumbers: true }}
                  onCreateEditor={(view) => { editorRef.current = view; editorPath.current = activePaperFilePath; }}
                  onUpdate={(update) => {
                    if (!update.selectionSet && !update.docChanged) return;
                    const offset = update.state.selection.main.head;
                    const line = update.state.doc.lineAt(offset);
                    setLastPaperCursorOffset(offset); setCursor({ line: line.number, column: offset - line.from + 1 });
                  }}
                  onChange={(value) => updatePaperFileContent(activePaperFilePath, value)} />
              </div>
              <div className="paper-source-status"><span>LaTeX</span><span>UTF-8</span><span className="paper-command-spacer" /><span>行 {cursor.line}，列 {cursor.column}</span></div>
            </div>
            {viewMode === 'both' && <div className="paper-resize-handle" role="separator" aria-label="调整源码与 PDF 的宽度" aria-orientation="vertical" tabIndex={0}
              aria-valuemin={30} aria-valuemax={75} aria-valuenow={Math.round(sourceWidth)}
              onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setSourceWidth((w) => Math.min(75, Math.max(30, w + (e.key === 'ArrowLeft' ? -2 : 2)))); } }}
              onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setResizing(true); }}
              onPointerMove={(e) => { if (!resizing || !splitRef.current) return; const rect = splitRef.current.getBoundingClientRect(); setSourceWidth(Math.min(75, Math.max(30, (e.clientX - rect.left) / rect.width * 100))); }}
              onPointerUp={(e) => { setResizing(false); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
              onLostPointerCapture={() => setResizing(false)} />}
            {viewMode === 'both' && <div className="paper-synctex-controls" style={{ left: `${sourceWidth}%` }} role="group" aria-label="源码与 PDF 双向定位">
              <button type="button" aria-label="在 PDF 中定位当前源码位置"
                title={syncUnavailable || '在 PDF 中定位当前源码位置'} disabled={!canSync || syncBusy || !/\.tex$/i.test(activePaperFilePath)}
                onMouseDown={(e) => e.preventDefault()} onClick={() => void locatePdf()}>
                {syncBusy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              </button>
              <button type="button" aria-label="在源码中定位当前 PDF 位置"
                title={syncUnavailable || '在源码中定位当前 PDF 位置（也可 Ctrl/⌘ + 点击 PDF）'} disabled={!canSync || syncBusy}
                onClick={() => void locateSource()}><ArrowLeft size={14} /></button>
            </div>}
            <div className="paper-preview" style={{ display: viewMode === 'source' ? 'none' : undefined }}>
              <div className="paper-preview-header"><FileText size={14} /><span>PDF 预览</span><span className="paper-command-spacer" /><button type="button" className="paper-icon-button" title="TeX 编译设置" onClick={() => openSettings('general')}><Settings size={14} /></button></div>
              <div className="paper-preview-content">
                {compileResult?.ok && compileResult.pdfPath && projectDir ? <Suspense fallback={<div className="paper-preview-empty">正在加载 PDF…</div>}>
                  <PaperPdfPreview key={`${compileResult.pdfPath}:${compileResult.buildId}`} ref={pdfRef} projectDir={projectDir} pdfPath={compileResult.pdfPath}
                    onReadyChange={setPdfReady} onReverseSync={(point) => void locateSource(point)} />
                </Suspense> : <div className="paper-preview-empty">
                  <div className="paper-preview-page"><FileText size={30} strokeWidth={1.2} /><span /><span /><span /></div>
                  <h2>{isCompiling ? '正在编译论文' : '在这里预览你的论文'}</h2>
                  <p>{isCompiling ? '正在调用本地 TeX 引擎，请稍候。' : '点击「编译 PDF」，查看完整排版。'}</p>
                  <button type="button" onClick={() => openSettings('general')}>配置 TeX Live <ChevronRight size={12} /></button>
                </div>}
              </div>
              {compileResult && <div className={`paper-build-result ${compileResult.ok ? 'is-success' : 'is-error'}`} role="status">{compileResult.message}</div>}
              {showLogs && compileResult?.logExcerpt && <pre className="paper-build-log">{compileResult.logExcerpt}</pre>}
              <div className="paper-preview-status"><span className={isCompiling ? 'paper-dirty-dot' : 'paper-status-dot'} /><span>{isCompiling ? '正在编译' : compileResult ? (compileResult.ok ? (pdfStale ? '源码已更改 · 请重新编译' : '编译完成') : '未生成 PDF') : '等待编译'}</span><span className="paper-command-spacer" />
                <button type="button" disabled={!compileResult?.logExcerpt} onClick={() => setShowLogs(!showLogs)}>{showLogs ? '收起日志' : '编译日志'}</button><span>{texEngine}</span></div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
