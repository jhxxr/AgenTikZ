import type { AcpAgentId } from './acp';

export interface McpValue {
  value?: string;
  secret: boolean;
  stored: boolean;
  sessionOnly: boolean;
  credentialId?: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  enabled: boolean;
  agentIds: AcpAgentId[];
  command: string;
  args: string[];
  env: Record<string, McpValue>;
  url: string;
  headers: Record<string, McpValue>;
}

export interface McpConfig {
  schemaVersion: 1;
  builtinEnabled: boolean;
  servers: McpServerConfig[];
}

export interface McpToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface CanvasTarget {
  conversationId: string;
  projectId: string;
  canvasId: string;
}

export type ExternalMcpAccess = 'read' | 'review' | 'direct';

export interface ExternalMcpConnection {
  requestId: string;
  target: CanvasTarget;
  access: ExternalMcpAccess;
  /** Temporary credentials; never persist this in settings or ordinary exports. */
  clientConfig?: Record<string, unknown>;
}

export interface McpToolRequest {
  requestId: string;
  toolRequestId: string;
  target: CanvasTarget;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface McpToolStatus {
  phase: 'idle' | 'testing' | 'ready' | 'error';
  message?: string;
  tools?: McpToolSpec[];
}
