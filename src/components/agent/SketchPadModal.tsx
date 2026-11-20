import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, Eraser, Image as ImageIcon, Loader2, PenLine, RotateCcw, Trash2, X,
} from 'lucide-react';
import type { AgentImageAttachment } from '../../types/acp';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { compileWorkspaceTexPreview } from '../../core/tex/preview';
import { rasterizePreview } from '../../core/agent/visual-review';
import {
  canvasToSketchAttachment,
  composeSketchLayers,
  drawContainedImage,
  drawStroke,
  renderSketchStrokes,
  SKETCH_CANVAS_HEIGHT,
  SKETCH_CANVAS_WIDTH,
  type SketchPoint,
  type SketchStroke,
} from '../../core/agent/sketch-attachments';

type SketchMode = 'blank' | 'annotate';
type SketchTool = 'pen' | 'eraser';

interface Props {
  onClose: () => void;
  onComplete: (attachment: AgentImageAttachment) => void;
}

const PEN_WIDTH = 6;
const ERASER_WIDTH = 34;

function clampPoint(point: SketchPoint): SketchPoint {
  return {
    x: Math.max(0, Math.min(SKETCH_CANVAS_WIDTH, point.x)),
    y: Math.max(0, Math.min(SKETCH_CANVAS_HEIGHT, point.y)),
  };
}

