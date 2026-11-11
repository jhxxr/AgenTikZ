import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
  DEFAULT_CHANNEL_CONTEXT_WINDOW, DEFAULT_CHANNEL_MAX_TOKENS,
  escapeConfigLiteral, fetchChannelModels, normalizeChannelBaseUrl, registerChannel, validateChannel, validateUserAgent,
} from '../channels.mjs';
import { sessionKey } from '../engine.mjs';

const channel = (changes = {}) => ({
  id: 'channel-a', name: 'Custom gateway', provider: 'openai', api: 'openai-completions',
  baseUrl: 'https://example.test/custom/v1', models: [{
    id: 'model-a', name: 'Model A', contextWindow: 32768, maxTokens: 2048, reasoning: false, supportsImages: false,
  }], ...changes,
});
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

test('discovers and deduplicates gateway models, preserving base paths and keeping credentials out of URLs', async () => {
  let captured;
  const models = await fetchChannelModels(channel(), 'test-only-key', async (url, options) => {
    captured = { url: String(url), ...options };
    return json({ data: [{ id: 'model-a' }, { id: 'model-b', name: 'Model B' }, { id: 'model-a' }, null, { id: 3 }] });
  });
  assert.equal(captured.url, 'https://example.test/custom/v1/models');
  assert.equal(captured.headers.authorization, 'Bearer test-only-key');
  assert.equal(captured.redirect, 'error');
  assert.deepEqual(models.map((model) => model.id), ['model-a', 'model-b']);
  assert.equal(models[0].supportsImages, false, 'unknown model capabilities must not be guessed');
  assert.equal(models[0].contextWindow, DEFAULT_CHANNEL_CONTEXT_WINDOW);
  assert.equal(models[0].maxTokens, DEFAULT_CHANNEL_MAX_TOKENS);
});

test('Anthropic discovery follows bounded cursor pagination on the same endpoint', async () => {
  const requests = [];
  const models = await fetchChannelModels(channel({ api: 'anthropic-messages', baseUrl: 'https://example.test/proxy' }), 'test-key', async (url, options) => {
    requests.push({ url: String(url), ...options });
    return requests.length === 1 ? json({ data: [{ id: 'one', display_name: 'One' }], has_more: true, last_id: 'one' })
      : json({ data: [{ id: 'two' }], has_more: false });
  });
  assert.equal(requests[0].url, 'https://example.test/proxy/v1/models');
  assert.equal(requests[1].url, 'https://example.test/proxy/v1/models?after_id=one');
  assert.equal(requests[0].headers['x-api-key'], 'test-key');
  assert.equal(models[0].name, 'One');
  assert.equal(models.length, 2);
});

test('Google discovery filters non-chat models and uses headers rather than query-string keys', async () => {
  const requests = [];
  const models = await fetchChannelModels(channel({ api: 'google-generative-ai', baseUrl: 'https://example.test/v1beta' }), 'test-key', async (url, options) => {
    requests.push({ url: String(url), ...options });
    return json({ models: [
      { name: 'models/gemini-fixture', displayName: 'Gemini', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 65536, outputTokenLimit: 1024 },
      { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] },
    ] });
  });
  assert.equal(requests[0].headers['x-goog-api-key'], 'test-key');
  assert.equal(requests[0].url, 'https://example.test/v1beta/models');
  assert.equal(models[0].id, 'gemini-fixture');
  assert.equal(models[0].contextWindow, 65536);
  assert.equal(models.length, 1);
});

test('rejects invalid URLs, oversized results, bad pagination, HTML and auth error bodies without exposing secrets', async () => {
  for (const baseUrl of ['file:///tmp/test', 'https://user:secret@example.test', 'https://example.test?key=secret', 'https://example.test/#secret']) {
    assert.throws(() => validateChannel(channel({ baseUrl })));
  }
  for (const response of [json({ error: { message: 'SECRET' } }, 401), new Response('<html>SECRET</html>'),
    json({ strange: 'SECRET' }), json({ data: Array.from({ length: 2001 }, (_, index) => ({ id: String(index) })) }),
    new Response('a'.repeat(2 * 1024 * 1024 + 1))]) {
    await assert.rejects(fetchChannelModels(channel(), 'SECRET', async () => response), (error) => !error.message.includes('SECRET'));
  }
  await assert.rejects(fetchChannelModels(channel({ api: 'anthropic-messages' }), 'SECRET', async () =>
    json({ data: [], has_more: true, last_id: 'repeat' })), /分页重复/);
});

