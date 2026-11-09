import { useShallow } from 'zustand/react/shallow';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { buildFigureLaTeXSnippet, type FigureColumnSpan, type FigureInsertMode } from '../../core/paper/paper-templates';
import {
  canInsertGraphic, canvasFigurePath, defaultFigureLabel, defaultFigureSpan, escapeLatexText,
  hasDrawableFigure, type FigureInsertSource,
} from '../../core/paper/figure-insertion';
import './InsertFigureModal.css';

/** Mount once per explicit open, never reset the form on an asset refresh or a field change. */
export const InsertFigureModal: React.FC = () => {
  const { open, requestId } = useProjectStore(useShallow((s) => ({
    open: s.isInsertFigureModalOpen, requestId: s.figureInsertRequestId,
  })));
  return open ? <FigureInsertionDialog key={requestId || 'insert'} /> : null;
};

const FigureInsertionDialog: React.FC = () => {
  const {
    projectDir, requestId, source, assets, canvases, activeCanvasFileName, activeCanvasName, paperFiles,
    activePaperFilePath, lastPaperCursorOffset, mainSource, isInsertingFigure,
    setInsertFigureModalOpen, insertFigureIntoPaper, ensureAgentikzMacrosSty, setWorkbenchMode, setPickerOpen,
    registerLocalBrowserAssetFiles,
  } = useProjectStore(useShallow((s) => ({
    projectDir: s.projectDir, requestId: s.figureInsertRequestId, source: s.figureInsertSource,
    assets: s.assets, canvases: s.canvases, activeCanvasFileName: s.activeCanvasFileName,
    activeCanvasName: s.activeCanvasName, paperFiles: s.paperFiles,
    activePaperFilePath: s.activePaperFilePath, lastPaperCursorOffset: s.lastPaperCursorOffset,
    mainSource: s.paperFileContents['main.tex'] || Object.values(s.paperFileContents).find((text) => /\\documentclass\b/.test(text)) || '',
    isInsertingFigure: s.isInsertingFigure, setInsertFigureModalOpen: s.setInsertFigureModalOpen,
    insertFigureIntoPaper: s.insertFigureIntoPaper, ensureAgentikzMacrosSty: s.ensureAgentikzMacrosSty,
    setWorkbenchMode: s.setWorkbenchMode, setPickerOpen: s.setPickerOpen,
    registerLocalBrowserAssetFiles: s.registerLocalBrowserAssetFiles,
  })));
  const { tikzCode, parsedDoc, canvasWidthCm } = useWorkspaceStore(useShallow((s) => ({
    tikzCode: s.tikzCode, parsedDoc: s.parsedDoc, canvasWidthCm: s.canvasWidthCm,
  })));
  let currentPath = '';
  try { currentPath = canvasFigurePath(activeCanvasFileName); } catch { /* no current drawing */ }
  const graphics = useMemo(() => assets.filter((asset) => canInsertGraphic(asset.relativePath)), [assets]);
  const figures = useMemo(() => {
    const choices = new Map<string, string>();
    for (const canvas of canvases) {
      try { choices.set(canvasFigurePath(canvas.fileName), canvas.name); } catch { /* invalid legacy entry */ }
    }
    for (const file of paperFiles) {
      if (/\.tikz$/i.test(file.relativePath) && !file.relativePath.startsWith('agentikzfile/')) {
        if (!choices.has(file.relativePath)) choices.set(file.relativePath, file.fileName);
      }
    }
    if (currentPath && hasDrawableFigure(tikzCode)) choices.set(currentPath, `${activeCanvasName}（当前画布）`);
    return [...choices].map(([path, name]) => ({ path, name }));
  }, [canvases, paperFiles, currentPath, tikzCode, activeCanvasName]);
  const texFiles = useMemo(() => paperFiles.filter((file) =>
    /\.tex$/i.test(file.relativePath) && !file.relativePath.startsWith('agentikzfile/')), [paperFiles]);
  const initialMode: FigureInsertMode = source?.mode || (hasDrawableFigure(tikzCode) ? 'tikz_package' : 'external_graphic');
  const initialTikz = source?.mode === 'tikz_package' ? source.relativePath
    : hasDrawableFigure(tikzCode) ? currentPath : figures.find((figure) => figure.path !== currentPath)?.path || '';
  const initialGraphic = source?.mode === 'external_graphic' ? source.relativePath : graphics[0]?.relativePath || '';
  const initialPath = initialMode === 'tikz_package' ? initialTikz : initialGraphic;
  const description = (selection: FigureInsertSource) => {
    const isCurrent = selection.mode === 'tikz_package' && selection.relativePath === currentPath;
    const name = selection.mode === 'external_graphic'
      ? assets.find((asset) => asset.relativePath === selection.relativePath)?.fileName
      : figures.find((figure) => figure.path === selection.relativePath)?.name || activeCanvasName;
    return {
      caption: isCurrent && parsedDoc.figureCaption ? parsedDoc.figureCaption
        : escapeLatexText((name || selection.relativePath.split('/').pop() || '').replace(/\.(png|pdf|jpe?g|tikz)$/i, '')),
      label: isCurrent && parsedDoc.figureLabel ? parsedDoc.figureLabel : defaultFigureLabel(selection.relativePath || 'figure'),
    };
  };
  const defaults = description({ mode: initialMode, relativePath: initialPath });
  const [mode, setMode] = useState<FigureInsertMode>(initialMode);
  const [tikzPath, setTikzPath] = useState(initialTikz);
  const [graphicPath, setGraphicPath] = useState(initialGraphic);
  const [target, setTarget] = useState(texFiles.some((file) => file.relativePath === activePaperFilePath)
    ? activePaperFilePath : texFiles.find((file) => file.relativePath === 'main.tex')?.relativePath || texFiles[0]?.relativePath || '');
  const [span, setSpan] = useState<FigureColumnSpan>(defaultFigureSpan(mainSource, initialMode === 'tikz_package' ? canvasWidthCm : 0));
  const [width, setWidth] = useState('0.98');
  const [caption, setCaption] = useState(defaults.caption);
  const [label, setLabel] = useState(defaults.label);
  const [atCursor, setAtCursor] = useState(true);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  useEffect(() => {
    if (projectDir) void useProjectStore.getState().refreshProjectAssets();
  }, [projectDir]);
  const dirtyCaption = useRef(false);
  const dirtyLabel = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);
  const busy = isSubmitting || isImporting || isInsertingFigure;
  const path = mode === 'tikz_package' ? tikzPath : graphicPath;
  const stillCurrent = () => {
    const live = useProjectStore.getState();
    return live.projectDir === projectDir && live.figureInsertRequestId === requestId && live.isInsertFigureModalOpen;
  };
  const close = () => { if (!busy) setInsertFigureModalOpen(false); };
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || [])]
          .filter((element) => element.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [busy, setInsertFigureModalOpen]);
  const selectSource = (selection: FigureInsertSource) => {
    const next = description(selection);
    if (!dirtyCaption.current) setCaption(next.caption);
    if (!dirtyLabel.current) setLabel(next.label);
    setStatus(null);
  };
  const options = { mode, relativePath: path, caption, label, span, widthRatio: width,
    targetTexFile: target, insertAtCursor: atCursor, allowDuplicate };
  let preview = '', validation = '';
  try { preview = buildFigureLaTeXSnippet(options); } catch (error) { validation = String(error instanceof Error ? error.message : error); }
  if (!projectDir) validation = '请先打开或新建论文项目。';
  else if (!texFiles.length) validation = '当前项目没有论文文件，请先新建论文。';
  else if (!target || !texFiles.some((file) => file.relativePath === target)) validation = '请选择一个实际存在的论文章节。';
  else if (!path) validation = mode === 'external_graphic' ? '请先选择或导入 PDF、PNG、JPEG 图片。' : '请选择已绘制的 TikZ 配图。';

  const insert = async (showPaper: boolean) => {
    if (busy || validation) return;
    setIsSubmitting(true); setStatus(null);
    try {
      const result = await insertFigureIntoPaper(options);
      if (!stillCurrent()) return;
      if (!result.ok) { setStatus({ error: true, text: result.error || '插入失败，文件未确认保存。' }); return; }
      if (result.label) setLabel(result.label);
      setStatus({ error: false, text: result.alreadyPresent
        ? `此配图已在 ${result.targetFile}，未重复插入。勾选“允许重复”可插入第二处引用。`
        : `已保存至 ${result.targetFile}；插图不等于编译成功，请在论文区编译检查。` });
      if (showPaper) { setWorkbenchMode('paper'); setInsertFigureModalOpen(false); }
    } catch (error) { if (stillCurrent()) setStatus({ error: true, text: String(error) }); }
    finally { setIsSubmitting(false); }
  };
  return (
    <div className="ifm-overlay" onClick={close}>
      <div className="ifm-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="figure-insert-title" aria-busy={busy}
        onClick={(event) => event.stopPropagation()}>
        <div className="ifm-header">
          <div><span className="ifm-badge">FIGURE → PAPER</span><h3 className="ifm-title" id="figure-insert-title">将配图插入论文</h3></div>
          <button type="button" className="ifm-close" onClick={close} disabled={busy} aria-label="关闭插图窗口">✕</button>
        </div>
        <fieldset className="ifm-body" disabled={busy}>
          <div className="ifm-field">
            <span className="ifm-label">配图来源</span>
            <div className="ifm-seg">
              <button type="button" className={`ifm-seg-btn ${mode === 'tikz_package' ? 'active' : ''}`} aria-pressed={mode === 'tikz_package'}
                onClick={() => { setMode('tikz_package'); selectSource({ mode: 'tikz_package', relativePath: tikzPath }); }}>TikZ 可编辑图源</button>
              <button type="button" className={`ifm-seg-btn ${mode === 'external_graphic' ? 'active' : ''}`} aria-pressed={mode === 'external_graphic'}
                onClick={() => { setMode('external_graphic'); selectSource({ mode: 'external_graphic', relativePath: graphicPath }); }}>图片 / PDF 素材</button>
            </div>
            {mode === 'tikz_package' ? <>
              <select className="ifm-select" aria-label="选择 TikZ 配图" value={tikzPath}
                onChange={(event) => { setTikzPath(event.target.value); selectSource({ mode, relativePath: event.target.value }); }}>
                <option value="">请选择配图</option>
                {tikzPath && !figures.some((figure) => figure.path === tikzPath) && <option value={tikzPath}>{tikzPath}</option>}
                {figures.map((figure) => <option key={figure.path} value={figure.path}>{figure.name} · {figure.path}</option>)}
              </select>
              <span className="ifm-hint">插入时保存所选图源并检查宏包；选择其他配图不会切换当前画布。</span>
            </> : <>
              <div className="ifm-source-row">
                <select className="ifm-select" aria-label="选择论文图片" value={graphicPath}
                  onChange={(event) => { setGraphicPath(event.target.value); selectSource({ mode, relativePath: event.target.value }); }}>
                  <option value="">请选择图片</option>
                  {graphicPath && !graphics.some((asset) => asset.relativePath === graphicPath) && <option value={graphicPath}>{graphicPath}（需检查格式）</option>}
                  {graphics.map((asset) => <option key={asset.relativePath} value={asset.relativePath}>{asset.fileName} · {asset.relativePath}</option>)}
                </select>
                <button type="button" className="ifm-btn secondary" disabled={!projectDir} onClick={() => fileInput.current?.click()}>导入图片</button>
                <input ref={fileInput} hidden type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={async (event) => {
                  const files = Array.from(event.target.files || []); event.target.value = '';
                  if (!files.length) return;
                  setIsImporting(true); setStatus(null);
                  try {
                    const imported = await registerLocalBrowserAssetFiles(files, 'figures/external');
                    if (!stillCurrent()) return;
                    if (!imported.length) throw new Error(useProjectStore.getState().errorMessage || '图片导入失败。');
                    const selected = imported[0].relativePath;
                    setGraphicPath(selected);
                    if (!dirtyCaption.current) setCaption(escapeLatexText(imported[0].fileName.replace(/\.[^.]+$/, '')));
                    if (!dirtyLabel.current) setLabel(defaultFigureLabel(selected));
                  } catch (error) { if (stillCurrent()) setStatus({ error: true, text: String(error) }); }
                  finally { setIsImporting(false); }
                }} />
              </div>
              <span className="ifm-hint">直接引用项目内 PDF / PNG / JPEG，不保存或改动绘图画布。SVG / WebP 请先转换。</span>
            </>}
          </div>
          <div className="ifm-grid">
            <label className="ifm-field"><span className="ifm-label">目标章节</span>
              <select className="ifm-select" aria-label="目标论文章节" value={target} onChange={(event) => setTarget(event.target.value)}>
                {!texFiles.length && <option value="">尚无论文文件</option>}
                {texFiles.map((file) => <option key={file.relativePath} value={file.relativePath}>{file.relativePath}</option>)}
              </select>
            </label>
            <label className="ifm-field"><span className="ifm-label">插入位置</span>
              <select className="ifm-select" value={atCursor ? 'cursor' : 'end'} onChange={(event) => setAtCursor(event.target.value === 'cursor')}>
                <option value="cursor">光标附近安全行（无光标时放在文末）</option><option value="end">章节末尾 / 文档结束之前</option>
              </select>
              <span className="ifm-hint">{atCursor && target === activePaperFilePath && lastPaperCursorOffset != null
                ? '使用当前章节记录的光标；不会插进命令参数或公式。' : '未使用其他文件的旧光标位置。'}</span>
            </label>
          </div>
          <div className="ifm-grid">
            <label className="ifm-field"><span className="ifm-label">版面栏宽</span>
              <select className="ifm-select" value={span} onChange={(event) => setSpan(event.target.value as FigureColumnSpan)}>
                <option value="single_column">单栏 figure · columnwidth</option><option value="double_column">跨栏 figure* · textwidth</option>
              </select>
            </label>
            <label className="ifm-field"><span className="ifm-label">宽度比例（大于 0，至多 1）</span>
              <input className="ifm-input" aria-label="插图宽度比例" inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} />
            </label>
          </div>
          <div className="ifm-grid">
            <label className="ifm-field"><span className="ifm-label">图注 Caption（可留空）</span>
              <textarea className="ifm-input" rows={2} aria-label="配图图注" value={caption}
                onChange={(event) => { dirtyCaption.current = true; setCaption(event.target.value); }} />
              <span className="ifm-hint">支持 LaTeX；特殊字符按 LaTeX 语法转义，不自动生成实验结论。</span>
            </label>
            <label className="ifm-field"><span className="ifm-label">引用标签 Label</span>
              <input className="ifm-input" aria-label="配图引用标签" value={label}
                onChange={(event) => { dirtyLabel.current = true; setLabel(event.target.value); }} />
              <span className="ifm-hint">与现有标签冲突时自动追加序号，并显示实际使用的标签。</span>
            </label>
          </div>
          <label className="ifm-hint"><input type="checkbox" checked={allowDuplicate} onChange={(event) => setAllowDuplicate(event.target.checked)} /> 允许同一配图在当前章节重复插入（默认仅定位已有配图）</label>
          <div className="ifm-preview-box">
            <div className="ifm-preview-header"><span>LaTeX 代码预览</span><div className="ifm-source-row">
              {mode === 'tikz_package' && <button type="button" className="ifm-mini-btn" disabled={!projectDir} onClick={async () => {
                setIsSubmitting(true);
                try {
                  await ensureAgentikzMacrosSty();
                  if (stillCurrent()) setStatus({ error: false, text: '仅同步了 TikZ 宏包；图源会在插入时保存。' });
                } catch (error) { if (stillCurrent()) setStatus({ error: true, text: String(error) }); }
                finally { setIsSubmitting(false); }
              }}>同步宏包</button>}
              <button type="button" className="ifm-mini-btn" disabled={Boolean(validation)} onClick={async () => {
                try { await navigator.clipboard.writeText(preview); setStatus({ error: false, text: '已复制代码段，尚未写入论文文件。' }); }
                catch { setStatus({ error: true, text: '复制失败，请手动选中代码复制。' }); }
              }}>复制代码</button>
            </div></div>
            <pre className="ifm-pre">{preview || '选择有效配图后显示代码预览。'}</pre>
          </div>
          {validation && <div className="ifm-status is-error" role="status">{validation}
            {(!projectDir || !texFiles.length) && <button type="button" className="ifm-create-paper" onClick={() => {
              setInsertFigureModalOpen(false); setPickerOpen(true, 'create_template');
            }}>打开 / 新建论文</button>}
          </div>}
          {status && <div className={`ifm-status ${status.error ? 'is-error' : ''}`} role="status">{status.text}</div>}
        </fieldset>
        <div className="ifm-footer">
          <button type="button" className="ifm-btn secondary" disabled={busy} onClick={close}>关闭</button>
          <button type="button" className="ifm-btn secondary" disabled={busy || Boolean(validation)} onClick={() => void insert(false)}>仅插入</button>
          <button type="button" className="ifm-btn primary" disabled={busy || Boolean(validation)} onClick={() => void insert(true)}>
            {busy ? '处理中…' : '插入并查看论文'}
          </button>
        </div>
      </div>
    </div>
  );
};
