import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Minus, Plus } from 'lucide-react';
import { pdfClickPoint, pdfHighlightBox, type PageGeometry, type PdfLocation, type PdfPoint } from '../../core/paper/synctex';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface PaperPdfPreviewHandle {
  navigate: (location: PdfLocation) => void;
  currentPoint: () => PdfPoint | null;
}

interface Props {
  projectDir: string;
  pdfPath: string;
  onReadyChange: (ready: boolean) => void;
  onReverseSync: (point: PdfPoint) => void;
}

const PdfPage: React.FC<{
  document: PDFDocumentProxy; number: number; width: number;
  target: (PdfLocation & { token: number }) | null;
  onGeometry: (page: number, geometry: PageGeometry) => void;
}> = ({ document, number, width, target, onGeometry }) => {
  const element = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const highlight = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const activeTarget = target?.page === number ? target : null;
  const geometry = page ? {
    width: page.view[2] - page.view[0], height: page.view[3] - page.view[1], rotation: page.rotate,
  } : null;
  const viewport = page?.getViewport({ scale: 1 });
  const height = viewport ? width * viewport.height / viewport.width : width * 1.414;
  const rectangle = activeTarget && geometry ? pdfHighlightBox(activeTarget, geometry) : null;

  useEffect(() => {
    let cancelled = false;
    void document.getPage(number).then((loaded) => {
      if (cancelled) return;
      setPage(loaded);
      onGeometry(number, { width: loaded.view[2] - loaded.view[0], height: loaded.view[3] - loaded.view[1], rotation: loaded.rotate });
    }).catch((error) => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; };
  }, [document, number, onGeometry]);

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '500px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = canvas.current;
    if (!visible || !page || !node || width <= 0) return;
    const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    node.width = Math.ceil(viewport.width * ratio);
    node.height = Math.ceil(viewport.height * ratio);
    const task = page.render({ canvas: node, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
    void task.promise.catch((error) => { if (error?.name !== 'RenderingCancelledException') setError(String(error)); });
    return () => task.cancel();
  }, [visible, page, width]);

  useEffect(() => {
    if (!activeTarget || !page) return;
    const frame = requestAnimationFrame(() => highlight.current?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }));
    return () => cancelAnimationFrame(frame);
  }, [activeTarget?.token, page]);

  return (
    <div ref={element} className="paper-pdf-page" data-pdf-page={number}
      style={{ width, height }} role="group" aria-label={`PDF 第 ${number} 页`}>
      <canvas key={width} ref={canvas} aria-label={`论文 PDF，第 ${number} 页`} role="img" />
      {!visible && <span className="paper-pdf-page-placeholder">{number}</span>}
      {error && <span className="paper-pdf-page-error" role="alert">PDF 页渲染失败：{error}</span>}
      {rectangle && <div key={activeTarget?.token} ref={highlight} className="paper-pdf-highlight" aria-label="源码对应的 PDF 位置"
        style={{ left: `${rectangle.left}%`, top: `${rectangle.top}%`, width: `${rectangle.width}%`, height: `${rectangle.height}%` }} />}
    </div>
  );
};

