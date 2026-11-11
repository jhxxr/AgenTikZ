import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoApplyMcpProposal, useAgentStore } from '../useAgentStore';
import { getMcpRequest } from '../../core/mcp/context';
import { useSettingsStore } from '../useSettingsStore';
import { useMcpStore } from '../useMcpStore';

const bridge = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  setTikzCode: vi.fn(),
  applyPaperFileChanges: vi.fn(),
  paperContents: { 'main.tex': 'Unsaved manuscript' } as Record<string, string>,
  paperRevision: 3,
  projectVersion: 0,
  canvasId: 'untitled',
  canvasCode: '% original canvas',
  revision: 0,
  projectDir: 'E:\\Research\\current-project',
  workbenchMode: 'figure' as 'figure' | 'paper',
  projectListeners: new Set<(state: any, previous: any) => void>(),
  onEvent: undefined as undefined | ((event: { payload: Record<string, unknown> }) => void),
}));

// Mock the native IPC boundary, not the dynamically imported JS module.
// Vitest 3's manual mock loader can bypass a mock during concurrent imports.
vi.mock('@tauri-apps/api/event', () => ({ listen: bridge.listen }));
vi.mock('../../core/mcp/runtime', () => ({ ensureMcpRuntime: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../useProjectStore', () => ({
  getPaperWorkspaceVersion: () => bridge.projectVersion,
  useProjectStore: {
    subscribe: vi.fn((callback) => {
      bridge.projectListeners.add(callback);
      return () => { bridge.projectListeners.delete(callback); };
    }),
    getState: () => ({
      projectDir: bridge.projectDir, workbenchMode: bridge.workbenchMode,
      activePaperFilePath: 'main.tex', paperFileContents: bridge.paperContents,
      activeCanvasFileName: bridge.canvasId,
      paperFiles: [{ relativePath: 'main.tex', category: 'main' }], paperDirtyFiles: { 'main.tex': true },
      paperEditRevision: bridge.paperRevision,
      applyPaperFileChanges: bridge.applyPaperFileChanges,
    }),
  },
}));
vi.mock('../useWorkspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => ({
      tikzCode: bridge.canvasCode,
      sourceRevision: bridge.revision,
      selectedIds: [],
      parsedDoc: { nodes: [], edges: [], charts: [] },
      setTikzCode: bridge.setTikzCode,
      setSelectedIds: vi.fn(),
    }),
  },
}));

async function freshStore() {
  useAgentStore.setState({
    ...useAgentStore.getInitialState(),
    providers: useAgentStore.getState().providers.map((provider) => ({ ...provider, detected: true })),
    sessions: [{ id: 'test-session', title: 'Test', agentId: 'claude-code', createdAt: '', messages: [] }],
    activeSessionId: 'test-session',
    activeAgentId: 'claude-code',
    isStreaming: false,
    activeRequestBackend: null,
  });
  return useAgentStore;
}