export const SketchPadModal: React.FC<Props> = ({ onClose, onComplete }) => {
  const compiledSvg = useWorkspaceStore((state) => state.compiledSvg);
  const isCompilingTex = useWorkspaceStore((state) => state.isCompilingTex);
  const texCompilerStatus = useWorkspaceStore((state) => state.texCompilerStatus);
  const sourceRevision = useWorkspaceStore((state) => state.sourceRevision);
  const themeId = useWorkspaceStore((state) => state.activeThemeId);
  const texEngine = useSettingsStore((state) => state.texEngine);
  const [mode, setMode] = useState<SketchMode>('blank');
  const [tool, setTool] = useState<SketchTool>('pen');
  const [strokes, setStrokes] = useState<SketchStroke[]>([]);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [readySvg, setReadySvg] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const backgroundRef = useRef<HTMLCanvasElement | null>(null);
  const inkRef = useRef<HTMLCanvasElement | null>(null);
  const activeStroke = useRef<SketchStroke | null>(null);
  const activePointer = useRef<number | null>(null);
  const previewRequested = useRef<string | null>(null);
  const mounted = useRef(false);
  const previewKey = JSON.stringify([sourceRevision, themeId, texEngine]);
  const ready = mode === 'blank' || Boolean(compiledSvg && compiledSvg === readySvg && !previewError);

  useLayoutEffect(() => {
    mounted.current = true;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      mounted.current = false;
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (mode !== 'annotate') {
      previewRequested.current = null;
      return;
    }
    if (previewRequested.current === previewKey || compiledSvg || isCompilingTex) return;
    previewRequested.current = previewKey;
    setPreviewError('');
    void compileWorkspaceTexPreview();
  }, [compiledSvg, isCompilingTex, mode, previewKey]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      // The dialog owns shortcuts while open; do not save, undo or open a
      // project in the editor underneath it. Native Tab navigation is retained.
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key.toLowerCase() === 'z' && !event.shiftKey && !exporting && !activeStroke.current) {
          setStrokes((current) => current.slice(0, -1));
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!exporting) onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [exporting, onClose]);

  useLayoutEffect(() => {
    activeStroke.current = null;
    activePointer.current = null;
    setDrawing(false);
    setStrokes([]);
    setTool('pen');
    setError('');
    setPreviewError('');
  }, [mode]);

  useLayoutEffect(() => {
    const canvas = backgroundRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SKETCH_CANVAS_WIDTH, SKETCH_CANVAS_HEIGHT);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SKETCH_CANVAS_WIDTH, SKETCH_CANVAS_HEIGHT);
    setReadySvg(null);
    setPreviewError('');
    if (mode === 'annotate') {
      // Ink on a previous source version must not be overlaid on a new figure.
      setStrokes([]);
      activeStroke.current = null;
      activePointer.current = null;
      setDrawing(false);
    }
    if (mode !== 'annotate' || !compiledSvg) return;

    let disposed = false;
    void rasterizePreview(compiledSvg).then((data) => {
      if (disposed) return;
      const image = new Image();
      image.onload = () => {
        if (disposed) return;
        try {
          drawContainedImage(ctx, image);
          setPreviewError('');
          setReadySvg(compiledSvg);
        } catch (cause) {
          setPreviewError(cause instanceof Error ? cause.message : String(cause));
        }
      };
      image.onerror = () => {
        if (!disposed) setPreviewError('当前图预览读取失败，请切换到空白草图。');
      };
      image.src = `data:image/png;base64,${data}`;
    }).catch((cause: unknown) => {
      if (!disposed) setPreviewError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => {
      disposed = true;
    };
  }, [compiledSvg, mode, previewKey]);

  useLayoutEffect(() => {
    const canvas = inkRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderSketchStrokes(ctx, strokes);
  }, [strokes]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): SketchPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clampPoint({
      x: (event.clientX - rect.left) * (SKETCH_CANVAS_WIDTH / Math.max(1, rect.width)),
      y: (event.clientY - rect.top) * (SKETCH_CANVAS_HEIGHT / Math.max(1, rect.height)),
    });
  };

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (exporting || !ready || activeStroke.current || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getPoint(event);
    const next: SketchStroke = {
      tool,
      color: mode === 'blank' ? '#1e293b' : '#dc2626',
      lineWidth: tool === 'pen' ? PEN_WIDTH : ERASER_WIDTH,
      points: [point],
    };
    activeStroke.current = next;
    activePointer.current = event.pointerId;
    setDrawing(true);
    const ctx = inkRef.current?.getContext('2d');
    if (ctx) drawStroke(ctx, next);
  };

  const moveStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStroke.current || activePointer.current !== event.pointerId) return;
    event.preventDefault();
    const point = getPoint(event);
    const previous = activeStroke.current.points.at(-1);
    if (previous) {
      const segment = { ...activeStroke.current, points: [previous, point] };
      const ctx = inkRef.current?.getContext('2d');
      if (ctx) drawStroke(ctx, segment);
    }
    activeStroke.current.points.push(point);
  };

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStroke.current || activePointer.current !== event.pointerId) return;
    event.preventDefault();
    if (event.type === 'pointerup') moveStroke(event);
    const stroke = activeStroke.current;
    activeStroke.current = null;
    activePointer.current = null;
    setDrawing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setStrokes((current) => [...current, stroke]);
  };

  const clearStrokes = () => {
    activeStroke.current = null;
    activePointer.current = null;
    setDrawing(false);
    setStrokes([]);
  };

  const complete = async () => {
    if (exporting || !ready || activeStroke.current || !strokes.some((stroke) => stroke.tool === 'pen')) return;
    setError('');
    setExporting(true);
    try {
      const background = backgroundRef.current;
      const ink = inkRef.current;
      if (!background || !ink) throw new Error('草图画布尚未准备好，请重试。');
      const canvas = composeSketchLayers(background, ink);
      const attachment = await canvasToSketchAttachment(
        canvas,
        mode === 'annotate' ? '当前图标注.png' : '手绘草图.png',
      );
      if (!mounted.current) return;
      if (mode === 'annotate') {
        const live = useWorkspaceStore.getState();
        if (live.compiledSvg !== compiledSvg || live.sourceRevision !== sourceRevision || live.activeThemeId !== themeId ||
            useSettingsStore.getState().texEngine !== texEngine) throw new Error('当前图已变化，请在更新的预览上重新标注。');
      }
      onComplete(attachment);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mounted.current) setExporting(false);
    }
  };

  const canComplete = !exporting && !drawing && ready && strokes.some((stroke) => stroke.tool === 'pen');

  return createPortal(
      <dialog ref={dialogRef} aria-modal="true" aria-labelledby="sketch-pad-title" aria-describedby="sketch-pad-description"
        onCancel={(event) => { event.preventDefault(); if (!exporting) onClose(); }}
        className="fixed inset-0 m-auto max-h-[min(92dvh,850px)] w-[calc(100%-32px)] max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/45 open:flex open:flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <PenLine className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="sketch-pad-title" className="text-sm font-semibold text-slate-900">绘制草图参考</h2>
            <p id="sketch-pad-description" className="mt-0.5 text-[11px] text-slate-500">画出大致结构，完成后会作为图片附加到当前消息</p>
          </div>
          <button type="button" onClick={onClose} disabled={exporting} aria-label="关闭草图面板" title="关闭"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="草图模式">
              <button type="button" aria-pressed={mode === 'blank'} onClick={() => setMode('blank')} disabled={exporting || drawing}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${mode === 'blank' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                <PenLine className="h-3.5 w-3.5" />空白草图
              </button>
              <button type="button" aria-pressed={mode === 'annotate'} onClick={() => setMode('annotate')} disabled={exporting || drawing}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${mode === 'annotate' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                <ImageIcon className="h-3.5 w-3.5" />标注当前图
              </button>
            </div>

            <div className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="草图工具">
              <button type="button" aria-label="画笔" aria-pressed={tool === 'pen'} onClick={() => setTool('pen')} disabled={exporting || drawing || !ready}
                title="画笔" className={`rounded-md p-1.5 cursor-pointer disabled:opacity-40 ${tool === 'pen' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                <PenLine className="h-4 w-4" />
              </button>
              <button type="button" aria-label="橡皮擦" aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')} disabled={exporting || drawing || !ready}
                title="橡皮擦" className={`rounded-md p-1.5 cursor-pointer disabled:opacity-40 ${tool === 'eraser' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                <Eraser className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setStrokes((current) => current.slice(0, -1))} disabled={exporting || drawing || !strokes.length}
                title="撤销上一笔" aria-label="撤销上一笔" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-35 cursor-pointer">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button type="button" onClick={clearStrokes} disabled={exporting || drawing || !strokes.length}
                title="清空涂鸦" aria-label="清空涂鸦" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-35 cursor-pointer">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-3xl shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-inner" style={{ aspectRatio: `${SKETCH_CANVAS_WIDTH}/${SKETCH_CANVAS_HEIGHT}` }}>
            <canvas ref={backgroundRef} width={SKETCH_CANVAS_WIDTH} height={SKETCH_CANVAS_HEIGHT} className="absolute inset-0 h-full w-full" aria-hidden="true" />
            <canvas ref={inkRef} width={SKETCH_CANVAS_WIDTH} height={SKETCH_CANVAS_HEIGHT}
              className="absolute inset-0 h-full w-full cursor-crosshair"
              style={{ touchAction: 'none' }} aria-label="草图绘制区域"
              onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={finishStroke}
              onPointerCancel={finishStroke} onLostPointerCapture={finishStroke} />
            {mode === 'annotate' && !previewError && (isCompilingTex || Boolean(compiledSvg && !ready)) && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-[12px] text-slate-600">
                <span className="inline-flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin text-blue-600" />正在准备当前图预览…</span>
              </div>
            )}
            {mode === 'annotate' && !isCompilingTex && !compiledSvg && (
              <div className="absolute inset-x-4 top-3 rounded-md border border-amber-200 bg-amber-50/95 px-2.5 py-1.5 text-center text-[11px] text-amber-800">
                {previewError || texCompilerStatus || '当前图没有可用的精确预览，请切换到空白草图。'}
              </div>
            )}
          </div>

          {(error || previewError) && <p role="alert" className="text-[11.5px] text-rose-600">{error || previewError}</p>}
          {mode === 'annotate' && compiledSvg && !previewError && <p className="text-[11px] text-slate-400">红色笔迹会与当前图合成为一张参考图；原图不会被修改。</p>}
          {mode === 'blank' && <p className="text-[11px] text-slate-400">草图只作为当前消息的图片参考，不会写入项目文件。切换模式会清空笔迹。</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} disabled={exporting}
            className="rounded-lg px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer">取消</button>
          <button type="button" onClick={() => void complete()} disabled={!canComplete}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {exporting ? '正在生成…' : '完成并添加'}
          </button>
        </footer>
      </dialog>, document.body,
  );
};
