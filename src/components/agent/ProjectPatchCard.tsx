import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Check, FileText, Play, RotateCcw, X } from 'lucide-react';
import { useAgentStore, projectProposalConflict } from '../../store/useAgentStore';
import { useProjectStore } from '../../store/useProjectStore';
import { usePaperBuildStore } from '../../store/usePaperBuildStore';
import type { ProjectPatchProposal } from '../../types/project-agent';

export const ProjectPatchCard: React.FC<{ messageId: string; proposal: ProjectPatchProposal }> = ({ messageId, proposal }) => {
  const { isStreaming, apply, revert, reject } = useAgentStore(useShallow((s) => ({
    isStreaming: s.isStreaming, apply: s.applyProjectProposal,
    revert: s.revertProjectProposal, reject: s.rejectProjectProposal,
  })));
  useProjectStore(useShallow((s) => ({
    projectDir: s.projectDir, revision: s.paperEditRevision, contents: s.paperFileContents,
  })));
  const building = usePaperBuildStore((s) => s.status === 'running');
  const conflict = proposal.status === 'rejected' ? undefined : projectProposalConflict(proposal, proposal.status === 'applied');
  const disabled = isStreaming || Boolean(conflict);
  const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return (
    <section className="mt-2 min-w-0 rounded-lg border border-indigo-200 bg-white overflow-hidden" aria-label="论文修改提案">
      <header className="px-2.5 py-2 bg-indigo-50 text-indigo-900 font-semibold flex items-center gap-1">
        <FileText className="w-3 h-3 shrink-0" />{proposal.summary}
      </header>
      <div className="p-2.5 space-y-2">
        <p className="text-[11px] text-slate-600">{proposal.rationale}</p>
        <p className="text-[10px] text-slate-500">
          {proposal.files.length} 个文件 · {proposal.status === 'pending' ? '待审核，尚未修改文件'
            : proposal.status === 'applied' ? '已应用到编辑器，沿用项目自动保存' : '已拒绝，文件未修改'}
        </p>
        {proposal.files.map((file) => (
          <details key={file.relativePath} className="min-w-0">
            <summary className="cursor-pointer break-all text-[11px] text-indigo-700">{file.relativePath}</summary>
            <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-50 p-1.5 text-[10px] font-mono select-text" aria-label={`${file.relativePath} 修改对比`}>
              {file.diffLines.map((line, index) => (
                <div key={index} className={line.type === 'add' ? 'text-emerald-800 bg-emerald-50'
                  : line.type === 'remove' ? 'text-red-800 bg-red-50' : 'text-slate-500'}>
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}{line.text || ' '}
                </div>
              ))}
            </pre>
          </details>
        ))}
        {conflict && <p className="text-[10px] text-amber-800" role="status">{conflict}</p>}
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {proposal.status === 'pending' && <>
            <button type="button" disabled={disabled} onClick={() => apply(messageId)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 bg-indigo-600 text-white disabled:opacity-40">
              <Check size={12} />应用修改集
            </button>
            {desktop && <button type="button" disabled={disabled || building} onClick={() => {
              if (apply(messageId)) {
                useProjectStore.getState().setWorkbenchMode('paper');
                void usePaperBuildStore.getState().run();
              }
            }} className="inline-flex items-center gap-1 rounded px-2 py-1 border border-indigo-200 text-indigo-700 disabled:opacity-40">
              <Play size={12} />应用并编译
            </button>}
            <button type="button" disabled={isStreaming} onClick={() => reject(messageId)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-slate-500 disabled:opacity-40">
              <X size={12} />拒绝
            </button>
          </>}
          {proposal.status === 'applied' && <button type="button" disabled={disabled} onClick={() => revert(messageId)}
            className="inline-flex items-center gap-1 rounded px-2 py-1 border border-slate-200 text-slate-600 disabled:opacity-40">
            <RotateCcw size={12} />撤回整组修改
          </button>}
        </div>
      </div>
    </section>
  );
};
