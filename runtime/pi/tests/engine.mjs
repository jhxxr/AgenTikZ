import test from 'node:test';
import assert from 'node:assert/strict';
import { PiEngine, validateBridge } from '../engine.mjs';

const specs = [{ name: 'get_project_context', description: 'Read current project',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false } }];
const request = (changes = {}) => ({
  requestId: 'r1', conversationId: 'chat', projectId: 'project-A', provider: 'anthropic',
  model: 'fixture', apiKey: 'not-a-real-key', tools: specs,
  bridge: { endpoint: 'http://127.0.0.1:12345/call', token: 'a'.repeat(64) },
  prompt: 'Read current project', history: [], ...changes,
});

function harness({ maxSessions = 8, maxTurns = 24 } = {}) {
  const created = [];
  const fetches = [];
  const sdk = {
    createExtensionRuntime: () => ({}), SessionManager: { inMemory: () => ({}) },
    SettingsManager: { inMemory: (settings) => settings },
    createModelRuntime: async () => ({
      getModel: (_provider, model) => model === 'missing' ? undefined : { id: model },
      setRuntimeApiKey: async () => {}, getModels: () => [],
    }),
    createAgentSession: async (options) => {
      let listener = () => {};
      const session = {
        options, disposed: false, prompts: [], history: [],
        subscribe: (callback) => { listener = callback; return () => { listener = () => {}; }; },
        emit: (event) => listener(event),
        prompt: async (text, promptOptions) => {
          session.prompts.push({ text, promptOptions });
          const result = await options.customTools[0].execute('tool-1', {}, undefined);
          session.history.push(result);
          listener({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Reviewed.' } });
        },
        getLastAssistantText: () => 'Reviewed.',
        abort: async () => {},
        dispose: () => { session.disposed = true; },
      };
      created.push(session);
      return { session };
    },
  };
  const engine = new PiEngine(sdk, { maxSessions, maxTurns, fetchImpl: async (url, options) => {
    fetches.push({ url, ...options });
    return { ok: true, json: async () => ({ projectId: 'fixture', revision: 1 }) };
  } });
  return { engine, created, fetches, sdk };
}

test('retains native session/tool history while rotating the per-turn bridge token', async () => {
  const { engine, created, fetches } = harness();
  const first = await engine.prompt(request({ history: [{ role: 'user', content: 'Prior visible conversation' }] }), () => {});
  const next = request({ requestId: 'r2', bridge: { endpoint: 'http://127.0.0.1:23456/call', token: 'b'.repeat(64) } });
  const second = await engine.prompt(next, () => {});
  assert.equal(first.resumed, false);
  assert.equal(second.resumed, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].history.length, 2);
  assert.match(created[0].prompts[0].text, /Prior visible conversation/);
  assert.doesNotMatch(created[0].prompts[1].text, /Previous visible conversation/);
  assert.equal(fetches[1].headers.authorization, `Bearer ${'b'.repeat(64)}`);
  assert.equal(fetches[1].url, next.bridge.endpoint);
  engine.dispose();
});

test('disables discovered resources, prompt expansion, native tools and background warming', async () => {
  const { engine, created } = harness();
  await engine.prompt(request(), () => {});
  const { options } = created[0];
  assert.deepEqual(options.tools, ['get_project_context']);
  assert.deepEqual(options.resourceLoader.getAgentsFiles(), { agentsFiles: [] });
  assert.deepEqual(options.resourceLoader.getExtensions().extensions, []);
  assert.deepEqual(options.resourceLoader.getSkills().skills, []);
  assert.deepEqual(created[0].prompts[0].promptOptions, { expandPromptTemplates: false });
  assert.equal(options.settingsManager.cacheWarming, 'off');
  assert.equal(options.thinkingLevel, 'medium');
  await assert.rejects(options.customTools[0].execute('late', {}), /ended/);
  engine.dispose();
});

test('separates project, conversation, model and credential scopes and evicts bounded idle sessions', async () => {
  const { engine, created } = harness({ maxSessions: 2 });
  for (const changes of [{}, { projectId: 'project-B' }, { conversationId: 'chat2' },
    { model: 'other' }, { apiKey: 'rotated-key' }, { thinkingLevel: 'high' }]) {
    assert.equal((await engine.prompt(request(changes), () => {})).resumed, false);
  }
  assert.equal(created.length, 6);
  assert.equal(created[0].disposed, true);
  assert.equal(engine.sessions.size, 2);
  engine.dispose();
  assert.equal(created.at(-1).disposed, true);
});

test('fails without a fallback model and sanitizes arbitrary provider failures', async () => {
  const { engine, created } = harness();
  await assert.rejects(engine.prompt(request({ provider: 'google-vertex' }), () => {}), /not supported/);
  assert.equal(created.length, 0);
  await assert.rejects(engine.prompt(request({ model: 'missing' }), () => {}), /not in the pinned Pi catalog/);
  await engine.prompt(request(), () => {});
  created[0].prompt = async () => { throw new Error('Authorization: sk-SECRET provider response'); };
  await assert.rejects(engine.prompt(request(), () => {}), (error) => !error.message.includes('SECRET'));
  assert.equal(engine.sessions.size, 0);
  assert.equal(engine.active, null);
});

test('rejects concurrent prompts, aborts the active task and rebuilds on retry', async () => {
  const { engine, created } = harness();
  await engine.prompt(request(), () => {});
  let reject;
  created[0].prompt = () => new Promise((_resolve, fail) => { reject = fail; });
  created[0].abort = async () => reject(new Error('Pi task cancelled'));
  const running = engine.prompt(request({ requestId: 'long' }), () => {});
  await assert.rejects(engine.prompt(request({ requestId: 'other' }), () => {}), /already running/);
  await engine.abort('long');
  await assert.rejects(running, /cancelled/);
  assert.equal(engine.sessions.size, 0);
  assert.equal((await engine.prompt(request(), () => {})).resumed, false);
  engine.dispose();
});

test('only accepts an authorized loopback bridge with no redirects or alternate paths', () => {
  for (const endpoint of ['https://example.com/call', 'http://localhost:123/call',
    'http://127.0.0.1:123/other', 'http://user@127.0.0.1:123/call', 'http://127.0.0.1:123/call?x=1']) {
    assert.throws(() => validateBridge({ endpoint, token: 'x'.repeat(64) }));
  }
  assert.throws(() => validateBridge({ endpoint: 'http://127.0.0.1:123/call', token: 'short' }));
});

test('turn and output budgets survive an aborted message_end event and dispose the session', async () => {
  for (const kind of ['turn', 'output']) {
    const { engine, created } = harness({ maxTurns: 2 });
    await engine.prompt(request(), () => {});
    created[0].prompt = async () => {
      if (kind === 'turn') {
        for (let i = 0; i < 3; i++) created[0].emit({ type: 'turn_start' });
      } else {
        created[0].emit({ type: 'message_update', assistantMessageEvent: {
          type: 'text_delta', delta: 'x'.repeat(2 * 1024 * 1024 + 1),
        } });
      }
      created[0].emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'aborted' } });
    };
    await assert.rejects(engine.prompt(request(), () => {}),
      kind === 'turn' ? /tool-turn budget/ : /output budget/);
    assert.equal(created[0].disposed, true);
    assert.equal(engine.active, null);
    assert.equal(engine.sessions.size, 0);
  }
});
