import { useProjectStore } from '../../store/useProjectStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { AcpAgentId, TikzPatchProposal } from '../../types/acp';
import type { CanvasTarget } from '../../types/mcp';

export interface McpRequestContext {
  target: CanvasTarget;
  agentId?: AcpAgentId;
  messageId?: string;
}

const requests = new Map<string, McpRequestContext>();

export function currentCanvasTarget(conversationId: string): CanvasTarget {
  const project = useProjectStore.getState();
  return {
    conversationId,
    projectId: project.projectDir || 'temporary',
    canvasId: project.activeCanvasFileName || 'untitled',
  };
}

export function sameCanvas(target: Pick<CanvasTarget, 'projectId' | 'canvasId'>): boolean {
  const current = currentCanvasTarget('');
  return current.projectId === target.projectId && current.canvasId === target.canvasId;
}

export function registerMcpRequest(requestId: string, context: McpRequestContext): () => void {
  if (requests.has(requestId)) throw new Error('Duplicate MCP request');
  requests.set(requestId, context);
  return () => requests.delete(requestId);
}

export function getMcpRequest(requestId: string): McpRequestContext | undefined {
  return requests.get(requestId);
}

export function endMcpRequest(requestId: string): void {
  requests.delete(requestId);
}

export async function sourceHash(source: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function proposalConflict(proposal: TikzPatchProposal, reverting = false): string | undefined {
  if (proposal.targetCanvas && !sameCanvas(proposal.targetCanvas)) return '请先切回生成此提案的原画布。';
  const workspace = useWorkspaceStore.getState();
  const expected = reverting ? proposal.newTikzCode : proposal.baseTikzCode;
  if (expected !== undefined && expected !== workspace.tikzCode) return '画布源码已变化，请重新生成提案，避免覆盖手动修改。';
  if (!reverting && proposal.baseRevision !== undefined && proposal.baseRevision !== (workspace.sourceRevision ?? 0)) {
    return '画布版本已变化，请重新生成提案。';
  }
  return undefined;
}
