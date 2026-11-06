import { create } from 'zustand';
import { AcpAgentId } from '../types/acp';

export type SettingsSection =
  | 'general'
  | 'agent'
  | 'editor'
  | 'doctor'
  | 'shortcuts'
  | 'about';

export type AgentResponseLanguage = 'auto' | 'zh-CN' | 'en';
export type TexEngineId = 'latex' | 'pdflatex' | 'xelatex';
export type UserAgentPreset = 'default' | 'claude-cli' | 'codex-cli' | 'custom';

export interface PersistedSettings {
  // General & Canvas
  defaultThemeId: string;
  showGridByDefault: boolean;
  snapToGridByDefault: boolean;
  nudgeStepCm: number;
  coordPrecision: number;

  // Code Editor & TeX
  codeFontSize: number;
  showLineNumbers: boolean;
  texEngine: TexEngineId;

  // Agent (BYOA · ACP)
  defaultAgentId: AcpAgentId;
  responseLanguage: AgentResponseLanguage;
  defaultAttachCanvas: boolean;
  defaultAttachSelection: boolean;
  autoSelectAffectedNodes: boolean;
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

  codeFontSize: 12,
  showLineNumbers: true,
  texEngine: 'latex',

  defaultAgentId: 'claude-code',
  responseLanguage: 'zh-CN',
  defaultAttachCanvas: true,
  defaultAttachSelection: true,
  autoSelectAffectedNodes: true,
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
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
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

export const useSettingsStore = create<SettingsState>((set, get) => {
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
          codeFontSize: patch.codeFontSize ?? state.codeFontSize,
          showLineNumbers: patch.showLineNumbers ?? state.showLineNumbers,
          texEngine: patch.texEngine ?? state.texEngine,
          defaultAgentId: patch.defaultAgentId ?? state.defaultAgentId,
          responseLanguage: patch.responseLanguage ?? state.responseLanguage,
          defaultAttachCanvas: patch.defaultAttachCanvas ?? state.defaultAttachCanvas,
          defaultAttachSelection: patch.defaultAttachSelection ?? state.defaultAttachSelection,
          autoSelectAffectedNodes: patch.autoSelectAffectedNodes ?? state.autoSelectAffectedNodes,
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
