import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePiStore } from '../usePiStore';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

beforeEach(() => {
  invoke.mockReset();
  usePiStore.setState({ models: [], error: null, isProbing: false });
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('Pi runtime catalog discovery', () => {
  it('coalesces simultaneous probes into one native process and publishes only the returned catalog', async () => {
    let complete!: (result: unknown) => void;
    invoke.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const first = usePiStore.getState().probe();
    const second = usePiStore.getState().probe();
    expect(first).toBe(second);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    expect(usePiStore.getState().isProbing).toBe(true);
    complete({ ok: true, message: 'SDK available', models: [{ provider: 'anthropic', id: 'fixture', name: 'Fixture catalog item' }] });
    await first;
    expect(usePiStore.getState().models).toHaveLength(1);
    expect(usePiStore.getState().isProbing).toBe(false);
  });

  it('clears a previously detected catalog if the runtime becomes unavailable', async () => {
    usePiStore.setState({ models: [{ provider: 'anthropic', id: 'old', name: 'Old catalog' }] });
    invoke.mockRejectedValue(new Error('Node runtime not found'));
    expect(await usePiStore.getState().probe()).toMatchObject({ ok: false, message: 'Node runtime not found' });
    expect(usePiStore.getState().models).toEqual([]);
    expect(usePiStore.getState().isProbing).toBe(false);
  });

  it('does not simulate a runtime or invoke native commands in browser mode', async () => {
    vi.stubGlobal('window', {});
    expect(await usePiStore.getState().probe()).toMatchObject({ ok: false });
    expect(invoke).not.toHaveBeenCalled();
    expect(usePiStore.getState().models).toEqual([]);
  });
});
