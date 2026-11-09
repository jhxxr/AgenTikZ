import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const binary = path.join(root, 'src-tauri/binaries', process.platform === 'win32' ? 'agentikz-mcp.exe' : 'agentikz-mcp');

async function fixture(t) {
  const token = randomBytes(32).toString('hex');
  const calls = [];
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    const call = JSON.parse(body);
    calls.push(call);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(call.toolName === 'get_canvas_source'
      ? { source: '\\begin{tikzpicture}\\end{tikzpicture}', revision: 7, sourceHash: 'fixture' }
      : call.toolName === 'get_project_context'
      ? { projectId: 'fixture-project', workbenchMode: 'paper', paperRevision: 9 }
      : call.toolName === 'read_project_file'
      ? { relativePath: call.arguments.relativePath, source: 'Unsaved manuscript', sourceHash: 'paper-fixture', paperRevision: 9 }
      : call.toolName === 'render_canvas_preview'
      ? { renderer: 'tex', image: { mimeType: 'image/png', data: 'cGl4ZWxz' }, applied: false }
      : { error: { code: 'source_changed', message: 'Source changed' } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const process = spawn(binary, [], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...globalThis.process.env, AGENTIKZ_MCP_ENDPOINT: `http://127.0.0.1:${server.address().port}/call`, AGENTIKZ_MCP_TOKEN: token },
  });
  let nextId = 1;
  let stderr = '';
  process.stderr.on('data', (chunk) => { stderr += chunk; });
  const pending = new Map();
  const output = createInterface({ input: process.stdout });
  output.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); }
    catch { for (const item of pending.values()) item.reject(new Error('Non-JSON stdout')); return; }
    if (message.id !== undefined) {
      const item = pending.get(message.id);
      if (item) { clearTimeout(item.timer); pending.delete(message.id); item.resolve(message); }
    }
  });
  process.on('error', (error) => { for (const item of pending.values()) item.reject(error); });
  process.on('exit', () => { for (const item of pending.values()) item.reject(new Error(`MCP process exited: ${stderr}`)); });
  t.after(async () => {
    output.close();
    for (const item of pending.values()) clearTimeout(item.timer);
    process.stdin.end();
    if (process.exitCode === null) {
      const timer = setTimeout(() => process.kill(), 3000);
      await once(process, 'exit');
      clearTimeout(timer);
    }
    assert.ok(!stderr.includes(token), 'Authorization token must never appear in stderr');
  });
  const notify = (method, params = {}) => process.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out: ${stderr}`)); }, 8000);
    pending.set(id, { resolve, reject, timer });
    process.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  return { request, notify, calls, server };
}

for (const version of ['2024-11-05', '2025-11-25']) {
  test(`native stdio MCP supports ${version}, real tool forwarding and structured failures`, async (t) => {
    const client = await fixture(t);
    const initialized = await client.request('initialize', {
      protocolVersion: version, capabilities: {}, clientInfo: { name: 'AgenTikZ transport test', version: '1' },
    });
    assert.equal(initialized.error, undefined);
    assert.equal(initialized.result.protocolVersion, version);
    client.notify('notifications/initialized');
    const listed = await client.request('tools/list');
    assert.equal(listed.result.tools.length, 15);
    assert.ok(listed.result.tools.some((tool) => tool.name === 'get_diagram_design_skill'));
    assert.ok(listed.result.tools.some((tool) => tool.name === 'propose_tikz_patch'));
    for (const name of ['get_project_context', 'read_project_file', 'propose_project_patch', 'get_paper_diagnostics']) {
      assert.ok(listed.result.tools.some((tool) => tool.name === name));
    }
    const source = await client.request('tools/call', { name: 'get_canvas_source', arguments: {} });
    assert.equal(source.result.isError, false);
    assert.equal(JSON.parse(source.result.content[0].text).revision, 7);
    assert.equal(client.calls[0].toolName, 'get_canvas_source');
    const project = await client.request('tools/call', { name: 'get_project_context', arguments: {} });
    assert.equal(JSON.parse(project.result.content[0].text).workbenchMode, 'paper');
    const paper = await client.request('tools/call', { name: 'read_project_file', arguments: { relativePath: 'sections/results.tex' } });
    assert.equal(JSON.parse(paper.result.content[0].text).source, 'Unsaved manuscript');
    assert.equal(client.calls.at(-1).arguments.relativePath, 'sections/results.tex');
    const preview = await client.request('tools/call', { name: 'render_canvas_preview', arguments: {} });
    assert.deepEqual(preview.result.content[1], { type: 'image', mimeType: 'image/png', data: 'cGl4ZWxz' });
    assert.ok(!preview.result.content[0].text.includes('cGl4ZWxz'));
    assert.equal(preview.result.structuredContent.image, undefined);
    const proposal = await client.request('tools/call', { name: 'propose_tikz_patch', arguments: { baseRevision: 1 } });
    assert.equal(proposal.result.isError, true);
    assert.equal(JSON.parse(proposal.result.content[0].text).error.code, 'source_changed');
    const unknown = await client.request('tools/call', { name: 'run_shell', arguments: {} });
    assert.equal(unknown.error.code, -32602);
  });
}
