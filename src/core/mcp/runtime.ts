import { autoApplyMcpProposal, useAgentStore } from '../../store/useAgentStore';
import { useMcpStore } from '../../store/useMcpStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { parseTikzDocument } from '../parser/parser';
import { analyzeTikzLayout, autoRepairTikzLayout } from '../agent/layout-diagnostics';
import { computeTikzDiff } from '../agent/tikz-diff';
import { PRIMITIVE_LIBRARY } from '../tikz/primitives';
import { JOURNAL_THEMES } from '../themes/journal-presets';
import { getMcpRequest, proposalConflict, sameCanvas, sourceHash } from './context';
import type { McpToolRequest } from '../../types/mcp';
import type { JournalThemeId } from '../../types/theme';
import type { TikzPatchProposal } from '../../types/acp';
import { executeProjectTool, isProjectTool } from './project-tools';
import { useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { renderAgentPreview } from '../agent/visual-review';
import { imageDataUrl } from '../agent/image-attachments';
import { preserveReproductionIntent } from '../agent/diagram-design-policy';
import { maskLatexComments } from '../tex/source';
import { getExternalProposal, publishExternalProposal } from './external';

class ToolError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const fail = (code: string, message: string): never => { throw new ToolError(code, message); };
const stringArg = (args: Record<string, unknown>, key: string): string =>
  typeof args[key] === 'string' ? args[key] as string : fail('invalid_arguments', `${key} 必须是字符串。`);

const PREAMBLE_ONLY_CMD_RE =
  /\\(?:documentclass|usepackage)(?:\s*\[[^\]]*\])?\s*\{[^}]*\}|\\(?:usetikzlibrary|usepgfplotslibrary)\s*\{[^}]*\}|\\pgfplotsset\s*\{\s*compat\s*=\s*[^{}]+\}|\\(?:this)?pagestyle\s*\{[^}]*\}|\\begin\s*\{document\}/g;

