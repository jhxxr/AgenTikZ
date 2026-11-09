import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  setTikzCode: vi.fn(),
  canvasCode: '% original canvas',
  revision: 0,
  projectDir: 'E:\\Research\\current-project',
  workbenchMode: 'figure' as 'figure' | 'paper',
  projectListeners: new Set<(state: any, previous: any) => void>(),
  onEvent: undefined as undefined | ((event: { payload: Record<string, unknown> }) => void),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: bridge.listen }));
vi.mock('../../core/mcp/runtime', () => ({ ensureMcpRuntime: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../useProjectStore', () => ({
  getPaperWorkspaceVersion: () => 0,
  useProjectStore: {
    subscribe: vi.fn((callback) => {
      bridge.projectListeners.add(callback);
      return () => { bridge.projectListeners.delete(callback); };
    }),
    getState: () => ({
      projectDir: bridge.projectDir, workbenchMode: bridge.workbenchMode,
      activePaperFilePath: 'main.tex', paperFileContents: { 'main.tex': 'Unsaved manuscript' },
      paperFiles: [{ relativePath: 'main.tex', category: 'main' }], paperDirtyFiles: { 'main.tex': true },
      paperEditRevision: 3,
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
  const { useAgentStore } = await import('../useAgentStore');
  useAgentStore.setState({
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
  vi.resetModules();
  vi.clearAllMocks();
  bridge.onEvent = undefined;
  bridge.canvasCode = '% original canvas';
  bridge.revision = 0;
  bridge.projectDir = 'E:\\Research\\current-project';
  bridge.workbenchMode = 'figure';
  bridge.projectListeners.clear();
  bridge.setTikzCode.mockImplementation((code: string) => { bridge.canvasCode = code; bridge.revision += 1; });
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  bridge.listen.mockImplementation(async (_name, callback) => {
    bridge.onEvent = callback;
    return bridge.unlisten;
  });
  bridge.invoke.mockResolvedValue({ usedNativeCli: true, reply: 'Real final response' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('real ACP frontend contract', () => {
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
      conversationId: 'test-session', provider: 'anthropic', model: 'fixture', thinkingLevel: 'medium',
      target: expect.objectContaining({ projectId: bridge.projectDir }),
    }) });
    const args = bridge.invoke.mock.calls[0][1].request;
    expect(args).not.toHaveProperty('apiKey');
    expect(args).not.toHaveProperty('fullAccess');
    expect(args.prompt).toContain('Unsaved manuscript');
    expect(store.getState().sessions[0].messages.at(-1)?.content).toBe('Pi response');
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
    await vi.waitFor(() => expect(bridge.invoke).toHaveBeenCalledWith('pi_reset_runtime'));
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
    expect(JSON.stringify(store.getState().sessions)).toContain('选择 provider');
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
});
