import type { McpConfig, McpServerConfig, McpValue } from '../../types/mcp';
import { newMcpServer } from '../../store/useMcpStore';

function stringValues(value: unknown, location: string): Record<string, McpValue> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${location} 必须是字符串映射。`);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (typeof item !== 'string') throw new Error(`${location}.${key} 必须是字符串。`);
    return [key, { value: item, secret: true, stored: false, sessionOnly: false }];
  }));
}

export function parseMcpImport(text: string): { servers: McpServerConfig[]; warnings: string[] } {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.mcpServers || Array.isArray(parsed.mcpServers)
      || typeof parsed.mcpServers !== 'object') throw new Error('需要包含 mcpServers 对象的 JSON 配置。');
  const warnings: string[] = [];
  const servers: McpServerConfig[] = [];
  for (const [name, raw] of Object.entries(parsed.mcpServers)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${name} 必须是配置对象。`);
    const entry = raw as Record<string, unknown>;
    const unknown = Object.keys(entry).filter((key) => !['type', 'command', 'args', 'env', 'url', 'headers', 'disabled'].includes(key));
    if (unknown.length) warnings.push(`${name}：不支持字段 ${unknown.join('、')}，不会导入。`);
    if (entry.type && !['stdio', 'http', 'streamableHttp', 'streamable-http'].includes(String(entry.type))) {
      warnings.push(`${name}：不支持 ${entry.type} 连接类型，已跳过。`); continue;
    }
    const server = { ...newMcpServer(), name };
    if (entry.url !== undefined) {
      if (typeof entry.url !== 'string') throw new Error(`${name}.url 必须是字符串。`);
      server.transport = 'http'; server.url = entry.url; server.headers = stringValues(entry.headers, `${name}.headers`);
      if (entry.command !== undefined || entry.env !== undefined || entry.args !== undefined) {
        warnings.push(`${name}：HTTP 服务的 command、args 和 env 不会导入。`);
      }
    } else {
      if (typeof entry.command !== 'string' || !entry.command.trim()) throw new Error(`${name} 缺少 command。`);
      server.command = entry.command;
      if (entry.args !== undefined && (!Array.isArray(entry.args) || entry.args.some((item) => typeof item !== 'string'))) {
        throw new Error(`${name}.args 必须是字符串数组。`);
      }
      server.args = (entry.args as string[]) || [];
      server.env = stringValues(entry.env, `${name}.env`);
      if (entry.headers !== undefined) warnings.push(`${name}：stdio 服务的 headers 不会导入。`);
    }
    servers.push(server);
  }
  if (!servers.length) throw new Error('未找到可导入的 stdio 或 Streamable HTTP 服务。');
  return { servers, warnings };
}

export function exportMcpConfig(config: McpConfig): string {
  const ordinary = (values: Record<string, McpValue>) =>
    Object.fromEntries(Object.entries(values).filter(([, value]) => !value.secret).map(([key, value]) => [key, value.value || '']));
  return JSON.stringify({
    mcpServers: Object.fromEntries(config.servers.map((server) => [server.name,
      server.transport === 'stdio'
        ? { command: server.command, args: server.args, env: ordinary(server.env), disabled: !server.enabled }
        : { type: 'http', url: server.url, headers: ordinary(server.headers), disabled: !server.enabled },
    ])),
  }, null, 2);
}
