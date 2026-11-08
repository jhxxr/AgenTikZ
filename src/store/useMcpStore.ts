import { create } from 'zustand';
import type { McpConfig, McpServerConfig, McpToolSpec, McpToolStatus } from '../types/mcp';
import { currentCanvasTarget, registerMcpRequest } from '../core/mcp/context';

const defaults: McpConfig = { schemaVersion: 1, builtinEnabled: true, servers: [] };
const desktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface McpState {
  config: McpConfig;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  error: string;
  tests: Record<string, McpToolStatus>;
  lastBuiltinCall: string;
  sessionStatus: string;
  load: () => Promise<void>;
  save: (config: McpConfig) => Promise<boolean>;
  test: (id: string) => Promise<void>;
  testBuiltin: () => Promise<void>;
}

export const useMcpStore = create<McpState>((set, get) => ({
  config: defaults, loaded: false, loading: false, saving: false, error: '', tests: {},
  lastBuiltinCall: '', sessionStatus: '',
  load: async () => {
    if (get().loading) return;
    if (!desktop()) { set({ loaded: true }); return; }
    set({ loading: true, error: '' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const config = await invoke<McpConfig>('mcp_get_config');
      set({ config, loaded: true });
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
