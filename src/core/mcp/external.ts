import { useMcpStore } from '../../store/useMcpStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { TikzPatchProposal } from '../../types/acp';
import { getMcpRequest, proposalConflict } from './context';

export function getExternalProposal(requestId: string): TikzPatchProposal | undefined {
  const state = useMcpStore.getState();
  return state.external?.requestId === requestId ? state.externalProposal ?? undefined : undefined;
}

export function publishExternalProposal(requestId: string, proposal: TikzPatchProposal): void {
  const context = getMcpRequest(requestId);
  const state = useMcpStore.getState();
  if (!context?.external || state.external?.requestId !== requestId || !state.config.builtinEnabled) {
    throw new Error('外部 MCP 连接已关闭。');
  }
  if (context.external.access === 'read') throw new Error('此外部 MCP 连接仅允许读取。');
  if (state.externalProposal?.newTikzCode !== proposal.newTikzCode) {
    // An external connection is long-lived: give each new draft its own render budget.
    context.previewAttempts = 0;
    context.previewCache = new Map();
  }
  useMcpStore.setState({ externalProposal: proposal });
  if (context.external.access === 'direct') applyExternalProposal(requestId);
}

/** Reuse the workspace edit/undo/autosave chain, without launching an in-app agent. */
export function applyExternalProposal(requestId: string): boolean {
  const state = useMcpStore.getState();
  const context = getMcpRequest(requestId);
  const proposal = getExternalProposal(requestId);
  if (!context?.external || context.external.access === 'read' || !state.config.builtinEnabled ||
      !proposal || proposal.status !== 'pending') return false;
  const conflict = proposalConflict(proposal);
  if (conflict) { useMcpStore.setState({ error: conflict }); return false; }
  useWorkspaceStore.getState().setTikzCode(proposal.newTikzCode);
  useMcpStore.setState({ externalProposal: {
    ...proposal, status: 'applied', previousTikzCode: proposal.baseTikzCode,
    autoApplied: context.external.access === 'direct',
  } });
  return true;
}

export function rejectExternalProposal(requestId: string): void {
  const proposal = getExternalProposal(requestId);
  if (proposal?.status === 'pending') useMcpStore.setState({ externalProposal: { ...proposal, status: 'rejected' } });
}
