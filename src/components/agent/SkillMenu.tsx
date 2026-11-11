import React from 'react';
import { ChevronRight, Wand2, Zap } from 'lucide-react';
import { useDismiss } from './agent-ui';

export interface SkillItem {
  id: string;
  label: string;
  detail: string;
  /** Local skills run instantly without a model; templates only fill the input. */
  kind: 'local' | 'template';
  run: () => void;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SkillItem[];
  disabled: boolean;
}

/** Opened from the composer button or by typing "/" on an empty input. */
export const SkillMenu: React.FC<Props> = ({ open, onOpenChange, items, disabled }) => {
  const ref = useDismiss<HTMLDivElement>(open, () => onOpenChange(false));
  const local = items.filter((item) => item.kind === 'local');
  const templates = items.filter((item) => item.kind === 'template');
  const section = (title: string, hint: string, list: SkillItem[]) => list.length > 0 && (
    <div className="py-1">
      <div className="flex items-baseline justify-between px-3 pb-1 pt-1.5">
        <span className="text-[11px] font-medium text-slate-400">{title}</span>
        <span className="text-[10.5px] text-slate-400">{hint}</span>
      </div>
      <ul className="px-1.5">
        {list.map((item) => {
          const blocked = disabled && item.kind === 'local';
          return (
            <li key={item.id}>
              <button type="button" role="menuitem" disabled={blocked}
                onClick={() => { item.run(); onOpenChange(false); }}
                className="group/item flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
                <span className="mt-0.5 shrink-0 text-slate-400 group-hover/item:text-blue-600">
                  {item.kind === 'local' ? <Zap className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-slate-800">{item.label}</span>
                  <span className="block text-[11px] leading-snug text-slate-500">{item.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => onOpenChange(!open)}
        title="技能与提示词模板（在空输入框中按 / 打开）"
        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] transition-colors cursor-pointer ${
          open ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
        <Wand2 className="h-3.5 w-3.5" />技能
      </button>
      {open && (
        <div role="menu" aria-label="技能"
          className="absolute bottom-full left-0 z-40 mb-2 max-h-[min(60vh,26rem)] w-[19.5rem] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {section('快捷操作', '本地即时执行，不调用模型', local)}
          {section('提示词模板', '填入输入框，可修改后发送', templates)}
        </div>
      )}
    </div>
  );
};
