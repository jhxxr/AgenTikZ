/**
 * Offline packaging smoke tests: relocate the bundle outside node_modules,
 * check --version and exchange ACP initialize using mock local CLI processes.
 * No user credentials, model requests, or installed agent CLIs are used.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

async function initialize(entry, cwd, env) {
  const child = spawn(process.execPath, [entry], {
    cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-4000); });
  const lines = createInterface({ input: child.stdout });
  try {
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`ACP initialize timed out: ${stderr}`)), 15000);
      const finish = (error, result) => {
        clearTimeout(timer);
        if (error) reject(error); else resolve(result);
      };
      child.once("error", (error) => finish(error));
      child.stdin.on("error", (error) => finish(error));
      child.once("exit", (code) => finish(new Error(`ACP exited (${code}): ${stderr}`)));
      lines.on("line", (line) => {
        try {
          const message = JSON.parse(line);
          if (message.id === 1) {
            if (message.error) finish(new Error(JSON.stringify(message.error)));
            else finish(null, message.result);
          }
        } catch (error) {
          finish(error);
        }
      });
      child.stdin.write(`${JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: {
          protocolVersion: 1,
          clientCapabilities: {},
          clientInfo: { name: "agentikz-packaging-test", version: "1.0.0" },
        },
      })}\n`);
    });
    assert.equal(response.protocolVersion, 1);
    return response;
  } finally {
    lines.close();
    // Closing stdin lets the adapter close its mock CLI, including on Windows.
    child.stdin.end();
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      const timer = setTimeout(() => child.kill(), 5000);
      await exited.finally(() => clearTimeout(timer));
    }
  }
}

export async function verifyAdapters(directory) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentikz-adapters-verify-"));
  try {
    // Deliberately use spaces, and keep the copy outside the build's npm tree.
    const isolated = path.join(temporaryRoot, "relocated bundle");
    fs.cpSync(directory, isolated, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(isolated, "manifest.json"), "utf8"));
    const mock = path.join(temporaryRoot, "mock-host.mjs");
    fs.writeFileSync(mock, `
import { createInterface } from "node:readline";
if (process.argv.includes("--version")) { console.log("packaging-mock"); process.exit(0); }
const lines = createInterface({input: process.stdin});
lines.on("line", line => {
  const request = JSON.parse(line);
  if (request.id !== undefined) {
    const result = request.method === "account/read" ? {account: null, requiresOpenaiAuth: true} : {};
    console.log(JSON.stringify({jsonrpc: "2.0", id: request.id, result}));
  }
});
`);
    const cli = path.join(temporaryRoot, process.platform === "win32" ? "mock codex.cmd" : "mock codex");
    fs.writeFileSync(cli, process.platform === "win32"
      ? `@echo off\r\n"${process.execPath}" "${mock}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${mock}" "$@"\n`);
    fs.chmodSync(cli, 0o755);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      !/^(?:ANTHROPIC_|OPENAI_|CLAUDE_|CODEX_|AWS_|AZURE_|GOOGLE_|GCP_|NODE_OPTIONS$|NODE_PATH$|DEFAULT_AUTH_REQUEST$|MODEL_PROVIDER$)/i.test(key),
    ));
    Object.assign(env, {
      // Isolate any SDK settings/auth probes from the user's actual config.
      HOME: temporaryRoot, USERPROFILE: temporaryRoot,
      XDG_CONFIG_HOME: temporaryRoot,
      CLAUDE_CONFIG_DIR: temporaryRoot,
      CODEX_HOME: temporaryRoot,
      CLAUDE_CODE_EXECUTABLE: mock,
      CODEX_PATH: cli,
    });
    for (const [id, adapter] of Object.entries(manifest.adapters)) {
      const entry = path.join(isolated, adapter.entry);
      const version = execFileSync(process.execPath, [entry, "--version"], {
        cwd: isolated, env, encoding: "utf8", timeout: 15000, windowsHide: true,
      });
      assert.ok(version.includes(adapter.version), `${id} --version: ${version}`);
      const response = await initialize(entry, isolated, env);
      assert.equal(response.agentInfo?.version, adapter.version);
      assert.equal(response.agentInfo?.name, adapter.package);
      console.log(`[verify-adapters] ${id}: version + isolated ACP initialize passed`);
    }
    assert.ok(fs.existsSync(path.join(isolated, "codex-cli", "xdg-open")));
    assert.ok(fs.statSync(path.join(isolated, "THIRD_PARTY_NOTICES.txt")).size > 0);
  } finally {
    // This exact path was returned by mkdtemp above, not derived from input.
    const relative = path.relative(os.tmpdir(), temporaryRoot);
    assert.ok(relative.startsWith("agentikz-adapters-verify-") && !relative.includes(path.sep));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyAdapters(path.resolve(process.argv[2] ?? "src-tauri/adapters")).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
