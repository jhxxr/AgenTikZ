import type { CanvasTarget } from './mcp';

export type AcpAgentId =
  | 'claude-code'
  | 'codex-cli'
  | 'opencode'
  | 'gemini-cli'
  | 'cursor-agent'
  | 'kimi-code'
  | 'custom-acp';

export type AcpHandshakeStatus = 'idle' | 'testing' | 'ok' | 'error';

export interface AcpAgentProvider {
  id: AcpAgentId;
  name: string;
  command: string;
  args: string[];
  protocol: 'ACP (JSON-RPC 2.0 / stdio)';
  detected: boolean;
  version?: string;
  binaryAvailable?: boolean;
  resolvedPath?: string;
  acpBundled?: boolean;
  acpBundledVersion?: string;
  installHint?: string;
  diagnostic?: string;
  handshakeStatus?: AcpHandshakeStatus;
  handshakeMessage?: string;
  handshakeAgentName?: string;
  description: string;
  badgeColor: string;
}

export interface AcpHandshakeResult {
  ok: boolean;
  agentName?: string;
  agentVersion?: string;
  protocolVersion?: string;
  resolvedSource?: string;
  message: string;
}

export interface ToolDiagnostic {
  id: string;
  name: string;
  available: boolean;
  path?: string;
  note: string;
}

export interface EnvironmentDiagnostics {
  nodeAvailable: boolean;
  nodeVersion?: string;
  nodePath?: string;
  adaptersStaged: boolean;
  adaptersRoot?: string;
  tools: ToolDiagnostic[];
}

/** Streamed from the Rust backend via Tauri event `acp:stream`. */
export interface AcpStreamEvent {
  requestId: string;
  kind: 'message' | 'thought' | 'tool_call' | 'tool_update' | 'completed' | 'failed' | 'permission_denied' | 'mcp_status';
  text: string;
  toolName?: string;
  toolCallId?: string;
  toolStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface TikzSemanticDiffItem {
  type: 'add' | 'modify' | 'remove';
  category: 'node' | 'edge' | 'chart' | 'style';
  id: string;
  detail: string;
}

export interface TikzDiffLine {
  type: 'context' | 'add' | 'remove' | 'header';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface TikzPatchProposal {
  id: string;
  summary: string;
  rationale: string;
  newTikzCode: string;
  affectedElementIds: string[];
  status: 'pending' | 'applied' | 'rejected';
  previousTikzCode?: string;
  mode?: 'surgical_diff' | 'full_replace' | 'agent_skill';
  semanticItems?: TikzSemanticDiffItem[];
  diffLines?: TikzDiffLine[];
  autoRepairs?: string[];
  layoutScore?: number;
  recommendedThemeId?: string;
  fitCanvasOnApply?: boolean;
  targetCanvas?: CanvasTarget;
  baseRevision?: number;
  baseSourceHash?: string;
  baseTikzCode?: string;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thoughtProcess?: string;
  timestamp: string;
  agentId: AcpAgentId;
  contextSelectionIds?: string[];
  includeFullCanvas?: boolean;
  patchProposal?: TikzPatchProposal;
  mcpToolCalls?: Array<{
    callId?: string;
    source?: 'mcp' | 'agent' | 'local';
    durationMs?: number;
    toolName: string;
    argsSummary: string;
    status: 'running' | 'completed' | 'failed';
  }>;
}

export interface AgentSession {
  id: string;
  title: string;
  agentId: AcpAgentId;
  createdAt: string;
  messages: AgentChatMessage[];
}
