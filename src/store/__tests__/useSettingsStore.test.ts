import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'agentikz-settings-v1';
let storage: Map<string, string>;

beforeEach(() => {
  vi.resetModules();
  storage = new Map();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('agent access preferences', () => {
  it('migrates existing settings with access disabled', async () => {
    storage.set(STORAGE_KEY, JSON.stringify({ responseLanguage: 'en' }));
    const { useSettingsStore } = await import('../useSettingsStore');
    expect(useSettingsStore.getState()).toMatchObject({
      responseLanguage: 'en',
      agentFullAccess: false,
      agentWorkingDirectory: '',
    });
  });

  it('persists access and directory across restarts, and clears them on reset', async () => {
    const { useSettingsStore } = await import('../useSettingsStore');
    useSettingsStore.getState().updateSettings({
      agentFullAccess: true,
      agentWorkingDirectory: 'E:\\Research notes',
    });
    useSettingsStore.getState().updateSettings({ responseLanguage: 'en' });
    vi.resetModules();
    const { useSettingsStore: reloaded } = await import('../useSettingsStore');
    expect(reloaded.getState()).toMatchObject({
      agentFullAccess: true,
      agentWorkingDirectory: 'E:\\Research notes',
    });
    reloaded.getState().resetSettings();
    expect(JSON.parse(storage.get(STORAGE_KEY)!)).toMatchObject({
      agentFullAccess: false,
      agentWorkingDirectory: '',
    });
  });
});
