// Test-only JSON-RPC peer: never bundled with the application or used as an AI fallback.
const { appendFileSync } = require('node:fs');
const { createInterface } = require('node:readline');
const [scenario, log] = process.argv.slice(1);
let current = 'one';
const options = () => scenario === 'unsupported' ? [] : [{
  id: 'model-choice', name: 'Model', category: 'model', type: 'select', currentValue: current,
  options: [{ value: 'one', name: 'One' }, { value: 'two', name: 'Two' }],
}];
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  appendFileSync(log, request.method + '\n');
  let result;
  if (request.method === 'initialize') result = { protocolVersion: 1, agentCapabilities: {} };
  else if (request.method === 'session/new') result = { sessionId: 'fixture', configOptions: options() };
  else if (request.method === 'session/set_config_option') {
    if (request.params.sessionId !== 'fixture' || request.params.configId !== 'model-choice') process.exit(2);
    if (scenario !== 'unconfirmed') current = request.params.value;
    result = { configOptions: options() };
  } else if (request.method === 'session/prompt') result = { stopReason: 'end_turn' };
  else process.exit(3);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});
