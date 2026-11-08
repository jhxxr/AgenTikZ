import { create } from 'zustand';
import {
  AcpAgentId,
  AcpAgentProvider,
  AcpHandshakeResult,
  AcpStreamEvent,
  AgentChatMessage,
  AgentSession,
  TikzPatchProposal,
} from '../types/acp';
import { useWorkspaceStore } from './useWorkspaceStore';
import { useProjectStore } from './useProjectStore';
import { useMcpStore } from './useMcpStore';
import { currentCanvasTarget, endMcpRequest, proposalConflict, registerMcpRequest } from '../core/mcp/context';
import { buildAgentSkillAndLibraryContext } from '../core/agent/agent-knowledge';
import { compileUserPromptWithStyleGuide } from '../core/agent/prompt-compiler';
import {
  computeTikzDiff,
  extractAgentDirectives,
  resolveAgentPatchFromReply,
} from '../core/agent/tikz-diff';
import {
  analyzeTikzLayout,
  autoRepairTikzLayout,
} from '../core/agent/layout-diagnostics';
import { JOURNAL_THEMES } from '../core/themes/journal-presets';
import { JournalThemeId } from '../types/theme';
import {
  buildCustomAcpCommandSpec,
  resolveEffectiveUserAgent,
  useSettingsStore,
} from './useSettingsStore';

export type LocalAgentSkillId =
  | 'full_optimize'
  | 'auto_layout'
  | 'theme_colorize'
  | 'diagnose_canvas';

const DEFAULT_ACP_PROVIDERS: AcpAgentProvider[] = [
  { id: 'claude-code', name: 'Claude Code (ACP)', command: 'claude-agent-acp', args: [],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)', detected: false,
    description: '内置 claude-agent-acp 适配器（或优先使用 PATH 适配器），驱动本地 claude CLI', badgeColor: '#D97706' },
  { id: 'opencode', name: 'OpenCode (ACP)', command: 'opencode', args: ['acp'],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)', detected: false,
    description: '连接本地 OpenCode 原生 ACP 程序 (opencode acp)', badgeColor: '#2563EB' },
  { id: 'codex-cli', name: 'Codex CLI (ACP)', command: 'codex-acp', args: [],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)', detected: false,
    description: '内置 codex-acp 适配器（或优先使用 PATH 适配器），驱动本地 codex CLI', badgeColor: '#059669' },
  { id: 'gemini-cli', name: 'Gemini CLI (ACP)', command: 'gemini', args: ['--acp'],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)', detected: false,
    description: '连接本地 Gemini ACP 程序', badgeColor: '#7C3AED' },
  { id: 'cursor-agent', name: 'Cursor Agent (ACP)', command: 'cursor-agent', args: ['acp'],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)', detected: false,
    description: '连接本地 Cursor Agent ACP 程序', badgeColor: '#F97316' },
  { id: 'kimi-code', name: 'Kimi Code (ACP)', command: 'kimi', args: ['acp'],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)', detected: false,
    description: '连接本地 Kimi ACP 程序', badgeColor: '#06B6D4' },
  { id: 'custom-acp', name: '自定义 ACP Agent', command: 'custom-agent-acp', args: ['--stdio'],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)', detected: false,
    description: '配置兼容 ACP 的本地可执行文件和参数', badgeColor: '#475569' },
];

interface AgentStoreState {
  providers: AcpAgentProvider[];
  activeAgentId: AcpAgentId;
  customCommand: string;
  attachCanvasContext: boolean;
  attachSelectionContext: boolean;
  autoLayoutRepairEnabled: boolean;
  isStreaming: boolean;
  activeRequestId: string | null;
  sessions: AgentSession[];
  activeSessionId: string;
  setActiveAgentId: (id: AcpAgentId) => void;
  setCustomCommand: (cmd: string) => void;
  setAttachCanvasContext: (attach: boolean) => void;
  setAttachSelectionContext: (attach: boolean) => void;
  setAutoLayoutRepairEnabled: (enabled: boolean) => void;
  createNewSession: () => void;
  switchSession: (sessionId: string) => void;
  probeLocalAgents: () => Promise<void>;
  testAgentHandshake: (agentId: AcpAgentId) => Promise<AcpHandshakeResult>;
  sendPromptToAgent: (promptText: string) => Promise<void>;
  cancelPrompt: () => Promise<void>;
  runLocalAgentSkill: (skillId: LocalAgentSkillId) => void;
  applyPatchProposal: (messageId: string) => boolean;
  revertPatchProposal: (messageId: string) => void;
}

