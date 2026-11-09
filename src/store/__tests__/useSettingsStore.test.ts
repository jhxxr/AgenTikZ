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
  it('persists non-secret Pi model preferences without accepting a key into settings storage', async () => {
    const { useSettingsStore } = await import('../useSettingsStore');
    useSettingsStore.getState().updateSettings({
      defaultAgentId: 'pi', piProvider: 'anthropic', piModel: 'fixture', piThinkingLevel: 'high',
      ...({ piApiKey: 'secret-fixture-do-not-persist' } as Record<string, string>),
    });
    const saved = JSON.parse(storage.get(STORAGE_KEY)!);
    expect(saved).toMatchObject({ defaultAgentId: 'pi', piModel: 'fixture', piThinkingLevel: 'high' });
    expect(saved).not.toHaveProperty('piApiKey');
    expect(storage.get(STORAGE_KEY)).not.toContain('secret-fixture');
    vi.resetModules();
    const { useSettingsStore: reloaded } = await import('../useSettingsStore');
    expect(reloaded.getState()).toMatchObject({ defaultAgentId: 'pi', piModel: 'fixture', piThinkingLevel: 'high' });
    reloaded.getState().resetSettings();
    expect(reloaded.getState()).toMatchObject({ defaultAgentId: 'claude-code', piModel: '', piThinkingLevel: 'medium' });
  });

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
