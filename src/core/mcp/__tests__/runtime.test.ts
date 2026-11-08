import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeMcpTool } from '../runtime';
import { currentCanvasTarget, registerMcpRequest, sourceHash } from '../context';
import { useAgentStore } from '../../../store/useAgentStore';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useProjectStore } from '../../../store/useProjectStore';
import type { McpToolRequest } from '../../../types/mcp';

const original = '\\begin{tikzpicture}\n\\node[dl_block] (a) at (0,0) {Original};\n\\end{tikzpicture}';
const replacement = original.replace('Original', 'Changed');
let release: () => void;
let target: McpToolRequest['target'];

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
  useWorkspaceStore.getState().setTikzCode(original);
  useProjectStore.setState({ projectDir: null, activeCanvasFileName: 'figure-a.canvas.json' });
  useAgentStore.setState({
    activeSessionId: 'chat', sessions: [{ id: 'chat', title: 'Test', agentId: 'claude-code', createdAt: '',
      messages: [{ id: 'assistant', role: 'assistant', content: '', timestamp: '', agentId: 'claude-code' }] }],
  });
  target = currentCanvasTarget('chat');
  release = registerMcpRequest('request', { target, agentId: 'claude-code', messageId: 'assistant' });
});
afterEach(() => release());

function call(toolName: string, args: Record<string, unknown> = {}) {
  return executeMcpTool({ requestId: 'request', toolRequestId: 'tool', target, toolName, arguments: args }) as Promise<any>;
}
async function base() {
  const current = await call('get_canvas_source');
  return { baseRevision: current.revision, baseSourceHash: current.sourceHash, summary: 'Change label' };
}

describe('actual canvas MCP handlers', () => {
  it('reads live source, AST, selection and diagnostics', async () => {
    const current = await call('get_canvas_source');
    expect(current.source).toBe(original);
    expect(current.sourceHash).toBe(await sourceHash(original));
    const ast = await call('get_canvas_ast');
    expect(ast.ast.nodes[0].id).toBe('a');
    useWorkspaceStore.getState().setSelectedIds(['a']);
    const selected = await call('get_selected_elements');
    expect(selected.elements[0].source).toContain('{Original}');
    expect((await call('inspect_layout_diagnostics')).report.score).toBeTypeOf('number');
  });

  it('publishes a reviewable proposal, never changes source, and lets diagnostics inspect it', async () => {
    const args = await base();
    const result = await call('propose_tikz_patch', { ...args, newTikzCode: replacement });
    expect(result).toMatchObject({ status: 'pending', applied: false });
    expect(useWorkspaceStore.getState().tikzCode).toBe(original);
    const proposal = useAgentStore.getState().sessions[0].messages[0].patchProposal!;
    expect(proposal.newTikzCode).toBe(replacement);
    expect(proposal.targetCanvas).toEqual(target);
    expect((await call('inspect_layout_diagnostics', { proposalId: result.proposalId })).report).toBeDefined();
    const second = await call('propose_tikz_patch', { ...args, newTikzCode: replacement.replace('Changed', 'Refined') });
    expect(second.proposalId).toBe(result.proposalId);
    expect(useAgentStore.getState().sessions[0].messages).toHaveLength(1);
    useAgentStore.getState().applyPatchProposal('assistant');
    expect(useWorkspaceStore.getState().tikzCode).toContain('Refined');
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().tikzCode).toBe(original);
  });

  it('requires both the source hash and revision, including after undo restores the same text', async () => {
    const args = await base();
    useWorkspaceStore.getState().setTikzCode(replacement);
    expect(await call('propose_tikz_patch', { ...args, newTikzCode: replacement })).toMatchObject({ error: { code: 'source_changed' } });
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().tikzCode).toBe(original);
    expect(await call('propose_tikz_patch', { ...args, newTikzCode: replacement })).toMatchObject({ error: { code: 'source_changed' } });
  });

  it('does not operate on another canvas or accept responses for another target', async () => {
    useProjectStore.setState({ activeCanvasFileName: 'figure-b.canvas.json' });
    expect(await call('get_canvas_source')).toMatchObject({ error: { code: 'target_inactive' } });
    expect((await call('get_component_library')).components.length).toBeGreaterThan(0);
    expect((await call('get_theme_palette', { themeId: 'nature' })).id).toBe('nature');
    const result = await executeMcpTool({ requestId: 'request', toolRequestId: 'tool', target: { ...target, conversationId: 'other' }, toolName: 'get_canvas_source', arguments: {} });
    expect(result).toMatchObject({ error: { code: 'target_mismatch' } });
  });

  it('blocks stale proposal application and reverting over later user edits', async () => {
    await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    useProjectStore.setState({ activeCanvasFileName: 'figure-b.canvas.json' });
    useAgentStore.getState().applyPatchProposal('assistant');
    expect(useWorkspaceStore.getState().tikzCode).toBe(original);
    useProjectStore.setState({ activeCanvasFileName: target.canvasId });
    useAgentStore.getState().applyPatchProposal('assistant');
    expect(useWorkspaceStore.getState().tikzCode).toBe(replacement);
    useWorkspaceStore.getState().setTikzCode(replacement + '\n% User edit');
    useAgentStore.getState().revertPatchProposal('assistant');
    expect(useWorkspaceStore.getState().tikzCode).toContain('% User edit');
  });

  it('applies surgical changes only when each search matches once', async () => {
    const args = await base();
    expect(await call('propose_surgical_diff', { ...args, patches: [{ search: 'missing', replace: 'bad' }] }))
      .toMatchObject({ error: { code: 'ambiguous_search' } });
    expect(await call('propose_surgical_diff', { ...args, patches: [{ search: 'Original', replace: 'A $& B' }] }))
      .toMatchObject({ applied: false });
    expect(useAgentStore.getState().sessions[0].messages[0].patchProposal?.newTikzCode).toContain('A $& B');
    const duplicate = original.replace('{Original}', '{Original Original}');
    useWorkspaceStore.getState().setTikzCode(duplicate);
    expect(await call('propose_surgical_diff', { ...await base(), patches: [{ search: 'Original', replace: 'bad' }] }))
      .toMatchObject({ error: { code: 'ambiguous_search' } });
  });

  it('validates tool arguments and rejects expired requests', async () => {
    expect(await call('get_canvas_source', { path: 'unrelated.txt' })).toMatchObject({ error: { code: 'invalid_arguments' } });
    expect(await call('get_theme_palette', { themeId: '__proto__' })).toMatchObject({ error: { code: 'invalid_arguments' } });
    expect(await call('propose_tikz_patch', { ...await base(), newTikzCode: '\\node {Snippet};' })).toMatchObject({ error: { code: 'invalid_source' } });
    release();
    expect(await call('get_canvas_ast')).toMatchObject({ error: { code: 'request_ended' } });
  });
});
