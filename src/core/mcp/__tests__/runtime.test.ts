import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeMcpTool } from '../runtime';
import { currentCanvasTarget, registerMcpRequest, sourceHash } from '../context';
import { useAgentStore } from '../../../store/useAgentStore';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useProjectStore } from '../../../store/useProjectStore';
import type { McpToolRequest } from '../../../types/mcp';
import { renderAgentPreview } from '../../agent/visual-review';
import { getMcpRequest } from '../context';

vi.mock('../../agent/visual-review', () => ({ renderAgentPreview: vi.fn() }));

const original = '\\begin{tikzpicture}\n\\node[dl_block] (a) at (0,0) {Original};\n\\end{tikzpicture}';
const replacement = original.replace('Original', 'Changed');
let release: () => void;
let target: McpToolRequest['target'];

beforeEach(() => {
  vi.mocked(renderAgentPreview).mockReset().mockResolvedValue({
    image: { data: 'cGl4ZWxz', mimeType: 'image/png' }, message: 'Compiled fixture',
  });
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
  it('provides scoped skill pages independently of the selected canvas, validates arguments and honors request expiry', async () => {
    useProjectStore.setState({ activeCanvasFileName: 'figure-b.canvas.json' });
    const page = await call('get_diagram_design_skill', { topic: 'mae', lineCount: 20 });
    expect(page.skill).toBe('tikz-diagram-reproduction');
    expect(page.macroIndex.some((item: any) => item.name === 'TokenStrip')).toBe(true);
    expect(await call('get_diagram_design_skill', { topic: '../../private' })).toMatchObject({ error: { code: 'invalid_arguments' } });
    expect(await call('get_diagram_design_skill', { path: 'private' })).toMatchObject({ error: { code: 'invalid_arguments' } });
    release();
    expect(await call('get_diagram_design_skill')).toMatchObject({ error: { code: 'request_ended' } });
  });

  it('records reproduction intent on tool proposals and keeps reference geometry unchanged during layout repair', async () => {
    getMcpRequest('request')!.diagramMode = 'reproduction';
    const proposal = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    expect(proposal.applied).toBe(false);
    const pending = useAgentStore.getState().sessions[0].messages[0].patchProposal!;
    expect(pending.newTikzCode).toContain('"preserveGeometry":true');
    expect(pending.newTikzCode).toContain(replacement);
    expect(useWorkspaceStore.getState().tikzCode).toBe(original);
    await call('propose_layout_repair', await base());
    const repaired = useAgentStore.getState().sessions[0].messages[0].patchProposal!;
    expect(repaired.newTikzCode).toContain(original);
    expect(repaired.autoRepairs).toEqual([]);
  });

  it('renders the exact pending draft, returns pixels, caches identical previews and never applies changes', async () => {
    const proposal = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    const result = await call('render_canvas_preview', { proposalId: proposal.proposalId });
    expect(result).toMatchObject({ image: { mimeType: 'image/png', data: 'cGl4ZWxz' }, applied: false,
      previewSourceHash: await sourceHash(replacement), rendersRemaining: 2, cached: false });
    expect(renderAgentPreview).toHaveBeenCalledWith(replacement, useWorkspaceStore.getState().activeThemeId, expect.any(Object));
    expect(useWorkspaceStore.getState().tikzCode).toBe(original);
    expect(useAgentStore.getState().sessions[0].messages[0].patchProposal?.renderPreview?.dataUrl).toBe('data:image/png;base64,cGl4ZWxz');
    expect(await call('render_canvas_preview', { proposalId: proposal.proposalId })).toMatchObject({ cached: true, rendersRemaining: 2 });
    expect(renderAgentPreview).toHaveBeenCalledTimes(1);
    await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement + '\n% refine' });
    expect(useAgentStore.getState().sessions[0].messages[0].patchProposal?.renderPreview).toBeUndefined();
    await call('render_canvas_preview', { proposalId: proposal.proposalId });
    expect(renderAgentPreview).toHaveBeenCalledTimes(2);
  });

  it('bounds distinct renders and caches real compile failures without inventing an image', async () => {
    vi.mocked(renderAgentPreview).mockRejectedValue(new Error('Missing latex'));
    for (let i = 0; i < 3; i++) {
      const proposal = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement + `\n% ${i}` });
      for (let repeat = 0; repeat < 2; repeat++) {
        expect(await call('render_canvas_preview', { proposalId: proposal.proposalId }))
          .toMatchObject({ error: { code: 'preview_failed', message: 'Missing latex' } });
      }
    }
    expect(renderAgentPreview).toHaveBeenCalledTimes(3);
    const final = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement + '\n% fourth' });
    expect(await call('render_canvas_preview', { proposalId: final.proposalId }))
      .toMatchObject({ error: { code: 'preview_budget_exceeded' } });
    expect(useAgentStore.getState().sessions[0].messages[0].patchProposal?.renderPreview).toBeUndefined();
  });

  it.each(['canvas', 'proposal', 'cancel'])('discards a render when %s changes while compiling', async (change) => {
    let finish!: (value: any) => void;
    vi.mocked(renderAgentPreview).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const proposal = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    const running = call('render_canvas_preview', { proposalId: proposal.proposalId });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    if (change === 'canvas') useWorkspaceStore.getState().setTikzCode(original + '\n% user edit');
    if (change === 'proposal') await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement + '\n% newer' });
    if (change === 'cancel') release();
    finish({ image: { data: 'cGl4ZWxz', mimeType: 'image/png' }, message: 'Old render' });
    expect(await running).toMatchObject({ error: { code: 'source_changed' } });
    expect(useAgentStore.getState().sessions[0].messages[0].patchProposal?.renderPreview).toBeUndefined();
  });

  it('honors preview opt-out, validates proposal identity and rejects outdated drafts before compiling', async () => {
    getMcpRequest('request')!.visualReviewEnabled = false;
    expect(await call('render_canvas_preview')).toMatchObject({ error: { code: 'preview_disabled' } });
    getMcpRequest('request')!.visualReviewEnabled = true;
    expect(await call('render_canvas_preview', { proposalId: 'missing' })).toMatchObject({ error: { code: 'proposal_not_found' } });
    const proposal = await call('propose_tikz_patch', { ...await base(), newTikzCode: replacement });
    useWorkspaceStore.getState().setTikzCode(original + '\n% changed');
    expect(await call('render_canvas_preview', { proposalId: proposal.proposalId })).toMatchObject({ error: { code: 'source_changed' } });
    expect(renderAgentPreview).not.toHaveBeenCalled();
  });

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

  it('normalizes fenced and standalone-wrapped tikzpicture proposals while rejecting nested tikzpictures with guidance', async () => {
    const fenced = '```tikz\n\\definecolor{encBlue}{HTML}{2563EB}\n% Example \\begin{tikzpicture} in comment\n' + replacement + '\n```';
    const res1 = await call('propose_tikz_patch', { ...await base(), newTikzCode: fenced });
    expect(res1).toMatchObject({ status: 'pending', applied: false });
    const pending1 = useAgentStore.getState().sessions[0].messages[0].patchProposal!;
    expect(pending1.newTikzCode).toContain('\\definecolor{encBlue}{HTML}{2563EB}');
    expect(pending1.newTikzCode).not.toContain('```');

    const standalone = [
      '\\documentclass[tikz,border=10pt]{standalone}',
      '\\usepackage{tikz,amsmath}',
      '\\usetikzlibrary{arrows.meta,positioning}',
      '\\definecolor{decGreen}{HTML}{16A34A}',
      '\\tikzset{customBox/.style={draw=decGreen}}',
      '\\begin{document}',
      replacement,
      '\\end{document}',
    ].join('\n');
    const res2 = await call('propose_tikz_patch', { ...await base(), newTikzCode: standalone });
    expect(res2).toMatchObject({ status: 'pending', applied: false });
    const pending2 = useAgentStore.getState().sessions[0].messages[0].patchProposal!;
    expect(pending2.newTikzCode).not.toContain('\\documentclass');
    expect(pending2.newTikzCode).not.toContain('\\begin{document}');
    expect(pending2.newTikzCode).toContain('\\definecolor{decGreen}{HTML}{16A34A}');
    expect(pending2.newTikzCode).toContain('\\tikzset{customBox/.style={draw=decGreen}}');
    expect(pending2.newTikzCode).toContain('\\begin{tikzpicture}');

    const jsonEscaped = '\x09ikzset{box/.style={draw}}\n\x08egin{tikzpicture}\n\\node[font=\x0cootnotesize\x08fseries] (a) at (0,0) {Recovered};\n\\end{tikzpicture}';
    const resEscaped = await call('propose_tikz_patch', { ...await base(), newTikzCode: jsonEscaped });
    expect(resEscaped).toMatchObject({ status: 'pending', applied: false });
    const pendingEscaped = useAgentStore.getState().sessions[0].messages[0].patchProposal!;
    expect(pendingEscaped.newTikzCode).toContain('\\tikzset{box/.style={draw}}');
    expect(pendingEscaped.newTikzCode).toContain('\\begin{tikzpicture}');
    expect(pendingEscaped.newTikzCode).toContain('\\footnotesize\\bfseries');

    const diagWithoutId = await call('inspect_layout_diagnostics');
    expect(diagWithoutId.inspectedTarget).toBe('live_canvas');
    expect(diagWithoutId.pendingProposalId).toBe(resEscaped.proposalId);
    const repairedPending = await call('propose_layout_repair', { ...await base(), proposalId: resEscaped.proposalId });
    expect(repairedPending).toMatchObject({ status: 'pending', applied: false });
    expect(useAgentStore.getState().sessions[0].messages[0].patchProposal!.newTikzCode).toContain('{Recovered}');

    const nested = '\\begin{tikzpicture}\n\\node (outer) {\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}};\n\\end{tikzpicture}';
    const resNested = await call('propose_tikz_patch', { ...await base(), newTikzCode: nested });
    expect(resNested).toMatchObject({ error: { code: 'invalid_source' } });
    expect(resNested.error.message).toContain('嵌套');
  });

  it('validates tool arguments and rejects expired requests', async () => {
    expect(await call('get_canvas_source', { path: 'unrelated.txt' })).toMatchObject({ error: { code: 'invalid_arguments' } });
    expect(await call('get_theme_palette', { themeId: '__proto__' })).toMatchObject({ error: { code: 'invalid_arguments' } });
    expect(await call('propose_tikz_patch', { ...await base(), newTikzCode: '\\node {Snippet};' })).toMatchObject({ error: { code: 'invalid_source' } });
    release();
    expect(await call('get_canvas_ast')).toMatchObject({ error: { code: 'request_ended' } });
  });
});
