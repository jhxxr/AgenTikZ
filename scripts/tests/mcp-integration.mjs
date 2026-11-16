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

async function fixture(t, scope) {
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
      : call.toolName === 'get_diagram_design_skill'
      ? call.arguments.action === 'list'
        ? { version: '1.0.0', contentKind: 'catalog', skills: [{ id: 'canvas-editing', references: ['layout'] }] }
        : call.arguments.skillId
          ? { skillId: call.arguments.skillId, version: '1.0.0', contentKind: 'adapted-skill', reference: call.arguments.reference ?? null,
              text: 'Fixture packaged editing workflow.', startLine: 1, endLine: 1, totalLines: 1, nextStartLine: null }
          : { skill: 'tikz-diagram-reproduction', topic: call.arguments.topic ?? 'design', contentKind: 'reference',
              text: 'Original reference fixture', macroIndex: [], nextStartLine: null }
      : call.toolName === 'render_canvas_preview'
      ? { renderer: 'tex', image: { mimeType: 'image/png', data: 'cGl4ZWxz' }, applied: false }
      : { error: { code: 'source_changed', message: 'Source changed' } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const env = { ...globalThis.process.env, AGENTIKZ_MCP_ENDPOINT: `http://127.0.0.1:${server.address().port}/call`, AGENTIKZ_MCP_TOKEN: token };
  delete env.AGENTIKZ_MCP_SCOPE;
  if (scope) env.AGENTIKZ_MCP_SCOPE = scope;
  const process = spawn(binary, [], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env,
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

test('independent canvas-scoped client discovers drawing tools without exposing manuscript access', async (t) => {
  const client = await fixture(t, 'canvas');
  const initialized = await client.request('initialize', {
    protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Independent external agent', version: '1' },
  });
  assert.equal(initialized.error, undefined);
  assert.match(initialized.result.instructions, /external MCP client/);
  client.notify('notifications/initialized');
  const listed = await client.request('tools/list');
  assert.equal(listed.result.tools.length, 11);
  assert.ok(listed.result.tools.some((tool) => tool.name === 'propose_surgical_diff'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'render_canvas_preview'));
  for (const name of ['read_project_file', 'get_project_context', 'propose_project_patch', 'get_paper_diagnostics']) {
    assert.ok(!listed.result.tools.some((tool) => tool.name === name));
    const denied = await client.request('tools/call', { name, arguments: {} });
    assert.equal(denied.error.code, -32602);
  }
  assert.equal(client.calls.length, 0, 'Out-of-scope tools must not reach the app bridge');
  const source = await client.request('tools/call', { name: 'get_canvas_source', arguments: {} });
  assert.equal(source.result.isError, false);
  assert.equal(source.result.structuredContent.revision, 7);
  const preview = await client.request('tools/call', { name: 'render_canvas_preview', arguments: {} });
  assert.equal(preview.result.content[1].type, 'image');
});

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
    const skillTool = listed.result.tools.find((tool) => tool.name === 'get_diagram_design_skill');
    assert.deepEqual(skillTool.inputSchema.properties.action.enum, ['list', 'read', 'reload']);
    assert.deepEqual(skillTool.inputSchema.properties.skillId.enum, [
      'scientific-diagram-design', 'reference-reproduction', 'canvas-editing', 'publication-style',
    ]);
    assert.deepEqual(skillTool.inputSchema.properties.topic.enum, ['design', 'reproduction', 'swsa', 'gnn', 'mae', 'riemannian']);
    assert.ok(listed.result.tools.find((tool) => tool.name === 'get_component_library').inputSchema.properties.componentId);
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
    const catalog = await client.request('tools/call', { name: 'get_diagram_design_skill', arguments: { action: 'list' } });
    assert.equal(catalog.result.structuredContent.contentKind, 'catalog');
    assert.ok(!catalog.result.content[0].text.includes('Fixture packaged editing workflow'));
    const skill = await client.request('tools/call', { name: 'get_diagram_design_skill',
      arguments: { skillId: 'canvas-editing', reference: 'layout' } });
    assert.equal(skill.result.structuredContent.contentKind, 'adapted-skill');
    assert.equal(skill.result.structuredContent.skillId, 'canvas-editing');
    assert.equal(client.calls.at(-1).arguments.reference, 'layout');
    const reloadArgs = { action: 'reload', skillId: 'canvas-editing', reference: 'layout', startLine: 1, lineCount: 5 };
    const reloaded = await client.request('tools/call', { name: 'get_diagram_design_skill', arguments: reloadArgs });
    assert.equal(reloaded.error, undefined);
    assert.equal(reloaded.result.isError, false);
    assert.equal(reloaded.result.structuredContent.contentKind, 'adapted-skill');
    assert.equal(reloaded.result.structuredContent.skillId, 'canvas-editing');
    assert.equal(reloaded.result.structuredContent.reference, 'layout');
    assert.equal(JSON.parse(reloaded.result.content[0].text).text, 'Fixture packaged editing workflow.');
    assert.deepEqual(client.calls.at(-1), { toolName: 'get_diagram_design_skill', arguments: reloadArgs });
    const originalSkill = await client.request('tools/call', { name: 'get_diagram_design_skill', arguments: { topic: 'mae' } });
    assert.equal(originalSkill.result.structuredContent.contentKind, 'reference');
    assert.equal(originalSkill.result.structuredContent.topic, 'mae');
    const unknown = await client.request('tools/call', { name: 'run_shell', arguments: {} });
    assert.equal(unknown.error.code, -32602);
  });
}
