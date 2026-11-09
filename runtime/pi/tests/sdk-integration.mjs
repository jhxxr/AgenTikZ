import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createAgentSession, createExtensionRuntime, ModelRuntime, SessionManager, SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { PiEngine } from '../engine.mjs';

test('real pinned SDK performs tool calls and reuses their history through a loopback model fixture', { timeout: 30000 }, async (t) => {
  const requests = [];
  let tools = 0;
  let failModel = false;
  let waitForAbort = false;
  let modelStarted;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (req.url === '/call') {
      tools++;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ projectId: 'fixture', paperRevision: 7 }));
      return;
    }
    const input = JSON.parse(body);
    requests.push(input);
    if (waitForAbort) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.flushHeaders();
      modelStarted();
      return;
    }
    if (failModel) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'echoed-secret-fixture-key', type: 'authentication_error' } }));
      return;
    }
    const toolCall = requests.length === 1;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({
      id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', created: 0,
      choices: [{ index: 0, delta, finish_reason }],
    })}\n\n`);
    chunk({ role: 'assistant' });
    if (toolCall) {
      chunk({ tool_calls: [{ index: 0, id: 'fixture_call', type: 'function',
        function: { name: 'get_project_context', arguments: '{}' } }] });
      chunk({}, 'tool_calls');
    } else {
      chunk({ content: 'Fixture verified.' });
      chunk({}, 'stop');
    }
    res.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  let actualSession;
  const engine = new PiEngine({
    createExtensionRuntime, SessionManager, SettingsManager,
    createModelRuntime: async () => {
      const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(),
        modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
      runtime.registerProvider('agentikz-test', {
        baseUrl: base + '/v1', api: 'openai-completions', apiKey: 'fixture-only',
        models: [{ id: 'fixture', name: 'Local test fixture', reasoning: false, input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 16384, maxTokens: 1024 }],
      });
      return runtime;
    },
    createAgentSession: async (options) => {
      const result = await createAgentSession(options);
      actualSession = result.session;
      return result;
    },
  }, { providers: ['agentikz-test'] });
  t.after(() => engine.dispose());
  const request = {
    requestId: 'one', conversationId: 'chat', projectId: 'project', provider: 'agentikz-test',
    model: 'fixture', apiKey: 'fixture-only', prompt: 'Read the project.', history: [],
    tools: [{ name: 'get_project_context', description: 'Read project context',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false } }],
    bridge: { endpoint: base + '/call', token: 't'.repeat(64) },
  };
  const first = await engine.prompt(request, () => {});
  assert.equal(first.resumed, false);
  assert.equal(first.reply, 'Fixture verified.');
  assert.equal(tools, 1);
  assert.deepEqual(actualSession.getActiveToolNames(), ['get_project_context']);
  assert.deepEqual(actualSession.getCallableToolNames(), ['get_project_context']);
  assert.ok(actualSession.messages.some((message) => message.role === 'toolResult'));
  const second = await engine.prompt({ ...request, requestId: 'two', prompt: 'Continue from your tool result.' }, () => {});
  assert.equal(second.resumed, true);
  assert.ok(requests.at(-1).messages.some((message) => message.role === 'tool'));
  assert.equal(requests.length, 3);
  waitForAbort = true;
  const started = new Promise((resolve) => { modelStarted = resolve; });
  const cancelling = engine.prompt({ ...request, requestId: 'cancelled', prompt: 'Wait for cancellation' }, () => {});
  const cancelled = assert.rejects(cancelling, /cancelled/);
  await started;
  await engine.abort('cancelled');
  await cancelled;
  assert.equal(engine.active, null);
  assert.equal(engine.sessions.size, 0);
  waitForAbort = false;
  failModel = true;
  await assert.rejects(engine.prompt({ ...request, requestId: 'failed', prompt: 'Check failure handling' }, () => {}),
    (error) => error.message.includes('Model request failed') && !error.message.includes('echoed-secret'));
  assert.equal(engine.sessions.size, 0);
});

test('actual worker imports the pinned SDK and exposes a catalog without credentials or a model call', { timeout: 30000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../worker.mjs', import.meta.url))], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  try {
    const result = await new Promise((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(() => reject(new Error('Worker handshake timeout')), 20000);
      const fail = (error) => { clearTimeout(timer); reject(error); };
      child.on('error', fail);
      child.on('exit', () => fail(new Error('Worker exited before catalog')));
      child.stderr.resume();
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const record = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
          if (record.type === 'ready') {
            assert.equal(record.version, '1.5.0');
            for (const invalid of [null, [], 42, { type: 'inspect' }, { type: 'prompt', requestId: 42 }]) {
              child.stdin.write(JSON.stringify(invalid) + '\n');
            }
            child.stdin.write(JSON.stringify({ type: 'inspect', requestId: 'catalog\u2028record' }) + '\n');
          }
          if (record.type === 'models') { clearTimeout(timer); resolve(record); }
          if (record.type === 'error' && record.error !== 'Invalid protocol record') fail(new Error(record.error));
        }
      });
    });
    assert.equal(result.requestId, 'catalog\u2028record');
    assert.ok(result.models.length > 0);
    assert.ok(result.models.some((model) => model.provider === 'anthropic'));
    assert.ok(!result.models.some((model) => ['openai-codex', 'google-vertex', 'amazon-bedrock'].includes(model.provider)));
  } finally { child.stdin.end(); child.kill(); }
});
