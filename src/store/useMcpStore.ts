import { create } from 'zustand';
import type { ExternalMcpAccess, ExternalMcpConnection, McpConfig, McpServerConfig, McpToolSpec, McpToolStatus } from '../types/mcp';
import type { TikzPatchProposal } from '../types/acp';
import { currentCanvasTarget, getMcpRequest, registerMcpRequest } from '../core/mcp/context';
import { useProjectStore } from './useProjectStore';

const defaults: McpConfig = { schemaVersion: 1, builtinEnabled: true, servers: [] };
const desktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
let releaseExternal: (() => void) | undefined;
let externalGeneration = 0;

interface McpState {
  config: McpConfig;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  error: string;
  tests: Record<string, McpToolStatus>;
  lastBuiltinCall: string;
  sessionStatus: string;
  external: ExternalMcpConnection | null;
  externalBusy: boolean;
  externalProposal: TikzPatchProposal | null;
  externalLastCall: string;
  startExternal: (access: ExternalMcpAccess) => Promise<void>;
  stopExternal: () => Promise<void>;
  load: () => Promise<void>;
  save: (config: McpConfig) => Promise<boolean>;
  test: (id: string) => Promise<void>;
  testBuiltin: () => Promise<void>;
}

export const useMcpStore = create<McpState>((set, get) => ({
  config: defaults, loaded: false, loading: false, saving: false, error: '', tests: {},
  lastBuiltinCall: '', sessionStatus: '',
  external: null, externalBusy: false, externalProposal: null, externalLastCall: '',
  startExternal: async (access) => {
    if (get().externalBusy || get().external) return;
    if (!['read', 'review', 'direct'].includes(access)) { set({ error: '未知的外部 MCP 权限。' }); return; }
    if (!desktop()) { set({ error: '外部 Agent 接入需要运行 AgenTikZ 桌面客户端。' }); return; }
    if (!get().loaded || !get().config.builtinEnabled) { set({ error: '请先加载配置并启用 AgenTikZ MCP 工具。' }); return; }
    const generation = ++externalGeneration;
    const requestId = crypto.randomUUID();
    const target = currentCanvasTarget(`external_${requestId}`);
    set({ externalBusy: true, error: '' });
    try {
      const { ensureMcpRuntime } = await import('../core/mcp/runtime');
      await ensureMcpRuntime();
      if (generation !== externalGeneration) return;
      const current = currentCanvasTarget('');
      if (current.projectId !== target.projectId || current.canvasId !== target.canvasId) throw new Error('画布已切换，请重新开启连接。');
      const release = registerMcpRequest(requestId, { target, external: { access }, visualReviewEnabled: true });
      const unsubscribe = useProjectStore.subscribe((state, previous) => {
        if (state.projectDir !== previous.projectDir || state.activeCanvasFileName !== previous.activeCanvasFileName) {
          void get().stopExternal();
        }
      });
      releaseExternal = () => { release(); unsubscribe(); };
      set({ external: { requestId, target, access }, externalProposal: null, externalLastCall: '' });
      const { invoke } = await import('@tauri-apps/api/core');
      const clientConfig = await invoke<Record<string, unknown>>('mcp_start_external', { requestId, target });
      if (generation !== externalGeneration || !getMcpRequest(requestId)) {
        await invoke('mcp_stop_external', { requestId });
        return;
      }
      set({ external: { requestId, target, access, clientConfig } });
    } catch (error) {
      if (generation !== externalGeneration) return;
      await get().stopExternal();
      set({ error: String(error) });
    } finally {
      if (generation === externalGeneration) set({ externalBusy: false });
    }
  },
  stopExternal: async () => {
    ++externalGeneration;
    const connection = get().external;
    releaseExternal?.();
    releaseExternal = undefined;
    // Invalidate frontend authorization before awaiting the backend.
    set({ external: null, externalBusy: false, externalProposal: null, externalLastCall: '' });
    if (!connection || !desktop()) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('mcp_stop_external', { requestId: connection.requestId });
    } catch (error) { set({ error: `画布授权已撤销，但关闭外部 MCP 监听失败：${String(error)}` }); }
  },
  load: async () => {
    if (get().loading) return;
    if (!desktop()) { set({ loaded: true }); return; }
    set({ loading: true, error: '' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const config = await invoke<McpConfig>('mcp_get_config');
      set({ config, loaded: true });
      if (!config.builtinEnabled && get().external) await get().stopExternal();
    } catch (error) { set({ error: String(error) }); }
    finally { set({ loading: false }); }
  },
  save: async (config) => {
    if (get().saving) return false;
    if (!desktop()) { set({ error: 'MCP 服务配置需要在桌面客户端中保存。' }); return false; }
    if (!get().loaded) { set({ error: 'MCP 配置尚未成功加载，请刷新后重试。' }); return false; }
    set({ saving: true, error: '' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const saved = await invoke<McpConfig>('mcp_save_config', { config });
      // Probe results belong to exact configurations, not just server ids.
      set({ config: saved, loaded: true, tests: {} });
      if (!saved.builtinEnabled) await get().stopExternal();
      return true;
    } catch (error) { set({ error: String(error) }); return false; }
    finally { set({ saving: false }); }
  },
  test: async (id) => {
    const testedConfig = get().config;
    set((s) => ({ tests: { ...s.tests, [id]: { phase: 'testing' } } }));
    try {
      if (!desktop()) throw new Error('连接测试需要桌面客户端。');
      const { invoke } = await import('@tauri-apps/api/core');
      const tools = await invoke<McpToolSpec[]>('mcp_test_server', { serverId: id });
      if (get().config !== testedConfig) return;
      set((s) => ({ tests: { ...s.tests, [id]: { phase: 'ready', tools, message: `测试通过 · ${tools.length} 个工具` } } }));
    } catch (error) {
      if (get().config !== testedConfig) return;
      set((s) => ({ tests: { ...s.tests, [id]: { phase: 'error', message: String(error) } } }));
    }
  },
  testBuiltin: async () => {
    const id = 'builtin';
    set((s) => ({ tests: { ...s.tests, [id]: { phase: 'testing' } } }));
    let release: (() => void) | undefined;
    try {
      if (!desktop()) throw new Error('内置 MCP 测试需要桌面客户端。');
      const { ensureMcpRuntime } = await import('../core/mcp/runtime');
      await ensureMcpRuntime();
      const requestId = crypto.randomUUID();
      const target = currentCanvasTarget(`test_${requestId}`);
      release = registerMcpRequest(requestId, { target });
      const { invoke } = await import('@tauri-apps/api/core');
      const tools = await invoke<McpToolSpec[]>('mcp_test_builtin', { requestId, target });
      set((s) => ({ tests: { ...s.tests, [id]: { phase: 'ready', tools, message: `已完成握手、工具发现与真实画布读取 · ${tools.length} 个工具` } } }));
    } catch (error) {
      set((s) => ({ tests: { ...s.tests, [id]: { phase: 'error', message: String(error) } } }));
    } finally { release?.(); }
  },
}));

export function newMcpServer(): McpServerConfig {
  return { id: crypto.randomUUID(), name: '', transport: 'stdio', enabled: false, agentIds: [],
    command: '', args: [], env: {}, url: '', headers: {} };
}
