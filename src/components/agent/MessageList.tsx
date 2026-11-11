import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowDown, Check, ChevronRight, Copy, Loader2, RotateCcw, Settings, Sparkles, X,
} from 'lucide-react';
import { useMcpStore } from '../../store/useMcpStore';
import type { AcpAgentProvider, AgentChatMessage, AgentSession } from '../../types/acp';
import { imageDataUrl } from '../../core/agent/image-attachments';
import { CanvasPatchCard } from './CanvasPatchCard';
import { ProjectPatchCard } from './ProjectPatchCard';
import { Markdown } from './Markdown';
import {
  copyText, describeTool, formatCount, formatDuration, formatElapsed, messageKind, shortAgentName,
  useElapsedSeconds, useFlash,
} from './agent-ui';

export interface Suggestion { title: string; detail: string; prompt: string }

interface Props {
  session: AgentSession | undefined;
  providers: AcpAgentProvider[];
  /** True while a request is filling this conversation. */
  running: boolean;
  streamingMessageId: string | null;
  startedAt: number | null;
  canRetry: boolean;
  suggestions: Suggestion[];
  greeting: { title: string; detail: string };
  onRetry: () => void;
  onOpenSettings: () => void;
  onPickSuggestion: (prompt: string) => void;
}

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = '复制' }) => {
  const [copied, flash] = useFlash();
  return (
    <button type="button" title={label} aria-label={label}
      onClick={() => void copyText(text).then((ok) => { if (ok) flash(); })}
      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

/** The one place that says what the agent is doing right now. */
const LiveStatus: React.FC<{ startedAt: number | null; fallback: string }> = ({ startedAt, fallback }) => {
  const status = useMcpStore((s) => s.sessionStatus);
  const elapsed = useElapsedSeconds(startedAt);
  return (
    <div data-testid="agent-live-activity" role="status" className="flex items-center gap-2 text-[12px] text-slate-600">
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
      <span className="min-w-0 flex-1 truncate" title={status || fallback}>{status || fallback}</span>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-400">{formatElapsed(elapsed)}</span>
    </div>
  );
};

/** Keeps a streaming box pinned to its newest line. */
const TailBox: React.FC<{ text: string; live: boolean }> = ({ text, live }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (live && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text, live]);
  return (
    <div ref={ref} className={`overflow-y-auto whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-slate-500 select-text ${live ? 'max-h-24' : 'max-h-56'}`}>
      {text}
    </div>
  );
};

type ToolCall = NonNullable<AgentChatMessage['mcpToolCalls']>[number];

const ToolRow: React.FC<{ call: ToolCall }> = ({ call }) => {
  const { label, raw } = describeTool(call.toolName);
  return (
    <li className="flex items-center gap-2 text-[11.5px]" title={raw}>
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {call.status === 'completed' ? <Check className="h-3 w-3 text-emerald-600" />
          : call.status === 'failed' ? <X className="h-3 w-3 text-rose-600" />
          : <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
      </span>
      <span className={`min-w-0 flex-1 truncate ${call.status === 'failed' ? 'text-rose-700' : 'text-slate-700'}`}>
        {label}{call.status === 'failed' && ' · 失败'}
      </span>
      {call.durationMs !== undefined && (
        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-slate-400">{formatDuration(call.durationMs)}</span>
      )}
    </li>
  );
};

/** Reasoning and tool calls: expanded while the agent works, folded into one line afterwards. */
const Activity: React.FC<{ message: AgentChatMessage; live: boolean; startedAt: number | null }> = ({ message, live, startedAt }) => {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const tools = message.mcpToolCalls ?? [];
  const thought = message.thoughtProcess ?? '';
  if (!live && !tools.length && !thought) return null;
  const open = userOpen ?? live;
  const failed = tools.filter((call) => call.status === 'failed').length;
  const summary = [
    thought ? `思考 ${formatCount(thought.length)} 字` : '',
    tools.length ? `${tools.length} 次工具调用${failed ? `（${failed} 次失败）` : ''}` : '',
    message.durationMs !== undefined ? `用时 ${formatDuration(message.durationMs)}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${live ? 'border-blue-100 bg-blue-50/40' : 'border-slate-200/80 bg-slate-50/60'}`}>
      {live
        ? <LiveStatus startedAt={startedAt} fallback="正在等待模型响应…" />
        : (
          <button type="button" aria-expanded={open} onClick={() => setUserOpen(!open)}
            className="flex w-full items-center gap-1.5 text-left text-[11.5px] text-slate-500 hover:text-slate-800 cursor-pointer">
            <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
            <span className="min-w-0 flex-1 truncate">{summary || '运行过程'}</span>
          </button>
        )}
      {open && (tools.length > 0 || thought) && (
        <div className="mt-2 space-y-2 border-t border-slate-200/70 pt-2">
          {thought && <TailBox text={thought} live={live} />}
          {tools.length > 0 && <ul className="space-y-1">{tools.map((call, index) => <ToolRow key={call.callId ?? index} call={call} />)}</ul>}
        </div>
      )}
    </div>
  );
};

interface ItemProps {
  message: AgentChatMessage;
  agentName: string;
  live: boolean;
  startedAt: number | null;
  showRetry: boolean;
  onRetry: () => void;
  onOpenSettings: () => void;
}

const MessageItem: React.FC<ItemProps> = React.memo(({ message, agentName, live, startedAt, showRetry, onRetry, onOpenSettings }) => {
  if (message.role === 'user') {
    const chips = [
      ...(message.includeFullCanvas ? ['画布'] : []),
      ...(message.contextSelectionIds?.length ? [`选中 ${message.contextSelectionIds.slice(0, 3).join('、')}${message.contextSelectionIds.length > 3 ? ' 等' : ''}`] : []),
      ...(message.contextPaperPath ? [message.contextPaperPath] : []),
    ];
    return (
      <div className="group flex flex-col items-end gap-1">
        {!!message.images?.length && (
          <div className="flex max-w-[92%] flex-wrap justify-end gap-1.5">
            {message.images.map((image) => (
              <img key={image.id} src={imageDataUrl(image)} alt={image.name} title={image.name}
                className="max-h-40 max-w-[10rem] rounded-lg border border-slate-200 bg-white object-contain" />
            ))}
          </div>
        )}
        <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-slate-100 px-3 py-2 text-[13px] leading-relaxed text-slate-900">
          {message.content}
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
          {chips.map((chip) => <span key={chip} className="max-w-[12rem] truncate rounded bg-slate-50 px-1.5 py-px" title={`本轮附带：${chip}`}>{chip}</span>)}
          <span>{message.timestamp}</span>
          <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <CopyButton text={message.content} label="复制这条消息" />
          </span>
        </div>
      </div>
    );
  }

  if (message.role === 'system') {
    const kind = messageKind(message);
    if (kind === 'cancelled' || kind === 'notice') {
      return (
        <div className="flex items-center justify-center gap-2 py-0.5 text-[11.5px] text-slate-400">
          <span className="whitespace-pre-wrap text-center">{message.content}</span>
          {kind === 'cancelled' && showRetry && (
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-blue-600 hover:underline cursor-pointer">
              <RotateCcw className="h-3 w-3" />重试
            </button>
          )}
        </div>
      );
    }
    const error = kind === 'error';
    return (
      <div role={error ? 'alert' : 'status'}
        className={`rounded-xl border px-3 py-2.5 ${error ? 'border-rose-200 bg-rose-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
        <div className="flex items-start gap-2">
          <AlertCircle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${error ? 'text-rose-600' : 'text-amber-600'}`} />
          <div className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed select-text ${error ? 'text-rose-900' : 'text-amber-900'}`}>
            {message.content.replace(/^(?:Pi|ACP)\s*错误：/, '')}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[22px]">
          {error && showRetry && (
            <button type="button" onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-[11.5px] font-medium text-rose-800 hover:bg-rose-50 cursor-pointer">
              <RotateCcw className="h-3 w-3" />重试
            </button>
          )}
          <button type="button" onClick={onOpenSettings}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-slate-600 hover:bg-white/80 cursor-pointer">
            <Settings className="h-3 w-3" />检查 Agent 设置
          </button>
          <span className="ml-auto"><CopyButton text={message.content} label="复制错误信息" /></span>
        </div>
      </div>
    );
  }

  return (
    <article className="group space-y-2" aria-label={`${agentName} 的回复`}>
      <header className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className="font-medium text-slate-600">{agentName}</span>
        <span>{message.timestamp}</span>
      </header>
      <Activity message={message} live={live} startedAt={startedAt} />
      {message.content && <Markdown source={message.content} className="text-[13px] leading-relaxed text-slate-800 select-text" />}
      {message.projectPatchProposal && <ProjectPatchCard messageId={message.id} proposal={message.projectPatchProposal} />}
      {message.patchProposal && <CanvasPatchCard messageId={message.id} patch={message.patchProposal} />}
      {!live && message.content && (
        <footer className={`flex items-center gap-0.5 transition-opacity ${showRetry ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
          <CopyButton text={message.content} label="复制回复" />
          {showRetry && (
            <button type="button" onClick={onRetry} title="重新生成这一轮回复" aria-label="重新生成"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </footer>
      )}
    </article>
  );
});
MessageItem.displayName = 'MessageItem';

const EmptyState: React.FC<Pick<Props, 'suggestions' | 'greeting' | 'onPickSuggestion'>> = ({ suggestions, greeting, onPickSuggestion }) => (
  <div className="flex min-h-full flex-col justify-center px-1 py-6">
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
      <Sparkles className="h-4.5 w-4.5" />
    </div>
    <h2 className="mt-3 text-[15px] font-semibold text-slate-900">{greeting.title}</h2>
    <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">{greeting.detail}</p>
    <div className="mt-4 space-y-1.5">
      {suggestions.map((suggestion) => (
        <button key={suggestion.title} type="button" onClick={() => onPickSuggestion(suggestion.prompt)}
          className="group/item flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer">
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-slate-800">{suggestion.title}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">{suggestion.detail}</span>
          </span>
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover/item:text-blue-500" />
        </button>
      ))}
    </div>
    <p className="mt-4 text-[11.5px] leading-relaxed text-slate-400">所有修改都会先生成提案，由你审核后才会写入画布或论文。</p>
  </div>
);

const STICK_THRESHOLD = 72;

export const MessageList: React.FC<Props> = ({
  session, providers, running, streamingMessageId, startedAt, canRetry, suggestions, greeting,
  onRetry, onOpenSettings, onPickSuggestion,
}) => {
  const scroller = useRef<HTMLDivElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const [away, setAway] = useState(false);
  const messages = session?.messages ?? [];
  const sessionId = session?.id;

  const toBottom = () => {
    const element = scroller.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    stick.current = true;
    setAway(false);
  };

  // A different conversation always opens at its latest message.
  useLayoutEffect(() => { toBottom(); }, [sessionId]);

  // Follow new content only while the reader is already at the bottom, so
  // scrolling up to re-read is never yanked back by the next streamed chunk.
  useEffect(() => {
    const element = content.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Sending a message is an explicit request to see the answer, and a result
  // that arrives with no run in progress (a local skill) is one the user just asked for.
  const lastUserId = [...messages].reverse().find((message) => message.role === 'user')?.id;
  useLayoutEffect(() => { if (lastUserId) toBottom(); }, [lastUserId]);
  const previousCount = useRef(messages.length);
  useLayoutEffect(() => {
    if (messages.length > previousCount.current && !running) toBottom();
    previousCount.current = messages.length;
  }, [messages.length, running]);

  const lastIndex = messages.length - 1;
  const lastAssistantIndex = messages.map((message) => message.role).lastIndexOf('assistant');
  const placeholderVisible = !!streamingMessageId && messages.some((message) => message.id === streamingMessageId);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} role="log" aria-label="对话内容" aria-live="polite"
        onScroll={(event) => {
          const element = event.currentTarget;
          const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD;
          stick.current = atBottom;
          setAway(!atBottom);
        }}
        className="h-full overflow-y-auto px-3.5">
        <div ref={content} className={messages.length || running ? 'space-y-4 py-4' : 'h-full'}>
          {messages.length === 0 && !running && (
            <EmptyState suggestions={suggestions} greeting={greeting} onPickSuggestion={onPickSuggestion} />
          )}
          {messages.map((message, index) => {
            const live = running && message.id === streamingMessageId;
            const retryHere = canRetry && !running && (
              message.role === 'assistant' ? index === lastAssistantIndex && index === lastIndex
                : message.role === 'system' && index === lastIndex);
            return (
              <MessageItem key={message.id} message={message} live={live} startedAt={live ? startedAt : null}
                agentName={shortAgentName(providers.find((provider) => provider.id === message.agentId) ?? { id: message.agentId, name: 'Agent' })}
                showRetry={retryHere} onRetry={onRetry} onOpenSettings={onOpenSettings} />
            );
          })}
          {running && !placeholderVisible && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/40 px-2.5 py-2">
              <LiveStatus startedAt={startedAt} fallback="正在连接 Agent…" />
            </div>
          )}
        </div>
      </div>
      {away && (
        <button type="button" onClick={toBottom}
          className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] text-slate-700 shadow-md hover:bg-slate-50 cursor-pointer">
          <ArrowDown className="h-3 w-3" />{running ? '查看最新进展' : '回到底部'}
        </button>
      )}
    </div>
  );
};
