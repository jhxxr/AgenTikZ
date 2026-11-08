import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const version = spawnSync('rustc', ['-vV'], { encoding: 'utf8', windowsHide: true });
if (version.status !== 0) throw new Error('Cannot determine Rust host target');
const host = /^host: (.+)$/m.exec(version.stdout)?.[1].trim();
if (!host) throw new Error('Missing Rust host target');
const target = process.env.TAURI_ENV_TARGET_TRIPLE || host;
if (target === 'universal-apple-darwin') {
  const sources = [];
  for (const arch of ['aarch64-apple-darwin', 'x86_64-apple-darwin']) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...(release ? ['--release'] : [])],
      { cwd: root, stdio: 'inherit', env: { ...process.env, TAURI_ENV_TARGET_TRIPLE: arch } });
    if (result.status !== 0) process.exit(result.status ?? 1);
    sources.push(path.join(root, 'src-tauri/binaries', `agentikz-mcp-${arch}`));
  }
  const output = path.join(root, 'src-tauri/binaries/agentikz-mcp');
  const combine = spawnSync('lipo', ['-create', ...sources, '-output', output], { stdio: 'inherit' });
  if (combine.status === 0) fs.copyFileSync(output, `${output}-universal-apple-darwin`);
  process.exit(combine.status ?? 1);
}
const args = ['build', '--manifest-path', path.join(root, 'crates/agentikz-mcp/Cargo.toml'), '--locked'];
if (release) args.push('--release');
if (target !== host) args.push('--target', target);
const build = spawnSync('cargo', args, { cwd: root, stdio: 'inherit', windowsHide: true });
if (build.status !== 0) process.exit(build.status ?? 1);
const windows = target.includes('windows');
const filename = `agentikz-mcp${windows ? '.exe' : ''}`;
const source = path.join(root, 'crates/agentikz-mcp/target', ...(target !== host ? [target] : []), release ? 'release' : 'debug', filename);
const output = path.join(root, 'src-tauri/binaries');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(source, path.join(output, filename));
fs.copyFileSync(source, path.join(output, `agentikz-mcp-${target}${windows ? '.exe' : ''}`));
console.log(`Staged ${filename} (${release ? 'release' : 'debug'})`);