test('does not follow a real redirect or forward credentials to the redirect destination', async (t) => {
  let leaked = false;
  const server = createServer((req, res) => {
    if (req.url === '/v1/models') { res.writeHead(302, { location: '/leak' }); res.end(); }
    else { leaked = true; res.end('{}'); }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await assert.rejects(fetchChannelModels(channel({ baseUrl: `http://127.0.0.1:${server.address().port}/v1` }), 'fixture-key'), /重定向/);
  assert.equal(leaked, false);
});

test('registers explicit capabilities under channel-specific provider ids and isolates endpoint/protocol/model changes', () => {
  let captured;
  const runtime = { registerProvider: (id, config) => { captured = { id, config }; } };
  const config = channel();
  assert.equal(registerChannel(runtime, config, 'model-a'), 'agentikz-channel-a');
  assert.equal(captured.config.baseUrl, config.baseUrl);
  assert.equal(captured.config.api, 'openai-completions');
  assert.deepEqual(captured.config.models[0].input, ['text']);
  assert.equal(captured.config.models[0].compat.supportsStore, false);
  assert.equal(captured.config.models[0].compat.supportsDeveloperRole, false);
  assert.equal(captured.config.models[0].compat.maxTokensField, 'max_tokens');
  assert.ok(!JSON.stringify(captured).includes('apiKey'));
  assert.throws(() => registerChannel(runtime, config, 'deleted'), /Invalid/);
  const input = { conversationId: 'chat', projectId: 'project', provider: 'openai', model: 'model-a', apiKey: 'fixture', tools: [], channel: config };
  for (const changes of [{ id: 'channel-b' }, { baseUrl: 'https://other.test/v1' }, { api: 'openai-responses' },
    { models: [{ ...config.models[0], supportsImages: true }] }]) {
    assert.notEqual(sessionKey(input), sessionKey({ ...input, channel: { ...config, ...changes } }));
  }
});

test('normalizes bare gateway origins and pasted endpoint suffixes per protocol', () => {
  assert.equal(normalizeChannelBaseUrl('https://share.example.test/', 'openai-completions'), 'https://share.example.test/v1');
  assert.equal(normalizeChannelBaseUrl('https://share.example.test', 'openai-responses'), 'https://share.example.test/v1');
  assert.equal(normalizeChannelBaseUrl('https://share.example.test/v1/chat/completions', 'openai-completions'), 'https://share.example.test/v1');
  assert.equal(normalizeChannelBaseUrl('https://share.example.test/v1', 'anthropic-messages'), 'https://share.example.test');
  assert.equal(normalizeChannelBaseUrl('https://share.example.test/v1/messages', 'anthropic-messages'), 'https://share.example.test');
  assert.equal(normalizeChannelBaseUrl('https://share.example.test/', 'google-generative-ai'), 'https://share.example.test/v1beta');
  assert.equal(normalizeChannelBaseUrl('https://example.test/missing/v1', 'openai-completions'), 'https://example.test/missing/v1');
});

test('validates and escapes User-Agent literals and sets DeepSeek reasoning compat', () => {
  assert.equal(escapeConfigLiteral('!whoami $HOME'), '$!whoami $$HOME');
  assert.throws(() => validateUserAgent('bad\r\nheader: injected'), /Invalid User-Agent/);
  let captured;
  const runtime = { registerProvider: (id, config) => { captured = { id, config }; } };
  const deepseekChannel = channel({
    baseUrl: 'https://share.example.test/',
    models: [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', contextWindow: 128000, maxTokens: 32768, reasoning: false, supportsImages: false }],
  });
  registerChannel(runtime, deepseekChannel, 'deepseek-v4.1-flash', '!ua $ENV');
  assert.equal(captured.config.baseUrl, 'https://share.example.test/v1');
  assert.equal(captured.config.headers['User-Agent'], '$!ua $$ENV');
  assert.equal(captured.config.models[0].reasoning, true);
  assert.equal(captured.config.models[0].compat.requiresReasoningContentOnAssistantMessages, true);
  assert.equal(captured.config.models[0].compat.thinkingFormat, 'deepseek');
  assert.equal(captured.config.models[0].compat.supportsReasoningEffort, false);
});
