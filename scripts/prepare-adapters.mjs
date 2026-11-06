/**
 * Stage the bundled ACP adapters (JS-only dependency trees) into
 * `src-tauri/adapters/` so Tauri can ship them as app resources.
 *
 * The Claude/Codex ACP adapters are Node CLIs whose native host binaries live
 * in platform `optionalDependencies` (~220-320MB each). We stage only the JS
 * layer (`--omit=optional`): at runtime the host spawns `node <entry>.js` and
 * points the adapter at the user's own `claude`/`codex` via
 * `CLAUDE_CODE_EXECUTABLE` / `CODEX_PATH`. A PATH-installed adapter always
 * wins; the bundled tier is an offline fallback.
 *
 * Usage:
 *   node scripts/prepare-adapters.mjs           # idempotent
 *   node scripts/prepare-adapters.mjs --force   # restage even if current
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NPM_BIN = "npm";
const NPM_OPTS = process.platform === "win32" ? { shell: true } : {};

const ADAPTERS = [
  {
    id: "claude-code",
    package: "@agentclientprotocol/claude-agent-acp",
    version: "0.79.0",
    entry: "node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js",
    // claude-agent-acp engines: node >= 22
    nodeMajor: 22,
  },
  {
    id: "codex-cli",
    package: "@agentclientprotocol/codex-acp",
    version: "1.12.0",
    entry: "node_modules/@agentclientprotocol/codex-acp/dist/index.js",
    nodeMajor: null,
  },
];

const MAX_TOTAL_MB = Number(process.env.AGENTIKZ_ADAPTER_MAX_MB || 80);
const MAX_FILE_MB = 5;
const NATIVE_EXT = /\.(node|dylib|dll|so|exe)$/i;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "src-tauri", "adapters");

function manifestPath() {
  return path.join(outDir, "manifest.json");
}

function isCurrent() {
  if (process.argv.includes("--force")) return false;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath(), "utf8"));
  } catch {
    return false;
  }
  for (const adapter of ADAPTERS) {
    const entry = manifest?.adapters?.[adapter.id];
    if (entry?.version !== adapter.version) return false;
    const staged = path.join(outDir, adapter.entry);
    if (!fs.existsSync(staged)) return false;
  }
  return true;
}

if (isCurrent()) {
  console.log(
    `[prepare-adapters] ${manifestPath()} is current (pinned versions staged); use --force to restage`,
  );
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentikz-adapters-"));
try {
  fs.writeFileSync(
    path.join(tmp, "package.json"),
    JSON.stringify(
      {
        private: true,
        dependencies: Object.fromEntries(
          ADAPTERS.map((a) => [a.package, a.version]),
        ),
      },
      null,
      "\t",
    ),
  );
  console.log(
    `[prepare-adapters] npm install (one tree so shared deps dedupe) in ${tmp}`,
  );
  execFileSync(
    NPM_BIN,
    [
      "install",
      "--omit=optional",
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
    ],
    { cwd: tmp, stdio: "inherit", ...NPM_OPTS },
  );

  for (const adapter of ADAPTERS) {
    const entry = path.join(tmp, adapter.entry);
    if (!fs.existsSync(entry)) {
      console.error(`[prepare-adapters] missing entry: ${entry}`);
      process.exit(1);
    }
  }

  // Drop npm's .bin shims: they are the only symlinks in the tree and the
  // runtime spawns `node <entry>.js` directly, never the shims.
  fs.rmSync(path.join(tmp, "node_modules", ".bin"), {
    recursive: true,
    force: true,
  });

  let totalBytes = 0;
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isSymbolicLink()) {
        console.error(`[prepare-adapters] symlink in staged tree: ${full}`);
        process.exit(1);
      }
      if (item.isDirectory()) {
        walk(full);
        continue;
      }
      if (NATIVE_EXT.test(item.name)) {
        console.error(`[prepare-adapters] native file in staged tree: ${full}`);
        process.exit(1);
      }
      const size = fs.statSync(full).size;
      totalBytes += size;
      if (size > MAX_FILE_MB * 1024 * 1024) {
        console.error(
          `[prepare-adapters] ${full} is ${(size / 1024 / 1024).toFixed(1)}MB (> ${MAX_FILE_MB}MB); refusing`,
        );
        process.exit(1);
      }
    }
  };
  walk(path.join(tmp, "node_modules"));
  if (totalBytes > MAX_TOTAL_MB * 1024 * 1024) {
    console.error(
      `[prepare-adapters] staged tree is ${(totalBytes / 1024 / 1024).toFixed(1)}MB (> ${MAX_TOTAL_MB}MB); refusing (set AGENTIKZ_ADAPTER_MAX_MB to override)`,
    );
    process.exit(1);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.cpSync(path.join(tmp, "node_modules"), path.join(outDir, "node_modules"), {
    recursive: true,
  });
  for (const adapter of ADAPTERS) {
    console.log(
      `[prepare-adapters] ${adapter.package}@${adapter.version} staged (entry ${adapter.entry})`,
    );
  }
  fs.writeFileSync(
    manifestPath(),
    `${JSON.stringify(
      {
        adapters: Object.fromEntries(
          ADAPTERS.map((a) => [
            a.id,
            {
              package: a.package,
              version: a.version,
              entry: a.entry,
              nodeMajor: a.nodeMajor,
            },
          ]),
        ),
        totalBytes,
      },
      null,
      "\t",
    )}\n`,
  );
  console.log(
    `[prepare-adapters] manifest -> ${manifestPath()} (total ${(totalBytes / 1024 / 1024).toFixed(1)}MB)`,
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
