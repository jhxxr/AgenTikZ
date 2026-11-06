import { create } from 'zustand';
import {
  AcpAgentId,
  AcpAgentProvider,
  AcpStreamEvent,
  AgentChatMessage,
  AgentSession,
} from '../types/acp';
import { useWorkspaceStore } from './useWorkspaceStore';

const DEFAULT_ACP_PROVIDERS: AcpAgentProvider[] = [
  { id: 'claude-code', name: 'Claude Code (ACP)', command: 'claude-agent-acp', args: [],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)', detected: false,
    description: '需要本地 claude-agent-acp 适配器与 CLI 登录', badgeColor: '#D97706' },
  { id: 'opencode', name: 'OpenCode (ACP)', command: 'opencode', args: ['acp'],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)', detected: false,
    description: '连接本地 OpenCode ACP 程序', badgeColor: '#2563EB' },
  { id: 'codex-cli', name: 'Codex CLI (ACP)', command: 'codex-acp', args: [],
    protocol: 'ACP (JSON-RPC 2.0 / stdio)', detected: false,
    description: '需要本地 codex-acp 适配器与 CLI 登录', badgeColor: '#059669' },
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
  mcpServerEnabled: boolean;
  attachCanvasContext: boolean;
  attachSelectionContext: boolean;
  isStreaming: boolean;
  sessions: AgentSession[];
  activeSessionId: string;
  setActiveAgentId: (id: AcpAgentId) => void;
  setCustomCommand: (cmd: string) => void;
  setMcpServerEnabled: (enabled: boolean) => void;
  setAttachCanvasContext: (attach: boolean) => void;
  setAttachSelectionContext: (attach: boolean) => void;
  createNewSession: () => void;
  switchSession: (sessionId: string) => void;
  probeLocalAgents: () => Promise<void>;
  sendPromptToAgent: (promptText: string) => Promise<void>;
  applyPatchProposal: (messageId: string) => void;
  revertPatchProposal: (messageId: string) => void;
}

