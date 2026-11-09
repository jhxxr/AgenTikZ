import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Send, Square, X } from 'lucide-react';
import type { AgentImageAttachment } from '../../types/acp';
import { clipboardImages, imageDataUrl, MAX_AGENT_IMAGES, prepareAgentImage } from '../../core/agent/image-attachments';

interface Props {
  text: string;
  onTextChange: (text: string) => void;
  onSend: (text: string, images: AgentImageAttachment[]) => Promise<void>;
  onCancel: () => Promise<void>;
  isStreaming: boolean;
  canCancel: boolean;
  paperMode: boolean;
}

export function AgentComposer({ text, onTextChange, onSend, onCancel, isStreaming, canCancel, paperMode }: Props) {
  const [images, setImages] = useState<AgentImageAttachment[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const addFiles = async (files: File[]) => {
    if (!files.length || busy.current) return;
    setError('');
    if (images.length + files.length > MAX_AGENT_IMAGES) {
      setError(`每条消息最多 ${MAX_AGENT_IMAGES} 张图片，请先移除多余图片。`); return;
    }
    busy.current = true;
    setPreparing(true);
    try {
      const prepared = await Promise.all(files.map(prepareAgentImage));
      if (mounted.current) setImages((previous) => [...previous, ...prepared]);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy.current = false;
      if (mounted.current) setPreparing(false);
    }
  };
  const send = async () => {
    if (isStreaming || sending.current || busy.current || (!text.trim() && !images.length)) return;
    sending.current = true;
    const attached = images;
    onTextChange('');
    setImages([]);
    setError('');
    try { await onSend(text, attached); }
    catch (err) {
      if (mounted.current) { setError(String(err)); setImages(attached); onTextChange(text); }
    } finally { sending.current = false; }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100/60 shadow-sm transition-all">
      {images.length > 0 && <div className="flex flex-wrap gap-2 px-3 pt-2" aria-label="待发送图片">
        {images.map((image) => <div key={image.id} className="relative">
          <img src={imageDataUrl(image)} alt={image.name} title={image.name}
            className="w-16 h-16 object-contain rounded-lg border border-slate-200 bg-slate-50" />
          <button type="button" aria-label={`移除图片 ${image.name}`} disabled={preparing}
            onClick={() => setImages((previous) => previous.filter((item) => item.id !== image.id))}
            className="absolute -right-1 -top-1 rounded-full bg-slate-700 text-white p-0.5 disabled:opacity-40">
            <X className="w-3 h-3" />
          </button>
        </div>)}
      </div>}
      <textarea rows={2} value={text} onChange={(event) => onTextChange(event.target.value)}
        aria-label="Agent 消息"
        onPaste={(event) => {
          const files = clipboardImages(event.clipboardData);
          if (!files.length) return;
          // Mixed text + image clipboard content keeps the text's native insertion behavior.
          if (!event.clipboardData.getData('text/plain')) event.preventDefault();
          void addFiles(files);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault(); void send();
          }
        }}
        placeholder={paperMode ? '描述论文任务，或粘贴参考图片…' : '描述绘图需求，支持 Ctrl+V 粘贴截图或参考图片…'}
        className="w-full px-3 pt-2 pb-1 text-xs text-slate-800 bg-transparent resize-none focus:outline-none" />
      {error && <p role="alert" className="px-3 pb-1 text-[10px] text-rose-600">{error}</p>}
      {preparing && <p role="status" className="px-3 pb-1 text-[10px] text-blue-600">正在处理图片…</p>}
      <div className="px-2.5 pb-2 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden"
            aria-label="选择参考图片" onChange={(event) => {
              const files = Array.from(event.target.files || []); event.target.value = ''; void addFiles(files);
            }} />
          <button type="button" aria-label="添加图片" title="粘贴或选择图片；最多 4 张，每张原图 ≤10 MB，自动压缩"
            disabled={preparing || images.length >= MAX_AGENT_IMAGES} onClick={() => fileInput.current?.click()}
            className="p-1 text-slate-500 hover:text-blue-600 disabled:opacity-40">
            <ImagePlus className="h-4 w-4" />
          </button>
          <span className="text-[10px] text-slate-400 truncate" title="图片会发送给所选 Agent；每轮携带最近 4 张参考图">
            Ctrl+V 图片 · 最多 4 张
          </span>
        </div>
        <button type="button" onClick={isStreaming ? () => void onCancel() : () => void send()}
          disabled={isStreaming ? !canCancel : preparing || (!text.trim() && !images.length)}
          className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 text-white text-[11px] font-medium flex items-center gap-1">
          <span>{isStreaming ? '停止' : '发送'}</span>
          {isStreaming ? <Square className="w-3 h-3" /> : <Send className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}
