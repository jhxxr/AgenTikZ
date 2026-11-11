import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { AgentSession } from '../../types/acp';
import { formatRelative, useDismiss } from './agent-ui';

interface Props {
  sessions: AgentSession[];
  activeSession: AgentSession | undefined;
  currentProjectId: string;
  streamingSessionId: string | null;
  onSwitch: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

const turnCount = (session: AgentSession) => session.messages.filter((message) => message.role === 'user').length;

/** The conversation title doubles as the switcher: history, rename and delete live behind it. */
export const SessionMenu: React.FC<Props> = ({
  sessions, activeSession, currentProjectId, streamingSessionId, onSwitch, onRename, onDelete, onNew,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const close = () => { setOpen(false); setQuery(''); setEditing(null); setConfirming(null); };
  const ref = useDismiss<HTMLDivElement>(open, close);

  useEffect(() => { if (open) searchInput.current?.focus(); }, [open]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sessions
      .map((session, index) => ({ session, index }))
      .filter(({ session }) => !needle || session.title.toLowerCase().includes(needle) ||
        session.messages.some((message) => message.role !== 'system' && message.content.toLowerCase().includes(needle)))
      // Most recently used first; the array order breaks ties for conversations without a timestamp.
      .sort((a, b) => (b.session.updatedAt ?? 0) - (a.session.updatedAt ?? 0) || a.index - b.index)
      .map(({ session }) => session);
  }, [sessions, query]);

  const commitRename = () => {
    if (editing?.title.trim()) onRename(editing.id, editing.title);
    setEditing(null);
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}
        title="切换或管理对话"
        className={`flex max-w-full items-center gap-1 rounded-lg px-2 py-1 text-left cursor-pointer ${open ? 'bg-slate-100' : 'hover:bg-slate-100'}`}>
        <span className="min-w-0 truncate text-[13px] font-semibold text-slate-900">{activeSession?.title ?? '对话'}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div role="dialog" aria-label="对话历史"
          className="absolute left-0 top-full z-40 mt-1.5 flex max-h-[min(70vh,28rem)] w-[19.5rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索对话" placeholder="搜索对话标题或内容"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none" />
            <button type="button" onClick={() => { onNew(); close(); }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-[11.5px] font-medium text-white hover:bg-slate-700 cursor-pointer">
              <Plus className="h-3 w-3" />新对话
            </button>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {visible.length === 0 && <li className="px-2 py-6 text-center text-[12px] text-slate-400">没有匹配的对话</li>}
            {visible.map((session) => {
              const active = session.id === activeSession?.id;
              const running = session.id === streamingSessionId;
              const turns = turnCount(session);
              const foreign = !!session.projectId && session.projectId !== currentProjectId;
              if (editing?.id === session.id) {
                return (
                  <li key={session.id} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1.5">
                    <input autoFocus value={editing.title} aria-label="对话名称" maxLength={60}
                      onChange={(event) => setEditing({ id: session.id, title: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); commitRename(); }
                        else if (event.key === 'Escape') { event.stopPropagation(); setEditing(null); }
                      }}
                      className="min-w-0 flex-1 rounded-md border border-blue-300 bg-white px-1.5 py-1 text-[12.5px] focus:outline-none" />
                    <button type="button" aria-label="保存名称" onClick={commitRename}
                      className="rounded-md p-1 text-emerald-600 hover:bg-white cursor-pointer"><Check className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="取消重命名" onClick={() => setEditing(null)}
                      className="rounded-md p-1 text-slate-500 hover:bg-white cursor-pointer"><X className="h-3.5 w-3.5" /></button>
                  </li>
                );
              }
              return (
                <li key={session.id} className={`group/row flex items-center gap-1 rounded-lg ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <button type="button" aria-current={active ? 'true' : undefined}
                    onClick={() => { onSwitch(session.id); close(); }}
                    className="min-w-0 flex-1 px-2 py-1.5 text-left cursor-pointer">
                    <span className={`flex items-center gap-1.5 text-[12.5px] ${active ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
                      {running && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-600" />}
                      <span className="truncate">{session.title}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                      {running ? '正在运行' : turns ? `${turns} 轮对话` : '尚未开始'}
                      {session.updatedAt && turns > 0 ? ` · ${formatRelative(session.updatedAt)}` : ''}
                      {foreign ? ' · 其他项目' : ''}
                    </span>
                  </button>
                  {confirming === session.id ? (
                    <span className="flex shrink-0 items-center gap-0.5 pr-1.5">
                      <button type="button" onClick={() => { onDelete(session.id); setConfirming(null); }}
                        className="rounded-md bg-rose-600 px-1.5 py-1 text-[11px] font-medium text-white hover:bg-rose-700 cursor-pointer">删除</button>
                      <button type="button" onClick={() => setConfirming(null)}
                        className="rounded-md px-1.5 py-1 text-[11px] text-slate-600 hover:bg-white cursor-pointer">取消</button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center pr-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                      <button type="button" aria-label={`重命名 ${session.title}`} title="重命名"
                        onClick={() => { setConfirming(null); setEditing({ id: session.id, title: session.title }); }}
                        className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700 cursor-pointer"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label={`删除 ${session.title}`} disabled={running}
                        title={running ? '请先停止这个对话中正在运行的请求' : '删除对话'}
                        onClick={() => setConfirming(session.id)}
                        className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">对话仅保存在本次运行中，关闭应用后不会保留。</p>
        </div>
      )}
    </div>
  );
};
