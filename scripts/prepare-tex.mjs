// Stages the built-in TeX runtime into src-tauri/tex-runtime:
//   bin/     pinned Tectonic engine (XeTeX core) for the build target
//   fonts/   Noto Sans CJK SC (SIL OFL 1.1)
//   texmf/   agentikz-fonts.sty
//   cache/   package cache pre-warmed with the documents in runtime/tex/warmup,
//            so the pre-installed packages compile without network access
// Every download is verified against a pinned SHA-256.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'runtime/tex');
const templatesSource = path.join(root, 'runtime/paper-templates');
const templateManifests = fs.readdirSync(templatesSource, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({ dir: entry.name, ...JSON.parse(fs.readFileSync(path.join(templatesSource, entry.name, 'template.json'), 'utf8')) }))
  .sort((a, b) => a.order - b.order);
const output = path.join(root, 'src-tauri/tex-runtime');
const downloads = path.join(root, 'src-tauri/.tex-runtime-build-downloads');

const TECTONIC_VERSION = '0.17.0';
const TECTONIC_ASSETS = {
  'x86_64-pc-windows-msvc': ['x86_64-pc-windows-msvc.zip', 'f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f'],
  'x86_64-unknown-linux-gnu': ['x86_64-unknown-linux-musl.tar.gz', '8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7'],
  'aarch64-unknown-linux-gnu': ['aarch64-unknown-linux-musl.tar.gz', 'b10954a95404f3ab2328d2fa59a5ebab8e657f893fab096f98be8db7c0c979b8'],
  'x86_64-apple-darwin': ['x86_64-apple-darwin.tar.gz', '7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80'],
  'aarch64-apple-darwin': ['aarch64-apple-darwin.tar.gz', 'a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667'],
};
const NOTO = 'https://github.com/notofonts/noto-cjk/raw/main/Sans';
const FONT_FILES = [
  ['NotoSansCJKsc-Regular.otf', `${NOTO}/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf`, '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b'],
  ['NotoSansCJKsc-Bold.otf', `${NOTO}/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf`, 'b5f0d1a190a7f9b43c310a8850630af12553df32c4c050543f9059732d9b4c0a'],
  ['LICENSE-NotoSansCJK-OFL.txt', `${NOTO}/LICENSE`, '6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2'],
];
const WARMUP = ['figure.tex', 'paper.tex', 'varwidth.tex'];
const STYLE_FILES = ['agentikz-fonts.sty'];

const rustc = spawnSync('rustc', ['-vV'], { encoding: 'utf8', windowsHide: true });
const host = /^host: (.+)$/m.exec(rustc.stdout || '')?.[1].trim();
if (!host) throw new Error('Cannot determine the Rust host target');
const target = process.env.TAURI_ENV_TARGET_TRIPLE || host;
const windows = target.includes('windows');
const binaryName = windows ? 'tectonic.exe' : 'tectonic';
const targets = target === 'universal-apple-darwin' ? ['aarch64-apple-darwin', 'x86_64-apple-darwin'] : [target];
for (const name of targets) {
  if (!TECTONIC_ASSETS[name]) throw new Error(`No bundled TeX engine is pinned for target ${name}`);
}

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fingerprint = createHash('sha256');
fingerprint.update(fs.readFileSync(fileURLToPath(import.meta.url)));
fingerprint.update(target);
for (const file of [...STYLE_FILES, ...WARMUP.map((name) => `warmup/${name}`)]) {
  fingerprint.update(fs.readFileSync(path.join(source, file)));
}
function fingerprintTree(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name);
    fingerprint.update(path.relative(templatesSource, file));
    if (entry.isDirectory()) fingerprintTree(file);
    else fingerprint.update(fs.readFileSync(file));
  }
}
fingerprintTree(templatesSource);
const stamp = fingerprint.digest('hex');
const manifestPath = path.join(output, 'manifest.json');

function staged() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).fingerprint === stamp &&
      fs.existsSync(path.join(output, 'bin', binaryName)) &&
      FONT_FILES.every(([name]) => fs.existsSync(path.join(output, 'fonts', name))) &&
      templateManifests.every((template) => fs.existsSync(path.join(output, 'paper-templates', template.dir, 'files', template.mainFile)));
  } catch {
    return false;
  }
}

/** Downloads once into a local cache; a file with the wrong hash is never used. */
async function fetchVerified(name, url, expected) {
  const file = path.join(downloads, name);
  if (fs.existsSync(file) && sha256(file) === expected) return file;
  console.log(`Downloading ${name}`);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      const actual = sha256(file);
      if (actual !== expected) throw new Error(`SHA-256 mismatch: expected ${expected}, got ${actual}`);
      return file;
    } catch (error) {
      lastError = error;
      fs.rmSync(file, { force: true });
    }
  }
  throw new Error(`Cannot download ${url}: ${lastError?.message ?? lastError}`);
}

