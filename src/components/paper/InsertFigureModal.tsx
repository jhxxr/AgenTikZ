import { useShallow } from 'zustand/react/shallow';
import React, { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import {
  buildFigureLaTeXSnippet,
  type FigureColumnSpan,
  type FigureInsertMode,
} from '../../core/paper/paper-templates';
import './InsertFigureModal.css';

export const InsertFigureModal: React.FC = () => {
  const {
    isInsertFigureModalOpen,
    setInsertFigureModalOpen,
    canvases,
    activeCanvasFileName,
    activeCanvasName,
    assets,
    paperFiles,
    activePaperFilePath,
    insertFigureIntoPaper,
    ensureAgentikzMacrosSty,
    setWorkbenchMode,
    openPaperFile,
  } = useProjectStore(useShallow((s) => ({
    isInsertFigureModalOpen: s.isInsertFigureModalOpen,
    setInsertFigureModalOpen: s.setInsertFigureModalOpen,
    canvases: s.canvases,
    activeCanvasFileName: s.activeCanvasFileName,
    activeCanvasName: s.activeCanvasName,
    assets: s.assets,
    paperFiles: s.paperFiles,
    activePaperFilePath: s.activePaperFilePath,
    insertFigureIntoPaper: s.insertFigureIntoPaper,
    ensureAgentikzMacrosSty: s.ensureAgentikzMacrosSty,
    setWorkbenchMode: s.setWorkbenchMode,
    openPaperFile: s.openPaperFile,
  })));

  const { parsedDoc } = useWorkspaceStore(useShallow((s) => ({ parsedDoc: s.parsedDoc })));

  const activeCanvas = useMemo(
    () =>
      canvases.find((c) => c.fileName === activeCanvasFileName) || canvases[0],
    [canvases, activeCanvasFileName]
  );

  const texFiles = useMemo(() => {
    const filtered = paperFiles.filter(
      (f) =>
        f.relativePath.toLowerCase().endsWith('.tex') &&
        !f.relativePath.startsWith('agentikzfile/')
    );
    if (filtered.length > 0) return filtered;
    return [
      {
        fileName: 'main.tex',
        relativePath: 'main.tex',
        category: 'main' as const,
        sizeBytes: 0,
        modifiedAt: 0,
      },
    ];
  }, [paperFiles]);

  const [mode, setMode] = useState<FigureInsertMode>('tikz_package');
  const [columnSpan, setColumnSpan] = useState<FigureColumnSpan>('double_column');
  const [targetTexRelPath, setTargetTexRelPath] = useState<string>('sections/method.tex');
  const [selectedExternalGraphic, setSelectedExternalGraphic] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [widthRatio, setWidthRatio] = useState<string>('0.98');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stem = useMemo(() => {
    const rawName =
      activeCanvasFileName.replace(/\.canvas\.json$/i, '') ||
      activeCanvas?.name ||
      activeCanvasName ||
      'fig1-overview';
    return rawName
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_');
  }, [activeCanvasFileName, activeCanvas, activeCanvasName]);

  useEffect(() => {
    if (!isInsertFigureModalOpen) return;
    setStatusMsg(null);
    setCaption(
      parsedDoc.figureCaption ||
        `${activeCanvas?.name || activeCanvasName || 'Figure'} overview and experimental results.`
    );
    setLabel(parsedDoc.figureLabel || `fig:${stem.toLowerCase()}`);

    if (activePaperFilePath && activePaperFilePath.endsWith('.tex')) {
      setTargetTexRelPath(activePaperFilePath);
    } else if (texFiles.some((f) => f.relativePath === 'sections/method.tex')) {
      setTargetTexRelPath('sections/method.tex');
    } else if (texFiles.length > 0) {
      setTargetTexRelPath(texFiles[0].relativePath);
    }

    if (assets.length > 0 && !selectedExternalGraphic) {
      setSelectedExternalGraphic(assets[0].relativePath);
    }
  }, [
    isInsertFigureModalOpen,
    parsedDoc.figureCaption,
    parsedDoc.figureLabel,
    activeCanvas,
    activeCanvasName,
    stem,
    activePaperFilePath,
    texFiles,
    assets,
    selectedExternalGraphic,
  ]);

  if (!isInsertFigureModalOpen) return null;

  const figureRelPath =
    mode === 'tikz_package'
      ? `figures/${stem}.tikz`
      : selectedExternalGraphic || `figures/${stem}.pdf`;

  const snippet = buildFigureLaTeXSnippet({
    mode,
    span: columnSpan,
    relativePath: figureRelPath,
    caption,
    label,
    widthRatio: widthRatio || '0.98',
  });

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setStatusMsg('✓ 已复制 LaTeX 插图代码段到剪贴板');
    } catch {
      setStatusMsg('复制失败，请手动选中代码复制');
    }
  };

  const handleSyncMacrosOnly = async () => {
    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      await ensureAgentikzMacrosSty();
      setStatusMsg('✓ 已更新 styles/agentikz-macros.sty 宏包与 figures/*.tikz 代码包');
    } catch (e) {
      setStatusMsg(`同步失败: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInsertIntoPaper = async () => {
    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      const result = await insertFigureIntoPaper({
        targetTexFile: targetTexRelPath,
        mode,
        span: columnSpan,
        relativePath: figureRelPath,
        widthRatio: widthRatio || '0.98',
        caption,
        label,
      });
      if (!result.ok) throw new Error('配图写入失败');
      setStatusMsg(`✓ 已将配图插入到 ${targetTexRelPath} 并自动同步 styles/agentikz-macros.sty`);
      return true;
    } catch (e) {
      setStatusMsg(`插入失败: ${String(e)}`);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInsertAndJumpToPaper = async () => {
    if (!await handleInsertIntoPaper()) return;
    await openPaperFile(targetTexRelPath);
    setWorkbenchMode('paper');
    setInsertFigureModalOpen(false);
  };

  return (
    <div className="ifm-overlay" onClick={() => setInsertFigureModalOpen(false)}>
      <div className="ifm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ifm-header">
          <div>
            <span className="ifm-badge">FIGURE-AS-PACKAGE WORKFLOW</span>
            <h3 className="ifm-title">📌 将配图作为代码包/素材插入论文</h3>
          </div>
          <button
            className="ifm-close"
            onClick={() => setInsertFigureModalOpen(false)}
            title="关闭"
          >
            ✕
          </button>
        </div>

        <div className="ifm-body">
          <div className="ifm-grid">
            <div className="ifm-field">
              <label className="ifm-label">插入方式 (Insertion Mode)</label>
              <div className="ifm-seg">
                <button
                  type="button"
                  className={`ifm-seg-btn ${mode === 'tikz_package' ? 'active' : ''}`}
                  onClick={() => setMode('tikz_package')}
                >
                  📦 TikZ 可编辑代码包 (\input)
                </button>
                <button
                  type="button"
                  className={`ifm-seg-btn ${mode === 'external_graphic' ? 'active' : ''}`}
                  onClick={() => setMode('external_graphic')}
                >
                  🖼️ 外部/导出成品图 (\includegraphics)
                </button>
              </div>
              <span className="ifm-hint">
                {mode === 'tikz_package'
                  ? `自动同步 figures/${stem}.tikz 与 styles/agentikz-macros.sty，画布修改后论文自动生效`
                  : '引用 figures/external/ 下的外部 PDF/PNG/SVG 素材或编译产物'}
              </span>
            </div>

            <div className="ifm-field">
              <label className="ifm-label">版面栏宽 (Column Span)</label>
              <div className="ifm-seg">
                <button
                  type="button"
                  className={`ifm-seg-btn ${columnSpan === 'single_column' ? 'active' : ''}`}
                  onClick={() => setColumnSpan('single_column')}
                >
                  单栏 figure (\columnwidth ≈ 89mm)
                </button>
                <button
                  type="button"
                  className={`ifm-seg-btn ${columnSpan === 'double_column' ? 'active' : ''}`}
                  onClick={() => setColumnSpan('double_column')}
                >
                  跨双栏 figure* (\textwidth ≈ 183mm)
                </button>
              </div>
            </div>
          </div>

          <div className="ifm-grid">
            <div className="ifm-field">
              <label className="ifm-label">目标 LaTeX 章节文件</label>
              <select
                className="ifm-select"
                value={targetTexRelPath}
                onChange={(e) => setTargetTexRelPath(e.target.value)}
              >
                {texFiles.map((f) => (
                  <option key={f.relativePath} value={f.relativePath}>
                    {f.relativePath}
                  </option>
                ))}
              </select>
            </div>

            {mode === 'external_graphic' ? (
              <div className="ifm-field">
                <label className="ifm-label">选择或输入外部图像路径</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="ifm-input"
                    value={selectedExternalGraphic}
                    onChange={(e) => setSelectedExternalGraphic(e.target.value)}
                    placeholder={`figures/${stem}.pdf 或 figures/external/xxx.png`}
                  />
                  {assets.length > 0 && (
                    <select
                      className="ifm-select"
                      style={{ maxWidth: 165 }}
                      value={selectedExternalGraphic}
                      onChange={(e) => setSelectedExternalGraphic(e.target.value)}
                    >
                      {assets.map((a) => (
                        <option key={a.relativePath} value={a.relativePath}>
                          {a.fileName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ) : (
              <div className="ifm-field">
                <label className="ifm-label">宽度比例 (相对栏宽)</label>
                <input
                  className="ifm-input"
                  value={widthRatio}
                  onChange={(e) => setWidthRatio(e.target.value)}
                  placeholder="0.98"
                />
              </div>
            )}
          </div>

          <div className="ifm-grid">
            <div className="ifm-field">
              <label className="ifm-label">图注 Caption (\caption)</label>
              <input
                className="ifm-input"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Overview of the proposed architecture..."
              />
            </div>
            <div className="ifm-field">
              <label className="ifm-label">引用标签 Label (\label)</label>
              <input
                className="ifm-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="fig:overview"
              />
            </div>
          </div>

          <div className="ifm-preview-box">
            <div className="ifm-preview-header">
              <span>生成的 LaTeX Figure 环境代码预览</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="ifm-mini-btn"
                  onClick={handleSyncMacrosOnly}
                  disabled={isSubmitting}
                >
                  🔄 仅同步 styles/agentikz-macros.sty
                </button>
                <button
                  type="button"
                  className="ifm-mini-btn"
                  onClick={handleCopySnippet}
                >
                  📋 复制代码段
                </button>
              </div>
            </div>
            <pre className="ifm-pre">{snippet}</pre>
          </div>

          {statusMsg && <div className="ifm-status">{statusMsg}</div>}
        </div>

        <div className="ifm-footer">
          <button
            type="button"
            className="ifm-btn secondary"
            onClick={() => setInsertFigureModalOpen(false)}
          >
            关闭
          </button>
          <button
            type="button"
            className="ifm-btn secondary"
            onClick={handleInsertIntoPaper}
            disabled={isSubmitting}
          >
            📌 写入 {targetTexRelPath}
          </button>
          <button
            type="button"
            className="ifm-btn primary"
            onClick={handleInsertAndJumpToPaper}
            disabled={isSubmitting}
          >
            写入并返回论文
          </button>
        </div>
      </div>
    </div>
  );
};