const initialSettings = useSettingsStore.getState();
const initialSessionId = 'session_1';
const initialSession: AgentSession = {
  id: initialSessionId, title: '新会话', agentId: initialSettings.defaultAgentId, createdAt: '刚刚',
  messages: [{
    id: 'msg_welcome', role: 'system', agentId: initialSettings.defaultAgentId,
    timestamp: new Date().toTimeString().slice(0, 5),
    content: '已挂载 AgenTikZ 智能绘图引擎（AST 语义解析 · 增量 Diff 补丁 · 防重叠几何排障 · 顶刊语义配色 · 组件库规范）。\n\n你可以直接用自然语言描述新架构或局部修改需求，或点击上方「Agent 快捷技能」一键自动修复画布重叠、无框公式与顶刊配色。',
  }],
};

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  providers: DEFAULT_ACP_PROVIDERS,
  activeAgentId: initialSettings.defaultAgentId,
  customCommand: buildCustomAcpCommandSpec(
    initialSettings.customAcpCommand,
    initialSettings.customAcpArgs,
    initialSettings.customAcpEnvJson
  ),
  attachCanvasContext: initialSettings.defaultAttachCanvas,
  attachSelectionContext: initialSettings.defaultAttachSelection,
  autoLayoutRepairEnabled: true,
  isStreaming: false,
  activeRequestId: null,
  sessions: [initialSession],
  activeSessionId: initialSessionId,

  setActiveAgentId: (activeAgentId) => set({ activeAgentId }),
  setCustomCommand: (customCommand) => {
    set({ customCommand });
    useSettingsStore.getState().updateSettings({ customAcpCommand: customCommand });
  },
  setAttachCanvasContext: (attachCanvasContext) => set({ attachCanvasContext }),
  setAttachSelectionContext: (attachSelectionContext) => set({ attachSelectionContext }),
  setAutoLayoutRepairEnabled: (autoLayoutRepairEnabled) => set({ autoLayoutRepairEnabled }),
  createNewSession: () => {
    const { activeAgentId, sessions } = get();
    const prefs = useSettingsStore.getState();
    const id = `session_${crypto.randomUUID()}`;
    set({
      attachCanvasContext: prefs.defaultAttachCanvas,
      attachSelectionContext: prefs.defaultAttachSelection,
      sessions: [{
        id, title: `会话 #${sessions.length + 1}`, agentId: activeAgentId, createdAt: '刚刚',
        messages: [{
          id: `msg_${id}`, role: 'system', agentId: activeAgentId,
          timestamp: new Date().toTimeString().slice(0, 5),
          content: '新对话已创建。已注入组件库、顶刊配色规范与增量 Diff 协议。',
        }],
      }, ...sessions],
      activeSessionId: id,
    });
  },
  switchSession: (activeSessionId) => {
    const session = get().sessions.find((item) => item.id === activeSessionId);
    if (session) set({ activeSessionId, activeAgentId: session.agentId });
  },
  probeLocalAgents: async () => {
    try {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
      const { invoke } = await import('@tauri-apps/api/core');
      const results = await invoke<Array<{
        id: string;
        detected: boolean;
        version?: string;
        binaryAvailable?: boolean;
        resolvedPath?: string;
        acpBundled?: boolean;
        acpBundledVersion?: string;
        installHint?: string;
        diagnostic?: string;
      }>>('acp_probe_agents', { customCommand: get().customCommand });
      set((state) => ({
        providers: state.providers.map((provider) => {
          const found = results.find((item) => item.id === provider.id);
          return found
            ? {
                ...provider,
                detected: found.detected,
                version: found.version || undefined,
                binaryAvailable: found.binaryAvailable ?? found.detected,
                resolvedPath: found.resolvedPath || undefined,
                acpBundled: found.acpBundled ?? false,
                acpBundledVersion: found.acpBundledVersion || undefined,
                installHint: found.installHint || undefined,
                diagnostic: found.diagnostic || undefined,
              }
            : provider;
        }),
      }));
    } catch {
      set((state) => ({
        providers: state.providers.map((provider) => ({ ...provider, detected: false })),
      }));
    }
  },
  testAgentHandshake: async (agentId) => {
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === agentId
          ? { ...p, handshakeStatus: 'testing', handshakeMessage: '正在执行 ACP Initialize 握手探测...' }
          : p
      ),
    }));
    try {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
        const res: AcpHandshakeResult = {
          ok: false,
          message: '浏览器预览模式不支持本地 ACP 进程握手，请在 Tauri 桌面端测试。',
        };
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === agentId ? { ...p, handshakeStatus: 'error', handshakeMessage: res.message } : p
          ),
        }));
        return res;
      }
      const { invoke } = await import('@tauri-apps/api/core');
      const settings = useSettingsStore.getState();
      const proxyUrl = settings.proxyEnabled ? settings.proxyUrl : undefined;
      const userAgent = resolveEffectiveUserAgent(settings.userAgentPreset, settings.customUserAgent);
      const res = await invoke<AcpHandshakeResult>('acp_test_agent', {
        agentId,
        customCommand: get().customCommand,
        proxyUrl,
        userAgent,
      });
      set((state) => ({
        providers: state.providers.map((p) =>
          p.id === agentId
            ? {
                ...p,
                detected: res.ok ? true : p.detected,
                handshakeStatus: res.ok ? 'ok' : 'error',
                handshakeMessage: res.message,
                handshakeAgentName: res.agentName
                  ? `${res.agentName}${res.agentVersion ? ` v${res.agentVersion}` : ''}`
                  : undefined,
              }
            : p
        ),
      }));
      return res;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const res: AcpHandshakeResult = { ok: false, message: msg };
      set((state) => ({
        providers: state.providers.map((p) =>
          p.id === agentId ? { ...p, handshakeStatus: 'error', handshakeMessage: msg } : p
        ),
      }));
      return res;
    }
  },
  cancelPrompt: async () => {
    const requestId = get().activeRequestId;
    if (!requestId) return;
    endMcpRequest(requestId);
    const { invoke } = await import('@tauri-apps/api/core');
    try { await invoke('acp_cancel_prompt', { requestId }); }
    catch (error) { useMcpStore.setState({ sessionStatus: String(error) }); }
  },
  sendPromptToAgent: async (promptText) => {
    if (!promptText.trim() || get().isStreaming) return;
    const { activeAgentId, activeSessionId, attachSelectionContext, attachCanvasContext, customCommand, sessions } = get();
    const workspace = useWorkspaceStore.getState();
    const activeThemeId = workspace.activeThemeId || 'neurips';
    const activeSession = sessions.find((session) => session.id === activeSessionId);
    const history = (activeSession?.messages || [])
      .filter((message) => message.role !== 'system')
      .map(({ role, content }) => ({ role, content }));
    const userMessage: AgentChatMessage = {
      id: `user_${crypto.randomUUID()}`, role: 'user', agentId: activeAgentId,
      timestamp: new Date().toTimeString().slice(0, 5), content: promptText.trim(),
      contextSelectionIds: attachSelectionContext ? [...workspace.selectedIds] : [],
      includeFullCanvas: attachCanvasContext,
    };
    set((state) => ({
      isStreaming: true,
      sessions: state.sessions.map((session) => session.id === activeSessionId
        ? { ...session, agentId: activeAgentId,
            title: session.messages.length <= 1 ? promptText.trim().slice(0, 22) : session.title,
            messages: [...session.messages, userMessage] }
        : session),
    }));
    try {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
        throw new Error('本地 ACP 需要 Tauri 桌面应用；浏览器模式不能连接本地 Agent，不会生成模拟回复。');
      }
      const settings = useSettingsStore.getState();
      const canvasTikz = attachCanvasContext ? workspace.tikzCode : '';
      const selectedIds = attachSelectionContext ? [...workspace.selectedIds] : [];
      const agentContext = buildAgentSkillAndLibraryContext(
        activeThemeId,
        canvasTikz,
        selectedIds,
        {
          enforcePublicationStyleGuide: settings.enforcePublicationStyleGuide,
          requireFigureContract: settings.requireFigureContract,
        }
      );
      const compiledPrompt = compileUserPromptWithStyleGuide(
        promptText,
        activeThemeId,
        {
          enforcePublicationStyleGuide: settings.enforcePublicationStyleGuide,
          requireFigureContract: settings.requireFigureContract,
        }
      );
      await sendViaRealAcp(
        activeAgentId,
        compiledPrompt,
        canvasTikz,
        selectedIds,
        activeSessionId,
        customCommand,
        history,
        agentContext,
        activeThemeId,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      set((state) => ({ sessions: state.sessions.map((session) => session.id === activeSessionId
        ? { ...session, messages: [...session.messages, {
            id: `error_${crypto.randomUUID()}`, role: 'system' as const, agentId: activeAgentId,
            timestamp: new Date().toTimeString().slice(0, 5), content: `ACP 错误：${detail}`,
          }] }
        : session) }));
    } finally {
      set({ isStreaming: false });
    }
  },
  runLocalAgentSkill: (skillId) => {
    const { activeAgentId, activeSessionId, sessions } = get();
    const workspace = useWorkspaceStore.getState();
    const activeThemeId = workspace.activeThemeId || 'neurips';
    const theme = JOURNAL_THEMES[activeThemeId] || JOURNAL_THEMES.neurips;
    const currentTikz = workspace.tikzCode || '';
    const timestamp = new Date().toTimeString().slice(0, 5);

    if (!currentTikz.trim()) {
      const emptyMsg: AgentChatMessage = {
        id: `skill_${crypto.randomUUID()}`,
        role: 'system',
        agentId: activeAgentId,
        timestamp,
        content: '当前画布为空。请先添加基础组件，或通过下方输入框让 Agent 根据你的需求绘图。',
      };
      set({
        sessions: sessions.map((s) =>
          s.id === activeSessionId ? { ...s, messages: [...s.messages, emptyMsg] } : s
        ),
      });
      return;
    }

    const beforeReport = analyzeTikzLayout(currentTikz, activeThemeId);

    if (skillId === 'diagnose_canvas') {
      const issueLines =
        beforeReport.issues.length > 0
          ? beforeReport.issues.map(
              (iss, i) => `${i + 1}. **[${iss.severity === 'error' ? '严重' : iss.severity === 'warning' ? '警告' : '建议'}]** ${iss.message}`
            )
          : ['✅ 未检测到节点重叠、箭头遮挡、容器越界或无配色纯白模块。'];

      const diagMessage: AgentChatMessage = {
        id: `skill_${crypto.randomUUID()}`,
        role: 'assistant',
        agentId: activeAgentId,
        timestamp,
        thoughtProcess: `执行 AST 几何碰撞检测与 ${theme.name} 配色审查...`,
        mcpToolCalls: [
          { toolName: 'get_canvas_ast', argsSummary: '解析画布节点与边集合', status: 'completed', source: 'local' },
          { toolName: 'inspect_layout_diagnostics', argsSummary: `theme=${activeThemeId}`, status: 'completed', source: 'local' },
        ],
        content: `### 📐 画布 AST 与几何布局诊断报告\n- **布局健康评分**：\`${beforeReport.score} / 100\`\n- **当前顶刊主题**：${theme.name}\n\n${issueLines.join('\n')}${
          beforeReport.issues.length > 0
            ? '\n\n💡 点击上方 **「✨ 一键综合精修」** 即可自动生成无重叠、带顶刊语义配色的增量 Diff 补丁。'
            : ''
        }`,
      };
      set({
        sessions: sessions.map((s) =>
          s.id === activeSessionId ? { ...s, messages: [...s.messages, diagMessage] } : s
        ),
      });
      return;
    }

    const repairResult = autoRepairTikzLayout(currentTikz, activeThemeId);
    const diff = computeTikzDiff(currentTikz, repairResult.tikzCode);

    const skillTitles: Record<LocalAgentSkillId, string> = {
      full_optimize: `✨ 一键综合精修（防重叠排障 + ${theme.name.split(' ')[0]} 配色 + 组件规范化）`,
      auto_layout: '📐 自动几何排障与箭头留白扩展',
      theme_colorize: `🎨 应用 ${theme.name} 语义配色方案`,
      diagnose_canvas: '🔍 画布诊断',
    };

    const hasChanges = repairResult.tikzCode.trim() !== currentTikz.trim();
    const repairBullets =
      repairResult.repairs.length > 0
        ? repairResult.repairs.map((r) => `- ${r}`).join('\n')
        : '- 当前画布布局与配色已符合顶刊规范，无需额外调整。';

    const assistantMsg: AgentChatMessage = {
      id: `skill_${crypto.randomUUID()}`,
      role: 'assistant',
      agentId: activeAgentId,
      timestamp,
      thoughtProcess: `分析画布 AST -> 检测垂直间距/重叠/无框标签 -> 注入 ${theme.name} 语义色板 -> 生成增量 Diff 补丁`,
      mcpToolCalls: [
        { toolName: 'get_canvas_ast', argsSummary: '提取节点坐标与包围盒', status: 'completed', source: 'local' },
        { toolName: 'inspect_layout_diagnostics', argsSummary: `score=${beforeReport.score}->${repairResult.afterReport.score}`, status: 'completed', source: 'local' },
        { toolName: 'auto_repair_layout', argsSummary: `${repairResult.repairs.length} 项优化`, status: 'completed', source: 'local' },
      ],
      content: `### ${skillTitles[skillId]}\n${repairBullets}\n\n- **布局健康度提升**：\`${beforeReport.score}/100\` → \`${repairResult.afterReport.score}/100\`\n- **AST 变更统计**：新增 \`${diff.addedCount}\` 项 / 修改 \`${diff.modifiedCount}\` 项 / 移除 \`${diff.removedCount}\` 项（共涉及 ${diff.affectedElementIds.length} 个元素）`,
      patchProposal: hasChanges
        ? {
            id: `patch_${crypto.randomUUID()}`,
            summary: skillTitles[skillId],
            rationale: `自动执行 ${repairResult.repairs.length} 项几何布局、组件规范与 ${theme.name} 语义配色修复。`,
            newTikzCode: repairResult.tikzCode,
            affectedElementIds: diff.affectedElementIds,
            status: 'pending',
            mode: 'surgical_diff',
            semanticItems: diff.semanticItems,
            diffLines: diff.diffLines,
            autoRepairs: repairResult.repairs,
            layoutScore: repairResult.afterReport.score,
            fitCanvasOnApply: true,
            targetCanvas: currentCanvasTarget(activeSessionId),
            baseTikzCode: currentTikz,
            baseRevision: workspace.sourceRevision ?? 0,
          }
        : undefined,
    };

    set({
      sessions: sessions.map((s) =>
        s.id === activeSessionId ? { ...s, messages: [...s.messages, assistantMsg] } : s
      ),
    });
  },
  applyPatchProposal: (messageId) => {
    const { sessions, activeSessionId } = get();
    const message = sessions.find((session) => session.id === activeSessionId)?.messages.find((item) => item.id === messageId);
    if (!message?.patchProposal || message.patchProposal.status === 'applied') return false;
    const conflict = proposalConflict(message.patchProposal);
    if (conflict) {
      updateAgentMessage(activeSessionId, messageId, (item) => ({ ...item, content: `${item.content}\n\n提案未应用：${conflict}` }));
      return false;
    }
    const workspace = useWorkspaceStore.getState();
    const currentCode = workspace.tikzCode;
    const recTheme = message.patchProposal.recommendedThemeId;
    if (recTheme && recTheme in JOURNAL_THEMES) {
      workspace.setActiveTheme?.(recTheme as JournalThemeId);
    }
    workspace.setTikzCode(message.patchProposal.newTikzCode, true);
    if (message.patchProposal.fitCanvasOnApply) {
      workspace.fitCanvasToContent?.();
    }
    if (
      useSettingsStore.getState().autoSelectAffectedNodes &&
      message.patchProposal.affectedElementIds.length > 0
    ) {
      workspace.setSelectedIds(message.patchProposal.affectedElementIds);
    }
    updateAgentMessage(activeSessionId, messageId, (item) => ({ ...item,
      patchProposal: item.patchProposal ? { ...item.patchProposal, status: 'applied', previousTikzCode: currentCode } : undefined,
    }));
    return true;
  },
  revertPatchProposal: (messageId) => {
    const { sessions, activeSessionId } = get();
    const message = sessions.find((session) => session.id === activeSessionId)?.messages.find((item) => item.id === messageId);
    if (!message?.patchProposal || message.patchProposal.previousTikzCode === undefined) return;
    const conflict = proposalConflict(message.patchProposal, true);
    if (conflict) {
      updateAgentMessage(activeSessionId, messageId, (item) => ({ ...item, content: `${item.content}\n\n提案未撤回：${conflict}` }));
      return;
    }
    useWorkspaceStore.getState().setTikzCode(message.patchProposal.previousTikzCode, true);
    updateAgentMessage(activeSessionId, messageId, (item) => ({ ...item,
      patchProposal: item.patchProposal ? { ...item.patchProposal, status: 'pending', baseRevision: useWorkspaceStore.getState().sourceRevision ?? 0 } : undefined,
    }));
  },
}));

