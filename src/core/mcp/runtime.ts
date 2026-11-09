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
import { useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { renderAgentPreview } from '../agent/visual-review';
import { imageDataUrl } from '../agent/image-attachments';
import { preserveReproductionIntent } from '../agent/diagram-design-policy';

class ToolError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const fail = (code: string, message: string): never => { throw new ToolError(code, message); };
const stringArg = (args: Record<string, unknown>, key: string): string =>
  typeof args[key] === 'string' ? args[key] as string : fail('invalid_arguments', `${key} 必须是字符串。`);

const allowedKeys: Record<string, string[]> = {
  get_canvas_source: [], get_canvas_ast: [], get_selected_elements: [],
  get_component_library: ['category'], get_theme_palette: ['themeId'],
  get_diagram_design_skill: ['topic', 'startLine', 'lineCount'],
  inspect_layout_diagnostics: ['proposalId', 'themeId'],
  render_canvas_preview: ['proposalId'],
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
    if (event.toolName === 'get_diagram_design_skill') {
      const { readDiagramSkillPage } = await import('../agent/diagram-skill-library');
      if (getMcpRequest(event.requestId) !== context) fail('request_ended', 'MCP 请求已结束。');
      try { return readDiagramSkillPage(args); }
      catch (error) { fail('invalid_arguments', error instanceof Error ? error.message : String(error)); }
    }
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
    if (event.toolName === 'render_canvas_preview') {
      if (context.visualReviewEnabled === false) fail('preview_disabled', '本轮已关闭视觉复核。');
      if (args.proposalId && (args.proposalId !== currentProposal?.id || currentProposal.status !== 'pending')) {
        fail('proposal_not_found', '待应用提案不存在。');
      }
      if (args.proposalId && (currentProposal!.baseRevision !== revision || currentProposal!.baseTikzCode !== source)) {
        fail('source_changed', '画布已变化，请重新生成提案后渲染。');
      }
      const previewSource = args.proposalId ? currentProposal!.newTikzCode : source;
      const previewSourceHash = await sourceHash(previewSource);
      const { texEngine, texLiveBinDir } = useSettingsStore.getState();
      const { projectDir } = useProjectStore.getState();
      const key = JSON.stringify([previewSourceHash, themeId, texEngine, texLiveBinDir, projectDir]);
      const cache = context.previewCache ??= new Map();
      const cached = cache.has(key);
      if (!cached) {
        if ((context.previewAttempts ?? 0) >= 3) fail('preview_budget_exceeded', '本轮已达 3 次渲染上限，请总结待审提案和剩余问题。');
        context.previewAttempts = (context.previewAttempts ?? 0) + 1;
        cache.set(key, renderAgentPreview(previewSource, themeId, { texEngine, texLiveBinDir, projectDir }));
      }
      // Capture failures before checking identity: an ended request must not publish even an old diagnostic.
      let preview: Awaited<ReturnType<typeof renderAgentPreview>> | undefined;
      let renderError: unknown;
      try { preview = await cache.get(key)!; } catch (error) { renderError = error; }
      const live = useWorkspaceStore.getState();
      const liveSettings = useSettingsStore.getState();
      const liveProposal = useAgentStore.getState().sessions.find((s) => s.id === context.target.conversationId)
        ?.messages.find((message) => message.id === context.messageId)?.patchProposal;
      if (getMcpRequest(event.requestId) !== context || !useMcpStore.getState().config.builtinEnabled ||
          !sameCanvas(context.target) || live.sourceRevision !== revision || live.tikzCode !== source ||
          (live.activeThemeId ?? 'neurips') !== themeId || liveSettings.texEngine !== texEngine ||
          liveSettings.texLiveBinDir !== texLiveBinDir ||
          (args.proposalId && (liveProposal !== currentProposal || liveProposal?.status !== 'pending'))) {
        fail('source_changed', '渲染期间画布、提案或请求已变化，结果已丢弃。');
      }
      if (!preview) fail('preview_failed', renderError instanceof Error ? renderError.message : String(renderError));
      const rendered = preview!;
      if (args.proposalId) {
        useAgentStore.setState((state) => ({ sessions: state.sessions.map((s) => s.id === context.target.conversationId
          ? { ...s, messages: s.messages.map((message) => message.id === context.messageId
            ? { ...message, patchProposal: { ...currentProposal!, renderPreview: {
              dataUrl: imageDataUrl(rendered.image), sourceHash: previewSourceHash,
            } } } : message) } : s) }));
      }
      return { ...version, previewSourceHash, proposalId: args.proposalId, applied: false, cached,
        rendersRemaining: 3 - (context.previewAttempts ?? 0), renderer: 'tex', message: rendered.message,
        report: analyzeTikzLayout(previewSource, themeId), image: rendered.image };
    }
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
      const repair = autoRepairTikzLayout(context.diagramMode === 'reproduction' ? preserveReproductionIntent(source) : source, themeId);
      nextSource = repair.tikzCode;
      repairs = repair.repairs;
    }
    if (context.diagramMode === 'reproduction') nextSource = preserveReproductionIntent(nextSource);
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
