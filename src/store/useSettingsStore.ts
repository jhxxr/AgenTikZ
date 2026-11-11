import { create } from 'zustand';
import { AcpAgentId } from '../types/acp';
import { ImageGenProviderId } from '../core/agent/illustration-prompt';
import { sanitizePiChannels, sanitizePiThinkingLevel, type PiChannel, type PiThinkingLevel } from '../types/pi';

export type SettingsSection =
  | 'general'
  | 'agent'
  | 'mcp'
  | 'illustration'
  | 'editor'
  | 'doctor'
  | 'shortcuts'
  | 'about';

export type AgentResponseLanguage = 'auto' | 'zh-CN' | 'en';
export type TexEngineId = 'xelatex' | 'lualatex' | 'pdflatex';
export type TexBuildMode = 'normal' | 'force' | 'clean';

/** Engines offered in the compile menu. Only bundled engines can be selected. */
export const TEX_ENGINES: ReadonlyArray<{ id: TexEngineId; label: string; builtin: boolean; note: string }> = [
  { id: 'xelatex', label: 'XeLaTeX', builtin: true, note: '内置 · 默认 · 中文与 OpenType 字体' },
  { id: 'lualatex', label: 'LuaLaTeX', builtin: false, note: '未内置' },
  { id: 'pdflatex', label: 'pdfLaTeX', builtin: false, note: '未内置' },
];

/** Settings saved by releases that used a system TeX Live fall back to the bundled engine. */
export function sanitizeTexEngine(value: unknown): TexEngineId {
  return TEX_ENGINES.find((engine) => engine.builtin && engine.id === value)?.id ?? 'xelatex';
}
export type UserAgentPreset = 'default' | 'claude-cli' | 'codex-cli' | 'custom';

export interface PersistedSettings {
  // General & Canvas
  defaultThemeId: string;
  showGridByDefault: boolean;
  snapToGridByDefault: boolean;
  nudgeStepCm: number;
  coordPrecision: number;

  // Publication Style Guide & Figure Contract (Nature Skills)
  enforcePublicationStyleGuide: boolean;
  requireFigureContract: boolean;

  // Code Editor & built-in TeX engine
  codeFontSize: number;
  showLineNumbers: boolean;
  texEngine: TexEngineId;

  // Multi-Provider AI Cutout Illustration Engine (OpenAI gpt-image-2 / Gemini / OpenRouter)
  imageGenProvider: ImageGenProviderId;
  imageGenBaseUrl: string;
  imageGenApiKey: string;
  imageGenModel: string;
  imageGenAutoRemoveWhiteBg: boolean;
  imageGenAutoTrimAlpha: boolean;

  // Agent (BYOA · ACP)
  defaultAgentId: AcpAgentId;
  piProvider: string;
  piModel: string;
  piThinkingLevel: PiThinkingLevel;
  piChannels: PiChannel[];
  piActiveChannelId: string;
  acpModelSelections: Partial<Record<AcpAgentId, string>>;
  acpThoughtSelections: Partial<Record<AcpAgentId, string>>;
  responseLanguage: AgentResponseLanguage;
  defaultAttachCanvas: boolean;
  defaultAttachSelection: boolean;
  autoSelectAffectedNodes: boolean;
  agentFullAccess: boolean;
  /** Applies agent proposals without a review click and approves the agent's tool permission requests. */
  agentAutoMode: boolean;
  agentWorkingDirectory: string;
  proxyEnabled: boolean;
  proxyUrl: string;
  personalPrompt: string;
  userAgentPreset: UserAgentPreset;
  customUserAgent: string;
  customAcpName: string;
  customAcpCommand: string;
  customAcpArgs: string;
  customAcpEnvJson: string;
}

const STORAGE_KEY = 'agentikz-settings-v1';

