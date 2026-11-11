import {
  createAgentSession, createExtensionRuntime, ModelRuntime, SessionManager, SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { PiEngine } from './engine.mjs';
import { fetchChannelModels } from './channels.mjs';

const engine = new PiEngine({
  createAgentSession, createExtensionRuntime, SessionManager, SettingsManager,
  createModelRuntime: () => ModelRuntime.create({
    credentials: new InMemoryCredentialStore(), modelsPath: null,
    allowModelNetwork: false, refreshOnCreate: false,
  }),
});
const write = (record) => process.stdout.write(JSON.stringify(record) + '\n');
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
      void fetchChannelModels(record.channel, record.apiKey, fetch, record.userAgent)
        .then((models) => write({ type: 'models', requestId: record.requestId, models }))
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