/** Updates only the originating conversation/message, even after switching tabs. */
function updateAgentMessage(sessionId: string, messageId: string, update: (message: AgentChatMessage) => AgentChatMessage) {
  useAgentStore.setState((state) => ({
    sessions: state.sessions.map((session) => session.id === sessionId
      ? { ...session, messages: session.messages.map((message) => message.id === messageId ? update(message) : message) }
      : session),
  }));
}

function buildEnrichedPatchProposal(
  requestId: string,
  replyText: string,
  canvasTikz: string,
  backendProposedTikz: string | null | undefined,
  fallbackSelectedIds: string[],
  activeThemeId: JournalThemeId,
  autoLayoutRepairEnabled: boolean
): TikzPatchProposal | undefined {
  const resolved = resolveAgentPatchFromReply(replyText, canvasTikz, backendProposedTikz);
  if (!resolved) return undefined;

  let finalTikz = resolved.newTikzCode;
  let autoRepairs: string[] = [];
  let layoutScore: number | undefined;

  if (autoLayoutRepairEnabled) {
    const repairResult = autoRepairTikzLayout(finalTikz, activeThemeId);
    finalTikz = repairResult.tikzCode;
    autoRepairs = repairResult.repairs;
    layoutScore = repairResult.afterReport.score;
  } else {
    layoutScore = analyzeTikzLayout(finalTikz, activeThemeId).score;
  }

  const diff = computeTikzDiff(canvasTikz, finalTikz);
  const directives = extractAgentDirectives(replyText);

  const affectedIds =
    diff.affectedElementIds.length > 0 ? diff.affectedElementIds : fallbackSelectedIds;

  const isSurgical = resolved.mode === 'surgical_diff';
  const summary = isSurgical
    ? `来自 ACP Agent 的增量 Diff 补丁（${resolved.appliedHunks} 处精准修改）`
    : '来自 ACP Agent 的 TikZ 代码更新';

  const rationaleParts: string[] = [
    isSurgical
      ? `已将 SEARCH/REPLACE 增量补丁合并至当前画布（${diff.semanticSummary}）。`
      : '本地 ACP 返回的完整代码；请预览 Diff 与画布变更后应用。',
  ];
  if (autoRepairs.length > 0) {
    rationaleParts.push(`内置几何与配色引擎已自动优化 ${autoRepairs.length} 项细节。`);
  }

  return {
    id: `patch_${requestId}`,
    summary,
    rationale: rationaleParts.join(' '),
    newTikzCode: finalTikz,
    affectedElementIds: affectedIds,
    status: 'pending',
    mode: resolved.mode,
    semanticItems: diff.semanticItems,
    diffLines: diff.diffLines,
    autoRepairs: autoRepairs.length > 0 ? autoRepairs : undefined,
    layoutScore,
    recommendedThemeId: directives.theme,
    fitCanvasOnApply: directives.fitCanvas,
  };
}

