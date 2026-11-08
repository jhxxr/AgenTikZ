import { describe, expect, it } from 'vitest';
import { exportMcpConfig, parseMcpImport } from '../config';

describe('MCP configuration interchange', () => {
  it('previews stdio and HTTP imports, disabled and with sensitive credentials', () => {
    const parsed = parseMcpImport(JSON.stringify({ mcpServers: {
      notes: { command: 'node', args: ['C:\\Research notes\\server.js'], env: { TOKEN: 'not-for-export' } },
      web: { type: 'http', url: 'https://example.org/mcp', headers: { Authorization: 'Bearer secret' }, timeout: 100 },
      old: { type: 'sse', url: 'https://example.org/sse' },
    } }));
    expect(parsed.servers).toHaveLength(2);
    expect(parsed.servers.every((server) => !server.enabled)).toBe(true);
    expect(parsed.servers[0].args).toEqual(['C:\\Research notes\\server.js']);
    expect(parsed.servers[0].env.TOKEN.secret).toBe(true);
    expect(parsed.warnings.join(' ')).toContain('timeout');
    expect(parsed.warnings.join(' ')).toContain('sse');
    const exported = exportMcpConfig({ schemaVersion: 1, builtinEnabled: true, servers: parsed.servers });
    expect(exported).not.toContain('not-for-export');
    expect(exported).not.toContain('Bearer secret');
    expect(JSON.parse(exported).mcpServers.notes.args).toEqual(['C:\\Research notes\\server.js']);
  });
  it('rejects malformed fields instead of coercing commands or arguments', () => {
    expect(() => parseMcpImport('{"mcpServers":{"bad":{"command":"node","args":"--stdio"}}}')).toThrow(/数组/);
    expect(() => parseMcpImport('{"mcpServers":{"bad":{"command":"node","env":{"TOKEN":123}}}}')).toThrow(/字符串/);
    expect(() => parseMcpImport('{"mcpServers":[]}')).toThrow();
  });
});
