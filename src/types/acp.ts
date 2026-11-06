export type AcpAgentId =
  | 'claude-code'
  | 'codex-cli'
  | 'opencode'
  | 'gemini-cli'
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
    status: 'running' | 'completed';
  }>;
}

export interface AgentSession {
  id: string;
  title: string;
  agentId: AcpAgentId;
  createdAt: string;
  messages: AgentChatMessage[];
}
