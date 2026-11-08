/**
 * Bundle the pinned ACP adapters, not their npm installation trees.
 *
 * Node and the authenticated host CLIs remain user-provided. The Rust launcher
 * supplies CLAUDE_CODE_EXECUTABLE / CODEX_PATH, so neither adapter needs the
 * large optional native CLI packages. No packages are downloaded at app runtime.
 *
 * npm run adapters:stage [-- --force]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, version as esbuildVersion } from "esbuild";
import { verifyAdapters } from "./verify-adapters.mjs";

export const ADAPTERS = [
  {
    id: "claude-code",
    package: "@agentclientprotocol/claude-agent-acp",
    version: "0.79.0",
    entry: "claude-code/index.mjs",
    nodeMajor: 22,
  },
  {
    id: "codex-cli",
    package: "@agentclientprotocol/codex-acp",
    version: "1.12.0",
    entry: "codex-cli/index.mjs",
    nodeMajor: null,
  },
];

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const outDir = path.join(root, "src-tauri", "adapters");
const layoutVersion = 2;
const hash = (data) => createHash("sha256").update(data).digest("hex");
const buildFingerprint = () => hash(JSON.stringify({
  layoutVersion,
  esbuildVersion,
  adapters: ADAPTERS,
  script: fs.readFileSync(scriptPath, "utf8"),
  verifier: fs.readFileSync(new URL("./verify-adapters.mjs", import.meta.url), "utf8"),
}));

/** Reject links, native binaries and leftover development trees before shipping. */
export function inventory(directory, maxMB = 80) {
  if (!Number.isFinite(maxMB) || maxMB <= 0) throw new Error("Invalid adapter size limit");
  const files = {};
  let totalBytes = 0;
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, item.name);
      const relative = path.relative(directory, full).split(path.sep).join("/");
      if (item.isSymbolicLink()) throw new Error(`Symlink in adapter bundle: ${relative}`);
      if (item.isDirectory()) {
        if (item.name === "node_modules") throw new Error("Unbundled node_modules in adapter output");
        walk(full);
      } else if (item.isFile()) {
        if (relative === "manifest.json") continue;
        if (/\.(?:node|dylib|dll|so|exe|map|ts|mts|cts)$/i.test(item.name)) {
          throw new Error(`Unexpected runtime file: ${relative}`);
        }
        const data = fs.readFileSync(full);
        if (data.length > 5 * 1024 * 1024) throw new Error(`Adapter file exceeds 5 MiB: ${relative}`);
        totalBytes += data.length;
        files[relative] = hash(data);
      } else {
        throw new Error(`Unsupported adapter file: ${relative}`);
      }
    }
  }
  walk(directory);
  if (totalBytes > maxMB * 1024 * 1024) throw new Error(`Adapter bundle exceeds ${maxMB} MiB`);
  return { files, totalBytes };
}

export function isCurrent(directory, fingerprint = buildFingerprint()) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
    if (manifest.layoutVersion !== layoutVersion || manifest.buildFingerprint !== fingerprint) return false;
    for (const adapter of ADAPTERS) {
      const entry = manifest.adapters?.[adapter.id];
      if (entry?.package !== adapter.package || entry?.version !== adapter.version || entry?.entry !== adapter.entry ||
          entry?.nodeMajor !== adapter.nodeMajor) return false;
    }
    const actual = inventory(directory);
    return actual.totalBytes === manifest.totalBytes &&
      JSON.stringify(actual.files) === JSON.stringify(manifest.files);
  } catch {
    return false;
  }
}

// Include every installed package's notices, including dependencies already
// embedded in Codex's upstream bundle (which esbuild's metafile cannot see).
export function thirdPartyNotices(installRoot) {
  const sections = [];
  function visitPackage(directory) {
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    const legal = fs.readdirSync(directory).filter((name) =>
      /^(?:licen[cs]e|notice|copying|copyright)(?:[.-]|$)/i.test(name) ||
      // Some packages, notably Claude Agent SDK, put their terms in README.
      /^readme(?:[.-]|$)/i.test(name),
    ).sort();
    const texts = legal.filter((name) => fs.statSync(path.join(directory, name)).isFile())
      .map((name) => `--- ${name} ---\n${fs.readFileSync(path.join(directory, name), "utf8")}`);
    sections.push(`## ${pkg.name}@${pkg.version}\nLicense: ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license ?? "unspecified")}\n${texts.join("\n\n")}`);
    visitModules(path.join(directory, "node_modules"));
  }
  function visitModules(directory) {
    if (!fs.existsSync(directory)) return;
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.name.startsWith(".") || !item.isDirectory()) continue;
      const full = path.join(directory, item.name);
      if (item.name.startsWith("@")) {
        for (const child of fs.readdirSync(full).sort()) visitPackage(path.join(full, child));
      } else {
        visitPackage(full);
      }
    }
  }
  visitModules(path.join(installRoot, "node_modules"));
  return `AgenTikZ bundled ACP adapters — third-party notices\n\n${sections.join("\n\n" + "=".repeat(80) + "\n\n")}\n`;
}