function normalizeProposedTikzSource(raw: string): string {
  let current = raw
    .replace(/\x08/g, '\\b')
    .replace(/\x0c/g, '\\f')
    .replace(/\t(?=(?:ikz(?:picture|set|style)\b|ext(?:bf|it|tt|rm|sf|sc|normal|width|height)?\b|iny\b|itle\b|heta\b|imes\b))/g, '\\t');
  const outerFence = /^\s*```(?:[a-zA-Z0-9_-]+)?[ \t]*\r?\n([\s\S]*?)\r?\n?```[ \t]*$/.exec(current);
  if (outerFence) {
    current = outerFence[1].trim();
  } else if (current.includes('```') && !/\\begin\s*\{tikzpicture\}/.test(maskLatexComments(current.replace(/```[\s\S]*?```/g, '')))) {
    const candidates: string[] = [];
    const fenceRe = /```(?:[a-zA-Z0-9_-]+)?[ \t]*\r?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = fenceRe.exec(current)) !== null) {
      if (/\\begin\s*\{tikzpicture\}/.test(maskLatexComments(match[1]))) {
        candidates.push(match[1].trim());
      }
    }
    if (candidates.length > 0) current = candidates[candidates.length - 1];
  }

  const maskedInitial = maskLatexComments(current);
  const hasEndDoc = /\\end\s*\{document\}/.exec(maskedInitial);
  PREAMBLE_ONLY_CMD_RE.lastIndex = 0;
  if (!hasEndDoc && !PREAMBLE_ONLY_CMD_RE.test(maskedInitial)) {
    return current;
  }

  if (hasEndDoc) {
    current = current.slice(0, hasEndDoc.index);
  }
  const masked = maskLatexComments(current);
  PREAMBLE_ONLY_CMD_RE.lastIndex = 0;
  let out = '';
  let cursor = 0;
  let cmdMatch: RegExpExecArray | null;
  while ((cmdMatch = PREAMBLE_ONLY_CMD_RE.exec(masked)) !== null) {
    out += current.slice(cursor, cmdMatch.index);
    cursor = cmdMatch.index + cmdMatch[0].length;
    if (current[cursor] === '\r') cursor += 1;
    if (current[cursor] === '\n') cursor += 1;
  }
  out += current.slice(cursor);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function validateProposedTikzSource(nextSource: string) {
  if (nextSource.length > 2 * 1024 * 1024) {
    fail('invalid_source', '提案源码超出 2 MB 大小上限。');
  }
  const masked = maskLatexComments(nextSource);
  const beginCount = (masked.match(/\\begin\s*\{tikzpicture\}/g) ?? []).length;
  const endCount = (masked.match(/\\end\s*\{tikzpicture\}/g) ?? []).length;
  if (beginCount === 0 || endCount === 0) {
    fail(
      'invalid_source',
      `提案缺少完整的 \\begin{tikzpicture}...\\end{tikzpicture} 环境（检测到 ${beginCount} 个 \\begin{tikzpicture}、${endCount} 个 \\end{tikzpicture}；请提交完整画布源码而非局部节点片段，并确保 JSON 字符串内反斜杠正确转义为 \\\\begin / \\\\end）。`
    );
  }
  if (beginCount !== 1 || endCount !== 1) {
    fail(
      'invalid_source',
      `提案包含 ${beginCount} 个 \\begin{tikzpicture} 与 ${endCount} 个 \\end{tikzpicture}（仅允许单个顶层 tikzpicture；请勿在 \\node 内嵌套子 tikzpicture，改用 scope、path 或普通样式绘制局部图形）。`
    );
  }
  if (/\\documentclass\b/.test(masked) || /\\begin\s*\{document\}/.test(masked)) {
    fail('invalid_source', '提案必须是完整的单个 tikzpicture，且不包含独立文档导言区。');
  }
}

const allowedKeys: Record<string, string[]> = {
  get_canvas_source: [], get_canvas_ast: [], get_selected_elements: [],
  get_component_library: ['category'], get_theme_palette: ['themeId'],
  get_diagram_design_skill: ['topic', 'startLine', 'lineCount'],
  inspect_layout_diagnostics: ['proposalId', 'themeId'],
  render_canvas_preview: ['proposalId'],
  propose_tikz_patch: ['baseRevision', 'baseSourceHash', 'summary', 'rationale', 'newTikzCode'],
  propose_surgical_diff: ['baseRevision', 'baseSourceHash', 'summary', 'rationale', 'patches'],
  propose_layout_repair: ['baseRevision', 'baseSourceHash', 'summary', 'rationale', 'themeId', 'proposalId'],
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
    if (isProjectTool(event.toolName)) {
      if (context.external) fail('unknown_tool', '外部绘图连接不开放论文文件访问。');
      return executeProjectTool(event, context);
    }
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
    // Read-only responses must also remain bound across asynchronous hashing.
    if (getMcpRequest(event.requestId) !== context || !useMcpStore.getState().config.builtinEnabled) {
      fail('request_ended', 'MCP 请求已结束或工具授权已关闭。');
    }
    if (!sameCanvas(context.target)) fail('target_inactive', '画布已切换，请重新连接原画布。');
    const hashedWorkspace = useWorkspaceStore.getState();
    if (hashedWorkspace.tikzCode !== source || (hashedWorkspace.sourceRevision ?? 0) !== revision) {
      fail('source_changed', '读取期间画布已变化，请重新读取。');
    }
    const version = { ...context.target, revision, sourceHash: hash, themeId,
      ...(context.external ? { access: context.external.access } : {}) };
    const doc = parseTikzDocument(source, themeId);
    if (event.toolName === 'get_canvas_source') {
      const latest = context.external ? getExternalProposal(event.requestId) : undefined;
      return { ...version, source,
        ...(latest ? { latestProposal: { proposalId: latest.id, status: latest.status, summary: latest.summary } } : {}) };
    }
    if (event.toolName === 'get_canvas_ast') return { ...version, ast: doc };
    if (event.toolName === 'get_selected_elements') return {
      ...version, elements: [...doc.nodes, ...doc.edges, ...doc.charts]
        .filter((item) => workspace.selectedIds.includes(item.id))
        .map((item) => ({ ...item, source: source.slice(item.span.start, item.span.end) })),
    };
    const session = useAgentStore.getState().sessions.find((s) => s.id === context.target.conversationId);
    const currentProposal = context.external ? getExternalProposal(event.requestId)
      : session?.messages.find((message) => message.id === context.messageId)?.patchProposal;
    const inspectableProposal = currentProposal?.status === 'pending' ||
      (currentProposal?.status === 'applied' && (currentProposal.autoApplied || context.external));
    if (event.toolName === 'render_canvas_preview') {
      if (context.visualReviewEnabled === false) fail('preview_disabled', '本轮已关闭视觉复核。');
      if (args.proposalId && (args.proposalId !== currentProposal?.id || !inspectableProposal)) {
        fail('proposal_not_found', '可检查的提案不存在。');
      }
      if (args.proposalId && proposalConflict(currentProposal!, currentProposal!.status === 'applied')) {
        fail('source_changed', '画布已变化，请重新生成提案后渲染。');
      }
      const previewSource = args.proposalId ? currentProposal!.newTikzCode : source;
      const previewSourceHash = await sourceHash(previewSource);
      const { texEngine } = useSettingsStore.getState();
      const { projectDir } = useProjectStore.getState();
      const key = JSON.stringify([previewSourceHash, themeId, texEngine, projectDir]);
      const cache = context.previewCache ??= new Map();
      const cached = cache.has(key);
      if (!cached) {
        if ((context.previewAttempts ?? 0) >= 3) fail('preview_budget_exceeded', '本轮已达 3 次渲染上限，请总结待审提案和剩余问题。');
        context.previewAttempts = (context.previewAttempts ?? 0) + 1;
        cache.set(key, renderAgentPreview(previewSource, themeId, { texEngine, projectDir }));
      }
      // Capture failures before checking identity: an ended request must not publish even an old diagnostic.
      let preview: Awaited<ReturnType<typeof renderAgentPreview>> | undefined;
      let renderError: unknown;
      try { preview = await cache.get(key)!; } catch (error) { renderError = error; }
      const live = useWorkspaceStore.getState();
      const liveSettings = useSettingsStore.getState();
      const liveProposal = context.external ? getExternalProposal(event.requestId)
        : useAgentStore.getState().sessions.find((s) => s.id === context.target.conversationId)
          ?.messages.find((message) => message.id === context.messageId)?.patchProposal;
      if (getMcpRequest(event.requestId) !== context || !useMcpStore.getState().config.builtinEnabled ||
          !sameCanvas(context.target) || live.sourceRevision !== revision || live.tikzCode !== source ||
          (live.activeThemeId ?? 'neurips') !== themeId || liveSettings.texEngine !== texEngine ||
          (args.proposalId && liveProposal !== currentProposal)) {
        fail('source_changed', '渲染期间画布、提案或请求已变化，结果已丢弃。');
      }
      if (!preview) fail('preview_failed', renderError instanceof Error ? renderError.message : String(renderError));
      const rendered = preview!;
      if (args.proposalId) {
        const renderedProposal = { ...currentProposal!, renderPreview: {
          dataUrl: imageDataUrl(rendered.image), sourceHash: previewSourceHash,
        } };
        if (context.external) useMcpStore.setState({ externalProposal: renderedProposal });
        else useAgentStore.setState((state) => ({ sessions: state.sessions.map((s) => s.id === context.target.conversationId
          ? { ...s, messages: s.messages.map((message) => message.id === context.messageId
            ? { ...message, patchProposal: renderedProposal } : message) } : s) }));
      }
      return { ...version, previewSourceHash, proposalId: args.proposalId,
        applied: Boolean(args.proposalId && currentProposal?.status === 'applied'), cached,
        rendersRemaining: 3 - (context.previewAttempts ?? 0), renderer: 'tex', message: rendered.message,
        report: analyzeTikzLayout(previewSource, themeId), image: rendered.image };
    }
    if (event.toolName === 'inspect_layout_diagnostics') {
      if (args.proposalId && args.proposalId !== currentProposal?.id) fail('proposal_not_found', '可检查的提案不存在。');
      return {
        ...version,
        inspectedTarget: args.proposalId && currentProposal?.status === 'pending' ? 'pending_proposal' : 'live_canvas',
        ...(!args.proposalId && currentProposal?.status === 'pending'
          ? {
              pendingProposalId: currentProposal.id,
              note: 'Inspected original live_canvas because proposalId was omitted; pass proposalId to inspect your pending proposal.',
            }
          : {}),
        report: analyzeTikzLayout(args.proposalId ? currentProposal!.newTikzCode : source, themeId),
      };
    }
    if (context.external ? context.external.access === 'read' : !context.agentId || !context.messageId || !session) {
      fail('read_only_request', '此连接只允许读取画布。');
    }
    if (!context.external && currentProposal && currentProposal.status !== 'pending' &&
        !(context.autoMode && useSettingsStore.getState().agentAutoMode && currentProposal.status === 'applied' && currentProposal.autoApplied)) {
      fail('proposal_closed', '已审阅的提案不能被后台覆盖，请发起新一轮请求。');
    }
    if (!context.external && currentProposal?.status === 'applied' && proposalConflict(currentProposal, true)) {
      fail('source_changed', '上次应用后画布已变化，请发起新一轮请求，避免覆盖后续编辑。');
    }
    if (args.baseRevision !== revision || args.baseSourceHash !== hash) fail('source_changed', '画布已变化，请重新读取后生成提案。');
    let nextSource: string;
    let repairs: string[] | undefined;
    if (event.toolName === 'propose_tikz_patch') {
      nextSource = normalizeProposedTikzSource(stringArg(args, 'newTikzCode'));
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
      if (args.proposalId && (args.proposalId !== currentProposal?.id || !inspectableProposal)) {
        fail('proposal_not_found', '可检查的提案不存在。');
      }
      const targetSource = args.proposalId ? currentProposal!.newTikzCode : source;
      const repair = autoRepairTikzLayout(
        context.diagramMode === 'reproduction' ? preserveReproductionIntent(targetSource) : targetSource,
        themeId,
      );
      nextSource = repair.tikzCode;
      repairs = repair.repairs;
    }
    if (context.diagramMode === 'reproduction') nextSource = preserveReproductionIntent(nextSource);
    validateProposedTikzSource(nextSource);
    // Hashing is asynchronous; recheck identity, registry and version immediately before publication.
    const live = useWorkspaceStore.getState();
    if (!useMcpStore.getState().config.builtinEnabled || getMcpRequest(event.requestId) !== context || !sameCanvas(context.target) ||
        live.tikzCode !== source || (live.sourceRevision ?? 0) !== revision) {
      fail('source_changed', '画布或请求已变化，请重新读取后生成提案。');
    }
    const previousTikzCode = !context.external && currentProposal?.status === 'applied' && currentProposal.autoApplied
      ? currentProposal.previousTikzCode : undefined;
    const diff = computeTikzDiff(previousTikzCode ?? source, nextSource);
    const proposal: TikzPatchProposal = {
      id: context.external
        ? (currentProposal?.status === 'pending' ? currentProposal.id : `mcp_proposal_${event.toolRequestId}`)
        : `mcp_proposal_${event.requestId}`,
      summary: stringArg(args, 'summary'),
      rationale: typeof args.rationale === 'string' ? args.rationale : '由 MCP 工具提交的画布修改。',
      newTikzCode: nextSource, affectedElementIds: diff.affectedElementIds, status: 'pending', previousTikzCode,
      mode: event.toolName === 'propose_surgical_diff' ? 'surgical_diff' : 'full_replace',
      semanticItems: diff.semanticItems, diffLines: diff.diffLines, autoRepairs: repairs,
      layoutScore: analyzeTikzLayout(nextSource, themeId).score,
      targetCanvas: context.target, baseRevision: revision, baseSourceHash: hash, baseTikzCode: source,
    };
    if (context.external) publishExternalProposal(event.requestId, proposal);
    else {
      useAgentStore.setState((state) => ({ sessions: state.sessions.map((s) => s.id === context.target.conversationId
        ? { ...s, messages: s.messages.map((message) => message.id === context.messageId
            ? { ...message, patchProposal: proposal } : message) } : s) }));
      autoApplyMcpProposal(event.requestId, 'canvas');
    }
    const published = context.external ? getExternalProposal(event.requestId)
      : useAgentStore.getState().sessions.find((s) => s.id === context.target.conversationId)
        ?.messages.find((message) => message.id === context.messageId)?.patchProposal;
    const applied = published?.status === 'applied';
    const liveSource = useWorkspaceStore.getState().tikzCode;
    return { proposalId: proposal.id, status: published?.status ?? 'pending', applied,
      ...version, revision: useWorkspaceStore.getState().sourceRevision ?? 0,
      sourceHash: applied ? await sourceHash(liveSource) : hash, report: analyzeTikzLayout(nextSource, themeId) };
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
      if (context.external) useMcpStore.setState({ externalLastCall: `${event.toolName} · 执行中…` });
      else useMcpStore.setState({ sessionStatus: `正在执行项目工具：${event.toolName}…` });
      const result = await executeMcpTool(event);
      try {
        await invoke('mcp_tool_result', { requestId: event.requestId, toolRequestId: event.toolRequestId, result });
        const failed = !!(result && typeof result === 'object' && 'error' in result);
        const elapsedMs = Math.round(performance.now() - started);
        update(failed ? 'failed' : 'completed');
        if (context.external) {
          if (useMcpStore.getState().external?.requestId === event.requestId) {
            useMcpStore.setState({ externalLastCall: `${event.toolName} · ${failed ? '失败' : '成功'} · ${elapsedMs} ms` });
          }
        } else useMcpStore.setState({
          lastBuiltinCall: `${event.toolName} · ${failed ? '失败' : '成功'} · ${elapsedMs} ms`,
          sessionStatus: failed
            ? `项目工具 ${event.toolName} 返回提示（${elapsedMs} ms），等待模型调整…`
            : `已完成项目工具：${event.toolName}（${elapsedMs} ms），等待模型继续响应…`,
        });
      } catch { update('failed'); }
    });
  })().catch((error) => { listening = undefined; throw error; });
  return listening;
}