export const PaperPdfPreview = forwardRef<PaperPdfPreviewHandle, Props>(({ projectDir, pdfPath, onReadyChange, onReverseSync }, ref) => {
  const scroll = useRef<HTMLDivElement | null>(null);
  const geometries = useRef(new Map<number, PageGeometry>());
  const lastPoint = useRef<PdfPoint | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [availableWidth, setAvailableWidth] = useState(400);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [target, setTarget] = useState<(PdfLocation & { token: number }) | null>(null);
  const onGeometry = useCallback((number: number, geometry: PageGeometry) => geometries.current.set(number, geometry), []);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setError(''); setDocument(null); setTarget(null); lastPoint.current = null; geometries.current.clear();
    onReadyChange(false);
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const bytes = await invoke<ArrayBuffer>('tex_read_paper_pdf', { projectDir, pdfPath });
        if (cancelled) return;
        const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
        destroy = () => { void task.destroy(); };
        const pdf = await task.promise;
        if (cancelled) return;
        setDocument(pdf); onReadyChange(true);
      } catch (error) {
        if (!cancelled) { setError(`PDF 加载失败：${String(error)}`); onReadyChange(false); }
      }
    })();
    return () => { cancelled = true; destroy?.(); };
  }, [projectDir, pdfPath, onReadyChange]);

  useEffect(() => {
    if (!scroll.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(Math.max(120, entry.contentRect.width - 36)));
    observer.observe(scroll.current);
    return () => observer.disconnect();
  }, []);

  const viewportPoint = useCallback((): PdfPoint | null => {
    const host = scroll.current;
    if (!host) return null;
    const viewport = host.getBoundingClientRect();
    const pages = [...host.querySelectorAll<HTMLElement>('[data-pdf-page]')];
    const visible = pages.map((element) => {
      const box = element.getBoundingClientRect();
      return { element, box, area: Math.max(0, Math.min(box.bottom, viewport.bottom) - Math.max(box.top, viewport.top)) };
    }).sort((a, b) => b.area - a.area);
    const selected = lastPoint.current;
    if (selected && visible.some(({ element, area }) => area > 0 && Number(element.dataset.pdfPage) === selected.page)) return selected;
    const best = visible[0];
    if (!best || best.area <= 0) return null;
    const page = Number(best.element.dataset.pdfPage);
    const geometry = geometries.current.get(page);
    return geometry ? pdfClickPoint(page, {
      x: (Math.max(best.box.left, viewport.left) + Math.min(best.box.right, viewport.right)) / 2,
      y: (Math.max(best.box.top, viewport.top) + Math.min(best.box.bottom, viewport.bottom)) / 2,
    }, best.box, geometry) : null;
  }, []);

  useImperativeHandle(ref, () => ({
    navigate: (location) => {
      if (!document || location.page > document.numPages) throw new Error('SyncTeX 返回的页码超出当前 PDF');
      setTarget({ ...location, token: performance.now() });
      lastPoint.current = location;
    },
    currentPoint: viewportPoint,
  }), [document, viewportPoint]);

  return (
    <div className="paper-pdf-viewer">
      <div className="paper-pdf-tools"><span>{document ? `${currentPage} / ${document.numPages} 页` : '正在加载 PDF'}</span>
        <span className="paper-command-spacer" />
        <button type="button" title="缩小 PDF" onClick={() => setZoom((value) => Math.max(.5, value - .15))}><Minus size={12} /></button>
        <button type="button" title="适应宽度" onClick={() => setZoom(1)}>{zoom === 1 ? '适应宽度' : `${Math.round(zoom * 100)}%`}</button>
        <button type="button" title="放大 PDF" onClick={() => setZoom((value) => Math.min(3, value + .15))}><Plus size={12} /></button>
      </div>
      <div ref={scroll} className="paper-pdf-scroll" onScroll={() => { const point = viewportPoint(); if (point) setCurrentPage(point.page); }}
        onClick={(event) => {
          if (!(event.target instanceof Element)) return;
          const element = event.target.closest<HTMLElement>('[data-pdf-page]');
          if (!element) return;
          const number = Number(element.dataset.pdfPage);
          const geometry = geometries.current.get(number);
          if (!geometry) return;
          const point = pdfClickPoint(number, { x: event.clientX, y: event.clientY }, element.getBoundingClientRect(), geometry);
          if (!point) return;
          lastPoint.current = point; setCurrentPage(number);
          if (event.ctrlKey || event.metaKey) { event.preventDefault(); onReverseSync(point); }
        }}>
        {error && <div className="paper-pdf-load-error" role="alert">{error}</div>}
        {document && Array.from({ length: document.numPages }, (_, index) => (
          <PdfPage key={index} document={document} number={index + 1} width={Math.min(1000, availableWidth) * zoom} target={target} onGeometry={onGeometry} />
        ))}
      </div>
    </div>
  );
});

PaperPdfPreview.displayName = 'PaperPdfPreview';
