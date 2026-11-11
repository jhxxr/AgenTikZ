import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Check, ChevronRight, FileText, Play, Undo2, X } from 'lucide-react';
import { useAgentStore, projectProposalConflict } from '../../store/useAgentStore';
import { useProjectStore } from '../../store/useProjectStore';
import { usePaperBuildStore } from '../../store/usePaperBuildStore';
import type { ProjectPatchProposal } from '../../types/project-agent';
import { DiffStats, DiffView } from './DiffView';
import { isDesktop } from './agent-ui';

const STATUS: Record<ProjectPatchProposal['status'], { label: string; note: string; className: string }> = {
  pending: { label: '待审核', note: '尚未修改任何文件', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  applied: { label: '已应用', note: '已写入编辑器，随项目自动保存', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  rejected: { label: '已拒绝', note: '文件未修改', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

/** A multi-file manuscript change set. It is applied or reverted as one unit. */
export const ProjectPatchCard: React.FC<{ messageId: string; proposal: ProjectPatchProposal }> = ({ messageId, proposal }) => {
  const { isStreaming, apply, revert, reject } = useAgentStore(useShallow((s) => ({
    isStreaming: s.isStreaming, apply: s.applyProjectProposal,
    revert: s.revertProjectProposal, reject: s.rejectProjectProposal,
  })));
  // Subscribed only so the conflict check re-runs when the manuscript changes.
  useProjectStore(useShallow((s) => ({
    projectDir: s.projectDir, revision: s.paperEditRevision, contents: s.paperFileContents,
  })));
  const building = usePaperBuildStore((s) => s.status === 'running');
  // A single-file change is the common case; show it without an extra click.
  const [openFile, setOpenFile] = useState<string | null>(proposal.files.length === 1 ? proposal.files[0].relativePath : null);

  const rejected = proposal.status === 'rejected';
  const conflict = rejected ? undefined : projectProposalConflict(proposal, proposal.status === 'applied');
  const disabled = isStreaming || Boolean(conflict);
  const status = STATUS[proposal.status];

  return (
    <section aria-label="论文修改提案"
      className={`min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white ${rejected ? 'opacity-75' : 'shadow-xs'}`}>
      <header className="flex items-start gap-2 border-b border-slate-100 px-3 py-2">
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold leading-snug text-slate-900">{proposal.summary}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
            <span className={`rounded-full border px-1.5 py-px text-[10.5px] font-medium ${status.className}`}>
              {proposal.status === 'applied' && proposal.autoApplied ? '已自动应用' : status.label}
            </span>
            <span>{proposal.files.length} 个文件 · {status.note}</span>
          </div>
        </div>
      </header>

      <div className="space-y-2.5 px-3 py-2.5">
        {proposal.rationale && <p className="text-[12px] leading-relaxed text-slate-600">{proposal.rationale}</p>}

        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {proposal.files.map((file) => {
            const open = openFile === file.relativePath;
            return (
              <li key={file.relativePath} className="min-w-0">
                <button type="button" aria-expanded={open}
                  onClick={() => setOpenFile(open ? null : file.relativePath)}
                  className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-slate-50 cursor-pointer">
                  <ChevronRight className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
                  <span className="min-w-0 flex-1 break-all font-mono text-[11.5px] text-slate-800">{file.relativePath}</span>
                  <DiffStats lines={file.diffLines} />
                </button>
                {open && (
                  <div className="px-2 pb-2">
                    <DiffView lines={file.diffLines} label={`${file.relativePath} 修改对比`} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {conflict && <p role="status" className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-900">{conflict}</p>}

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {proposal.status === 'pending' && <>
            <button type="button" disabled={disabled} onClick={() => apply(messageId)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed">
              <Check className="h-3.5 w-3.5" />应用修改集
            </button>
            {isDesktop() && (
              <button type="button" disabled={disabled || building} onClick={() => {
                if (apply(messageId)) {
                  useProjectStore.getState().setWorkbenchMode('paper');
                  void usePaperBuildStore.getState().run();
                }
              }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
                <Play className="h-3.5 w-3.5" />应用并编译
              </button>
            )}
            <button type="button" disabled={isStreaming} onClick={() => reject(messageId)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
              <X className="h-3.5 w-3.5" />拒绝
            </button>
          </>}
          {proposal.status === 'applied' && (
            <button type="button" disabled={disabled} onClick={() => revert(messageId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
              <Undo2 className="h-3.5 w-3.5" />撤回整组修改
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