async function sendViaRealAcp(
  agentId: AcpAgentId,
  prompt: string,
  canvasTikz: string,
  selectedIds: string[],
  activeSessionId: string,
  customCommand: string,
  history: Array<{ role: string; content: string }>,
  agentContext: string,
  activeThemeId: JournalThemeId,
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  const requestId = crypto.randomUUID();
  const messageId = `asst_${requestId}`;
  const target = currentCanvasTarget(activeSessionId);
  const baseTikzCode = useWorkspaceStore.getState().tikzCode;
  const baseRevision = useWorkspaceStore.getState().sourceRevision ?? 0;
  let finished = false;
  let unlisten: (() => void) | undefined;
  let releaseMcp: (() => void) | undefined;
  try {
    const { ensureMcpRuntime } = await import('../core/mcp/runtime');
    await ensureMcpRuntime();
    releaseMcp = registerMcpRequest(requestId, { target, agentId, messageId });
    // Establish delivery before creating a placeholder or invoking the backend.
    unlisten = await listen<AcpStreamEvent>('acp:stream', ({ payload: event }) => {
      if (finished || event.requestId !== requestId) return;
      if (event.kind === 'mcp_status') {
        useMcpStore.setState({ sessionStatus: event.text });
        return;
      }
      if (event.kind === 'tool_call' && event.toolName?.startsWith('mcp__')) {
        useMcpStore.setState({ sessionStatus: `本轮已发起 MCP 调用：${event.toolName}。结果见聊天中的工具记录。` });
      }
      if (event.kind === 'permission_denied') {
        const noticeId = `permission_${requestId}`;
        useAgentStore.setState((state) => ({ sessions: state.sessions.map((session) =>
          session.id === activeSessionId && !session.messages.some((message) => message.id === noticeId)
            ? { ...session, messages: [...session.messages, {
                id: noticeId, role: 'system' as const, agentId,
                timestamp: new Date().toTimeString().slice(0, 5),
                content: `ACP 权限请求已拒绝：${event.text}`,
              }] }
            : session) }));
        return;
      }
      updateAgentMessage(activeSessionId, messageId, (message) => {
        if (event.kind === 'message') return { ...message, content: message.content + event.text };
        if (event.kind === 'thought') return { ...message, thoughtProcess: (message.thoughtProcess || '') + event.text };
        if (event.kind === 'tool_call') {
          if (event.toolName?.startsWith('mcp__agentikz__')) return message;
          const status = event.toolStatus === 'completed' || event.toolStatus === 'failed' ? event.toolStatus : 'running';
          return { ...message, mcpToolCalls: [...(message.mcpToolCalls || []), {
            toolName: event.toolName || event.text, argsSummary: event.toolCallId || '', status,
            callId: event.toolCallId, source: event.toolName?.startsWith('mcp__') ? 'mcp' : 'agent',
          }] };
        }
        if (event.kind === 'tool_update') {
          return { ...message, mcpToolCalls: (message.mcpToolCalls || []).map((call) => {
            if (call.argsSummary !== event.toolCallId || !event.toolStatus) return call;
            const status = event.toolStatus === 'completed' || event.toolStatus === 'failed' ? event.toolStatus : 'running';
            return { ...call, status };
          }) };
        }
        return message;
      });
    });
    useAgentStore.setState((state) => ({ sessions: state.sessions.map((session) => session.id === activeSessionId
      ? { ...session, messages: [...session.messages, {
          id: messageId, role: 'assistant' as const, agentId,
          timestamp: new Date().toTimeString().slice(0, 5), content: '',
        }] }
      : session) }));
    const settings = useSettingsStore.getState();
    const proxyUrl = settings.proxyEnabled ? settings.proxyUrl : undefined;
    const userAgent = resolveEffectiveUserAgent(settings.userAgentPreset, settings.customUserAgent);
    useAgentStore.setState({ activeRequestId: requestId });
    useMcpStore.setState({ sessionStatus: '正在建立 Agent 会话并提交 MCP 配置…' });
    const response = await invoke<{
      usedNativeCli: boolean; thought?: string | null; reply?: string | null; proposedTikz?: string | null;
    }>('acp_send_prompt', {
      requestId,
      agentId,
      prompt,
      canvasTikz,
      agentContext,
      selectedIds,
      customCommand,
      history,
      proxyUrl,
      userAgent,
      responseLanguage: settings.responseLanguage,
      personalPrompt: settings.personalPrompt || undefined,
      fullAccess: settings.agentFullAccess,
      mcpTarget: target,
      workingDirectory: settings.agentFullAccess
        ? settings.agentWorkingDirectory.trim() || useProjectStore.getState().projectDir || undefined
        : undefined,
    });
    finished = true;
    if (!response?.usedNativeCli) throw new Error('本地 ACP Agent 未启动。请检查安装和 CLI 登录状态。');
    if (!response.reply?.trim()) throw new Error('ACP Agent 未返回文本。未生成画布修改。');

    const autoRepair = useAgentStore.getState().autoLayoutRepairEnabled;
    const existingProposal = useAgentStore.getState().sessions
      .find((session) => session.id === activeSessionId)?.messages.find((message) => message.id === messageId)?.patchProposal;
    const patchProposal = existingProposal ? undefined : buildEnrichedPatchProposal(
      requestId,
      response.reply,
      canvasTikz,
      response.proposedTikz,
      selectedIds,
      activeThemeId,
      autoRepair
    );

    updateAgentMessage(activeSessionId, messageId, (message) => ({
      ...message,
      // The IPC response is authoritative, not an extra stream chunk.
      content: response.reply!,
      thoughtProcess: response.thought ?? message.thoughtProcess,
      patchProposal: message.patchProposal ?? (patchProposal
        ? { ...patchProposal, targetCanvas: target, baseTikzCode, baseRevision }
        : undefined),
    }));
  } catch (error) {
    useMcpStore.setState({ sessionStatus: `Agent 会话未完成：${error instanceof Error ? error.message : String(error)}` });
    // Keep real partial output; remove only a completely empty placeholder.
    useAgentStore.setState((state) => ({ sessions: state.sessions.map((session) => session.id === activeSessionId
      ? { ...session, messages: session.messages.filter((message) =>
          message.id !== messageId || message.content || message.thoughtProcess || message.patchProposal || message.mcpToolCalls?.length) }
      : session) }));
    throw error;
  } finally {
    finished = true;
    useAgentStore.setState({ activeRequestId: null });
    releaseMcp?.();
    unlisten?.();
  }
}
