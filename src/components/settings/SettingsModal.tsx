import React, { useEffect, useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  Globe,
  HelpCircle,
  Keyboard,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Stethoscope,
  Terminal,
  Wrench,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  SettingsSection,
  useSettingsStore,
  AgentResponseLanguage,
  TexEngineId,
  UserAgentPreset,
  DEFAULT_SETTINGS,
  buildCustomAcpCommandSpec,
} from '../../store/useSettingsStore';
import { useAgentStore } from '../../store/useAgentStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { JOURNAL_THEMES } from '../../core/themes/journal-presets';
import { JournalThemeId } from '../../types/theme';
import { AcpAgentId, EnvironmentDiagnostics } from '../../types/acp';
import {
  SettingsGroup,
  SettingsPageTitle,
  SettingsRow,
  SettingsSectionLabel,
  SettingsToggle,
  StatusBadge,
} from './SettingsLayout';

const NAV_ITEMS: Array<{
  id: SettingsSection;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'agent',
    label: 'Agent (ACP)',
    sublabel: 'BYOA 适配器与本地 CLI',
    icon: <Bot className="w-4 h-4" />,
  },
  {
    id: 'general',
    label: '通用与画布',
    sublabel: '期刊配色、网格与对齐',
    icon: <Sliders className="w-4 h-4" />,
  },
  {
    id: 'editor',
    label: '代码与 TeX',
    sublabel: '编辑器字号与编译引擎',
    icon: <Code2 className="w-4 h-4" />,
  },
  {
    id: 'doctor',
    label: '环境诊断',
    sublabel: 'Node / ACP / TeX 检测',
    icon: <Stethoscope className="w-4 h-4" />,
  },
  {
    id: 'shortcuts',
    label: '快捷键',
    sublabel: '绘图与排版键盘加速',
    icon: <Keyboard className="w-4 h-4" />,
  },
  {
    id: 'about',
    label: '关于 AgenTikZ',
    sublabel: '架构说明与版本信息',
    icon: <HelpCircle className="w-4 h-4" />,
  },
];

