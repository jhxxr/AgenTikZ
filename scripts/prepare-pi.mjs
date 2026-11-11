import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 12)) throw new Error('Pi requires Node.js >= 20.12');
const source = path.join(root, 'runtime/pi');
const output = path.join(root, 'src-tauri/pi-runtime');
const files = ['package.json', 'package-lock.json', 'worker.mjs', 'engine.mjs', 'channels.mjs'];
const fingerprint = createHash('sha256');
fingerprint.update(fs.readFileSync(fileURLToPath(import.meta.url)));
for (const file of files) fingerprint.update(fs.readFileSync(path.join(source, file)));
const stamp = fingerprint.digest('hex');
const manifestPath = path.join(output, 'manifest.json');
let cached = false;
try {
  cached = JSON.parse(fs.readFileSync(manifestPath)).fingerprint === stamp &&
    files.every((file) => fs.readFileSync(path.join(source, file)).equals(fs.readFileSync(path.join(output, file)))) &&
    JSON.parse(fs.readFileSync(path.join(output, 'node_modules/@earendil-works/pi-coding-agent/package.json'))).version === '1.5.0';
} catch {}

function pruneStageNodeModules(stageRoot) {
  const nm = path.join(stageRoot, 'node_modules');
  const explicitDirs = [
    path.join(nm, '@types'),
    path.join(nm, '@earendil-works/pi-coding-agent/dist/bundle'),
    path.join(nm, '@earendil-works/pi-coding-agent/examples'),
    path.join(nm, '@earendil-works/pi-tui/native'),
  ];
  for (const target of explicitDirs) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'dist-types') {
          fs.rmSync(full, { recursive: true, force: true });
        } else {
          walk(full);
        }
      } else if (
        entry.name.endsWith('.d.ts') ||
        entry.name.endsWith('.d.mts') ||
        entry.name.endsWith('.d.cts') ||
        entry.name.endsWith('.map') ||
        entry.name.endsWith('.tsbuildinfo') ||
        (/\.md$/i.test(entry.name) && !/^(?:license|notice|copying)/i.test(entry.name))
      ) {
        fs.rmSync(full, { force: true });
      }
    }
  };
  walk(nm);
}

// Verify the relocated SDK can import and discover its catalog without credentials or a model call.
async function verify(directory) {
  const child = spawn(process.execPath, [path.join(directory, 'worker.mjs')], {
    cwd: directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Pi SDK smoke test timed out')), 30000);
      const fail = (error) => { clearTimeout(timer); reject(error); };
      child.on('error', fail);
      child.on('exit', (code) => fail(new Error(`Pi SDK smoke process exited (${code})`)));
      child.stderr.resume();
      child.stdout.on('data', (data) => {
        output += data.toString();
        let index;
        while ((index = output.indexOf('\n')) >= 0) {
          const line = output.slice(0, index); output = output.slice(index + 1);
          let record;
          try { record = JSON.parse(line); } catch { fail(new Error('Invalid Pi stdout')); return; }
          if (record.type === 'ready') child.stdin.write(JSON.stringify({ type: 'inspect', requestId: 'stage' }) + '\n');
          if (record.type === 'models' && record.requestId === 'stage' && record.models.length > 0) {
            clearTimeout(timer); resolve();
          }
          if (record.type === 'error' || record.type === 'startup_error') {
            fail(new Error(`Pi model catalog unavailable (${record.error || record.code || 'unknown'})`));
          }
        }
      });
    });
  } finally {
    const exited = child.pid && child.exitCode === null && child.signalCode === null
      ? new Promise((resolve) => child.once('exit', resolve)) : Promise.resolve();
    child.stdin.end(); child.kill();
    await exited;
  }
}

if (!cached) {
  // npm ci occurs only during development/build, never at application runtime.
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (process.platform === 'win32') {
    // npm.cmd needs cmd.exe; no filesystem operations are delegated to this shell.
    execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm ci --ignore-scripts --engine-strict=false --no-audit --no-fund'],
      { cwd: source, stdio: 'inherit', windowsHide: true });
  } else execFileSync(npm, ['ci', '--ignore-scripts', '--engine-strict=false', '--no-audit', '--no-fund'], { cwd: source, stdio: 'inherit' });
  const stage = fs.mkdtempSync(path.join(root, 'src-tauri/.pi-runtime-build-'));
  // All recursive removals are constrained to these explicit build-only paths.
  const remove = (target) => {
    const resolved = path.resolve(target);
    if (resolved !== output && !(path.dirname(resolved) === path.join(root, 'src-tauri') &&
        path.basename(resolved).startsWith('.pi-runtime-build-'))) throw new Error('Unsafe build cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  try {
    for (const file of files) fs.copyFileSync(path.join(source, file), path.join(stage, file));
    fs.cpSync(path.join(source, 'node_modules'), path.join(stage, 'node_modules'), { recursive: true, dereference: true });
    pruneStageNodeModules(stage);
    await verify(stage);
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify({ version: '1.5.0', fingerprint: stamp }, null, 2));
    // The old working runtime is retained until the new runtime has passed its smoke test.
    const backup = stage + '-previous';
    if (fs.existsSync(output)) fs.renameSync(output, backup);
    try {
      fs.renameSync(stage, output);
    } catch (error) {
      if (fs.existsSync(backup) && !fs.existsSync(output)) fs.renameSync(backup, output);
      throw error;
    }
    remove(backup);
  } finally { remove(stage); }
} else await verify(output);
console.log('Pi SDK 1.5.0 staged and verified (Node runtime remains user-provided).');