const initialSessionId = 'session_1';
const initialSession: AgentSession = {
  id: initialSessionId, title: '新会话', agentId: 'claude-code', createdAt: '刚刚',
  messages: [{
    id: 'msg_welcome', role: 'system', agentId: 'claude-code',
    timestamp: new Date().toTimeString().slice(0, 5),
    content: '尚未连接 Agent。发送时会启动本地已安装的 ACP 程序；请先安装对应适配器并完成 CLI 登录。不会下载程序或生成模拟回复。\n\n可附加画布与选中元素，生成的完整 TikZ 代码需要预览并确认后才会应用。',
  }],
};

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  providers: DEFAULT_ACP_PROVIDERS,
  activeAgentId: 'claude-code',
  customCommand: 'claude-agent-acp',
  mcpServerEnabled: false,
  attachCanvasContext: true,
  attachSelectionContext: true,
  isStreaming: false,
  sessions: [initialSession],
  activeSessionId: initialSessionId,

  setActiveAgentId: (activeAgentId) => set({ activeAgentId }),
  setCustomCommand: (customCommand) => set({ customCommand }),
  setMcpServerEnabled: (mcpServerEnabled) => set({ mcpServerEnabled }),
  setAttachCanvasContext: (attachCanvasContext) => set({ attachCanvasContext }),
  setAttachSelectionContext: (attachSelectionContext) => set({ attachSelectionContext }),
  createNewSession: () => {
    const { activeAgentId, sessions } = get();
    const id = `session_${crypto.randomUUID()}`;
    set({ sessions: [{
      id, title: `会话 #${sessions.length + 1}`, agentId: activeAgentId, createdAt: '刚刚',
      messages: [{
        id: `msg_${id}`, role: 'system', agentId: activeAgentId,
        timestamp: new Date().toTimeString().slice(0, 5),
        content: '新对话已创建。发送后将尝试连接本地 ACP 程序。',
      }],
    }, ...sessions], activeSessionId: id });
  },
  switchSession: (activeSessionId) => {
    const session = get().sessions.find((item) => item.id === activeSessionId);
    if (session) set({ activeSessionId, activeAgentId: session.agentId });
  },
  probeLocalAgents: async () => {
    try {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
      const { invoke } = await import('@tauri-apps/api/core');
      const results = await invoke<Array<{ id: string; detected: boolean; version?: string }>>(
        'acp_probe_agents', { customCommand: get().customCommand },
      );
      set((state) => ({ providers: state.providers.map((provider) => {
        const found = results.find((item) => item.id === provider.id);
        return found ? { ...provider, detected: found.detected, version: found.version || undefined } : provider;
      }) }));
    } catch {
      set((state) => ({ providers: state.providers.map((provider) => ({ ...provider, detected: false })) }));
    }
  },
  sendPromptToAgent: async (promptText) => {
    if (!promptText.trim() || get().isStreaming) return;
    const { activeAgentId, activeSessionId, attachSelectionContext, attachCanvasContext, customCommand, sessions } = get();
    const workspace = useWorkspaceStore.getState();
    const history = (sessions.find((session) => session.id === activeSessionId)?.messages || [])
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
      await sendViaRealAcp(activeAgentId, promptText,
        attachCanvasContext ? workspace.tikzCode : '',
        attachSelectionContext ? [...workspace.selectedIds] : [],
        activeSessionId, customCommand, history);
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
  applyPatchProposal: (messageId) => {
    const { sessions, activeSessionId } = get();
    const message = sessions.find((session) => session.id === activeSessionId)?.messages.find((item) => item.id === messageId);
    if (!message?.patchProposal || message.patchProposal.status === 'applied') return;
    const currentCode = useWorkspaceStore.getState().tikzCode;
    useWorkspaceStore.getState().setTikzCode(message.patchProposal.newTikzCode, true);
    if (message.patchProposal.affectedElementIds.length > 0) {
      useWorkspaceStore.getState().setSelectedIds(message.patchProposal.affectedElementIds);
    }
    updateAgentMessage(activeSessionId, messageId, (item) => ({ ...item,
      patchProposal: item.patchProposal ? { ...item.patchProposal, status: 'applied', previousTikzCode: currentCode } : undefined,
    }));
  },
  revertPatchProposal: (messageId) => {
    const { sessions, activeSessionId } = get();
    const message = sessions.find((session) => session.id === activeSessionId)?.messages.find((item) => item.id === messageId);
    if (!message?.patchProposal || message.patchProposal.previousTikzCode === undefined) return;
    useWorkspaceStore.getState().setTikzCode(message.patchProposal.previousTikzCode, true);
    updateAgentMessage(activeSessionId, messageId, (item) => ({ ...item,
      patchProposal: item.patchProposal ? { ...item.patchProposal, status: 'pending' } : undefined,
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

async function sendViaRealAcp(
  agentId: AcpAgentId, prompt: string, canvasTikz: string, selectedIds: string[],
  activeSessionId: string, customCommand: string, history: Array<{ role: string; content: string }>,
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  const requestId = crypto.randomUUID();
  const messageId = `asst_${requestId}`;
  let finished = false;
  let unlisten: (() => void) | undefined;
  try {
    // Establish delivery before creating a placeholder or invoking the backend.
    unlisten = await listen<AcpStreamEvent>('acp:stream', ({ payload: event }) => {
      if (finished || event.requestId !== requestId) return;
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
          const status = event.toolStatus === 'completed' || event.toolStatus === 'failed' ? event.toolStatus : 'running';
          return { ...message, mcpToolCalls: [...(message.mcpToolCalls || []), {
            toolName: event.toolName || event.text, argsSummary: event.toolCallId || '', status,
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
    const response = await invoke<{
      usedNativeCli: boolean; thought?: string | null; reply?: string | null; proposedTikz?: string | null;
    }>('acp_send_prompt', { requestId, agentId, prompt, canvasTikz, selectedIds, customCommand, history });
    finished = true;
    if (!response?.usedNativeCli) throw new Error('本地 ACP Agent 未启动。请检查安装和 CLI 登录状态。');
    if (!response.reply?.trim()) throw new Error('ACP Agent 未返回文本。未生成画布修改。');
    updateAgentMessage(activeSessionId, messageId, (message) => ({
      ...message,
      // The IPC response is authoritative, not an extra stream chunk.
      content: response.reply!, thoughtProcess: response.thought ?? message.thoughtProcess,
      patchProposal: response.proposedTikz ? {
        id: `patch_${requestId}`, summary: '来自 ACP Agent 的 TikZ 代码更新',
        rationale: '本地 ACP 返回的完整代码；请预览后应用。', newTikzCode: response.proposedTikz,
        affectedElementIds: selectedIds, status: 'pending',
      } : undefined,
    }));
  } catch (error) {
    // Keep real partial output; remove only a completely empty placeholder.
    useAgentStore.setState((state) => ({ sessions: state.sessions.map((session) => session.id === activeSessionId
      ? { ...session, messages: session.messages.filter((message) =>
          message.id !== messageId || message.content || message.thoughtProcess || message.mcpToolCalls?.length) }
      : session) }));
    throw error;
  } finally {
    finished = true;
    unlisten?.();
  }
}
