import { useProjectStore } from '../../store/useProjectStore';
import { useAgentStore } from '../../store/useAgentStore';
import { useMcpStore } from '../../store/useMcpStore';
import { getPaperBuildDiagnostics } from '../../store/usePaperBuildStore';
import { getProjectContext } from '../agent/project-context';
import { computeCompactLineDiff } from '../agent/tikz-diff';
import { isEditablePaperPath, isPaperFilePath, type ProjectPatchProposal } from '../../types/project-agent';
import type { McpToolRequest } from '../../types/mcp';
import { getMcpRequest, sourceHash, type McpRequestContext } from './context';

const toolKeys: Record<string, string[]> = {
  get_project_context: [],
  read_project_file: ['relativePath'],
  propose_project_patch: ['baseRevision', 'summary', 'rationale', 'files'],
  get_paper_diagnostics: [],
};
export const isProjectTool = (name: string) => Object.hasOwn(toolKeys, name);

class ProjectToolError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
function fail(code: string, message: string): never { throw new ProjectToolError(code, message); }
const text = (args: Record<string, unknown>, key: string): string =>
  typeof args[key] === 'string' ? args[key] as string : fail('invalid_arguments', `${key} 必须是字符串。`);

export async function executeProjectTool(event: McpToolRequest, context: McpRequestContext): Promise<unknown> {
  const check = () => {
    if (getMcpRequest(event.requestId) !== context || !useMcpStore.getState().config.builtinEnabled) {
      fail('request_ended', '请求已结束或工具授权已关闭。');
    }
    if ((useProjectStore.getState().projectDir || 'temporary') !== context.target.projectId) {
      fail('target_inactive', '项目已切换，不能操作其他项目。');
    }
  };
  try {
    check();
    const args = event.arguments;
    if (!args || typeof args !== 'object' || Array.isArray(args) ||
        Object.keys(args).some((key) => !toolKeys[event.toolName].includes(key))) {
      fail('invalid_arguments', '工具参数包含未知字段。');
    }
    if (event.toolName === 'get_project_context') return getProjectContext();
    if (event.toolName === 'get_paper_diagnostics') return getPaperBuildDiagnostics();
    const project = useProjectStore.getState();
    const revision = project.paperEditRevision;
    if (event.toolName === 'read_project_file') {
      const path = text(args, 'relativePath');
      if (!isPaperFilePath(path) || !project.paperFiles.some((file) => file.relativePath === path)) {
        fail('invalid_path', '只能读取当前项目文件列表中的论文文件。');
      }
      const source = await project.readPaperFile(path);
      if (source.length > 256 * 1024) fail('file_too_large', '此工具最多读取 256 Ki 字符的单个文件。');
      const hash = await sourceHash(source);
      check();
      const live = useProjectStore.getState();
      if (live.paperEditRevision !== revision || live.paperFileContents[path] !== source) {
        fail('source_changed', '读取期间论文已变化，请重新读取。');
      }
      (context.paperReads ??= new Map()).set(path, { revision, sourceHash: hash, source });
      return { projectId: context.target.projectId, relativePath: path, paperRevision: revision,
        sourceHash: hash, source, dirty: Boolean(live.paperDirtyFiles[path]) };
    }
    if (!context.messageId || !context.agentId) fail('read_only_request', '此连接只允许读取。');
    const summary = text(args, 'summary').trim();
    const rationale = args.rationale === undefined ? '项目修改草稿，等待审核。' : text(args, 'rationale');
    if (!summary || summary.length > 2000 || rationale.length > 8000 ||
        !Number.isSafeInteger(args.baseRevision) || Number(args.baseRevision) < 0 ||
        !Array.isArray(args.files) || args.files.length < 1 || args.files.length > 20) {
      fail('invalid_arguments', '请提供有效版本、摘要和 1–20 个文件修改。');
    }
    if (args.baseRevision !== revision) fail('source_changed', '论文版本已变化，请重新读取所有目标文件。');
    const paths = new Set<string>();
    let totalSize = 0;
    const files: ProjectPatchProposal['files'] = [];
    for (const entry of args.files as unknown[]) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
          Object.keys(entry).some((key) => !['relativePath', 'baseSourceHash', 'newContent'].includes(key))) {
        fail('invalid_arguments', '文件修改字段无效。');
      }
      const file = entry as Record<string, unknown>;
      const path = text(file, 'relativePath');
      const after = text(file, 'newContent');
      const hash = text(file, 'baseSourceHash');
      if (!isEditablePaperPath(path) || !project.paperFiles.some((item) => item.relativePath === path)) {
        fail('invalid_path', '只能修改已列出的 .tex/.bib/.sty/.cls 文件；画布图源请使用画布提案。');
      }
      if (paths.has(path)) fail('invalid_arguments', '同一文件不能在一个修改集中重复出现。');
      paths.add(path);
      totalSize += after.length;
      if (after.length > 256 * 1024 || totalSize > 512 * 1024) fail('file_too_large', '修改集过大，请拆分任务。');
      const read = context.paperReads?.get(path);
      if (!read || read.revision !== revision || read.sourceHash !== hash ||
          project.paperFileContents[path] !== read.source) {
        fail('source_changed', '请先用 read_project_file 读取每个文件的最新内容和 hash。');
      }
      if (read.source !== after) files.push({
        relativePath: path, before: read.source, after,
        diffLines: computeCompactLineDiff(read.source, after),
      });
    }
    if (!files.length) fail('no_changes', '提案没有实际修改。');
    check();
    const proposal: ProjectPatchProposal = {
      id: `project_proposal_${event.requestId}`, projectId: context.target.projectId,
      baseRevision: revision, summary, rationale, status: 'pending', files,
    };
    const message = useAgentStore.getState().sessions.find((s) => s.id === context.target.conversationId)
      ?.messages.find((m) => m.id === context.messageId);
    if (!message) fail('request_ended', '原始会话消息已不存在。');
    if (message.projectPatchProposal && message.projectPatchProposal.status !== 'pending') {
      fail('proposal_closed', '已审阅的修改集不能被后台覆盖，请发起新一轮请求。');
    }
    useAgentStore.setState((state) => ({ sessions: state.sessions.map((session) =>
      session.id === context.target.conversationId ? { ...session, messages: session.messages.map((m) =>
        m.id === context.messageId ? { ...m, projectPatchProposal: proposal } : m) } : session) }));
    return { proposalId: proposal.id, status: 'pending', applied: false,
      projectId: proposal.projectId, paperRevision: revision, files: files.map((file) => file.relativePath) };
  } catch (error) {
    return { error: { code: error instanceof ProjectToolError ? error.code : 'tool_failed',
      message: error instanceof Error ? error.message : String(error) } };
  }
}
