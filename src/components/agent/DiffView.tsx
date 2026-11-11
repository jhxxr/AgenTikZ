import React from 'react';
import type { TikzDiffLine } from '../../types/acp';

export function diffStats(lines: TikzDiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === 'add') added++;
    else if (line.type === 'remove') removed++;
  }
  return { added, removed };
}

export const DiffStats: React.FC<{ lines: TikzDiffLine[] }> = ({ lines }) => {
  const { added, removed } = diffStats(lines);
  if (!added && !removed) return null;
  return (
    <span className="font-mono text-[10.5px] tabular-nums">
      <span className="text-emerald-700">+{added}</span>
      <span className="ml-1 text-rose-700">−{removed}</span>
    </span>
  );
};

/** Unified diff that scrolls horizontally instead of cutting long TikZ lines. */
export const DiffView: React.FC<{ lines: TikzDiffLine[]; label: string; className?: string }> = ({ lines, label, className }) => (
  <div role="group" aria-label={label}
    className={`overflow-auto rounded-md border border-slate-200 bg-white font-mono text-[11px] leading-[1.55] select-text ${className ?? 'max-h-64'}`}>
    <div className="min-w-max py-1">
      {lines.map((line, index) => {
        const hunk = line.type === 'header' || line.text === '@@ ... @@';
        const tone = hunk ? 'bg-slate-50 text-slate-400'
          : line.type === 'add' ? 'bg-emerald-50 text-emerald-900'
          : line.type === 'remove' ? 'bg-rose-50 text-rose-900'
          : 'text-slate-600';
        return (
          <div key={index} className={`flex whitespace-pre pr-3 ${tone}`}>
            <span aria-hidden="true" className="w-6 shrink-0 select-none text-center opacity-70">
              {hunk ? '' : line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ''}
            </span>
            <span>{hunk ? '⋯' : line.text || ' '}</span>
          </div>
        );
      })}
    </div>
  </div>
);
