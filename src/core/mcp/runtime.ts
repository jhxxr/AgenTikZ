import { useAgentStore } from '../../store/useAgentStore';
import { useMcpStore } from '../../store/useMcpStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { parseTikzDocument } from '../parser/parser';
import { analyzeTikzLayout, autoRepairTikzLayout } from '../agent/layout-diagnostics';
import { computeTikzDiff } from '../agent/tikz-diff';
import { PRIMITIVE_LIBRARY } from '../tikz/primitives';
import { JOURNAL_THEMES } from '../themes/journal-presets';
import { getMcpRequest, sameCanvas, sourceHash } from './context';
import type { McpToolRequest } from '../../types/mcp';
import type { JournalThemeId } from '../../types/theme';
import type { TikzPatchProposal } from '../../types/acp';
import { executeProjectTool, isProjectTool } from './project-tools';

class ToolError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const fail = (code: string, message: string): never => { throw new ToolError(code, message); };
const stringArg = (args: Record<string, unknown>, key: string): string =>
  typeof args[key] === 'string' ? args[key] as string : fail('invalid_arguments', `${key} 必须是字符串。`);

const allowedKeys: Record<string, string[]> = {
  get_canvas_source: [], get_canvas_ast: [], get_selected_elements: [],
  get_component_library: ['category'], get_theme_palette: ['themeId'],
  inspect_layout_diagnostics: ['proposalId', 'themeId'],
  propose_tikz_patch: ['baseRevision', 'baseSourceHash', 'summary', 'rationale', 'newTikzCode'],
  propose_surgical_diff: ['baseRevision', 'baseSourceHash', 'summary', 'rationale', 'patches'],
  propose_layout_repair: ['baseRevision', 'baseSourceHash', 'summary', 'rationale', 'themeId'],
};

function validateArguments(name: string, args: Record<string, unknown>) {
  const keys = allowedKeys[name] ?? fail('unknown_tool', '未知的内置 MCP 工具。');
  if (!args || Array.isArray(args) || typeof args !== 'object' || Object.keys(args).some((key) => !keys.includes(key))) {
    fail('invalid_arguments', '工具参数包含未知字段。');
  }
  for (const key of ['proposalId', 'category', 'themeId', 'rationale']) {
    if (args[key] !== undefined) stringArg(args, key);
  }
  if (args.category !== undefined && !['all', 'dl', 'chart'].includes(String(args.category))) {
    fail('invalid_arguments', '未知的组件分类。');
  }
  if (name.startsWith('propose_')) {
    if (!Number.isSafeInteger(args.baseRevision) || Number(args.baseRevision) < 0) fail('invalid_arguments', 'baseRevision 必须是非负整数。');
    if (!stringArg(args, 'baseSourceHash')) fail('invalid_arguments', '缺少源码 hash。');
    if (!stringArg(args, 'summary').trim()) fail('invalid_arguments', '请填写修改摘要。');
  }
}