export const DEFAULT_SETTINGS: PersistedSettings = {
  defaultThemeId: 'neurips',
  showGridByDefault: true,
  snapToGridByDefault: true,
  nudgeStepCm: 0.25,
  coordPrecision: 2,

  enforcePublicationStyleGuide: true,
  requireFigureContract: true,

  codeFontSize: 12,
  showLineNumbers: true,
  texEngine: 'xelatex',

  imageGenProvider: 'openai',
  imageGenBaseUrl: 'https://api.openai.com/v1',
  imageGenApiKey: '',
  imageGenModel: 'gpt-image-2',
  imageGenAutoRemoveWhiteBg: true,
  imageGenAutoTrimAlpha: true,

  defaultAgentId: 'claude-code',
  piProvider: 'anthropic',
  piModel: '',
  piThinkingLevel: 'auto',
  piChannels: [],
  piActiveChannelId: '',
  acpModelSelections: {},
  acpThoughtSelections: {},
  responseLanguage: 'zh-CN',
  defaultAttachCanvas: true,
  defaultAttachSelection: true,
  autoSelectAffectedNodes: true,
  agentFullAccess: false,
  agentAutoMode: true,
  agentWorkingDirectory: '',
  proxyEnabled: false,
  proxyUrl: 'http://127.0.0.1:7890',
  personalPrompt: '',
  userAgentPreset: 'default',
  customUserAgent: '',
  customAcpName: 'Custom ACP Agent',
  customAcpCommand: 'claude-agent-acp',
  customAcpArgs: '',
  customAcpEnvJson: '{}',
};

function loadInitialSettings(): PersistedSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    // Paths and engines of a system TeX Live are no longer settings.
    delete parsed.texLiveBinDir;
    delete parsed.paperCompileEngine;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      texEngine: sanitizeTexEngine(parsed.texEngine),
      agentAutoMode: typeof parsed.agentAutoMode === 'boolean' ? parsed.agentAutoMode : DEFAULT_SETTINGS.agentAutoMode,
      piThinkingLevel: sanitizePiThinkingLevel(parsed.piThinkingLevel),
      piChannels: sanitizePiChannels(parsed.piChannels),
      acpModelSelections: sanitizeAcpSelections(parsed.acpModelSelections),
      acpThoughtSelections: sanitizeAcpSelections(parsed.acpThoughtSelections),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function sanitizeAcpSelections(value: unknown): Partial<Record<AcpAgentId, string>> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).filter(([id, model]) =>
    ['claude-code', 'codex-cli', 'opencode', 'gemini-cli', 'cursor-agent', 'kimi-code', 'custom-acp'].includes(id) &&
    typeof model === 'string' && model.length <= 256));
}