beforeEach(() => {
  // Keep one live module graph and its subscriptions, as in the app. Reset
  // Zustand snapshots instead of clearing module caches/listeners while lazy
  // dependencies may still hold references to the previous module instance.
  vi.clearAllMocks();
  bridge.onEvent = undefined;
  bridge.canvasCode = '% original canvas';
  bridge.revision = 0;
  bridge.projectDir = 'E:\\Research\\current-project';
  bridge.workbenchMode = 'figure';
  bridge.projectVersion = 0;
  bridge.canvasId = 'untitled';
  bridge.paperRevision = 3;
  bridge.paperContents = { 'main.tex': 'Unsaved manuscript' };
  bridge.applyPaperFileChanges.mockImplementation((_projectId, _revision, files) => {
    for (const file of files) bridge.paperContents[file.relativePath] = file.after;
    bridge.paperRevision += 1;
    return true;
  });
  bridge.setTikzCode.mockImplementation((code: string) => { bridge.canvasCode = code; bridge.revision += 1; });
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {
    invoke: (command: string, args: Record<string, unknown>) => bridge.invoke(command, args),
  } });
  bridge.listen.mockImplementation(async (_name, callback) => {
    bridge.onEvent = callback;
    return bridge.unlisten;
  });
  bridge.invoke.mockResolvedValue({ usedNativeCli: true, reply: 'Real final response' });
  useSettingsStore.setState({ ...useSettingsStore.getInitialState(), agentAutoMode: false }, true);
  useMcpStore.setState(useMcpStore.getInitialState(), true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('automatic mode', () => {
  const assistant = () => useAgentStore.getState().sessions.find((s) => s.id === 'test-session')!
    .messages.find((m) => m.role === 'assistant')!;
  const stageProposals = () => {
    const state = useAgentStore.getState();
    useAgentStore.setState({ sessions: state.sessions.map((s) => s.id === 'test-session' ? { ...s,
      messages: s.messages.map((m) => m.id === state.streamingMessageId ? { ...m,
        patchProposal: { id: 'canvas', status: 'pending' as const, summary: 'Canvas', rationale: '',
          affectedElementIds: [], newTikzCode: '% draft', baseTikzCode: bridge.canvasCode, baseRevision: bridge.revision,
          targetCanvas: { conversationId: s.id, projectId: bridge.projectDir, canvasId: bridge.canvasId } },
        projectPatchProposal: { id: 'paper', status: 'pending' as const, summary: 'Paper', rationale: '',
          projectId: bridge.projectDir, baseRevision: bridge.paperRevision,
          files: [{ relativePath: 'main.tex', before: bridge.paperContents['main.tex'], after: 'Revised manuscript', diffLines: [] }] },
      } : m) } : s) });
  };

  it('auto-applies a final text proposal once, preserving undo and manual review after disabling', async () => {
    const store = await freshStore();
    useSettingsStore.getState().updateSettings({ agentAutoMode: true });
    bridge.invoke.mockResolvedValue({ usedNativeCli: true, reply: 'Done', proposedTikz: '% replacement' });
    await store.getState().sendPromptToAgent('Edit');
    expect(assistant().patchProposal).toMatchObject({ status: 'applied', autoApplied: true, previousTikzCode: '% original canvas' });
    expect(bridge.setTikzCode).toHaveBeenCalledOnce();
    store.getState().revertPatchProposal(assistant().id);
    expect(assistant().patchProposal).toMatchObject({ status: 'pending', autoApplied: false });
    expect(bridge.canvasCode).toBe('% original canvas');
    useSettingsStore.getState().updateSettings({ agentAutoMode: false });
    await store.getState().sendPromptToAgent('Another edit');
    expect(store.getState().sessions[0].messages.at(-1)?.patchProposal?.status).toBe('pending');
    expect(bridge.setTikzCode).toHaveBeenCalledTimes(2);
  });

  it.each(['claude-code', 'pi'] as const)('registers %s auto approval for immediate tool edits before the response finishes', async (agentId) => {
    const store = await freshStore();
    store.getState().setActiveAgentId(agentId);
    useSettingsStore.getState().updateSettings({ agentAutoMode: true, piModel: 'fixture' });
    bridge.invoke.mockImplementation(async (_command, args) => {
      const requestId = agentId === 'pi' ? args.request.requestId : args.requestId;
      expect(getMcpRequest(requestId)?.autoMode).toBe(true);
      stageProposals();
      autoApplyMcpProposal(requestId, 'canvas');
      autoApplyMcpProposal(requestId, 'project');
      expect(store.getState().isStreaming).toBe(true);
      expect(bridge.canvasCode).toBe('% draft');
      expect(bridge.paperContents['main.tex']).toBe('Revised manuscript');
      return agentId === 'pi' ? { runtimeStarted: true, reply: 'Done' } : { usedNativeCli: true, reply: 'Done' };
    });
    await store.getState().sendPromptToAgent('Edit');
    expect(bridge.setTikzCode).toHaveBeenCalledOnce();
    expect(bridge.applyPaperFileChanges).toHaveBeenCalledOnce();
    expect(assistant().patchProposal?.autoApplied).toBe(true);
    expect(assistant().projectPatchProposal?.autoApplied).toBe(true);
  });

  it.each(['error', 'cancel'])('preserves already applied edits and undo when the rest of a run ends with %s', async (reason) => {
    const store = await freshStore();
    useSettingsStore.getState().updateSettings({ agentAutoMode: true });
    bridge.invoke.mockImplementation(async (command, args) => {
      if (command === 'acp_cancel_prompt') return;
      stageProposals();
      autoApplyMcpProposal(args.requestId, 'canvas');
      autoApplyMcpProposal(args.requestId, 'project');
      if (reason === 'cancel') await store.getState().cancelPrompt();
      throw new Error('Run interrupted');
    });
    await store.getState().sendPromptToAgent('Edit');
    expect(assistant().patchProposal?.status).toBe('applied');
    expect(assistant().projectPatchProposal?.status).toBe('applied');
    expect(bridge.setTikzCode).toHaveBeenCalledOnce();
    store.getState().revertPatchProposal(assistant().id);
    expect(store.getState().revertProjectProposal(assistant().id)).toBe(true);
    expect(bridge.canvasCode).toBe('% original canvas');
    expect(bridge.paperContents['main.tex']).toBe('Unsaved manuscript');
  });

  it('forwards effective native access without overwriting the independent full-access preference', async () => {
    const store = await freshStore();
    useSettingsStore.getState().updateSettings({ agentAutoMode: true, agentWorkingDirectory: '  E:\\Notes  ' });
    await store.getState().testAgentHandshake('claude-code');
    expect(bridge.invoke).toHaveBeenLastCalledWith('acp_test_agent', expect.objectContaining({ fullAccess: true, workingDirectory: 'E:\\Notes' }));
    await store.getState().sendPromptToAgent('Read');
    expect(bridge.invoke).toHaveBeenLastCalledWith('acp_send_prompt', expect.objectContaining({
      fullAccess: true, autoMode: true, workingDirectory: 'E:\\Notes',
      agentContext: expect.stringContaining('Automatic mode is enabled'),
    }));
    expect(useSettingsStore.getState().agentFullAccess).toBe(false);
    useSettingsStore.getState().updateSettings({ agentAutoMode: false });
    await store.getState().sendPromptToAgent('Read');
    expect(bridge.invoke).toHaveBeenLastCalledWith('acp_send_prompt', expect.objectContaining({ fullAccess: false, autoMode: false, workingDirectory: undefined }));
    useSettingsStore.getState().updateSettings({ agentFullAccess: true });
    await store.getState().sendPromptToAgent('Read');
    expect(bridge.invoke).toHaveBeenLastCalledWith('acp_send_prompt', expect.objectContaining({ fullAccess: true, autoMode: false }));
  });

  it.each(['claude-code', 'pi'] as const)('applies final MCP proposals after %s finishes, even in another conversation', async (agentId) => {
    const store = await freshStore();
    store.getState().setActiveAgentId(agentId);
    useSettingsStore.getState().updateSettings({ agentAutoMode: true, piModel: 'fixture' });
    bridge.invoke.mockImplementation(async (_command, args) => {
      stageProposals();
      // The agent must be able to refine/preview the pending draft without changing live source.
      expect(assistant().patchProposal?.status).toBe('pending');
      expect(bridge.setTikzCode).not.toHaveBeenCalled();
      expect(bridge.applyPaperFileChanges).not.toHaveBeenCalled();
      store.setState((state) => ({ sessions: state.sessions.map((s) => ({ ...s,
        messages: s.messages.map((m) => m.patchProposal ? { ...m, patchProposal: { ...m.patchProposal, newTikzCode: '% final draft' } } : m),
      })) }));
      store.getState().createNewSession();
      if (agentId === 'pi') {
        expect(args.request).not.toHaveProperty('fullAccess');
        expect(args.request.prompt).toContain('Automatic mode is enabled');
        return { runtimeStarted: true, reply: 'Done', resumed: false };
      }
      return { usedNativeCli: true, reply: 'Done', proposedTikz: '% duplicate fallback' };
    });
    await store.getState().sendPromptToAgent('Edit both');
    expect(store.getState().activeSessionId).not.toBe('test-session');
    expect(assistant().patchProposal).toMatchObject({ status: 'applied', autoApplied: true, newTikzCode: '% final draft' });
    expect(assistant().projectPatchProposal).toMatchObject({ status: 'applied', autoApplied: true, appliedRevision: 4 });
    expect(bridge.setTikzCode).toHaveBeenCalledOnce();
    expect(bridge.paperContents['main.tex']).toBe('Revised manuscript');
    store.getState().switchSession('test-session');
    expect(store.getState().revertProjectProposal(assistant().id)).toBe(true);
    expect(bridge.paperContents['main.tex']).toBe('Unsaved manuscript');
    expect(assistant().projectPatchProposal).toMatchObject({ status: 'pending', autoApplied: false });
  });

  it.each(['error', 'cancel', 'disabled', 'project-changed', 'source-changed', 'rejected'])(
    'does not auto-apply when the run is %s', async (reason) => {
      const store = await freshStore();
      useSettingsStore.getState().updateSettings({ agentAutoMode: true });
      bridge.invoke.mockImplementation(async (command) => {
        if (command === 'acp_cancel_prompt') return;
        stageProposals();
        if (reason === 'error') throw new Error('Transport failed');
        if (reason === 'cancel') await store.getState().cancelPrompt();
        if (reason === 'disabled') useSettingsStore.getState().updateSettings({ agentAutoMode: false });
        if (reason === 'project-changed') bridge.projectVersion += 1;
        if (reason === 'source-changed') {
          bridge.canvasCode = '% User edit'; bridge.revision += 1;
          bridge.paperContents['main.tex'] = 'User edit'; bridge.paperRevision += 1;
        }
        if (reason === 'rejected') store.setState((state) => ({ sessions: state.sessions.map((s) => ({ ...s,
          messages: s.messages.map((m) => ({ ...m,
            patchProposal: m.patchProposal && { ...m.patchProposal, status: 'rejected' as const },
            projectPatchProposal: m.projectPatchProposal && { ...m.projectPatchProposal, status: 'rejected' as const },
          })),
        })) }));
        return { usedNativeCli: true, reply: 'Done' };
      });
      await store.getState().sendPromptToAgent('Edit');
      expect(bridge.setTikzCode).not.toHaveBeenCalled();
      expect(bridge.applyPaperFileChanges).not.toHaveBeenCalled();
      expect(assistant().patchProposal?.status).not.toBe('applied');
      expect(assistant().projectPatchProposal?.status).not.toBe('applied');
      if (reason === 'source-changed') expect(assistant().content).toContain('提案未应用');
    },
  );

  it('does not approve a turn retroactively or apply a proposal to a different canvas', async () => {
    const store = await freshStore();
    bridge.invoke.mockImplementation(async () => {
      stageProposals();
      useSettingsStore.getState().updateSettings({ agentAutoMode: true });
      return { usedNativeCli: true, reply: 'Done' };
    });
    await store.getState().sendPromptToAgent('Manual turn');
    expect(bridge.setTikzCode).not.toHaveBeenCalled();
    expect(bridge.applyPaperFileChanges).not.toHaveBeenCalled();
    bridge.invoke.mockImplementation(async () => {
      stageProposals();
      bridge.canvasId = 'other.tikz';
      return { usedNativeCli: true, reply: 'Done' };
    });
    await store.getState().sendPromptToAgent('Auto turn');
    expect(bridge.setTikzCode).not.toHaveBeenCalled();
    expect(store.getState().sessions[0].messages.at(-1)?.content).toContain('原画布');
  });

  it('auto-applies a local repair but never reapplies it on undo', async () => {
    const store = await freshStore();
    bridge.canvasCode = '\\begin{tikzpicture}\\node (a) at (0,0) {A};\\node (b) at (0,0) {B};\\end{tikzpicture}';
    useSettingsStore.getState().updateSettings({ agentAutoMode: true });
    store.getState().runLocalAgentSkill('full_optimize');
    expect(assistant().patchProposal).toMatchObject({ status: 'applied', autoApplied: true });
    store.getState().revertPatchProposal(assistant().id);
    expect(assistant().patchProposal?.status).toBe('pending');
    expect(bridge.setTikzCode).toHaveBeenCalledTimes(2);
  });
});

describe('real ACP frontend contract', () => {
  it('loads agent-advertised models on connection and forwards the persisted selection on every prompt', async () => {
    const store = await freshStore();
    bridge.invoke.mockResolvedValueOnce({ ok: true, message: 'Connected', currentModelId: 'default-model',
      models: [{ id: 'default-model', name: 'Default' }, { id: 'chosen-model', name: 'Chosen' }] });
    await store.getState().testAgentHandshake('claude-code');
    expect(store.getState().providers.find((provider) => provider.id === 'claude-code')?.models).toEqual([
      { id: 'default-model', name: 'Default' }, { id: 'chosen-model', name: 'Chosen' },
    ]);
    useSettingsStore.getState().updateSettings({ acpModelSelections: { 'claude-code': 'chosen-model' } });
    await store.getState().sendPromptToAgent('Use the selected model');
    expect(bridge.invoke).toHaveBeenLastCalledWith('acp_send_prompt', expect.objectContaining({ modelId: 'chosen-model' }));
    useSettingsStore.getState().updateSettings({ acpModelSelections: {} });
    await store.getState().sendPromptToAgent('Use the agent default');
    expect(bridge.invoke).toHaveBeenLastCalledWith('acp_send_prompt', expect.objectContaining({ modelId: undefined }));
  });

  it('does not invent model lists for an ACP agent that does not advertise them', async () => {
    const store = await freshStore();
    bridge.invoke.mockResolvedValueOnce({ ok: true, message: 'No selector' });
    await store.getState().testAgentHandshake('opencode');
    expect(store.getState().providers.find((provider) => provider.id === 'opencode')?.models).toEqual([]);
  });

  it('uses the active custom Pi channel without passing API keys through renderer requests', async () => {
    const store = await freshStore();
    const { newPiModel } = await import('../../types/pi');
    const channel = { id: 'custom-one', name: 'Gateway', provider: 'openai', api: 'openai-completions' as const,
      baseUrl: 'https://gateway.example.test/custom/v1', models: [newPiModel('custom-model')] };
    useSettingsStore.getState().updateSettings({ piChannels: [channel], piActiveChannelId: channel.id,
      piProvider: 'openai', piModel: 'custom-model' });
    store.getState().setActiveAgentId('pi');
    bridge.invoke.mockResolvedValue({ runtimeStarted: true, reply: 'Custom channel response', resumed: false });
    await store.getState().sendPromptToAgent('Hello');
    const call = bridge.invoke.mock.calls.find(([command]) => command === 'pi_send_prompt');
    expect(call?.[1].request.channel).toMatchObject(channel);
    expect(call?.[1].request).not.toHaveProperty('apiKey');
    expect(call?.[1].request.channel).not.toHaveProperty('apiKey');
  });

  it('delivers every IPC call when reset and send import the Tauri wrapper concurrently', async () => {
    bridge.invoke.mockImplementation((_command: string, args: { index: number }) => Promise.resolve(args.index));
    const results = await Promise.allSettled(Array.from({ length: 32 }, async (_, index) => {
      // Exercise both resolution paths deterministically. Under Vitest 3 a
      // concurrent manual mock import can fall through to the actual module.
      const { invoke } = index % 2
        ? await import('@tauri-apps/api/core')
        : await vi.importActual<typeof import('@tauri-apps/api/core')>('@tauri-apps/api/core');
      expect(invoke).not.toBe(bridge.invoke);
      return invoke<number>('concurrent_agent_ipc_probe', { index });
    }));
    expect(results.filter((result) => result.status === 'rejected').map((result) => String(result.reason))).toEqual([]);
    expect(results.map((result) => result.status === 'fulfilled' ? result.value : undefined))
      .toEqual(Array.from({ length: 32 }, (_, index) => index));
    expect(bridge.invoke).toHaveBeenCalledTimes(32);
  });

  it('injects the user drawing skill and reproduction intent without silently recoloring fallback source', async () => {
    const store = await freshStore();
    bridge.canvasCode = '\\begin{tikzpicture}\\node[fill=white] (a) at (0,0) {resnet};\\end{tikzpicture}';
    bridge.invoke.mockResolvedValue({ usedNativeCli: true, reply: `\`\`\`tikz\n${bridge.canvasCode}\n\`\`\`` });
    await store.getState().sendPromptToAgent('请复刻这张图，保留原配色');
    const args = bridge.invoke.mock.calls.at(-1)![1];
    expect(args.agentContext).toContain('BUILT-IN DRAWING SKILL: tikz-diagram-reproduction');
    expect(args.agentContext).toContain('Task mode: reproduction');
    expect(args.prompt).toContain('保留原图的配色');
    const proposal = store.getState().sessions[0].messages.at(-1)?.patchProposal;
    expect(proposal?.newTikzCode).toContain('fill=white');
    expect(proposal?.newTikzCode).toContain('{resnet}');
    expect(proposal?.newTikzCode).toContain('"preserveGeometry":true');
    expect(proposal?.autoRepairs).toBeUndefined();
  });

  it('sends image-only messages as pixels and replays bounded image references on stateless ACP followups', async () => {
    const store = await freshStore();
    const image = { id: 'ref', name: 'diagram.png', mimeType: 'image/png' as const, data: 'cGl4ZWxz' };
    await store.getState().sendPromptToAgent('', [image]);
    expect(bridge.invoke).toHaveBeenCalledWith('acp_send_prompt', expect.objectContaining({
      images: [image], agentContext: expect.stringContaining('BOUNDED VISUAL REVIEW'),
    }));
    expect(store.getState().sessions[0].messages[0].images).toEqual([image]);
    expect(store.getState().sessions[0].messages[0].content).toContain('所附图片');
    await store.getState().sendPromptToAgent('Follow the reference');
    const args = bridge.invoke.mock.calls.at(-1)![1];
    expect(args.images).toEqual([image]);
    expect(JSON.stringify(args.history)).not.toContain(image.data);
    store.getState().setVisualReviewEnabled(false);
    await store.getState().sendPromptToAgent('Text diagnostics only');
    expect(bridge.invoke.mock.calls.at(-1)![1].agentContext).not.toContain('BOUNDED VISUAL REVIEW');
  });

  it('routes Pi to its own long-lived backend without forwarding secrets or native access flags', async () => {
    const store = await freshStore();
    const { useSettingsStore } = await import('../useSettingsStore');
    useSettingsStore.getState().updateSettings({ piProvider: 'anthropic', piModel: 'fixture', agentFullAccess: true });
    store.getState().setActiveAgentId('pi');
    bridge.workbenchMode = 'paper';
    bridge.invoke.mockResolvedValue({ runtimeStarted: true, reply: 'Pi response', resumed: true });
    await store.getState().sendPromptToAgent('Update the caption');
    expect(bridge.invoke).toHaveBeenCalledWith('pi_send_prompt', { request: expect.objectContaining({
      conversationId: 'test-session', provider: 'anthropic', model: 'fixture', thinkingLevel: 'auto',
      target: expect.objectContaining({ projectId: bridge.projectDir }),
    }) });
    const args = bridge.invoke.mock.calls[0][1].request;
    expect(args).not.toHaveProperty('apiKey');
    expect(args).not.toHaveProperty('fullAccess');
    expect(args.prompt).toContain('Unsaved manuscript');
    expect(store.getState().sessions[0].messages.at(-1)?.content).toBe('Pi response');

    useSettingsStore.getState().updateSettings({ piThinkingLevel: 'xhigh', acpThoughtSelections: { 'codex-cli': 'high' } });
    await store.getState().sendPromptToAgent('Deep check');
    expect(bridge.invoke.mock.calls.at(-1)![1].request.thinkingLevel).toBe('xhigh');

    store.getState().setActiveAgentId('codex-cli');
    bridge.invoke.mockResolvedValue({ usedNativeCli: true, reply: 'Codex response' });
    await store.getState().sendPromptToAgent('Codex check');
    expect(bridge.invoke.mock.calls.at(-1)![1]).toMatchObject({ agentId: 'codex-cli', thoughtLevel: 'high' });
  });

  it('cancels the running Pi backend even after the provider selector changes', async () => {
    const store = await freshStore();
    const { useSettingsStore } = await import('../useSettingsStore');
    useSettingsStore.getState().updateSettings({ piModel: 'fixture' });
    store.getState().setActiveAgentId('pi');
    let finish!: (value: unknown) => void;
    bridge.invoke.mockImplementation((command) => command === 'pi_send_prompt'
      ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve());
    const running = store.getState().sendPromptToAgent('Long Pi task');
    await vi.waitFor(() => expect(store.getState().activeRequestBackend).toBe('pi'));
    store.getState().setActiveAgentId('codex-cli');
    await store.getState().cancelPrompt();
    expect(bridge.invoke).toHaveBeenCalledWith('pi_cancel_prompt', { requestId: store.getState().activeRequestId });
    finish({ runtimeStarted: true, reply: 'Stopped', resumed: false });
    await running;
    expect(store.getState().activeRequestBackend).toBeNull();
  });

  it('resets the Pi process on project changes and waits for reset before sending the next project', async () => {
    const store = await freshStore();
    const { useSettingsStore } = await import('../useSettingsStore');
    useSettingsStore.getState().updateSettings({ piModel: 'fixture' });
    store.getState().setActiveAgentId('pi');
    bridge.invoke.mockResolvedValue({ runtimeStarted: true, reply: 'Pi result', resumed: false });
    await store.getState().sendPromptToAgent('Project A');
    // Production Zustand notifies every subscriber. A later observer must not
    // replace the Agent's reset listener (paper/MCP modules subscribe as well).
    const { useProjectStore } = await import('../useProjectStore');
    const observer = vi.fn();
    const unsubscribeObserver = useProjectStore.subscribe(observer);
    let finishReset!: () => void;
    bridge.invoke.mockImplementation((command) => command === 'pi_reset_runtime'
      ? new Promise<void>((resolve) => { finishReset = resolve; })
      : Promise.resolve({ runtimeStarted: true, reply: 'Pi result', resumed: false }));
    const before = bridge.projectDir;
    bridge.projectDir = 'E:\\OtherProject';
    for (const listener of [...bridge.projectListeners]) {
      listener({ projectDir: bridge.projectDir }, { projectDir: before });
    }
    expect(observer).toHaveBeenCalledTimes(1);
    unsubscribeObserver();
    expect(bridge.projectListeners.has(observer)).toBe(false);
    const sending = store.getState().sendPromptToAgent('Project B');
    // Keep failure output focused on command ordering, not the full model prompt.
    await vi.waitFor(() => expect(bridge.invoke.mock.calls.map(([command]) => command)).toContain('pi_reset_runtime'));
    expect(bridge.invoke).toHaveBeenCalledWith('pi_reset_runtime', {});
    expect(bridge.invoke.mock.calls.filter(([command]) => command === 'pi_send_prompt')).toHaveLength(1);
    finishReset();
    await sending;
    const last = bridge.invoke.mock.calls.at(-1);
    expect(last?.[0]).toBe('pi_send_prompt');
    expect(last?.[1].request.target.projectId).toBe(bridge.projectDir);
    expect(last?.[1].request.history).toEqual([]);
  });

  it('does not select a fallback model or turn a Pi code block into an unreviewed tool proposal', async () => {
    const store = await freshStore();
    store.getState().setActiveAgentId('pi');
    await store.getState().sendPromptToAgent('Draw');
    expect(bridge.invoke).not.toHaveBeenCalled();
    expect(JSON.stringify(store.getState().sessions)).toContain('选择渠道');
    const { useSettingsStore } = await import('../useSettingsStore');
    useSettingsStore.getState().updateSettings({ piModel: 'fixture' });
    bridge.invoke.mockResolvedValue({
      runtimeStarted: true, resumed: false,
      reply: '```latex\n\\begin{tikzpicture}\\node {Not a tool proposal};\\end{tikzpicture}\n```',
    });
    await store.getState().sendPromptToAgent('Draw');
    expect(store.getState().sessions[0].messages.at(-1)?.patchProposal).toBeUndefined();
    expect(bridge.setTikzCode).not.toHaveBeenCalled();
  });

  it('uses manuscript context without drawing constraints and never turns paper prose into a canvas patch', async () => {
    const store = await freshStore();
    bridge.workbenchMode = 'paper';
    bridge.invoke.mockResolvedValue({ usedNativeCli: true, reply: 'Review manuscript changes.', proposedTikz: '% not a canvas edit' });
    await store.getState().sendPromptToAgent('Polish my manuscript');
    const args = bridge.invoke.mock.calls[0][1];
    expect(args).toMatchObject({ workbenchMode: 'paper', canvasTikz: '', selectedIds: [], prompt: 'Polish my manuscript' });
    expect(args.agentContext).toContain('Unsaved manuscript');
    expect(args.agentContext).toContain('propose_project_patch');
    expect(args.agentContext).not.toContain('REGISTERED PRIMITIVE');
    expect(store.getState().sessions[0].messages.some((m) => m.patchProposal)).toBe(false);
    expect(bridge.setTikzCode).not.toHaveBeenCalled();
  });

  it('keeps one conversation across paper/figure views but starts a fresh conversation for another project', async () => {
    const store = await freshStore();
    await store.getState().sendPromptToAgent('Figure task for project A');
    bridge.workbenchMode = 'paper';
    await store.getState().sendPromptToAgent('Continue in paper');
    expect(store.getState().activeSessionId).toBe('test-session');
    expect(bridge.invoke.mock.calls[1][1].history.some((m: { content: string }) => m.content === 'Figure task for project A')).toBe(true);
    bridge.projectDir = 'E:\\Research\\different-project';
    await store.getState().sendPromptToAgent('New project task');
    expect(store.getState().activeSessionId).not.toBe('test-session');
    expect(bridge.invoke.mock.calls[2][1].history).toEqual([]);
  });

  it('does not send old project context to another project while the listener is being attached', async () => {
    const store = await freshStore();
    bridge.listen.mockImplementation(async () => {
      bridge.projectDir = 'E:\\Other';
      return bridge.unlisten;
    });
    await store.getState().sendPromptToAgent('Read current project');
    expect(bridge.invoke).not.toHaveBeenCalled();
    expect(JSON.stringify(store.getState().sessions[0].messages)).toContain('项目已切换');
    expect(bridge.unlisten).toHaveBeenCalledOnce();
  });

  it('preserves an MCP proposal instead of replacing it with a duplicate text proposal', async () => {
    const store = await freshStore();
    bridge.invoke.mockImplementation(async (_command, args) => {
      store.setState((state) => ({ sessions: state.sessions.map((session) => ({ ...session,
        messages: session.messages.map((message) => message.id === `asst_${args.requestId}` ? { ...message,
          patchProposal: { id: 'real-mcp-proposal', summary: 'MCP', rationale: '', newTikzCode: '% MCP',
            affectedElementIds: [], status: 'pending' as const },
        } : message),
      })) }));
      return { usedNativeCli: true, reply: 'A proposal is ready.', proposedTikz: '% duplicate text proposal' };
    });
    await store.getState().sendPromptToAgent('Edit with a tool');
    expect(store.getState().sessions[0].messages.at(-1)?.patchProposal?.id).toBe('real-mcp-proposal');
  });

  it('forwards cancellation to the active backend request and clears its id at completion', async () => {
    const store = await freshStore();
    let complete: (value: unknown) => void = () => {};
    bridge.invoke.mockImplementation((command) => command === 'acp_send_prompt'
      ? new Promise((resolve) => { complete = resolve; }) : Promise.resolve());
    const sending = store.getState().sendPromptToAgent('Long task');
    await vi.waitFor(() => expect(store.getState().activeRequestId).toBeTruthy());
    const id = store.getState().activeRequestId;
    await store.getState().cancelPrompt();
    expect(bridge.invoke).toHaveBeenCalledWith('acp_cancel_prompt', { requestId: id });
    complete({ usedNativeCli: true, reply: 'Stopped.' });
    await sending;
    expect(store.getState().activeRequestId).toBeNull();
  });

  it('blocks a text proposal when the user edits the source before applying it', async () => {
    bridge.invoke.mockResolvedValue({ usedNativeCli: true, reply: 'Review this.', proposedTikz: '% replacement' });
    const store = await freshStore();
    await store.getState().sendPromptToAgent('Edit');
    const message = store.getState().sessions[0].messages.find((m) => m.patchProposal)!;
    bridge.canvasCode = '% User edit';
    bridge.revision += 1;
    expect(store.getState().applyPatchProposal(message.id)).toBe(false);
    expect(bridge.setTikzCode).not.toHaveBeenCalled();
    expect(store.getState().sessions[0].messages.find((m) => m.id === message.id)?.content).toContain('源码已变化');
  });

  it('keeps local access disabled by default and excludes project paths', async () => {
    const store = await freshStore();
    await store.getState().sendPromptToAgent('Read my local notes');
    expect(bridge.invoke.mock.calls[0][1]).toMatchObject({
      fullAccess: false,
      workingDirectory: undefined,
    });
  });

  it('uses the enabled access setting and follows the project when no directory is specified', async () => {
    const { useSettingsStore } = await import('../useSettingsStore');
    const store = await freshStore();
    useSettingsStore.getState().updateSettings({ agentFullAccess: true });
    await store.getState().sendPromptToAgent('Read notes outside my project');
    expect(bridge.invoke.mock.calls[0][1]).toMatchObject({
      fullAccess: true,
      workingDirectory: 'E:\\Research\\current-project',
    });
  });

  it('uses a custom directory and honors disabling access on the next message', async () => {
    const { useSettingsStore } = await import('../useSettingsStore');
    const store = await freshStore();
    useSettingsStore.getState().updateSettings({
      agentFullAccess: true,
      agentWorkingDirectory: '  E:\\Other Folder\\notes  ',
    });
    await store.getState().sendPromptToAgent('Read local notes');
    expect(bridge.invoke.mock.calls[0][1]).toMatchObject({
      fullAccess: true,
      workingDirectory: 'E:\\Other Folder\\notes',
    });
    useSettingsStore.getState().updateSettings({ agentFullAccess: false });
    await store.getState().sendPromptToAgent('Continue from the canvas');
    expect(bridge.invoke.mock.calls[1][1]).toMatchObject({
      fullAccess: false,
      workingDirectory: undefined,
    });
  });

  it('does not simulate an agent when the desktop bridge is unavailable', async () => {
    vi.stubGlobal('window', {});
    const store = await freshStore();
    await store.getState().sendPromptToAgent('hello');
    expect(bridge.invoke).not.toHaveBeenCalled();
    const messages = store.getState().sessions[0].messages;
    expect(JSON.stringify(messages)).toMatch(/Tauri|桌面|desktop/i);
    expect(messages.every((message) => !message.patchProposal && !message.mcpToolCalls?.length)).toBe(true);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('retains an actionable invoke error instead of a mock response or empty bubble', async () => {
    bridge.invoke.mockRejectedValue(new Error('ACP test: login required'));
    const store = await freshStore();
    await store.getState().sendPromptToAgent('hello');
    expect(JSON.stringify(store.getState().sessions[0].messages)).toContain('ACP test: login required');
    expect(bridge.unlisten).toHaveBeenCalledOnce();
    expect(store.getState().isStreaming).toBe(false);
  });

  it('handles listener setup failures without sending or leaving streaming stuck', async () => {
    bridge.listen.mockRejectedValue(new Error('ACP test: listener unavailable'));
    const store = await freshStore();
    await store.getState().sendPromptToAgent('hello');
    expect(bridge.invoke).not.toHaveBeenCalled();
    expect(JSON.stringify(store.getState().sessions[0].messages)).toContain('ACP test: listener unavailable');
    expect(store.getState().isStreaming).toBe(false);
  });

  it('does not turn a missing native agent response into a simulated success', async () => {
    bridge.invoke.mockResolvedValue({ usedNativeCli: false, reply: null, thought: null, proposedTikz: null });
    const store = await freshStore();
    await store.getState().sendPromptToAgent('hello');
    const messages = store.getState().sessions[0].messages;
    expect(messages.some((message) => message.role === 'system' || message.content.match(/失败|错误|不可用|未.*连接|error|unavailable/i))).toBe(true);
    expect(messages.every((message) => !message.patchProposal && !message.mcpToolCalls?.length)).toBe(true);
    expect(bridge.unlisten).toHaveBeenCalledOnce();
    expect(store.getState().isStreaming).toBe(false);
  });

  it('uses the final reply even if no stream events reach the webview', async () => {
    const store = await freshStore();
    await store.getState().sendPromptToAgent('hello');
    const responses = store.getState().sessions[0].messages.filter((message) => message.role === 'assistant');
    expect(responses).toHaveLength(1);
    expect(responses[0].content).toBe('Real final response');
    expect(bridge.unlisten).toHaveBeenCalledOnce();
  });

  it('does not duplicate streamed text when reconciling the final response', async () => {
    bridge.invoke.mockImplementation(async (_command, args) => {
      bridge.onEvent?.({ payload: { ...args, kind: 'message', text: 'Real ' } });
      return { usedNativeCli: true, reply: 'Real final response' };
    });
    const store = await freshStore();
    await store.getState().sendPromptToAgent('hello');
    const response = store.getState().sessions[0].messages.find((message) => message.role === 'assistant');
    expect(response?.content).toBe('Real final response');
  });

  it('preserves partial output when a connection fails mid-stream', async () => {
    bridge.invoke.mockImplementation(async (_command, args) => {
      bridge.onEvent?.({ payload: { ...args, kind: 'message', text: 'Partial real answer' } });
      throw new Error('ACP test: connection closed');
    });
    const store = await freshStore();
    await store.getState().sendPromptToAgent('hello');
    const messages = JSON.stringify(store.getState().sessions[0].messages);
    expect(messages).toContain('Partial real answer');
    expect(messages).toContain('ACP test: connection closed');
    expect(bridge.unlisten).toHaveBeenCalledOnce();
    expect(store.getState().isStreaming).toBe(false);
  });

  it('applies a pending final reply to its original session after the user switches sessions', async () => {
    const store = await freshStore();
    bridge.invoke.mockImplementation(async () => {
      const state = store.getState();
      store.setState({
        sessions: [...state.sessions, { id: 'other-session', title: 'Other', agentId: 'claude-code', createdAt: '', messages: [] }],
        activeSessionId: 'other-session',
      });
      return { usedNativeCli: true, reply: 'Original session answer' };
    });
    await store.getState().sendPromptToAgent('hello');
    const state = store.getState();
    expect(state.activeSessionId).toBe('other-session');
    expect(state.sessions.find((session) => session.id === 'other-session')?.messages).toEqual([]);
    expect(state.sessions.find((session) => session.id === 'test-session')?.messages.at(-1)?.content).toBe('Original session answer');
  });

  it('ignores stream chunks from a different request', async () => {
    bridge.invoke.mockImplementation(async (_command, args) => {
      bridge.onEvent?.({ payload: { ...args, requestId: 'unrelated-request', kind: 'message', text: 'Other conversation' } });
      bridge.onEvent?.({ payload: { ...args, kind: 'message', text: 'Own partial answer' } });
      throw new Error('ACP test: stopped');
    });
    const store = await freshStore();
    await store.getState().sendPromptToAgent('hello');
    const messages = JSON.stringify(store.getState().sessions[0].messages);
    expect(messages).not.toContain('Other conversation');
    expect(messages).toContain('Own partial answer');
  });

  it('keeps tools running on progress updates and reports failures accurately', async () => {
    const store = await freshStore();
    bridge.invoke.mockImplementation(async (_command, args) => {
      bridge.onEvent?.({ payload: { ...args, kind: 'tool_call', text: 'Reading', toolName: 'Read', toolCallId: 'read-1', toolStatus: 'pending' } });
      bridge.onEvent?.({ payload: { ...args, kind: 'tool_update', text: 'Still reading', toolCallId: 'read-1', toolStatus: 'in_progress' } });
      const inProgress = store.getState().sessions[0].messages.find((message) => message.role === 'assistant');
      expect(inProgress?.mcpToolCalls?.[0].status).not.toBe('completed');
      bridge.onEvent?.({ payload: { ...args, kind: 'tool_update', text: 'Read failed', toolCallId: 'read-1', toolStatus: 'failed' } });
      return { usedNativeCli: true, reply: 'The tool failed.' };
    });
    await store.getState().sendPromptToAgent('hello');
    const response = store.getState().sessions[0].messages.find((message) => message.role === 'assistant');
    expect(response?.mcpToolCalls?.[0].status).toBe('failed');
  });

  it('exposes generated source as a pending proposal, without applying it automatically', async () => {
    bridge.invoke.mockResolvedValue({
      usedNativeCli: true,
      reply: 'Please review this change.',
      proposedTikz: '% real source from agent',
    });
    const store = await freshStore();
    await store.getState().sendPromptToAgent('edit');
    const response = store.getState().sessions[0].messages.find((message) => message.role === 'assistant');
    expect(response?.patchProposal?.newTikzCode).toBe('% real source from agent');
    expect(response?.patchProposal?.status).toBe('pending');
    expect(bridge.setTikzCode).not.toHaveBeenCalled();
    store.getState().applyPatchProposal(response!.id);
    expect(bridge.setTikzCode).toHaveBeenLastCalledWith('% real source from agent', true);
    store.getState().revertPatchProposal(response!.id);
    expect(bridge.setTikzCode).toHaveBeenLastCalledWith('% original canvas', true);
  });

  it('sends only the user request and current canvas, without removed figure-library references', async () => {
    const store = await freshStore();
    store.setState({ attachCanvasContext: true });
    await store.getState().sendPromptToAgent('Draw my four-stage encoder');
    const args = bridge.invoke.mock.calls[0][1];
    expect(args.canvasTikz).toBe('% original canvas');
    expect(args).not.toHaveProperty('templateReferences');
    expect(store.getState()).not.toHaveProperty('setTemplateReference');
    expect(bridge.setTikzCode).not.toHaveBeenCalled();
  });

  it('can request a new drawing without attaching any example or canvas source', async () => {
    const store = await freshStore();
    store.setState({ attachCanvasContext: false });
    await store.getState().sendPromptToAgent('Draw a new pipeline');
    const args = bridge.invoke.mock.calls[0][1];
    expect(args.canvasTikz).toBe('');
    expect(args).not.toHaveProperty('templateReferences');
  });

  it('persists customCommand to useSettingsStore and applies defaultAttachCanvas/Selection on createNewSession', async () => {
    const { useSettingsStore, buildCustomAcpCommandSpec } = await import('../useSettingsStore');
    const store = await freshStore();

    const spec = buildCustomAcpCommandSpec('my-acp-bin', '--stdio --fast', '{"API_ENV":"prod"}');
    expect(spec).toBe('{"command":"my-acp-bin","args":["--stdio","--fast"],"env":{"API_ENV":"prod"}}');

    store.getState().setCustomCommand(spec);
    expect(useSettingsStore.getState().customAcpCommand).toBe(spec);

    useSettingsStore.getState().updateSettings({
      defaultAttachCanvas: false,
      defaultAttachSelection: false,
    });
    store.setState({ attachCanvasContext: true, attachSelectionContext: true });
    store.getState().createNewSession();
    expect(store.getState().attachCanvasContext).toBe(false);
    expect(store.getState().attachSelectionContext).toBe(false);
  });

  it('forwards proxy/User-Agent to Pi, skips render_canvas_preview prompt guidance on text-only models, and streams thoughts', async () => {
    const store = await freshStore();
    const { newPiModel } = await import('../../types/pi');
    const channel = {
      id: 'custom-gw',
      name: 'Custom Gateway',
      provider: 'openai',
      api: 'openai-completions' as const,
      baseUrl: 'https://share.example.test/',
      defaultModelId: 'deepseek-v4.1-flash',
      models: [newPiModel('deepseek-v4.1-flash')],
    };
    useSettingsStore.getState().updateSettings({
      piChannels: [channel],
      piActiveChannelId: 'custom-gw',
      piProvider: 'openai',
      piModel: '',
      proxyEnabled: true,
      proxyUrl: 'http://127.0.0.1:7890',
      userAgentPreset: 'custom',
      customUserAgent: 'AgenTikZ-Pi/1.0',
    });
    store.getState().setActiveAgentId('pi');
    bridge.invoke.mockImplementation(async (command, args: any) => {
      if (command === 'pi_send_prompt') {
        bridge.onEvent?.({ payload: { requestId: args.request.requestId, kind: 'thought', text: 'Thinking step 1. ' } });
        bridge.onEvent?.({ payload: { requestId: args.request.requestId, kind: 'message', text: 'Final answer.' } });
        return { runtimeStarted: true, reply: 'Final answer.', resumed: false };
      }
      return {};
    });
    await store.getState().sendPromptToAgent('绘制双流架构图');
    const call = bridge.invoke.mock.calls.find(([cmd]) => cmd === 'pi_send_prompt')!;
    expect(call[1].request).toMatchObject({
      provider: 'openai',
      model: 'deepseek-v4.1-flash',
      proxyUrl: 'http://127.0.0.1:7890',
      userAgent: 'AgenTikZ-Pi/1.0',
      channel: expect.objectContaining({ baseUrl: 'https://share.example.test/v1' }),
    });
    expect(call[1].request.prompt).toContain('TEXTUAL LAYOUT VERIFICATION (NON-VISION MODEL)');
    expect(call[1].request.prompt).not.toContain('BOUNDED VISUAL REVIEW');
    const lastMsg = store.getState().sessions[0].messages.at(-1);
    expect(lastMsg?.thoughtProcess).toBe('Thinking step 1. ');
    expect(lastMsg?.content).toBe('Final answer.');
  });
});
