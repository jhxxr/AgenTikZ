if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

import zlib from 'node:zlib';
import { EventEmitter } from 'node:events';
import { PiEngine } from './engine.mjs';
import { fetchChannelModels, sanitizeProxyEnvironment, testChannelConnection } from './channels.mjs';

const write = (record) => process.stdout.write(JSON.stringify(record) + '\n');

let engine;
try {
  await sanitizeProxyEnvironment(process.env);
  if (typeof zlib.createZstdDecompress === 'function') {
    const { configureHttpDispatcher } = await import(
      new URL('./node_modules/@earendil-works/pi-coding-agent/dist/core/http-dispatcher.js', import.meta.url)
    );
    configureHttpDispatcher();
  } else {
    const { default: EnvHttpProxyAgent } = await import(
      new URL('./node_modules/undici/lib/dispatcher/env-http-proxy-agent.js', import.meta.url)
    );
    const dispatcher = new EnvHttpProxyAgent({
      allowH2: false, proxyTunnel: true, bodyTimeout: 300_000, headersTimeout: 300_000,
      connect: { autoSelectFamilyAttemptTimeout: 2_000 },
    });
    if (dispatcher instanceof EventEmitter) dispatcher.on('error', () => {});
    globalThis[Symbol.for('undici.globalDispatcher.1')] = dispatcher;
  }
  const [
    { createAgentSession },
    { createExtensionRuntime },
    { ModelRuntime },
    { SessionManager },
    { SettingsManager },
    { InMemoryCredentialStore },
  ] = await Promise.all([
    import(new URL('./node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js', import.meta.url)),
    import(new URL('./node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/index.js', import.meta.url)),
    import(new URL('./node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js', import.meta.url)),
    import(new URL('./node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js', import.meta.url)),
    import(new URL('./node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.js', import.meta.url)),
    import(new URL('./node_modules/@earendil-works/pi-ai/dist/index.js', import.meta.url)),
  ]);
  engine = new PiEngine({
    createAgentSession, createExtensionRuntime, SessionManager, SettingsManager,
    createModelRuntime: () => ModelRuntime.create({
      credentials: new InMemoryCredentialStore(), modelsPath: null,
      allowModelNetwork: false, refreshOnCreate: false,
    }),
  }, { fetchImpl: (...args) => globalThis.fetch(...args) });
} catch (error) {
  const code = String(error?.code || error?.name || 'StartupError').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'StartupError';
  write({ type: 'startup_error', code });
  process.exit(1);
}

write({ type: 'ready', protocol: 1, version: '1.5.0' });

let input = '';
let shuttingDown = false;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  if (input.length > 16 * 1024 * 1024) { engine.dispose(); process.exit(2); }
  // Only LF frames records. Unicode line/paragraph separators are legitimate JSON data.
  let newline;
  while ((newline = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, newline).replace(/\r$/, '');
    input = input.slice(newline + 1);
    let record;
    try { record = JSON.parse(line); }
    catch { write({ type: 'error', error: 'Invalid JSON record' }); continue; }
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        typeof record.type !== 'string' || (record.type !== 'shutdown' &&
        (typeof record.requestId !== 'string' || !record.requestId || record.requestId.length > 128))) {
      write({ type: 'error', error: 'Invalid protocol record' });
      continue;
    }
    if (shuttingDown) continue;
    if (record.type === 'abort') {
      void engine.abort(record.requestId).catch(() => {});
    } else if (record.type === 'inspect') {
      if (engine.active) write({ type: 'error', requestId: record.requestId, error: 'Pi task is running' });
      else void engine.inspect().then((models) => write({ type: 'models', requestId: record.requestId, models }))
        .catch(() => write({ type: 'error', requestId: record.requestId, error: 'Pi catalog unavailable' }));
    } else if (record.type === 'fetch_models') {
      void fetchChannelModels(record.channel, record.apiKey, globalThis.fetch, record.userAgent)
        .then((models) => write({ type: 'models', requestId: record.requestId, models }))
        .catch((error) => write({ type: 'error', requestId: record.requestId, error: error.message }));
    } else if (record.type === 'test_channel') {
      void testChannelConnection(record.channel, record.apiKey, record.model, globalThis.fetch, record.userAgent, record.thinkingLevel)
        .then((status) => write({ type: 'channel_status', requestId: record.requestId, ...status }))
        .catch((error) => write({ type: 'error', requestId: record.requestId, error: error.message }));
    } else if (record.type === 'prompt') {
      void engine.prompt(record, (event) => write({ type: 'event', requestId: record.requestId, ...event }))
        .then((result) => write({ type: 'result', requestId: record.requestId, ...result }))
        .catch((error) => write({ type: 'error', requestId: record.requestId, error: error.message }));
    } else if (record.type === 'shutdown') {
      shuttingDown = true; engine.dispose(); process.exit(0);
    } else write({ type: 'error', requestId: record.requestId, error: 'Unknown command' });
  }
});
process.stdin.on('end', () => { engine.dispose(); process.exit(0); });
process.on('SIGTERM', () => { engine.dispose(); process.exit(0); });