function saveSettings(state: PersistedSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function resolveEffectiveUserAgent(
  preset: UserAgentPreset,
  customUserAgent: string
): string | undefined {
  switch (preset) {
    case 'claude-cli':
      return 'claude-cli/1.0.0 (AgenTikZ ACP)';
    case 'codex-cli':
      return 'codex-cli/1.0.0 (AgenTikZ ACP)';
    case 'custom': {
      const trimmed = customUserAgent.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    default:
      return undefined;
  }
}

/** Auto mode approves tool permission requests, which is what the full-access setting does. */
export function agentHasFullAccess(settings: Pick<PersistedSettings, 'agentFullAccess' | 'agentAutoMode'>): boolean {
  return settings.agentFullAccess || settings.agentAutoMode;
}

export function buildCustomAcpCommandSpec(
  cmd: string,
  args: string,
  envJson: string
): string {
  const cmdTrim = cmd.trim() || 'claude-agent-acp';
  if (cmdTrim.startsWith('{')) {
    return cmdTrim;
  }
  const argsList = args
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let envObj: Record<string, string> = {};
  try {
    const parsed = JSON.parse(envJson || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      envObj = parsed;
    }
  } catch {
    // fallback empty env
  }
  if (argsList.length > 0 || Object.keys(envObj).length > 0) {
    return JSON.stringify({
      command: cmdTrim,
      args: argsList,
      env: envObj,
    });
  }
  return cmdTrim;
}

interface SettingsState extends PersistedSettings {
  isOpen: boolean;
  activeSection: SettingsSection;

  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  setActiveSection: (section: SettingsSection) => void;
  updateSettings: (patch: Partial<PersistedSettings>) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => {
  const initial = loadInitialSettings();

  return {
    ...initial,
    isOpen: false,
    activeSection: 'agent',

    openSettings: (section) =>
      set((state) => ({
        isOpen: true,
        activeSection: section ?? state.activeSection,
      })),

    closeSettings: () => set({ isOpen: false }),

    setActiveSection: (section) => set({ activeSection: section }),

    updateSettings: (patch) => {
      set((state) => {
        const next: PersistedSettings = {
          defaultThemeId: patch.defaultThemeId ?? state.defaultThemeId,
          showGridByDefault: patch.showGridByDefault ?? state.showGridByDefault,
          snapToGridByDefault: patch.snapToGridByDefault ?? state.snapToGridByDefault,
          nudgeStepCm: patch.nudgeStepCm ?? state.nudgeStepCm,
          coordPrecision: patch.coordPrecision ?? state.coordPrecision,
          enforcePublicationStyleGuide:
            patch.enforcePublicationStyleGuide ?? state.enforcePublicationStyleGuide,
          requireFigureContract:
            patch.requireFigureContract ?? state.requireFigureContract,
          codeFontSize: patch.codeFontSize ?? state.codeFontSize,
          showLineNumbers: patch.showLineNumbers ?? state.showLineNumbers,
          texEngine: sanitizeTexEngine(patch.texEngine ?? state.texEngine),
          imageGenProvider: patch.imageGenProvider ?? state.imageGenProvider,
          imageGenBaseUrl: patch.imageGenBaseUrl ?? state.imageGenBaseUrl,
          imageGenApiKey: patch.imageGenApiKey ?? state.imageGenApiKey,
          imageGenModel: patch.imageGenModel ?? state.imageGenModel,
          imageGenAutoRemoveWhiteBg:
            patch.imageGenAutoRemoveWhiteBg ?? state.imageGenAutoRemoveWhiteBg,
          imageGenAutoTrimAlpha:
            patch.imageGenAutoTrimAlpha ?? state.imageGenAutoTrimAlpha,
          defaultAgentId: patch.defaultAgentId ?? state.defaultAgentId,
          piProvider: patch.piProvider ?? state.piProvider,
          piModel: patch.piModel ?? state.piModel,
          piThinkingLevel: sanitizePiThinkingLevel(patch.piThinkingLevel ?? state.piThinkingLevel),
          piChannels: sanitizePiChannels(patch.piChannels ?? state.piChannels),
          piActiveChannelId: patch.piActiveChannelId ?? state.piActiveChannelId,
          acpModelSelections: sanitizeAcpSelections(patch.acpModelSelections ?? state.acpModelSelections),
          acpThoughtSelections: sanitizeAcpSelections(patch.acpThoughtSelections ?? state.acpThoughtSelections),
          responseLanguage: patch.responseLanguage ?? state.responseLanguage,
          defaultAttachCanvas: patch.defaultAttachCanvas ?? state.defaultAttachCanvas,
          defaultAttachSelection: patch.defaultAttachSelection ?? state.defaultAttachSelection,
          autoSelectAffectedNodes: patch.autoSelectAffectedNodes ?? state.autoSelectAffectedNodes,
          agentFullAccess: patch.agentFullAccess ?? state.agentFullAccess,
          agentAutoMode: patch.agentAutoMode ?? state.agentAutoMode,
          agentWorkingDirectory: patch.agentWorkingDirectory ?? state.agentWorkingDirectory,
          proxyEnabled: patch.proxyEnabled ?? state.proxyEnabled,
          proxyUrl: patch.proxyUrl ?? state.proxyUrl,
          personalPrompt: patch.personalPrompt ?? state.personalPrompt,
          userAgentPreset: patch.userAgentPreset ?? state.userAgentPreset,
          customUserAgent: patch.customUserAgent ?? state.customUserAgent,
          customAcpName: patch.customAcpName ?? state.customAcpName,
          customAcpCommand: patch.customAcpCommand ?? state.customAcpCommand,
          customAcpArgs: patch.customAcpArgs ?? state.customAcpArgs,
          customAcpEnvJson: patch.customAcpEnvJson ?? state.customAcpEnvJson,
        };
        saveSettings(next);
        return next;
      });
    },

    resetSettings: () => {
      saveSettings(DEFAULT_SETTINGS);
      set({ ...DEFAULT_SETTINGS });
    },
  };
});
