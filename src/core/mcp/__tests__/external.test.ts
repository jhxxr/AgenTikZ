import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeMcpTool } from '../runtime';
import { currentCanvasTarget, getMcpRequest, registerMcpRequest, sourceHash } from '../context';
import { applyExternalProposal, rejectExternalProposal } from '../external';
import { useMcpStore } from '../../../store/useMcpStore';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useProjectStore } from '../../../store/useProjectStore';
import { useAgentStore } from '../../../store/useAgentStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { renderAgentPreview } from '../../agent/visual-review';
import type { CanvasTarget, ExternalMcpAccess } from '../../../types/mcp';

vi.mock('../../agent/visual-review', () => ({ renderAgentPreview: vi.fn() }));

const original = '\\begin{tikzpicture}\n\\node[dl_block] (a) at (0,0) {Original};\n\\end{tikzpicture}';
const replacement = original.replace('Original', 'External edit');
let release: (() => void) | undefined;
let target: CanvasTarget;
let toolId = 0;

beforeEach(() => {
  useMcpStore.setState(useMcpStore.getInitialState());
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
  useWorkspaceStore.getState().setTikzCode(original);
  useProjectStore.setState({ projectDir: null, activeCanvasFileName: 'figure-a.canvas.json' });
  useAgentStore.setState({ isStreaming: false, activeRequestId: null, sessions: [] });
  useSettingsStore.setState({ agentAutoMode: false });
  vi.mocked(renderAgentPreview).mockReset().mockResolvedValue({
    image: { data: 'cGl4ZWxz', mimeType: 'image/png' }, message: 'Compiled fixture',
  });
  toolId = 0;
});
afterEach(() => release?.());

function connect(access: ExternalMcpAccess) {
  target = currentCanvasTarget('external-client');
  release = registerMcpRequest('external', { target, external: { access }, visualReviewEnabled: true });
  useMcpStore.setState({ external: { requestId: 'external', target, access } });
}
const call = (toolName: string, args: Record<string, unknown> = {}) =>
  executeMcpTool({ requestId: 'external', toolRequestId: `tool-${++toolId}`, target, toolName, arguments: args }) as Promise<any>;
async function base() {
  const source = await call('get_canvas_source');
  return { baseRevision: source.revision, baseSourceHash: source.sourceHash, summary: 'External drawing edit' };
}

