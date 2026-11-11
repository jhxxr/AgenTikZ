import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Eraser, RefreshCw, RotateCcw } from 'lucide-react';
import { TEX_ENGINES, useSettingsStore } from '../../store/useSettingsStore';

export type CompileMenuAction = 'force' | 'clean' | 'clean_only';

const ACTIONS: Array<{ id: CompileMenuAction; label: string; hint: string; icon: typeof RefreshCw }> = [
  { id: 'force', label: '强制重新编译', hint: '忽略「源码未变化」检查，完整重跑', icon: RefreshCw },
  { id: 'clean', label: '清理后重新编译', hint: '先删除中间产物，再从头编译', icon: RotateCcw },
  { id: 'clean_only', label: '清理中间产物', hint: '删除 .aux / .log 等，保留源码与 PDF', icon: Eraser },
];

/** The arrow half of a compile split button: engine choice plus rebuild and clean actions. */
export function CompileMenu({ disabled, onAction, buttonClassName }: {
  disabled?: boolean;
  onAction: (action: CompileMenuAction) => void;
  buttonClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const texEngine = useSettingsStore((s) => s.texEngine);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="relative flex" ref={rootRef}>
      <button type="button" className={buttonClassName} aria-haspopup="menu" aria-expanded={open}
        aria-label="编译选项" title="选择 TeX 引擎与编译方式" onClick={() => setOpen(!open)}>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
          <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold tracking-wide text-slate-400">TeX 引擎</div>
          {TEX_ENGINES.map((engine) => (
            <button key={engine.id} type="button" role="menuitemradio" aria-checked={texEngine === engine.id}
              disabled={!engine.builtin}
              title={engine.builtin ? undefined : `${engine.label} 需要 TeX Live 的专用二进制，当前版本未内置`}
              onClick={() => { updateSettings({ texEngine: engine.id }); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent cursor-pointer">
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {texEngine === engine.id && <Check size={13} className="text-blue-600" />}
              </span>
              <span className="font-medium">{engine.label}</span>
              <span className="ml-auto truncate text-[10px] text-slate-400">{engine.note}</span>
            </button>
          ))}
          <div className="my-1.5 border-t border-slate-100" />
          {ACTIONS.map(({ id, label, hint, icon: Icon }) => (
            <button key={id} type="button" role="menuitem" disabled={disabled}
              onClick={() => { setOpen(false); onAction(id); }}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent cursor-pointer">
              <Icon size={13} className="mt-0.5 shrink-0 text-slate-500" />
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-slate-800">{label}</span>
                <span className="block text-[10px] leading-snug text-slate-400">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