export async function executeMcpTool(event: McpToolRequest): Promise<unknown> {
  try {
    const context = getMcpRequest(event.requestId) ?? fail('request_ended', 'MCP 请求已结束。');
    if (!useMcpStore.getState().config.builtinEnabled) fail('request_ended', '内置 MCP 服务已关闭。');
    if (context.target.conversationId !== event.target.conversationId ||
        context.target.projectId !== event.target.projectId || context.target.canvasId !== event.target.canvasId) {
      fail('target_mismatch', '工具请求与原始画布不一致。');
    }
    if (isProjectTool(event.toolName)) return executeProjectTool(event, context);
    validateArguments(event.toolName, event.arguments);
    const args = event.arguments;
    const independent = event.toolName === 'get_component_library' || (event.toolName === 'get_theme_palette' && args.themeId);
    if (!independent && !sameCanvas(context.target)) fail('target_inactive', '请切回原画布后继续调用工具。');
    const workspace = useWorkspaceStore.getState();
    const source = workspace.tikzCode;
    const revision = workspace.sourceRevision ?? 0;
    const themeId = (args.themeId ?? workspace.activeThemeId ?? 'neurips') as JournalThemeId;
    if (!Object.hasOwn(JOURNAL_THEMES, themeId)) fail('invalid_arguments', '未知的期刊主题。');
    if (event.toolName === 'get_component_library') return {
      components: PRIMITIVE_LIBRARY.filter((item) => !args.category || args.category === 'all' || item.category === args.category)
        .map(({ generateSnippet, ...item }) => ({ ...item, snippet: generateSnippet(1, 0, 0) })),
    };
    if (event.toolName === 'get_theme_palette') return JOURNAL_THEMES[themeId];
    const hash = await sourceHash(source);
    const version = { ...context.target, revision, sourceHash: hash, themeId };
    const doc = parseTikzDocument(source, themeId);
    if (event.toolName === 'get_canvas_source') return { ...version, source };
    if (event.toolName === 'get_canvas_ast') return { ...version, ast: doc };
    if (event.toolName === 'get_selected_elements') return {
      ...version, elements: [...doc.nodes, ...doc.edges, ...doc.charts]
        .filter((item) => workspace.selectedIds.includes(item.id))
        .map((item) => ({ ...item, source: source.slice(item.span.start, item.span.end) })),
    };
    const session = useAgentStore.getState().sessions.find((s) => s.id === context.target.conversationId);
    const currentProposal = session?.messages.find((message) => message.id === context.messageId)?.patchProposal;
    if (event.toolName === 'inspect_layout_diagnostics') {
      if (args.proposalId && args.proposalId !== currentProposal?.id) fail('proposal_not_found', '待应用提案不存在。');
      return { ...version, report: analyzeTikzLayout(args.proposalId ? currentProposal!.newTikzCode : source, themeId) };
    }
    if (!context.agentId || !context.messageId || !session) fail('read_only_request', '此连接只允许读取画布。');
    if (args.baseRevision !== revision || args.baseSourceHash !== hash) fail('source_changed', '画布已变化，请重新读取后生成提案。');
    let nextSource: string;
    let repairs: string[] | undefined;
    if (event.toolName === 'propose_tikz_patch') {
      nextSource = stringArg(args, 'newTikzCode');
    } else if (event.toolName === 'propose_surgical_diff') {
      if (!Array.isArray(args.patches) || !args.patches.length || args.patches.length > 100) fail('invalid_arguments', 'patches 必须包含 1–100 项。');
      nextSource = source;
      for (const patch of args.patches as Array<Record<string, unknown>>) {
        if (!patch || typeof patch !== 'object' || Object.keys(patch).some((key) => !['search', 'replace'].includes(key))) {
          fail('invalid_arguments', '补丁字段无效。');
        }
        const search = stringArg(patch, 'search');
        const replacement = stringArg(patch, 'replace');
        if (!search || nextSource.indexOf(search) < 0 || nextSource.indexOf(search) !== nextSource.lastIndexOf(search)) {
          fail('ambiguous_search', '每个 SEARCH 必须精确命中一次。');
        }
        nextSource = nextSource.replace(search, () => replacement);
      }
    } else {
      const repair = autoRepairTikzLayout(source, themeId);
      nextSource = repair.tikzCode;
      repairs = repair.repairs;
    }
    if (nextSource.length > 2 * 1024 * 1024 || nextSource.split('\\begin{tikzpicture}').length !== 2
        || nextSource.split('\\end{tikzpicture}').length !== 2 || nextSource.includes('\\documentclass')) {
      fail('invalid_source', '提案必须是完整的单个 tikzpicture，且不包含独立文档导言区。');
    }
    // Hashing is asynchronous; recheck identity, registry and version immediately before publication.
    const live = useWorkspaceStore.getState();
    if (!useMcpStore.getState().config.builtinEnabled || getMcpRequest(event.requestId) !== context || !sameCanvas(context.target) ||
        live.tikzCode !== source || (live.sourceRevision ?? 0) !== revision) {
      fail('source_changed', '画布或请求已变化，请重新读取后生成提案。');
    }
    const diff = computeTikzDiff(source, nextSource);
    const proposal: TikzPatchProposal = {
      id: `mcp_proposal_${event.requestId}`, summary: stringArg(args, 'summary'),
      rationale: typeof args.rationale === 'string' ? args.rationale : '由 MCP 工具生成，等待审核。',
      newTikzCode: nextSource, affectedElementIds: diff.affectedElementIds, status: 'pending',
      mode: event.toolName === 'propose_surgical_diff' ? 'surgical_diff' : 'full_replace',
      semanticItems: diff.semanticItems, diffLines: diff.diffLines, autoRepairs: repairs,
      layoutScore: analyzeTikzLayout(nextSource, themeId).score,
      targetCanvas: context.target, baseRevision: revision, baseSourceHash: hash, baseTikzCode: source,
    };
    useAgentStore.setState((state) => ({ sessions: state.sessions.map((s) => s.id === context.target.conversationId
      ? { ...s, messages: s.messages.map((message) => message.id === context.messageId
          ? { ...message, patchProposal: proposal } : message) } : s) }));
    return { proposalId: proposal.id, status: 'pending', applied: false, ...version, report: analyzeTikzLayout(nextSource, themeId) };
  } catch (error) {
    return { error: { code: error instanceof ToolError ? error.code : 'tool_failed', message: error instanceof Error ? error.message : String(error) } };
  }
}

let listening: Promise<void> | undefined;
export function ensureMcpRuntime(): Promise<void> {
  if (listening) return listening;
  listening = (async () => {
    const { listen } = await import('@tauri-apps/api/event');
    const { invoke } = await import('@tauri-apps/api/core');
    await listen<McpToolRequest>('mcp:call', async ({ payload: event }) => {
      const context = getMcpRequest(event.requestId);
      if (!context) {
        await invoke('mcp_tool_result', { requestId: event.requestId, toolRequestId: event.toolRequestId,
          result: { error: { code: 'request_ended', message: '项目请求已结束，请重新发起任务。' } } }).catch(() => {});
        return;
      }
      const started = performance.now();
      const update = (status: 'running' | 'completed' | 'failed') => {
        if (!context.messageId) return;
        useAgentStore.setState((state) => ({ sessions: state.sessions.map((s) => s.id === context.target.conversationId
          ? { ...s, messages: s.messages.map((message) => message.id === context.messageId ? {
              ...message, mcpToolCalls: [
                ...(message.mcpToolCalls || []).filter((call) => call.callId !== event.toolRequestId),
                { callId: event.toolRequestId, toolName: `mcp__agentikz__${event.toolName}`, argsSummary: isProjectTool(event.toolName) ? '内置论文工具' : '内置画布工具',
                  status, source: 'mcp' as const, durationMs: status === 'running' ? undefined : Math.round(performance.now() - started) },
              ],
            } : message) } : s) }));
      };
      update('running');
      const result = await executeMcpTool(event);
      try {
        await invoke('mcp_tool_result', { requestId: event.requestId, toolRequestId: event.toolRequestId, result });
        const failed = !!(result && typeof result === 'object' && 'error' in result);
        update(failed ? 'failed' : 'completed');
        useMcpStore.setState({ lastBuiltinCall: `${event.toolName} · ${failed ? '失败' : '成功'} · ${Math.round(performance.now() - started)} ms` });
      } catch { update('failed'); }
    });
  })().catch((error) => { listening = undefined; throw error; });
  return listening;
}