describe('independent external MCP drawing client', () => {
  it('reads the live drawing without an in-app agent or conversation, and enforces read-only access', async () => {
    connect('read');
    expect(await call('get_canvas_source')).toMatchObject({ access: 'read', source: original });
    expect(await call('get_canvas_ast')).toHaveProperty('ast');
    expect(await call('render_canvas_preview')).toMatchObject({ renderer: 'tex', image: { mimeType: 'image/png' } });
    expect(await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement }))
      .toMatchObject({ error: { code: 'read_only_request' } });
    expect(useAgentStore.getState().sessions).toEqual([]);
    expect(useWorkspaceStore.getState().tikzCode).toBe(original);
    expect(applyExternalProposal('external')).toBe(false);
  });

  it('keeps reviewed edits pending even if in-app auto mode is enabled, and reports approval', async () => {
    connect('review');
    useSettingsStore.setState({ agentAutoMode: true });
    const proposed = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    expect(proposed).toMatchObject({ status: 'pending', applied: false });
    expect(useWorkspaceStore.getState().tikzCode).toBe(original);
    expect(await call('render_canvas_preview', { proposalId: proposed.proposalId })).toMatchObject({ applied: false });
    expect(renderAgentPreview).toHaveBeenCalledWith(replacement, expect.any(String), expect.any(Object));
    expect(applyExternalProposal('external')).toBe(true);
    expect(await call('get_canvas_source')).toMatchObject({
      source: replacement, latestProposal: { proposalId: proposed.proposalId, status: 'applied' },
    });
    expect(await call('render_canvas_preview', { proposalId: proposed.proposalId })).toMatchObject({ applied: true });
  });

  it('directly draws and refines with per-edit undo independently of in-app auto mode', async () => {
    connect('direct');
    const first = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    expect(first).toMatchObject({ status: 'applied', applied: true, sourceHash: await sourceHash(replacement) });
    expect(useWorkspaceStore.getState().tikzCode).toBe(replacement);
    const second = await call('propose_surgical_diff', {
      ...await base(), patches: [{ search: 'External edit', replace: 'Refined' }],
    });
    expect(second).toMatchObject({ status: 'applied', applied: true });
    expect(second.proposalId).not.toBe(first.proposalId);
    expect(useWorkspaceStore.getState().tikzCode).toContain('Refined');
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().tikzCode).toBe(replacement);
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().tikzCode).toBe(original);
    expect(useAgentStore.getState().sessions).toEqual([]);
    expect(useAgentStore.getState().activeRequestId).toBeNull();
    expect(useSettingsStore.getState().agentAutoMode).toBe(false);
  });

  it('starts a new draft after rejection or approval, instead of closing the long-lived connection', async () => {
    connect('review');
    const first = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    rejectExternalProposal('external');
    expect(await call('get_canvas_source')).toMatchObject({ latestProposal: { status: 'rejected' } });
    const second = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    expect(second.proposalId).not.toBe(first.proposalId);
    expect(applyExternalProposal('external')).toBe(true);
    const third = await call('propose_tikz_patch', { ...await base(), newTikzCode: original });
    expect(third).toMatchObject({ status: 'pending', applied: false });
    expect(third.proposalId).not.toBe(second.proposalId);
  });

  it('rejects stale edits and stale approval, but permits a fresh edit after rereading user changes', async () => {
    connect('direct');
    const stale = await base();
    useWorkspaceStore.getState().setTikzCode(original + '\n% manual change');
    expect(await call('propose_tikz_patch', { ...stale, newTikzCode: replacement }))
      .toMatchObject({ error: { code: 'source_changed' } });
    expect(await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement })).toMatchObject({ applied: true });
    useWorkspaceStore.getState().setTikzCode(replacement + '\n% another manual change');
    expect(await call('propose_tikz_patch', { ...await base(), newTikzCode: original })).toMatchObject({ applied: true });
    getMcpRequest('external')!.external!.access = 'review';
    await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    useWorkspaceStore.getState().setTikzCode(original + '\n% intervening edit');
    expect(applyExternalProposal('external')).toBe(false);
    expect(useWorkspaceStore.getState().tikzCode).toContain('intervening edit');
  });

  it('does not let concurrent direct edits overwrite each other from the same base', async () => {
    connect('direct');
    const args = await base();
    const results = await Promise.all([
      call('propose_tikz_patch', { ...args, newTikzCode: replacement }),
      call('propose_tikz_patch', { ...args, newTikzCode: original.replace('Original', 'Competing edit') }),
    ]);
    expect(results.filter((result) => result.applied)).toHaveLength(1);
    expect(results.filter((result) => result.error?.code === 'source_changed')).toHaveLength(1);
  });

  it('excludes manuscript access and does not retarget a switched canvas', async () => {
    connect('direct');
    for (const tool of ['get_project_context', 'read_project_file', 'propose_project_patch', 'get_paper_diagnostics']) {
      expect(await call(tool)).toMatchObject({ error: { code: 'unknown_tool' } });
    }
    useProjectStore.setState({ activeCanvasFileName: 'another.canvas.json' });
    expect(await call('get_canvas_source')).toMatchObject({ error: { code: 'target_inactive' } });
    release?.();
    expect(await call('get_component_library')).toMatchObject({ error: { code: 'request_ended' } });
  });

  it('does not return a read snapshot after its authorization or source changes during hashing', async () => {
    connect('read');
    const stale = call('get_canvas_source');
    useWorkspaceStore.getState().setTikzCode(replacement);
    expect(await stale).toMatchObject({ error: { code: 'source_changed' } });
    const revoked = call('get_canvas_source');
    release?.();
    expect(await revoked).toMatchObject({ error: { code: 'request_ended' } });
  });

  it('discards a rendered image after disconnect and prevents later approval', async () => {
    connect('review');
    const proposal = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    let finish!: (value: any) => void;
    vi.mocked(renderAgentPreview).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const rendered = call('render_canvas_preview', { proposalId: proposal.proposalId });
    await vi.waitFor(() => expect(renderAgentPreview).toHaveBeenCalled());
    release?.();
    finish({ image: { data: 'cGl4ZWxz', mimeType: 'image/png' }, message: 'Compiled fixture' });
    expect(await rendered).toMatchObject({ error: { code: 'source_changed' } });
    expect(applyExternalProposal('external')).toBe(false);
    expect(useMcpStore.getState().externalProposal?.renderPreview).toBeUndefined();
  });

  it('gives a new external draft a fresh, bounded preview cache', async () => {
    connect('review');
    await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    await call('render_canvas_preview');
    getMcpRequest('external')!.previewAttempts = 3;
    const next = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement + '\n% refine' });
    expect(await call('render_canvas_preview', { proposalId: next.proposalId }))
      .toMatchObject({ rendersRemaining: 2, cached: false });
    expect(await call('render_canvas_preview', { proposalId: next.proposalId })).toMatchObject({ cached: true });
  });
});
