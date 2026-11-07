import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  setTikzCode: vi.fn(),
  onEvent: undefined as undefined | ((event: { payload: Record<string, unknown> }) => void),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: bridge.listen }));
vi.mock('../useWorkspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => ({
      tikzCode: '% original canvas',
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
  });
  return useAgentStore;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  bridge.onEvent = undefined;
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

  it('attaches composition guidance independently of current canvas code', async () => {
    const store = await freshStore();
    store.setState({ attachCanvasContext: true });
    store.getState().setTemplateReference('tpl_cvpr_3d_pyramid');
    expect(bridge.setTikzCode).not.toHaveBeenCalled();
    expect(bridge.invoke).not.toHaveBeenCalled();
    await store.getState().sendPromptToAgent('Draw my four-stage encoder');
    const args = bridge.invoke.mock.calls[0][1];
    expect(args.canvasTikz).toBe('% original canvas');
    const references = JSON.parse(args.templateReferences);
    expect(references.selectedTemplateId).toBe('tpl_cvpr_3d_pyramid');
    expect(references.references).toHaveLength(1);
    expect(args.templateReferences).not.toContain('tikzpicture');
    expect(args.templateReferences).not.toContain('128\\\\times');
    expect(store.getState().sessions[0].messages[0].templateReferenceId).toBe('tpl_cvpr_3d_pyramid');
    expect(bridge.setTikzCode).not.toHaveBeenCalled();
  });

  it('keeps reference choice in its session and allows clearing it', async () => {
    const store = await freshStore();
    store.getState().setTemplateReference('tpl_iclr_qkv_attention');
    store.getState().createNewSession();
    expect(store.getState().sessions[0].templateReferenceId).toBeUndefined();
    store.getState().switchSession('test-session');
    expect(store.getState().sessions.find((s) => s.id === 'test-session')?.templateReferenceId).toBe('tpl_iclr_qkv_attention');
    store.getState().setTemplateReference();
    store.setState({ attachCanvasContext: false });
    await store.getState().sendPromptToAgent('Draw a new pipeline');
    const args = bridge.invoke.mock.calls[0][1];
    expect(args.canvasTikz).toBe('');
    expect(JSON.parse(args.templateReferences).selectedTemplateId).toBeNull();
    expect(JSON.parse(args.templateReferences).references.length).toBeGreaterThan(1);
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