export const SettingsModal: React.FC = () => {
  const {
    isOpen,
    activeSection,
    closeSettings,
    setActiveSection,
    defaultThemeId,
    showGridByDefault,
    snapToGridByDefault,
    nudgeStepCm,
    coordPrecision,
    codeFontSize,
    showLineNumbers,
    texEngine,
    defaultAgentId,
    responseLanguage,
    defaultAttachCanvas,
    defaultAttachSelection,
    autoSelectAffectedNodes,
    proxyEnabled,
    proxyUrl,
    personalPrompt,
    userAgentPreset,
    customUserAgent,
    customAcpCommand,
    customAcpArgs,
    customAcpEnvJson,
    updateSettings,
    resetSettings,
  } = useSettingsStore();

  const {
    providers,
    activeAgentId,
    customCommand,
    setActiveAgentId,
    setCustomCommand,
    setAttachCanvasContext,
    setAttachSelectionContext,
    probeLocalAgents,
    testAgentHandshake,
  } = useAgentStore();

  const {
    activeThemeId,
    showGrid,
    snapToGrid,
    setActiveTheme,
    setShowGrid,
    setSnapToGrid,
  } = useWorkspaceStore();

  const [isProbingAll, setIsProbingAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<EnvironmentDiagnostics | null>(null);
  const [isLoadingDiag, setIsLoadingDiag] = useState(false);

  // Sync Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeSettings]);

  // Automatically probe agents & environment when modal opens
  useEffect(() => {
    if (!isOpen) return;
    probeLocalAgents();
    if (activeSection === 'doctor' && !diagnostics) {
      runEnvDiagnostics();
    }
  }, [isOpen, activeSection]);

  if (!isOpen) return null;

  const handleRefreshAgents = async () => {
    setIsProbingAll(true);
    try {
      await probeLocalAgents();
    } finally {
      setIsProbingAll(false);
    }
  };

  const runEnvDiagnostics = async () => {
    setIsLoadingDiag(true);
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<EnvironmentDiagnostics>('sys_probe_environment');
        setDiagnostics(res);
      } else {
        setDiagnostics({
          nodeAvailable: false,
          adaptersStaged: false,
          tools: [
            {
              id: 'browser',
              name: '浏览器预览模式',
              available: false,
              note: '本地进程诊断需要在 Tauri 桌面客户端中运行',
            },
          ],
        });
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingDiag(false);
    }
  };

  const handleCopyCommand = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleSaveCustomAcp = () => {
    const serialized = buildCustomAcpCommandSpec(
      customAcpCommand,
      customAcpArgs,
      customAcpEnvJson
    );
    setCustomCommand(serialized);
    setTimeout(() => probeLocalAgents(), 50);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeSettings();
      }}
    >
      <div className="flex h-[680px] max-h-[90vh] w-[920px] max-w-[96vw] overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50 shadow-2xl">
        {/* Left Navigation Sidebar (Agentero macOS System Settings style) */}
        <aside className="flex w-[225px] shrink-0 flex-col justify-between border-r border-slate-200/80 bg-slate-100/90 p-3 select-none">
          <div>
            <div className="mb-3 flex items-center gap-2 px-2.5 pt-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
                <Settings className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[13px] font-bold tracking-tight text-slate-900">
                  偏好设置
                </div>
                <div className="text-[10px] text-slate-500">
                  AgenTikZ Studio · ACP
                </div>
              </div>
            </div>

            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-white text-blue-600 shadow-xs ring-1 ring-slate-200/80 font-semibold'
                        : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        active
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-slate-200/70 text-slate-600'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] leading-tight">
                        {item.label}
                      </div>
                      <div className="truncate text-[10px] font-normal text-slate-400 mt-0.5">
                        {item.sublabel}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-2.5 text-[10.5px] text-slate-500">
            <div className="flex items-center justify-between font-medium text-slate-700 mb-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                BYOA 零密钥策略
              </span>
              <span className="font-mono text-[9.5px] text-slate-400">ACP v1</span>
            </div>
            <p className="leading-relaxed text-[10px] text-slate-500">
              复用本机已登录的 CLI Agent 与内置 ACP 适配器，不上传或托管任何 API Key。
            </p>
          </div>
        </aside>

        {/* Right Content Area */}
        <div className="flex min-w-0 flex-1 flex-col bg-slate-50/70">
          {/* Top close bar */}
          <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-6 py-3 backdrop-blur-xs">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>设置中心</span>
              <span>/</span>
              <span className="font-semibold text-slate-800">
                {NAV_ITEMS.find((i) => i.id === activeSection)?.label}
              </span>
            </div>
            <button
              type="button"
              onClick={closeSettings}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              title="关闭设置 (Esc)"
            >
              <X className="h-3.5 w-3.5" />
              <span>关闭</span>
            </button>
          </div>

          {/* Scrollable Pane Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* ==================== 1. AGENT (ACP) PANE ==================== */}
            {activeSection === 'agent' && (
              <div>
                <SettingsPageTitle
                  title="Agent 协作设置 (BYOA · ACP)"
                  subtitle="参考 Agentero 双层检测架构：优先使用系统 PATH 适配器，并为 Claude Code 与 Codex CLI 提供应用内置 ACP 适配器自动回退。"
                  action={
                    <button
                      type="button"
                      onClick={handleRefreshAgents}
                      disabled={isProbingAll}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 text-blue-600 ${
                          isProbingAll ? 'animate-spin' : ''
                        }`}
                      />
                      <span>重新扫描本机 Agent</span>
                    </button>
                  }
                />

                {/* Default Agent & General Agent Preferences */}
                <SettingsSectionLabel
                  title="默认 Agent 与协作策略"
                  description="配置右侧 Agent 协作窗口的默认引擎、响应语言与上下文自动挂载行为。"
                />
                <SettingsGroup>
                  <SettingsRow
                    label="当前默认 ACP Agent"
                    description="新会话与右侧协作面板默认连接的本地 Agent"
                  >
                    <select
                      value={activeAgentId}
                      onChange={(e) => {
                        const nextId = e.target.value as AcpAgentId;
                        setActiveAgentId(nextId);
                        updateSettings({ defaultAgentId: nextId });
                      }}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-medium text-slate-800 outline-none focus:border-blue-500"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.detected ? '● 已就绪' : '○ 未就绪'}
                        </option>
                      ))}
                    </select>
                  </SettingsRow>

                  <SettingsRow
                    label="Agent 解释与回复语言"
                    description="控制 Agent 解释修改思路时使用的自然语言（TikZ 宏与标识符始终保持标准 LaTeX）"
                  >
                    <select
                      value={responseLanguage}
                      onChange={(e) =>
                        updateSettings({
                          responseLanguage: e.target.value as AgentResponseLanguage,
                        })
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-medium text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="zh-CN">简体中文 (zh-CN)</option>
                      <option value="en">English (en)</option>
                      <option value="auto">自动跟随提问语言 (Auto)</option>
                    </select>
                  </SettingsRow>

                  <SettingsRow
                    label="默认附加 @canvas 完整画布源码"
                    description="每次提问时自动将当前 tikzpicture 源码作为上下文发送给 Agent"
                  >
                    <SettingsToggle
                      checked={defaultAttachCanvas}
                      onChange={(checked) => {
                        updateSettings({ defaultAttachCanvas: checked });
                        setAttachCanvasContext(checked);
                      }}
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="默认附加 @选中 图元节点 ID"
                    description="将画布当前选中的模块或曲线坐标轴 ID 注入提示词，便于局部精准修改"
                  >
                    <SettingsToggle
                      checked={defaultAttachSelection}
                      onChange={(checked) => {
                        updateSettings({ defaultAttachSelection: checked });
                        setAttachSelectionContext(checked);
                      }}
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="应用 TikZ 补丁后自动高亮受影响节点"
                    description="点击「应用此修改」后，在画布上自动选中关联模块以便立即微调"
                  >
                    <SettingsToggle
                      checked={autoSelectAffectedNodes}
                      onChange={(checked) =>
                        updateSettings({ autoSelectAffectedNodes: checked })
                      }
                    />
                  </SettingsRow>
                </SettingsGroup>

                {/* Common Agents Catalog (Agentero 2-layer detection + Handshake Probe) */}
                <SettingsSectionLabel
                  title="常见 Agent 目录与双层状态探测"
                  description="第 1 层检测本机 CLI 可执行文件；第 2 层匹配内置或 PATH 上的 ACP 协议适配器。点击「握手测试」可验证真实 stdio 通信。"
                />
                <SettingsGroup>
                  {providers
                    .filter((p) => p.id !== 'custom-acp')
                    .map((provider) => {
                      const isCurrent = activeAgentId === provider.id;
                      const isTesting = provider.handshakeStatus === 'testing';
                      return (
                        <div key={provider.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: provider.badgeColor }}
                                />
                                <span className="text-[13px] font-semibold text-slate-900">
                                  {provider.name}
                                </span>

                                {/* Layer 1: Host CLI status */}
                                {provider.binaryAvailable ? (
                                  <StatusBadge
                                    tone="emerald"
                                    title={provider.resolvedPath || '已在 PATH 中检测到 CLI'}
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>CLI 已安装</span>
                                  </StatusBadge>
                                ) : (
                                  <StatusBadge tone="slate">
                                    <span>CLI 未安装</span>
                                  </StatusBadge>
                                )}

                                {/* Layer 2: Bundled ACP Adapter or PATH Adapter */}
                                {provider.acpBundled && (
                                  <StatusBadge
                                    tone="blue"
                                    title="AgenTikZ 已内置官方 @agentclientprotocol 适配器，无需单独安装 *-acp 包"
                                  >
                                    <span>
                                      内置适配器 v{provider.acpBundledVersion || '1.0'}
                                    </span>
                                  </StatusBadge>
                                )}

                                {/* Overall ACP Readiness */}
                                {provider.detected ? (
                                  <StatusBadge tone="emerald">
                                    <span>{provider.version || 'ACP 就绪'}</span>
                                  </StatusBadge>
                                ) : (
                                  <StatusBadge tone="amber">
                                    <span>待安装/配置</span>
                                  </StatusBadge>
                                )}

                                {/* Layer 3: Active Handshake Result */}
                                {provider.handshakeStatus === 'ok' && (
                                  <StatusBadge tone="purple">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    <span>
                                      握手通过
                                      {provider.handshakeAgentName
                                        ? ` · ${provider.handshakeAgentName}`
                                        : ''}
                                    </span>
                                  </StatusBadge>
                                )}
                                {provider.handshakeStatus === 'error' && (
                                  <StatusBadge tone="rose">
                                    <AlertCircle className="h-2.5 w-2.5" />
                                    <span>握手失败</span>
                                  </StatusBadge>
                                )}
                              </div>

                              <p className="mt-1 text-[11px] text-slate-500">
                                {provider.description}
                              </p>

                              {provider.resolvedPath && (
                                <div className="mt-1 flex items-center gap-1.5 text-[10.5px] font-mono text-slate-400 truncate">
                                  <Terminal className="h-3 w-3 shrink-0" />
                                  <span className="truncate" title={provider.resolvedPath}>
                                    {provider.resolvedPath}
                                  </span>
                                </div>
                              )}

                              {provider.handshakeMessage && (
                                <div
                                  className={`mt-1.5 rounded-lg px-2.5 py-1 text-[10.5px] ${
                                    provider.handshakeStatus === 'ok'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                                      : provider.handshakeStatus === 'error'
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200/70'
                                      : 'bg-blue-50 text-blue-700'
                                  }`}
                                >
                                  {provider.handshakeMessage}
                                </div>
                              )}

                              {!provider.detected && provider.installHint && (
                                <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-slate-100/90 px-2.5 py-1 text-[10.5px] font-mono text-slate-600">
                                  <span className="truncate flex-1">
                                    $ {provider.installHint}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyCommand(
                                        provider.id,
                                        provider.installHint!
                                      )
                                    }
                                    className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-sans font-medium text-slate-700 shadow-2xs hover:bg-slate-50 cursor-pointer shrink-0"
                                  >
                                    {copiedId === provider.id ? (
                                      <>
                                        <Check className="h-2.5 w-2.5 text-emerald-600" />
                                        <span>已复制</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-2.5 w-2.5 text-slate-500" />
                                        <span>复制安装命令</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isTesting}
                                onClick={() => testAgentHandshake(provider.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                                title="启动子进程并发送 ACP InitializeRequest(V1) 验证协议连通性"
                              >
                                {isTesting ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                                ) : (
                                  <Play className="h-3 w-3 text-blue-600" />
                                )}
                                <span>握手测试</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setActiveAgentId(provider.id);
                                  updateSettings({ defaultAgentId: provider.id });
                                }}
                                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                                  isCurrent
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {isCurrent ? '当前使用' : '设为默认'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </SettingsGroup>

                {/* Network Proxy & User-Agent (Agentero AgentCommonRows / UserAgentBlock) */}
                <SettingsSectionLabel
                  title="网络代理与请求头亲和 (Proxy & User-Agent)"
                  description="为本地 ACP Agent 子进程注入 HTTP_PROXY / HTTPS_PROXY 环境变量与自定义 User-Agent。"
                />
                <SettingsGroup>
                  <SettingsRow
                    label="为本地 ACP Agent 启用网络代理"
                    description="开启后自动向 Agent 进程注入 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY"
                  >
                    <SettingsToggle
                      checked={proxyEnabled}
                      onChange={(checked) => updateSettings({ proxyEnabled: checked })}
                    />
                  </SettingsRow>

                  {proxyEnabled && (
                    <SettingsRow
                      label="代理服务器地址 (Proxy URL)"
                      description="支持 HTTP 或 SOCKS5 代理，例如 http://127.0.0.1:7890"
                    >
                      <input
                        type="text"
                        value={proxyUrl}
                        onChange={(e) => updateSettings({ proxyUrl: e.target.value })}
                        placeholder="http://127.0.0.1:7890"
                        className="w-64 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] font-mono text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </SettingsRow>
                  )}

                  <SettingsRow
                    label="User-Agent 标识策略"
                    description="为部分中转网关或企业代理注入兼容的客户端 User-Agent"
                  >
                    <select
                      value={userAgentPreset}
                      onChange={(e) =>
                        updateSettings({
                          userAgentPreset: e.target.value as UserAgentPreset,
                        })
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-medium text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="default">保持 CLI 默认 (Default)</option>
                      <option value="claude-cli">Claude CLI 亲和标识</option>
                      <option value="codex-cli">Codex CLI 亲和标识</option>
                      <option value="custom">自定义 User-Agent...</option>
                    </select>
                  </SettingsRow>

                  {userAgentPreset === 'custom' && (
                    <SettingsRow
                      label="自定义 User-Agent 字符串"
                      description="将通过 USER_AGENT 与 HTTP_USER_AGENT 环境变量传递给子进程"
                    >
                      <input
                        type="text"
                        value={customUserAgent}
                        onChange={(e) =>
                          updateSettings({ customUserAgent: e.target.value })
                        }
                        placeholder="MyCustomAgent/1.0"
                        className="w-64 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] font-mono text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </SettingsRow>
                  )}
                </SettingsGroup>

                {/* Personal Prompt Block (Agentero AgentPersonalPromptBlock) */}
                <SettingsSectionLabel
                  title="个人绘图附加提示词 (Personal Prompt)"
                  description="在此定义的科研绘图规范将自动附加到每一次 Agent 请求中（例如字体字号、箭头样式、宏包约定）。"
                />
                <SettingsGroup>
                  <div className="p-4">
                    <textarea
                      rows={3}
                      value={personalPrompt}
                      onChange={(e) =>
                        updateSettings({ personalPrompt: e.target.value })
                      }
                      placeholder="例如：优先使用 >=stealth 箭头与 rounded corners=2pt；数学向量统一使用 \mathbf{}；模块间距保持在 1.5cm 以上..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[12px] leading-relaxed text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                    />
                    <div className="mt-2 flex items-center justify-between text-[10.5px] text-slate-400">
                      <span>留空则仅使用 AgenTikZ 标准科研绘图提示词</span>
                      {personalPrompt.trim() && (
                        <button
                          type="button"
                          onClick={() => updateSettings({ personalPrompt: '' })}
                          className="text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          清空内容
                        </button>
                      )}
                    </div>
                  </div>
                </SettingsGroup>

                {/* Custom ACP Agent Configuration (Agentero AgentCustomForm) */}
                <SettingsSectionLabel
                  title="自定义 ACP Agent (Custom stdio Agent)"
                  description="接入任何兼容 Agent Client Protocol (JSON-RPC 2.0 over stdio) 的本地可执行程序或脚本。"
                />
                <SettingsGroup>
                  <div className="space-y-3 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          可执行文件命令或绝对路径 (command)
                        </label>
                        <input
                          type="text"
                          value={customAcpCommand}
                          onChange={(e) =>
                            updateSettings({ customAcpCommand: e.target.value })
                          }
                          placeholder="例如: my-acp-agent 或 C:\tools\agent.exe"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-mono text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          启动参数 (args，以空格分隔)
                        </label>
                        <input
                          type="text"
                          value={customAcpArgs}
                          onChange={(e) =>
                            updateSettings({ customAcpArgs: e.target.value })
                          }
                          placeholder="例如: --acp --stdio"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-mono text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        附加环境变量 (JSON 对象，可选)
                      </label>
                      <input
                        type="text"
                        value={customAcpEnvJson}
                        onChange={(e) =>
                          updateSettings({ customAcpEnvJson: e.target.value })
                        }
                        placeholder='例如: {"FOO":"1"} 或 {}'
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-mono text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        直接编辑生效的完整命令或 JSON (customCommand)
                      </label>
                      <input
                        type="text"
                        value={customCommand}
                        onChange={(e) => setCustomCommand(e.target.value)}
                        placeholder='例如: claude-agent-acp 或 {"command":"node","args":["agent.js"],"env":{"FOO":"1"}}'
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-mono text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500">
                        当前生效配置: <code className="font-mono text-slate-700">{customCommand}</code>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSaveCustomAcp}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          根据上方字段生成配置
                        </button>
                        <button
                          type="button"
                          onClick={() => testAgentHandshake('custom-acp')}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-700 cursor-pointer"
                        >
                          <Play className="h-3 w-3" />
                          <span>探测并握手自定义 Agent</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </SettingsGroup>
              </div>
            )}

            {/* ==================== 2. GENERAL & CANVAS PANE ==================== */}
            {activeSection === 'general' && (
              <div>
                <SettingsPageTitle
                  title="通用与画布设置"
                  subtitle="管理顶会/期刊默认配色方案、画布参考网格、磁吸对齐精度与方向键微调步长。"
                />

                <SettingsSectionLabel
                  title="学术期刊与会议配色规范 (Publication Theme)"
                  description="切换后会立即更新画布渲染及导出的完整 .tex 导言区色彩定义。"
                />
                <SettingsGroup>
                  <SettingsRow
                    label="当前画布与默认期刊主题"
                    description={JOURNAL_THEMES[activeThemeId]?.description}
                  >
                    <select
                      value={activeThemeId}
                      onChange={(e) => {
                        const nextTheme = e.target.value as JournalThemeId;
                        setActiveTheme(nextTheme);
                        updateSettings({ defaultThemeId: nextTheme });
                      }}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-medium text-slate-800 outline-none focus:border-blue-500"
                    >
                      {Object.values(JOURNAL_THEMES).map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.name} ({theme.fontFamily})
                        </option>
                      ))}
                    </select>
                  </SettingsRow>
                </SettingsGroup>

                <SettingsSectionLabel
                  title="画布网格与交互对齐"
                  description="控制矢量画布的网格线显示、拖拽吸附与坐标数值精度。"
                />
                <SettingsGroup>
                  <SettingsRow
                    label="显示画布参考网格 (Grid)"
                    description="在画布背景显示厘米级辅助网格线"
                  >
                    <SettingsToggle
                      checked={showGrid}
                      onChange={(checked) => {
                        setShowGrid(checked);
                        updateSettings({ showGridByDefault: checked });
                      }}
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="拖拽与缩放磁吸对齐 (Snap to Grid)"
                    description="拖拽节点或控制点时自动吸附到网格刻度与邻近节点中心线"
                  >
                    <SettingsToggle
                      checked={snapToGrid}
                      onChange={(checked) => {
                        setSnapToGrid(checked);
                        updateSettings({ snapToGridByDefault: checked });
                      }}
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="键盘方向键微调步长 (Nudge Step)"
                    description="选中图元后按方向键单次移动的 TikZ 坐标距离 (cm)"
                  >
                    <select
                      value={String(nudgeStepCm)}
                      onChange={(e) =>
                        updateSettings({ nudgeStepCm: parseFloat(e.target.value) })
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-medium text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="0.1">0.10 cm (精细微调)</option>
                      <option value="0.25">0.25 cm (标准网格)</option>
                      <option value="0.5">0.50 cm (快速移动)</option>
                    </select>
                  </SettingsRow>

                  <SettingsRow
                    label="TikZ 坐标写回小数精度"
                    description="画布拖拽同步写回 TikZ 代码时的坐标保留位数"
                  >
                    <select
                      value={String(coordPrecision)}
                      onChange={(e) =>
                        updateSettings({
                          coordPrecision: parseInt(e.target.value, 10),
                        })
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-medium text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="1">保留 1 位小数 (如 2.5)</option>
                      <option value="2">保留 2 位小数 (如 2.45)</option>
                    </select>
                  </SettingsRow>
                </SettingsGroup>

                <SettingsSectionLabel
                  title="重置偏好设置"
                  description="将所有设置项恢复为出厂默认状态（不会清空当前画布代码）。"
                />
                <SettingsGroup>
                  <SettingsRow
                    label="恢复默认偏好设置"
                    description={`当前默认主题: ${defaultThemeId} · 默认 Agent: ${defaultAgentId}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        resetSettings();
                        setActiveTheme(DEFAULT_SETTINGS.defaultThemeId as JournalThemeId);
                        setShowGrid(DEFAULT_SETTINGS.showGridByDefault);
                        setSnapToGrid(DEFAULT_SETTINGS.snapToGridByDefault);
                        setActiveAgentId(DEFAULT_SETTINGS.defaultAgentId);
                        setAttachCanvasContext(DEFAULT_SETTINGS.defaultAttachCanvas);
                        setAttachSelectionContext(DEFAULT_SETTINGS.defaultAttachSelection);
                        setCustomCommand(DEFAULT_SETTINGS.customAcpCommand);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11.5px] font-medium text-rose-700 hover:bg-rose-100 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>重置所有设置</span>
                    </button>
                  </SettingsRow>
                </SettingsGroup>
              </div>
            )}

            {/* ==================== 3. CODE EDITOR & TEX ENGINE PANE ==================== */}
            {activeSection === 'editor' && (
              <div>
                <SettingsPageTitle
                  title="代码编辑器与本地 TeX 引擎"
                  subtitle="配置左侧 TikZ 源码面板 (CodeMirror 6) 的显示效果，以及本地 TeX Live 真实编译预览的参数。"
                />

                <SettingsSectionLabel
                  title="TikZ 源码编辑器 (CodeMirror 6)"
                  description="修改后将实时应用于左侧代码面板。"
                />
                <SettingsGroup>
                  <SettingsRow
                    label="代码编辑器字号 (Font Size)"
                    description="调整左侧 TikZ / PGFPlots 代码编辑器的等宽字体大小"
                  >
                    <select
                      value={String(codeFontSize)}
                      onChange={(e) =>
                        updateSettings({
                          codeFontSize: parseInt(e.target.value, 10),
                        })
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-medium text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="11">11 px (紧凑)</option>
                      <option value="12">12 px (默认推荐)</option>
                      <option value="13">13 px (舒适)</option>
                      <option value="14">14 px (大字号)</option>
                      <option value="15">15 px (演示模式)</option>
                    </select>
                  </SettingsRow>

                  <SettingsRow
                    label="显示代码行号 (Line Numbers)"
                    description="在代码面板左侧显示行号与模块定位标记 (L12)"
                  >
                    <SettingsToggle
                      checked={showLineNumbers}
                      onChange={(checked) =>
                        updateSettings({ showLineNumbers: checked })
                      }
                    />
                  </SettingsRow>
                </SettingsGroup>

                <SettingsSectionLabel
                  title="本地 TeX Live 编译引擎偏好"
                  description="画布平时使用内置零延迟 SVG+KaTeX 引擎实时交互；点击顶栏「TeX」按钮时调用此处选择的本地编译器。"
                />
                <SettingsGroup>
                  <SettingsRow
                    label="首选本地 LaTeX 编译器"
                    description="配合 dvisvgm 将编译产物转换为高保真矢量 SVG"
                  >
                    <select
                      value={texEngine}
                      onChange={(e) =>
                        updateSettings({
                          texEngine: e.target.value as TexEngineId,
                        })
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-medium text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="latex">latex + dvisvgm (DVI 极速模式 · 默认)</option>
                      <option value="pdflatex">pdflatex + dvisvgm --pdf (PDF 标准模式)</option>
                      <option value="xelatex">xelatex -no-pdf + dvisvgm (Unicode / CJK 支持)</option>
                    </select>
                  </SettingsRow>
                </SettingsGroup>
              </div>
            )}

            {/* ==================== 4. ENVIRONMENT DOCTOR PANE ==================== */}
            {activeSection === 'doctor' && (
              <div>
                <SettingsPageTitle
                  title="系统环境诊断 (Environment Doctor)"
                  subtitle="检测本机 Node.js 运行时、内置 ACP 适配器资源包及 TeX Live 编译工具链状态。"
                  action={
                    <button
                      type="button"
                      onClick={runEnvDiagnostics}
                      disabled={isLoadingDiag}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 text-blue-600 ${
                          isLoadingDiag ? 'animate-spin' : ''
                        }`}
                      />
                      <span>重新诊断环境</span>
                    </button>
                  }
                />

                <SettingsSectionLabel
                  title="ACP 适配器宿主环境"
                  description="Claude Code 与 Codex CLI 的内置 ACP 适配器通过本机 Node.js 运行。"
                />
                <SettingsGroup>
                  <SettingsRow
                    label="Node.js 运行时"
                    description={
                      diagnostics?.nodePath ||
                      '用于启动内置 @agentclientprotocol/* JS 适配器'
                    }
                    badge={
                      diagnostics?.nodeAvailable ? (
                        <StatusBadge tone="emerald">
                          <span>{diagnostics.nodeVersion || '已就绪'}</span>
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="amber">
                          <span>未检测到</span>
                        </StatusBadge>
                      )
                    }
                  />
                  <SettingsRow
                    label="内置 ACP 适配器资源包 (Bundled Adapters)"
                    description={
                      diagnostics?.adaptersRoot ||
                      '包含 claude-agent-acp 与 codex-acp 离线 JS 树'
                    }
                    badge={
                      diagnostics?.adaptersStaged ? (
                        <StatusBadge tone="emerald">
                          <span>已就绪 (Staged)</span>
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="amber">
                          <span>未找到 manifest.json</span>
                        </StatusBadge>
                      )
                    }
                  />
                </SettingsGroup>

                <SettingsSectionLabel
                  title="本地命令行工具链明细"
                  description="自动合并系统 PATH 与常见包管理器路径（npm、pnpm、WinGet、Scoop、Cargo、~/.local/bin）。"
                />
                <SettingsGroup>
                  {(diagnostics?.tools || []).map((tool) => (
                    <SettingsRow
                      key={tool.id}
                      label={tool.name}
                      description={
                        <div className="space-y-0.5">
                          <div>{tool.note}</div>
                          {tool.path && (
                            <div className="font-mono text-[10px] text-slate-400">
                              {tool.path}
                            </div>
                          )}
                        </div>
                      }
                      badge={
                        tool.available ? (
                          <StatusBadge tone="emerald">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>已安装</span>
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="slate">
                            <span>未安装</span>
                          </StatusBadge>
                        )
                      }
                    />
                  ))}
                </SettingsGroup>
              </div>
            )}

            {/* ==================== 5. KEYBOARD SHORTCUTS PANE ==================== */}
            {activeSection === 'shortcuts' && (
              <div>
                <SettingsPageTitle
                  title="键盘快捷键速查"
                  subtitle="熟练使用快捷键可显著提升科研架构图与实验曲线的排版效率。"
                />

                <SettingsSectionLabel title="全局与视图控制" />
                <SettingsGroup>
                  {[
                    ['打开/关闭偏好设置', 'Ctrl + ,'],
                    ['撤销上一步修改 (Undo)', 'Ctrl + Z'],
                    ['重做修改 (Redo)', 'Ctrl + Y / Ctrl + Shift + Z'],
                    ['全选画布图元', 'Ctrl + A'],
                    ['复制选中图元 (Duplicate)', 'Ctrl + D'],
                    ['删除选中图元', 'Delete / Backspace'],
                    ['画布平移 (Pan)', '按住 Space 拖拽 / 鼠标中键'],
                    ['画布缩放 (Zoom)', 'Ctrl + 鼠标滚轮'],
                  ].map(([label, keys]) => (
                    <SettingsRow key={label} label={label}>
                      <kbd className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                        {keys}
                      </kbd>
                    </SettingsRow>
                  ))}
                </SettingsGroup>

                <SettingsSectionLabel title="画布图元操作" />
                <SettingsGroup>
                  {[
                    ['多选/加选节点', 'Shift + 点击节点'],
                    ['框选多个节点 (Marquee)', '在空白处拖拽框选'],
                    ['精细移动选中节点', '↑ / ↓ / ← / → 方向键'],
                    ['大步长移动选中节点', 'Shift + 方向键'],
                    ['原位编辑节点文字/LaTeX 公式', '双击节点或文字'],
                    ['取消当前选中 / 退出连线模式', 'Esc'],
                  ].map(([label, keys]) => (
                    <SettingsRow key={label} label={label}>
                      <kbd className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                        {keys}
                      </kbd>
                    </SettingsRow>
                  ))}
                </SettingsGroup>
              </div>
            )}

            {/* ==================== 6. ABOUT PANE ==================== */}
            {activeSection === 'about' && (
              <div>
                <SettingsPageTitle
                  title="关于 AgenTikZ Studio"
                  subtitle="面向深度学习与自然科学论文的科研绘图 IDE · 双向无损 TikZ AST 同步与原生 ACP Agent 协作。"
                />

                <SettingsGroup>
                  <SettingsRow
                    label="应用版本"
                    description="Tauri v2 + React 19 + Rust + CodeMirror 6"
                  >
                    <StatusBadge tone="blue">v0.2.0 (BYOA · ACP Edition)</StatusBadge>
                  </SettingsRow>

                  <SettingsRow
                    label="Agent 协议架构"
                    description="遵循 Agent Client Protocol (ACP v1) 标准，内置 @agentclientprotocol/claude-agent-acp 与 codex-acp 适配器"
                  >
                    <StatusBadge tone="emerald">JSON-RPC 2.0 / stdio</StatusBadge>
                  </SettingsRow>

                  <SettingsRow
                    label="双向 AST 同步引擎"
                    description="支持画布拖拽、8 控制点缩放、分组容器、PGFPlots 实验曲线与 TikZ 源码毫秒级无损互转"
                  >
                    <StatusBadge tone="purple">Lossless TikZ AST</StatusBadge>
                  </SettingsRow>
                </SettingsGroup>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
