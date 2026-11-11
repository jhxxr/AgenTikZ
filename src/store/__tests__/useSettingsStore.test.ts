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
  it('persists multiple independent channels and model selections but strips nested credentials', async () => {
    const { useSettingsStore } = await import('../useSettingsStore');
    const { newPiModel } = await import('../../types/pi');
    const models = [{ ...newPiModel('same-model'), apiKey: 'nested-model-secret' }];
    useSettingsStore.getState().updateSettings({
      piChannels: [
        { id: 'channel-one', name: 'One', provider: 'openai', api: 'openai-completions',
          baseUrl: 'https://one.test/v1', models, apiKey: 'nested-channel-secret' },
        { id: 'channel-two', name: 'Two', provider: 'openai', api: 'openai-responses',
          baseUrl: 'https://two.test/api/v1', models },
      ] as any,
      piActiveChannelId: 'channel-two', piModel: 'same-model',
      acpModelSelections: { 'claude-code': 'claude-fixture', 'codex-cli': 'codex-fixture' },
    });
    const stored = storage.get(STORAGE_KEY)!;
    expect(stored).not.toContain('secret');
    vi.resetModules();
    const { useSettingsStore: reloaded } = await import('../useSettingsStore');
    expect(reloaded.getState().piChannels).toHaveLength(2);
    expect(reloaded.getState()).toMatchObject({ piActiveChannelId: 'channel-two',
      acpModelSelections: { 'claude-code': 'claude-fixture', 'codex-cli': 'codex-fixture' } });
    reloaded.getState().updateSettings({ piChannels: reloaded.getState().piChannels.filter((channel) => channel.id !== 'channel-one') });
    expect(JSON.parse(storage.get(STORAGE_KEY)!).piChannels).toHaveLength(1);
  });

  it('persists non-secret Pi and ACP thinking preferences without accepting a key into settings storage', async () => {
    const { useSettingsStore } = await import('../useSettingsStore');
    useSettingsStore.getState().updateSettings({
      defaultAgentId: 'pi', piProvider: 'anthropic', piModel: 'fixture', piThinkingLevel: 'xhigh',
      acpThoughtSelections: { 'codex-cli': 'high', 'claude-code': 'medium' },
      ...({ piApiKey: 'secret-fixture-do-not-persist' } as Record<string, string>),
    });
    const saved = JSON.parse(storage.get(STORAGE_KEY)!);
    expect(saved).toMatchObject({
      defaultAgentId: 'pi',
      piModel: 'fixture',
      piThinkingLevel: 'xhigh',
      acpThoughtSelections: { 'codex-cli': 'high', 'claude-code': 'medium' },
    });
    expect(saved).not.toHaveProperty('piApiKey');
    expect(storage.get(STORAGE_KEY)).not.toContain('secret-fixture');
    vi.resetModules();
    const { useSettingsStore: reloaded } = await import('../useSettingsStore');
    expect(reloaded.getState()).toMatchObject({
      defaultAgentId: 'pi',
      piModel: 'fixture',
      piThinkingLevel: 'xhigh',
      acpThoughtSelections: { 'codex-cli': 'high', 'claude-code': 'medium' },
    });
    reloaded.getState().updateSettings({ piThinkingLevel: 'invalid-level' as any });
    expect(reloaded.getState().piThinkingLevel).toBe('auto');
    reloaded.getState().resetSettings();
    expect(reloaded.getState()).toMatchObject({ defaultAgentId: 'claude-code', piModel: '', piThinkingLevel: 'auto', acpThoughtSelections: {} });
  });

  it('defaults to automatic mode, persists an explicit opt-out, and restores it on reset', async () => {
    const { useSettingsStore, agentHasFullAccess } = await import('../useSettingsStore');
    expect(useSettingsStore.getState().agentAutoMode).toBe(true);
    expect(agentHasFullAccess(useSettingsStore.getState())).toBe(true);
    expect(useSettingsStore.getState().agentFullAccess).toBe(false);
    useSettingsStore.getState().updateSettings({ agentAutoMode: false, responseLanguage: 'en' });
    vi.resetModules();
    const { useSettingsStore: reloaded, agentHasFullAccess: reloadedAccess } = await import('../useSettingsStore');
    expect(reloaded.getState()).toMatchObject({ agentAutoMode: false, agentFullAccess: false });
    expect(reloadedAccess(reloaded.getState())).toBe(false);
    reloaded.getState().resetSettings();
    expect(JSON.parse(storage.get(STORAGE_KEY)!)).toMatchObject({ agentAutoMode: true, agentFullAccess: false });
  });

  it.each(['true', 'false', 1, null])('keeps the automatic default for a non-boolean stored value %s', async (value) => {
    storage.set(STORAGE_KEY, JSON.stringify({ agentAutoMode: value }));
    const { useSettingsStore } = await import('../useSettingsStore');
    expect(useSettingsStore.getState().agentAutoMode).toBe(true);
  });

  it('migrates existing settings with access disabled', async () => {
    storage.set(STORAGE_KEY, JSON.stringify({ responseLanguage: 'en' }));
    const { useSettingsStore } = await import('../useSettingsStore');
    expect(useSettingsStore.getState()).toMatchObject({
      responseLanguage: 'en',
      agentFullAccess: false,
      agentAutoMode: true,
      agentWorkingDirectory: '',
    });
  });

  it('drops system TeX Live settings and falls back to the bundled engine', async () => {
    storage.set(STORAGE_KEY, JSON.stringify({
      texEngine: 'latex', texLiveBinDir: 'D:/texlive/2025/bin/windows', paperCompileEngine: 'pdflatex',
    }));
    const { useSettingsStore, sanitizeTexEngine, TEX_ENGINES } = await import('../useSettingsStore');
    expect(useSettingsStore.getState().texEngine).toBe('xelatex');
    expect(useSettingsStore.getState()).not.toHaveProperty('texLiveBinDir');
    expect(useSettingsStore.getState()).not.toHaveProperty('paperCompileEngine');
    // Engines that are not bundled can be listed but never selected.
    expect(TEX_ENGINES.filter((engine) => engine.builtin).map((engine) => engine.id)).toEqual(['xelatex']);
    useSettingsStore.getState().updateSettings({ texEngine: 'lualatex' });
    expect(useSettingsStore.getState().texEngine).toBe('xelatex');
    expect(sanitizeTexEngine('pdflatex')).toBe('xelatex');
    expect(JSON.parse(storage.get(STORAGE_KEY)!)).not.toHaveProperty('texLiveBinDir');
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

  it('normalizes gateway URLs per protocol and uses 128k/32k defaults for custom Pi models', async () => {
    const { useSettingsStore } = await import('../useSettingsStore');
    const { newPiModel, normalizePiChannelBaseUrl } = await import('../../types/pi');
    expect(newPiModel('deepseek-v4.1-flash')).toMatchObject({
      id: 'deepseek-v4.1-flash',
      reasoning: true,
      contextWindow: 128000,
      maxTokens: 32768,
    });
    expect(normalizePiChannelBaseUrl('https://share.example.test/', 'openai-completions')).toBe('https://share.example.test/v1');
    expect(normalizePiChannelBaseUrl('https://share.example.test/v1', 'anthropic-messages')).toBe('https://share.example.test');
    useSettingsStore.getState().updateSettings({
      piChannels: [
        { id: 'openai-gw', name: 'OpenAI GW', provider: 'openai', api: 'openai-completions', baseUrl: 'https://share.example.test/', models: [newPiModel('deepseek-v4.1-flash')] },
        { id: 'claude-gw', name: 'Claude GW', provider: 'anthropic', api: 'anthropic-messages', baseUrl: 'https://share.example.test/v1', models: [newPiModel('deepseek-v4.1-flash')] },
      ],
    });
    expect(useSettingsStore.getState().piChannels.map((c) => c.baseUrl)).toEqual([
      'https://share.example.test/v1',
      'https://share.example.test',
    ]);
  });

  it('migrates legacy 32k/4096 Pi channel models while preserving explicit user token overrides', async () => {
    storage.set(STORAGE_KEY, JSON.stringify({
      piChannels: [
        {
          id: 'legacy-gw',
          name: 'Legacy GW',
          provider: 'openai',
          api: 'openai-completions',
          baseUrl: 'https://gateway.example.test',
          models: [
            { id: 'deepseek-v4.1-flash', name: 'deepseek-v4.1-flash', reasoning: false, supportsImages: false, contextWindow: 32768, maxTokens: 4096 },
            { id: 'custom-explicit', name: 'custom-explicit', reasoning: false, supportsImages: false, contextWindow: 65536, maxTokens: 8192 },
          ],
        },
      ],
    }));
    const { useSettingsStore } = await import('../useSettingsStore');
    const models = useSettingsStore.getState().piChannels[0].models;
    expect(models[0]).toMatchObject({
      id: 'deepseek-v4.1-flash',
      reasoning: true,
      contextWindow: 128000,
      maxTokens: 32768,
    });
    expect(models[1]).toMatchObject({
      id: 'custom-explicit',
      reasoning: false,
      contextWindow: 65536,
      maxTokens: 8192,
    });
  });
});
