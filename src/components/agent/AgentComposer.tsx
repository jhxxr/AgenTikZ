import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, ImagePlus, Loader2, Square, X } from 'lucide-react';
import type { AgentImageAttachment } from '../../types/acp';
import { clipboardImages, imageDataUrl, MAX_AGENT_IMAGES, prepareAgentImage } from '../../core/agent/image-attachments';

export interface ComposerDraft { text: string; images: AgentImageAttachment[] }
export const EMPTY_DRAFT: ComposerDraft = { text: '', images: [] };

interface Props {
  draft: ComposerDraft;
  onDraftChange: (draft: ComposerDraft) => void;
  onSend: (text: string, images: AgentImageAttachment[]) => Promise<void>;
  onStop: () => void;
  /** A request is running in this conversation. */
  running: boolean;
  canStop: boolean;
  /** Why sending is unavailable right now, when it is not this conversation's own run. */
  blockedReason?: string;
  placeholder: string;
  /** The latest prompt of this conversation, recalled with ↑ on an empty input. */
  lastPrompt?: string;
  onSlash: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Context chips shown above the input. */
  context?: React.ReactNode;
  /** Controls on the left of the action row (skills, agent picker). */
  actions?: React.ReactNode;
}

const MAX_HEIGHT = 220;

export function AgentComposer({
  draft, onDraftChange, onSend, onStop, running, canStop, blockedReason, placeholder, lastPrompt,
  onSlash, textareaRef, context, actions,
}: Props) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const sending = useRef(false);
  const mounted = useRef(true);
  // The latest draft, for async handlers that resolve after further typing.
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`;
    element.style.overflowY = element.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [draft.text, textareaRef]);

  const addFiles = async (files: File[]) => {
    if (!files.length || busy.current) return;
    setError('');
    if (latest.current.images.length + files.length > MAX_AGENT_IMAGES) {
      setError(`每条消息最多 ${MAX_AGENT_IMAGES} 张图片，请先移除多余图片。`);
      return;
    }
    busy.current = true;
    setPreparing(true);
    try {
      const prepared = await Promise.all(files.map(prepareAgentImage));
      if (mounted.current) onDraftChange({ ...latest.current, images: [...latest.current.images, ...prepared] });
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy.current = false;
      if (mounted.current) setPreparing(false);
    }
  };

  const empty = !draft.text.trim() && !draft.images.length;
  const canSend = !running && !blockedReason && !preparing && !empty;

  const send = async () => {
    if (!canSend || sending.current || busy.current) return;
    sending.current = true;
    const sent = draft;
    onDraftChange(EMPTY_DRAFT);
    setError('');
    try {
      await onSend(sent.text, sent.images);
    } catch (err) {
      // Nothing was sent: give the message back instead of losing it.
      if (mounted.current) {
        setError(err instanceof Error ? err.message : String(err));
        onDraftChange(sent);
      }
    } finally {
      sending.current = false;
    }
  };

  return (
    <div
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={(event) => {
        setDragging(false);
        const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
        if (!files.length) return;
        event.preventDefault();
        void addFiles(files);
      }}
      className={`rounded-2xl border bg-white shadow-xs transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${
        dragging ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
      {context && <div className="flex flex-wrap items-center gap-1 px-2.5 pt-2">{context}</div>}

      {draft.images.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2.5" aria-label="待发送图片">
          {draft.images.map((image) => (
            <div key={image.id} className="relative">
              <img src={imageDataUrl(image)} alt={image.name} title={image.name}
                className="h-14 w-14 rounded-lg border border-slate-200 bg-slate-50 object-cover" />
              <button type="button" aria-label={`移除图片 ${image.name}`} disabled={preparing}
                onClick={() => onDraftChange({ ...draft, images: draft.images.filter((item) => item.id !== image.id) })}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-800 p-0.5 text-white hover:bg-slate-600 disabled:opacity-40 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea ref={textareaRef} rows={1} value={draft.text} aria-label="Agent 消息" placeholder={placeholder}
        onChange={(event) => {
          // "/" on an empty input opens the skill menu instead of typing a slash.
          if (event.target.value === '/' && !draft.text) { onSlash(); return; }
          onDraftChange({ ...draft, text: event.target.value });
        }}
        onPaste={(event) => {
          const files = clipboardImages(event.clipboardData);
          if (!files.length) return;
          // Mixed text + image clipboard content keeps the text's native insertion behavior.
          if (!event.clipboardData.getData('text/plain')) event.preventDefault();
          void addFiles(files);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void send();
          } else if (event.key === 'ArrowUp' && !draft.text && lastPrompt) {
            event.preventDefault();
            onDraftChange({ ...draft, text: lastPrompt });
          }
        }}
        className="block w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-[13px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none" />

      {error && <p role="alert" className="px-3 pb-1 text-[11.5px] text-rose-600">{error}</p>}
      {preparing && (
        <p role="status" className="flex items-center gap-1.5 px-3 pb-1 text-[11.5px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />正在处理图片…
        </p>
      )}

      <div className="flex items-center gap-1 px-2 pb-2 pt-0.5">
        <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden"
          aria-label="选择参考图片" onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            void addFiles(files);
          }} />
        <button type="button" aria-label="添加图片"
          title={`添加参考图片（也可直接粘贴或拖入）· 最多 ${MAX_AGENT_IMAGES} 张，单张 ≤10 MB`}
          disabled={preparing || draft.images.length >= MAX_AGENT_IMAGES} onClick={() => fileInput.current?.click()}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
          <ImagePlus className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1">{actions}</div>
        {running ? (
          <button type="button" onClick={onStop} disabled={!canStop} aria-label="停止"
            title={canStop ? '停止本轮请求' : '正在建立连接，稍后可停止'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 cursor-pointer disabled:cursor-not-allowed">
            <Square className="h-3 w-3 fill-current" />
          </button>
        ) : (
          <button type="button" onClick={() => void send()} disabled={!canSend} aria-label="发送"
            title={blockedReason ?? (empty ? '输入内容后发送' : '发送 (Enter)')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed">
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
