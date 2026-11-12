import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('../../core/mcp/runtime', () => ({ ensureMcpRuntime: vi.fn().mockResolvedValue(undefined) }));
import { newMcpServer, useMcpStore } from '../useMcpStore';
import { useProjectStore } from '../useProjectStore';
import { getMcpRequest } from '../../core/mcp/context';
import { exportMcpConfig } from '../../core/mcp/config';

beforeEach(() => {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  invoke.mockReset();
  useMcpStore.setState(useMcpStore.getInitialState());
  useMcpStore.setState({ loaded: true });
  useProjectStore.setState({ projectDir: null, activeCanvasFileName: 'drawing.canvas.json' });
});
afterEach(async () => {
  await useMcpStore.getState().stopExternal();
  vi.unstubAllGlobals();
});

describe('MCP service state', () => {
  it('loads backend configuration without claiming it is connected', async () => {
    const config = { schemaVersion: 1, builtinEnabled: false, servers: [{ ...newMcpServer(), name: 'notes' }] };
    invoke.mockResolvedValue(config);
    await useMcpStore.getState().load();
    expect(useMcpStore.getState().config).toEqual(config);
    expect(useMcpStore.getState().tests).toEqual({});
  });
  it('preserves the saved config on a failed save and reports the actual error', async () => {
    invoke.mockRejectedValue('Keychain unavailable');
    const before = useMcpStore.getState().config;
    expect(await useMcpStore.getState().save({ ...before, builtinEnabled: false })).toBe(false);
    expect(useMcpStore.getState().config).toBe(before);
    expect(useMcpStore.getState().error).toContain('Keychain unavailable');
    expect(useMcpStore.getState().saving).toBe(false);
  });
  it('distinguishes discovery from runtime attachment and resets stale test results on save', async () => {
    invoke.mockResolvedValue([{ name: 'echo', inputSchema: {}, description: 'Echo' }]);
    await useMcpStore.getState().test('server');
    expect(useMcpStore.getState().tests.server.phase).toBe('ready');
    expect(useMcpStore.getState().sessionStatus).toBe('');
    invoke.mockResolvedValue(useMcpStore.getState().config);
    await useMcpStore.getState().save(useMcpStore.getState().config);
    expect(useMcpStore.getState().tests).toEqual({});
  });
  it('does not simulate saving configuration in a browser', async () => {
    vi.stubGlobal('window', {});
    expect(await useMcpStore.getState().save(useMcpStore.getState().config)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('external MCP connection lifecycle', () => {
  const clientConfig = { mcpServers: { agentikz: {
    command: 'C:\\Program Files\\AgenTikZ\\agentikz-mcp.exe', args: [],
    env: { AGENTIKZ_MCP_ENDPOINT: 'http://127.0.0.1:12345/call', AGENTIKZ_MCP_TOKEN: 'temporary-secret', AGENTIKZ_MCP_SCOPE: 'canvas' },
  } } };

  it('registers the live target before starting the bridge and never persists its credentials', async () => {
    invoke.mockImplementation(async (command, args) => {
      if (command === 'mcp_start_external') {
        expect(getMcpRequest(args.requestId)).toMatchObject({ target: args.target, external: { access: 'direct' } });
        return clientConfig;
      }
    });
    await useMcpStore.getState().startExternal('direct');
    const state = useMcpStore.getState();
    expect(state.external).toMatchObject({ clientConfig, access: 'direct', target: { canvasId: 'drawing.canvas.json' } });
    expect(state.externalBusy).toBe(false);
    expect(state.externalLastCall).toBe('');
    expect(exportMcpConfig(state.config)).not.toContain('temporary-secret');
    expect(invoke).not.toHaveBeenCalledWith('mcp_save_config', expect.anything());
    const id = state.external!.requestId;
    await state.stopExternal();
    expect(getMcpRequest(id)).toBeUndefined();
    expect(useMcpStore.getState().external).toBeNull();
    expect(invoke).toHaveBeenCalledWith('mcp_stop_external', { requestId: id });
  });

  it.each(['project', 'canvas'])('revokes immediately on a %s switch, including a switch back', async (kind) => {
    invoke.mockResolvedValue(clientConfig);
    await useMcpStore.getState().startExternal('review');
    const id = useMcpStore.getState().external!.requestId;
    if (kind === 'project') useProjectStore.setState({ projectDir: 'E:\\Another project' });
    else useProjectStore.setState({ activeCanvasFileName: 'another.canvas.json' });
    expect(getMcpRequest(id)).toBeUndefined();
    expect(useMcpStore.getState().external).toBeNull();
    useProjectStore.setState({ projectDir: null, activeCanvasFileName: 'drawing.canvas.json' });
    expect(getMcpRequest(id)).toBeUndefined();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('mcp_stop_external', { requestId: id }));
  });

  it('cleans up a start that completes after it was stopped, without replacing a newer connection', async () => {
    let finish!: (value: unknown) => void;
    invoke.mockImplementation((command) => command === 'mcp_start_external'
      ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve());
    const first = useMcpStore.getState().startExternal('review');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const oldId = useMcpStore.getState().external!.requestId;
    await useMcpStore.getState().stopExternal();
    invoke.mockResolvedValue(clientConfig);
    await useMcpStore.getState().startExternal('read');
    const newId = useMcpStore.getState().external!.requestId;
    finish(clientConfig);
    await first;
    expect(useMcpStore.getState().external?.requestId).toBe(newId);
    expect(getMcpRequest(oldId)).toBeUndefined();
    expect(getMcpRequest(newId)?.external?.access).toBe('read');
    expect(invoke).toHaveBeenCalledWith('mcp_stop_external', { requestId: oldId });
  });

  it('cleans up authorization on startup failure', async () => {
    invoke.mockImplementation(async (command) => {
      if (command === 'mcp_start_external') throw new Error('Missing sidecar');
    });
    await useMcpStore.getState().startExternal('review');
    expect(useMcpStore.getState().external).toBeNull();
    expect(useMcpStore.getState().externalBusy).toBe(false);
    expect(useMcpStore.getState().error).toContain('Missing sidecar');
    const [, args] = invoke.mock.calls.find(([command]) => command === 'mcp_start_external')!;
    expect(getMcpRequest(args.requestId)).toBeUndefined();
  });

  it('disabling the master switch revokes the external connection', async () => {
    invoke.mockResolvedValue(clientConfig);
    await useMcpStore.getState().startExternal('direct');
    const id = useMcpStore.getState().external!.requestId;
    const config = { ...useMcpStore.getState().config, builtinEnabled: false };
    invoke.mockImplementation(async (command) => command === 'mcp_save_config' ? config : undefined);
    expect(await useMcpStore.getState().save(config)).toBe(true);
    expect(getMcpRequest(id)).toBeUndefined();
    expect(useMcpStore.getState().external).toBeNull();
  });

  it('does not open a bridge in the browser or with tools disabled', async () => {
    vi.stubGlobal('window', {});
    await useMcpStore.getState().startExternal('review');
    expect(invoke).not.toHaveBeenCalled();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    useMcpStore.setState({ config: { schemaVersion: 1, builtinEnabled: false, servers: [] } });
    await useMcpStore.getState().startExternal('direct');
    expect(invoke).not.toHaveBeenCalled();
    expect(useMcpStore.getState().external).toBeNull();
  });
});
