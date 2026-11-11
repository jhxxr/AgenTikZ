import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createAgentSession, createExtensionRuntime, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { PiEngine } from '../engine.mjs';

for (const api of ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai']) {
  test(`real Pi SDK uses custom ${api} endpoints and isolates channels sharing a model id`, { timeout: 30000 }, async (t) => {
    const calls = [];
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      calls.push({ path: req.url, headers: req.headers, body: JSON.parse(body) });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (data, event) => res.write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`);
      const text = 'Custom channel verified.';
      if (api === 'openai-completions') {
        send({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', created: 0,
          choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] });
        send({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', created: 0,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
        res.write('data: [DONE]\n\n');
      } else if (api === 'anthropic-messages') {
        const event = (type, data) => send({ type, ...data }, type);
        event('message_start', { message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture',
          content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
        event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
        event('content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
        event('content_block_stop', { index: 0 });
        event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } });
        event('message_stop', {});
      } else if (api === 'google-generative-ai') {
        send({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }, modelVersion: 'fixture' });
      } else {
        const item = { type: 'message', id: 'msg-fixture', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text, annotations: [] }] };
        const event = (type, data) => send({ type, ...data });
        event('response.created', { response: { id: 'fixture', model: 'fixture', status: 'in_progress' } });
        event('response.output_item.added', { output_index: 0, item: { ...item, content: [], status: 'in_progress' } });
        event('response.content_part.added', { item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } });
        event('response.output_text.delta', { item_id: item.id, output_index: 0, content_index: 0, delta: text });
        event('response.output_text.done', { item_id: item.id, output_index: 0, content_index: 0, text });
        event('response.output_item.done', { output_index: 0, item });
        event('response.completed', { response: { id: 'fixture', model: 'fixture', status: 'completed', output: [item],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 } } } });
      }
      res.end();
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const engine = new PiEngine({
      createAgentSession, createExtensionRuntime, SessionManager, SettingsManager,
      createModelRuntime: () => ModelRuntime.create({ credentials: new InMemoryCredentialStore(),
        modelsPath: null, allowModelNetwork: false, refreshOnCreate: false }),
    });
    t.after(() => engine.dispose());
    const request = (id) => ({
      requestId: id, projectId: 'project', conversationId: 'chat', provider: 'openai', model: 'fixture', thinkingLevel: 'off',
      apiKey: `key-for-${id}`, prompt: 'Hello.', tools: [],
      bridge: { endpoint: base + '/call', token: 't'.repeat(64) },
      channel: { id, name: id, provider: 'openai', api, baseUrl: `${base}/${id}/v1`,
        models: [{ id: 'fixture', name: 'Fixture', reasoning: false, supportsImages: false, contextWindow: 16384, maxTokens: 1024 }] },
      userAgent: '!AgenTikZ-Literal $PATH/1.0',
    });
    const first = await engine.prompt(request('one'), () => {});
    const second = await engine.prompt(request('two'), () => {});
    assert.equal(first.reply, 'Custom channel verified.');
    assert.equal(second.reply, first.reply);
    assert.equal(second.resumed, false);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].path.startsWith('/one/v1/'), calls[0].path);
    assert.ok(calls[1].path.startsWith('/two/v1/'), calls[1].path);
    if (api === 'anthropic-messages') {
      assert.equal(calls[0].path.split('?')[0], '/one/v1/messages');
      assert.equal(calls[1].path.split('?')[0], '/two/v1/messages');
    }
    assert.equal(calls[0].headers['user-agent'], '!AgenTikZ-Literal $PATH/1.0');
    const authHeader = api === 'anthropic-messages' ? 'x-api-key' : api === 'google-generative-ai' ? 'x-goog-api-key' : 'authorization';
    assert.ok(calls[0].headers[authHeader]?.includes('key-for-one'));
    assert.ok(calls[1].headers[authHeader]?.includes('key-for-two'));
    assert.ok(!JSON.stringify(calls[1].body).includes('key-for-one'));
  });
}