export async function bundleAdapters(installRoot, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const adapter of ADAPTERS) {
    const packageRoot = path.join(installRoot, "node_modules", adapter.package);
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    if (pkg.version !== adapter.version) throw new Error(`Unexpected version of ${adapter.package}: ${pkg.version}`);
    const result = await build({
      entryPoints: [path.join(packageRoot, "dist", "index.js")],
      outfile: path.join(destination, adapter.entry),
      bundle: true,
      platform: "node",
      format: "esm",
      target: `node${adapter.nodeMajor ?? 18}`,
      minify: true,
      sourcemap: false,
      legalComments: "eof",
      metafile: true,
      // ESM bundles can still contain CommonJS dependencies using require().
      banner: { js: 'import { createRequire as __agentikzCreateRequire } from "node:module"; var require = __agentikzCreateRequire(import.meta.url);' },
    });
    for (const output of Object.values(result.metafile.outputs)) {
      for (const dependency of output.imports) {
        if (dependency.external && !isBuiltin(dependency.path)) {
          throw new Error(`Unbundled dependency in ${adapter.id}: ${dependency.path}`);
        }
      }
    }
  }
  // open's Linux browser launcher is resolved relative to import.meta.url in
  // the upstream Codex bundle, not through an import visible to esbuild.
  fs.copyFileSync(
    path.join(installRoot, "node_modules", "open", "xdg-open"),
    path.join(destination, "codex-cli", "xdg-open"),
  );
  fs.chmodSync(path.join(destination, "codex-cli", "xdg-open"), 0o755);
  fs.writeFileSync(path.join(destination, "THIRD_PARTY_NOTICES.txt"), thirdPartyNotices(installRoot));
}

/** Only delete explicitly checked descendants, never a computed parent/root. */
function assertWithin(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing filesystem operation outside workspace: ${target}`);
  }
}

export function removeWithin(parent, target) {
  assertWithin(parent, target);
  fs.rmSync(target, { recursive: true, force: true });
}

/** Publish on the same volume; keep the old working adapters on failure. */
export function publishBundle(staged, destination, temporaryRoot) {
  const previous = path.join(temporaryRoot, "previous");
  const parent = path.dirname(path.resolve(destination));
  assertWithin(parent, destination);
  assertWithin(parent, temporaryRoot);
  assertWithin(temporaryRoot, staged);
  assertWithin(temporaryRoot, previous);
  const hadPrevious = fs.existsSync(destination);
  if (hadPrevious) fs.renameSync(destination, previous);
  try {
    fs.renameSync(staged, destination);
  } catch (error) {
    if (hadPrevious) fs.renameSync(previous, destination);
    throw error;
  }
}

async function main() {
  const maxMB = Number(process.env.AGENTIKZ_ADAPTER_MAX_MB || 80);
  if (!process.argv.includes("--force") && isCurrent(outDir)) {
    // A tightened limit must apply even when the cached bundle is current.
    inventory(outDir, maxMB);
    console.log("[prepare-adapters] bundled adapters are current; use --force to rebuild");
    return;
  }
  // Sibling staging keeps the final rename on the same filesystem on Windows.
  const parent = path.dirname(outDir);
  const temporaryRoot = fs.mkdtempSync(path.join(parent, ".adapters-build-"));
  try {
    fs.writeFileSync(path.join(temporaryRoot, "package.json"), JSON.stringify({
      private: true,
      dependencies: Object.fromEntries(ADAPTERS.map((a) => [a.package, a.version])),
    }));
    const installArgs = [
      "install", "--omit=optional", "--omit=dev", "--ignore-scripts",
      "--no-audit", "--no-fund", "--loglevel=error",
    ];
    // npm run supplies its JS entrypoint: invoke it directly to avoid shell
    // argument handling on Windows. Direct node invocations retain a fallback.
    const npmCli = process.env.npm_execpath;
    const directNpm = npmCli && path.basename(npmCli) === "npm-cli.js";
    execFileSync(directNpm ? process.execPath : "npm", directNpm ? [npmCli, ...installArgs] : installArgs, {
      cwd: temporaryRoot, stdio: "inherit", windowsHide: true,
      ...(!directNpm && process.platform === "win32" ? { shell: true } : {}),
    });
    const staged = path.join(temporaryRoot, "output");
    await bundleAdapters(temporaryRoot, staged);
    const contents = inventory(staged, maxMB);
    fs.writeFileSync(path.join(staged, "manifest.json"), `${JSON.stringify({
      layoutVersion,
      buildFingerprint: buildFingerprint(),
      adapters: Object.fromEntries(ADAPTERS.map(({ id, ...info }) => [id, info])),
      ...contents,
    }, null, 2)}\n`);
    // Smoke-test a relocated copy with no npm tree or user CLI credentials.
    await verifyAdapters(staged);
    publishBundle(staged, outDir, temporaryRoot);
    console.log(`[prepare-adapters] ${Object.keys(contents.files).length + 1} files, ${(contents.totalBytes / 1024 / 1024).toFixed(2)} MiB -> ${outDir}`);
  } finally {
    if (fs.existsSync(path.join(temporaryRoot, "previous")) && !fs.existsSync(outDir)) {
      console.error(`[prepare-adapters] recovery copy retained at ${temporaryRoot}`);
    } else {
      removeWithin(parent, temporaryRoot);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(`[prepare-adapters] ${error.stack ?? error}`);
    process.exitCode = 1;
  });
}
