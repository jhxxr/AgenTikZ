export type AcpAgentId =
  | 'claude-code'
  | 'codex-cli'
  | 'opencode'
  | 'gemini-cli'
  | 'cursor-agent'
  | 'kimi-code'
  | 'custom-acp';

export interface AcpAgentProvider {
  id: AcpAgentId;
  name: string;
  command: string;
  args: string[];
  protocol: 'ACP (JSON-RPC 2.0 / stdio)';
  detected: boolean;
  version?: string;
  description: string;
  badgeColor: string;
}

/** Streamed from the Rust backend via Tauri event `acp:stream`. */
export interface AcpStreamEvent {
  requestId: string;
  kind: 'message' | 'thought' | 'tool_call' | 'tool_update' | 'completed' | 'failed' | 'permission_denied';
  text: string;
  toolName?: string;
  toolCallId?: string;
  toolStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface TikzPatchProposal {
  id: string;
  summary: string;
  rationale: string;
  newTikzCode: string;
  affectedElementIds: string[];
  status: 'pending' | 'applied' | 'rejected';
  previousTikzCode?: string;
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