function extract(archive, into) {
  fs.mkdirSync(into, { recursive: true });
  // Windows ships bsdtar, which also reads .zip; Git Bash's GNU tar does not.
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const result = spawnSync(tar, ['-xf', archive, '-C', into], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error(`Cannot extract ${path.basename(archive)}`);
}

async function stageEngine(stage) {
  const binaries = [];
  for (const name of targets) {
    const [suffix, hash] = TECTONIC_ASSETS[name];
    const file = `tectonic-${TECTONIC_VERSION}-${suffix}`;
    const archive = await fetchVerified(file,
      `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/${file}`, hash);
    const into = path.join(downloads, `extract-${name}`);
    fs.rmSync(into, { recursive: true, force: true });
    extract(archive, into);
    binaries.push(path.join(into, name.includes('windows') ? 'tectonic.exe' : 'tectonic'));
  }
  const binary = path.join(stage, 'bin', binaryName);
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  if (binaries.length > 1) {
    const lipo = spawnSync('lipo', ['-create', ...binaries, '-output', binary], { stdio: 'inherit' });
    if (lipo.status !== 0) throw new Error('lipo failed to create the universal TeX engine');
  } else {
    fs.copyFileSync(binaries[0], binary);
  }
  if (!windows) fs.chmodSync(binary, 0o755);
  return binary;
}

/** Compiles the warm-up documents so every pre-installed package lands in the cache. */
function warmCache(stage, binary) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'agentikz-tex-warm-'));
  try {
    for (const name of WARMUP) {
      fs.copyFileSync(path.join(source, 'warmup', name), path.join(work, name));
      const searchPaths = ['fonts', 'texmf'].flatMap((dir) =>
        ['-Z', `search-path=${path.join(stage, dir).replace(/\\/g, '/')}`]);
      const result = spawnSync(binary, ['-X', 'compile', '--format', 'latex.fmt', name, '--outfmt', 'pdf', '--keep-logs', ...searchPaths], {
        cwd: work, encoding: 'utf8', windowsHide: true, timeout: 20 * 60 * 1000,
        env: { ...process.env, TECTONIC_CACHE_DIR: path.join(stage, 'cache') },
      });
      const pdf = path.join(work, name.replace(/\.tex$/, '.pdf'));
      if (result.status !== 0 || !fs.existsSync(pdf)) {
        const tail = `${result.stdout || ''}\n${result.stderr || ''}`.split('\n').slice(-25).join('\n');
        throw new Error(`Warm-up document ${name} did not compile:\n${tail}`);
      }
      console.log(`Warmed package cache with ${name}`);
    }
    for (const template of templateManifests) {
      const project = path.join(work, `template-${template.id}`);
      fs.cpSync(path.join(templatesSource, template.dir, 'files'), project, { recursive: true });
      const outdir = path.join(project, '.build');
      fs.mkdirSync(outdir);
      const searchPaths = ['fonts', 'texmf'].flatMap((dir) =>
        ['-Z', `search-path=${path.join(stage, dir).replace(/\\/g, '/')}`]);
      const mainDir = path.dirname(path.join(project, template.mainFile));
      const result = spawnSync(binary, ['-X', 'compile', '--format', 'latex.fmt', path.basename(template.mainFile), '--outfmt', 'pdf', '--keep-logs', '--outdir', outdir, ...searchPaths], {
        cwd: mainDir, encoding: 'utf8', windowsHide: true, timeout: 20 * 60 * 1000,
        env: { ...process.env, TECTONIC_CACHE_DIR: path.join(stage, 'cache') },
      });
      const pdf = path.join(outdir, `${path.parse(template.mainFile).name}.pdf`);
      if (result.status !== 0 || !fs.existsSync(pdf)) {
        const tail = `${result.stdout || ''}\n${result.stderr || ''}`.split('\n').slice(-25).join('\n');
        throw new Error(`Official template ${template.name} failed its bundled-engine warm-up:\n${tail}`);
      }
      console.log(`Warmed official template ${template.name}`);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (staged()) {
  console.log('Built-in TeX runtime is up to date');
} else {
  fs.mkdirSync(downloads, { recursive: true });
  const stage = fs.mkdtempSync(path.join(root, 'src-tauri/.tex-runtime-build-'));
  try {
    const binary = await stageEngine(stage);
    // Keep already-downloaded package files when templates or warm-up inputs change.
    if (fs.existsSync(path.join(output, 'cache'))) {
      fs.cpSync(path.join(output, 'cache'), path.join(stage, 'cache'), { recursive: true });
    }
    fs.cpSync(templatesSource, path.join(stage, 'paper-templates'), { recursive: true });
    fs.mkdirSync(path.join(stage, 'fonts'), { recursive: true });
    for (const [name, url, hash] of FONT_FILES) {
      fs.copyFileSync(await fetchVerified(name, url, hash), path.join(stage, 'fonts', name));
    }
    fs.mkdirSync(path.join(stage, 'texmf'), { recursive: true });
    for (const name of STYLE_FILES) fs.copyFileSync(path.join(source, name), path.join(stage, 'texmf', name));

    // The package cache is platform independent, but warming it runs the engine.
    const runnable = target === host || (target === 'universal-apple-darwin' && host.endsWith('apple-darwin'));
    if (process.env.AGENTIKZ_TEX_SKIP_WARMUP === '1' || !runnable) {
      console.warn('Skipping package warm-up: packages will be downloaded on first use instead of being pre-installed.');
    } else {
      warmCache(stage, binary);
    }
    fs.writeFileSync(path.join(stage, 'THIRD_PARTY_NOTICES.txt'), [
      `Tectonic ${TECTONIC_VERSION} — MIT License — https://tectonic-typesetting.github.io/`,
      'Noto Sans CJK SC — SIL Open Font License 1.1 — see fonts/LICENSE-NotoSansCJK-OFL.txt',
      'cache/ holds LaTeX packages and fonts from the Tectonic bundle (TeX Live); each keeps its own free license.',
      'paper-templates/ holds official author kits; see paper-templates/SOURCES.md and each kit license/header.',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(stage, 'manifest.json'), `${JSON.stringify({
      fingerprint: stamp, target, tectonic: TECTONIC_VERSION, cjkFont: 'Noto Sans CJK SC',
      preinstalled: fs.existsSync(path.join(stage, 'cache')),
    }, null, 2)}\n`);
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(stage, output);
    console.log(`Staged built-in TeX runtime (Tectonic ${TECTONIC_VERSION}, ${target})`);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
