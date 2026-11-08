import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { newMcpServer, useMcpStore } from '../useMcpStore';

beforeEach(() => {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  invoke.mockReset();
  useMcpStore.setState(useMcpStore.getInitialState());
  useMcpStore.setState({ loaded: true });
});
afterEach(() => vi.unstubAllGlobals());

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
