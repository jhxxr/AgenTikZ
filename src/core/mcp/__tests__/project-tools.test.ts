import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeMcpTool } from '../runtime';
import { currentCanvasTarget, registerMcpRequest, sourceHash } from '../context';
import { useProjectStore } from '../../../store/useProjectStore';
import { useAgentStore } from '../../../store/useAgentStore';
import { useMcpStore } from '../../../store/useMcpStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { getMcpRequest } from '../context';
import { usePaperBuildStore } from '../../../store/usePaperBuildStore';
import { computeCompactLineDiff } from '../../agent/tikz-diff';
import type { McpToolRequest } from '../../../types/mcp';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
let release: () => void;
let target: McpToolRequest['target'];
const original = {
  'main.tex': '\\documentclass{article}\n\\begin{document}\n\\input{sections/results}\n\\end{document}',
  'sections/results.tex': '\\section{Results}\nSee Figure~\\ref{fig:old}.',
  'figures/model.tikz': '\\begin{tikzpicture}\\node {Model};\\end{tikzpicture}',
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  invoke.mockReset();
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  // Project changes intentionally clear paper caches before the new index is loaded.
  useProjectStore.setState({ projectDir: 'E:/Research/Paper' });
  useProjectStore.setState({
    ...useProjectStore.getInitialState(),
    projectDir: 'E:/Research/Paper', activeCanvasFileName: 'a.canvas.json',
    workbenchMode: 'paper', activePaperFilePath: 'main.tex', paperEditRevision: 7,
    paperFileContents: { ...original }, paperDirtyFiles: { 'sections/results.tex': true },
    paperFiles: Object.keys(original).map((relativePath) => ({
      relativePath, fileName: relativePath.split('/').at(-1)!, category: 'section', sizeBytes: 100, modifiedAt: 0,
    })),
  });
  useMcpStore.setState({ config: { schemaVersion: 1, builtinEnabled: true, servers: [] } });
  useSettingsStore.setState({ agentAutoMode: false });
  useAgentStore.setState({
    isStreaming: false, activeSessionId: 'chat',
    sessions: [{ id: 'chat', title: 'Project test', agentId: 'claude-code', createdAt: '',
      messages: [{ id: 'assistant', agentId: 'claude-code', role: 'assistant', timestamp: '', content: '' }] }],
  });
  target = currentCanvasTarget('chat');
  release = registerMcpRequest('project-test', { target, agentId: 'claude-code', messageId: 'assistant' });
});
afterEach(() => { release(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const call = (toolName: string, args: Record<string, unknown> = {}) =>
  executeMcpTool({ requestId: 'project-test', toolRequestId: 'tool', target, toolName, arguments: args }) as Promise<any>;
const proposal = () => useAgentStore.getState().sessions[0].messages[0].projectPatchProposal;
async function editArgs() {
  const main = await call('read_project_file', { relativePath: 'main.tex' });
  const results = await call('read_project_file', { relativePath: 'sections/results.tex' });
  return { baseRevision: main.paperRevision, summary: 'Align figure reference and caption', files: [
    { relativePath: 'main.tex', baseSourceHash: main.sourceHash, newContent: main.source + '\n% Figure metadata' },
    { relativePath: 'sections/results.tex', baseSourceHash: results.sourceHash, newContent: results.source.replace('fig:old', 'fig:model') },
  ] };
}

describe('project-scoped manuscript tools', () => {
  it('applies successive auto-mode file edits while streaming and keeps a cumulative undo record', async () => {
    getMcpRequest('project-test')!.autoMode = true;
    useSettingsStore.setState({ agentAutoMode: true });
    useAgentStore.setState({ isStreaming: true });
    const first = await call('propose_project_patch', await editArgs());
    expect(first).toMatchObject({ status: 'applied', applied: true, paperRevision: 8 });
    expect(useProjectStore.getState().paperFileContents['sections/results.tex']).toContain('fig:model');
    expect(proposal()).toMatchObject({ status: 'applied', autoApplied: true, appliedRevision: 8 });
    const main = await call('read_project_file', { relativePath: 'main.tex' });
    const second = await call('propose_project_patch', { baseRevision: main.paperRevision, summary: 'Refine main', files: [
      { relativePath: 'main.tex', baseSourceHash: main.sourceHash, newContent: main.source + '\n% Refined' },
    ] });
    expect(second).toMatchObject({ status: 'applied', applied: true, paperRevision: 9 });
    expect(proposal()?.files).toHaveLength(2);
    expect(proposal()?.files.find((file) => file.relativePath === 'main.tex')?.before).toBe(original['main.tex']);
    expect(useProjectStore.getState().paperFileContents['main.tex']).toContain('% Refined');
    // No native file write is needed; the authoritative editor buffers update immediately.
    expect(invoke).not.toHaveBeenCalled();
    useAgentStore.setState({ isStreaming: false });
    expect(useAgentStore.getState().revertProjectProposal('assistant')).toBe(true);
    expect(useProjectStore.getState().paperFileContents).toEqual(original);
    expect(useAgentStore.getState().applyProjectProposal('assistant')).toBe(true);
    expect(useProjectStore.getState().paperFileContents['main.tex']).toContain('% Refined');
    expect(useProjectStore.getState().paperFileContents['sections/results.tex']).toContain('fig:model');
  });

  it.each(['not-opted-in', 'disabled'])('keeps manuscript edits pending when auto mode is %s', async (reason) => {
    getMcpRequest('project-test')!.autoMode = reason !== 'not-opted-in';
    useSettingsStore.setState({ agentAutoMode: reason !== 'disabled' });
    useAgentStore.setState({ isStreaming: true });
    expect(await call('propose_project_patch', await editArgs())).toMatchObject({ status: 'pending', applied: false });
    expect(useProjectStore.getState().paperFileContents).toEqual(original);
  });

  it('preserves an applied manuscript record if later manual changes prevent refinement', async () => {
    getMcpRequest('project-test')!.autoMode = true;
    useSettingsStore.setState({ agentAutoMode: true });
    await call('propose_project_patch', await editArgs());
    const applied = proposal();
    useProjectStore.getState().updatePaperFileContent('sections/results.tex', 'User edit');
    const main = await call('read_project_file', { relativePath: 'main.tex' });
    expect(await call('propose_project_patch', { baseRevision: main.paperRevision, summary: 'Refine main', files: [
      { relativePath: 'main.tex', baseSourceHash: main.sourceHash, newContent: main.source + '\n% Refined' },
    ] })).toMatchObject({ error: { code: 'source_changed' } });
    expect(proposal()).toBe(applied);
    expect(useProjectStore.getState().paperFileContents['sections/results.tex']).toBe('User edit');
  });

  it('reads dirty editor buffers without changing the selected editor or saving', async () => {
    const result = await call('read_project_file', { relativePath: 'sections/results.tex' });
    expect(result).toMatchObject({ source: original['sections/results.tex'], dirty: true, paperRevision: 7 });
    expect(result.sourceHash).toBe(await sourceHash(result.source));
    expect(useProjectStore.getState().activePaperFilePath).toBe('main.tex');
    expect(invoke).not.toHaveBeenCalled();
    const context = await call('get_project_context');
    expect(context.files).toContainEqual(expect.objectContaining({ path: 'sections/results.tex', dirty: true }));
    expect(context.files.find((f: { path: string }) => f.path === 'figures/model.tikz').editableByProjectProposal).toBe(false);
  });

  it('loads an uncached file without opening it and preserves a newer editor buffer', async () => {
    useProjectStore.setState({ paperFileContents: { 'main.tex': original['main.tex'] } });
    invoke.mockImplementation(async () => {
      useProjectStore.setState({ paperFileContents: { ...original, 'sections/results.tex': 'Newer buffer' } });
      return 'Old disk data';
    });
    const result = await call('read_project_file', { relativePath: 'sections/results.tex' });
    expect(result.source).toBe('Newer buffer');
    expect(useProjectStore.getState().activePaperFilePath).toBe('main.tex');
  });

  it('reports disk failures rather than returning an empty manuscript', async () => {
    useProjectStore.setState({ paperFileContents: {} });
    invoke.mockRejectedValue(new Error('disk unavailable'));
    expect(await call('read_project_file', { relativePath: 'main.tex' }))
      .toMatchObject({ error: { code: 'tool_failed', message: 'disk unavailable' } });
    expect(useProjectStore.getState().paperFileContents).toEqual({});
  });

  it('works after changing canvas or workbench but revokes requests on a project change, including A -> B -> A', async () => {
    useProjectStore.setState({ activeCanvasFileName: 'b.canvas.json', workbenchMode: 'figure' });
    expect((await call('get_project_context')).projectId).toBe(target.projectId);
    expect(await call('get_canvas_source')).toMatchObject({ error: { code: 'target_inactive' } });
    useProjectStore.setState({ projectDir: 'E:/Other' });
    useProjectStore.setState({ projectDir: target.projectId });
    expect(await call('get_project_context')).toMatchObject({ error: { code: 'request_ended' } });
  });

  it('does not publish read results when tool authorization is disabled mid-read', async () => {
    useProjectStore.setState({ paperFileContents: {} });
    invoke.mockImplementation(async () => {
      useMcpStore.setState({ config: { schemaVersion: 1, builtinEnabled: false, servers: [] } });
      return original['main.tex'];
    });
    expect(await call('read_project_file', { relativePath: 'main.tex' }))
      .toMatchObject({ error: { code: 'request_ended' } });
  });

  it.each(['../main.tex', '/main.tex', 'C:/main.tex', 'sections\\results.tex', '.secret.tex',
    'sections/../main.tex', 'sections//results.tex', 'missing.tex', 'script.js', 'main.tex:stream'])(
    'rejects unindexed, aliased or unsafe path %s', async (relativePath) => {
      expect(await call('read_project_file', { relativePath })).toMatchObject({ error: { code: 'invalid_path' } });
      expect(invoke).not.toHaveBeenCalled();
    },
  );

  it('publishes a multi-file draft without writes and applies all files in one state transition', async () => {
    const args = await editArgs();
    expect(await call('propose_project_patch', args)).toMatchObject({ status: 'pending', applied: false });
    expect(useProjectStore.getState().paperFileContents).toEqual(original);
    expect(invoke).not.toHaveBeenCalled();
    expect(proposal()?.files).toHaveLength(2);
    const transitions: Record<string, string>[] = [];
    const stop = useProjectStore.subscribe((state, old) => {
      if (state.paperFileContents !== old.paperFileContents) transitions.push(state.paperFileContents);
    });
    expect(useAgentStore.getState().applyProjectProposal('assistant')).toBe(true);
    stop();
    expect(transitions).toHaveLength(1);
    expect(transitions[0]['main.tex']).toContain('Figure metadata');
    expect(transitions[0]['sections/results.tex']).toContain('fig:model');
    expect(proposal()?.status).toBe('applied');
    expect(useAgentStore.getState().revertProjectProposal('assistant')).toBe(true);
    expect(useProjectStore.getState().paperFileContents).toEqual(original);
    expect(proposal()?.status).toBe('pending');
    expect(useAgentStore.getState().applyProjectProposal('assistant')).toBe(true);
  });

  it('requires prior reads, the correct hash and the latest revision', async () => {
    const args = await editArgs();
    args.files[0].baseSourceHash = 'wrong';
    expect(await call('propose_project_patch', args)).toMatchObject({ error: { code: 'source_changed' } });
    const fresh = await editArgs();
    useProjectStore.getState().updatePaperFileContent('main.tex', original['main.tex'] + '\n% manual edit');
    useProjectStore.getState().updatePaperFileContent('main.tex', original['main.tex']);
    expect(await call('propose_project_patch', fresh)).toMatchObject({ error: { code: 'source_changed' } });
    expect(proposal()).toBeUndefined();
  });

  it('does not partially apply or revert over subsequent manual edits', async () => {
    await call('propose_project_patch', await editArgs());
    useProjectStore.getState().updatePaperFileContent('sections/results.tex', 'Manual edit');
    expect(useAgentStore.getState().applyProjectProposal('assistant')).toBe(false);
    expect(useProjectStore.getState().paperFileContents['main.tex']).toBe(original['main.tex']);
    expect(useProjectStore.getState().paperFileContents['sections/results.tex']).toBe('Manual edit');
    await call('propose_project_patch', await editArgs());
    expect(useAgentStore.getState().applyProjectProposal('assistant')).toBe(true);
    useProjectStore.getState().updatePaperFileContent('main.tex', 'Later edit');
    expect(useAgentStore.getState().revertProjectProposal('assistant')).toBe(false);
    expect(useProjectStore.getState().paperFileContents['main.tex']).toBe('Later edit');
  });

  it('blocks cross-project application, duplicate files and canvas-backed file proposals', async () => {
    const args = await editArgs();
    expect(await call('propose_project_patch', { ...args, files: [args.files[0], args.files[0]] }))
      .toMatchObject({ error: { code: 'invalid_arguments' } });
    const figure = await call('read_project_file', { relativePath: 'figures/model.tikz' });
    expect(await call('propose_project_patch', { ...args, files: [{
      relativePath: 'figures/model.tikz', baseSourceHash: figure.sourceHash, newContent: 'Changed',
    }] })).toMatchObject({ error: { code: 'invalid_path' } });
    await call('propose_project_patch', args);
    useProjectStore.setState({ projectDir: 'E:/Other' });
    expect(useAgentStore.getState().applyProjectProposal('assistant')).toBe(false);
  });

  it('allows rejection without writes and does not overwrite an already reviewed proposal', async () => {
    const args = await editArgs();
    await call('propose_project_patch', args);
    useAgentStore.getState().rejectProjectProposal('assistant');
    expect(proposal()?.status).toBe('rejected');
    expect(useAgentStore.getState().applyProjectProposal('assistant')).toBe(false);
    expect(await call('propose_project_patch', args)).toMatchObject({ error: { code: 'proposal_closed' } });
    expect(invoke).not.toHaveBeenCalled();
    expect(useProjectStore.getState().paperFileContents).toEqual(original);
  });

  it('blocks review actions while the agent is still changing its draft', async () => {
    await call('propose_project_patch', await editArgs());
    useAgentStore.setState({ isStreaming: true });
    expect(useAgentStore.getState().applyProjectProposal('assistant')).toBe(false);
    useAgentStore.getState().rejectProjectProposal('assistant');
    expect(proposal()?.status).toBe('pending');
  });

  it('rejects new writes from a read-only connection', async () => {
    release();
    release = registerMcpRequest('project-test', { target });
    expect(await call('propose_project_patch', await editArgs()))
      .toMatchObject({ error: { code: 'read_only_request' } });
    expect(proposal()).toBeUndefined();
  });

  it('marks the last paper build stale immediately when an auto-synced figure is edited', async () => {
    usePaperBuildStore.setState({ projectId: target.projectId, status: 'completed', compiledRevision: 7,
      result: { ok: true, message: 'Compiled', buildId: 1 } });
    useProjectStore.getState().markCanvasDirty();
    expect(await call('get_paper_diagnostics')).toMatchObject({ stale: true });
  });

  it('reports real compilation errors and marks older results stale', async () => {
    usePaperBuildStore.setState({
      projectId: target.projectId, status: 'failed', compiledRevision: 6,
      result: { ok: false, message: 'Undefined control sequence', logExcerpt: '! error', buildId: 1 },
    });
    expect(await call('get_paper_diagnostics')).toMatchObject({
      status: 'failed', stale: true, result: { ok: false, logExcerpt: '! error' },
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('shows removed content as well as additions when a large file falls back to whole-file diff', () => {
    const diff = computeCompactLineDiff('old\n'.repeat(600), 'new\n'.repeat(600));
    expect(diff.some((line) => line.type === 'remove' && line.text === 'old')).toBe(true);
    expect(diff.some((line) => line.type === 'add' && line.text === 'new')).toBe(true);
  });
});
