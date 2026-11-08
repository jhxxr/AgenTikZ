import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ADAPTERS, bundleAdapters, inventory, isCurrent, publishBundle,
  removeWithin, thirdPartyNotices,
} from "../prepare-adapters.mjs";

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "agentikz-packaging-test-"));
  t.after(() => removeWithin(os.tmpdir(), directory));
  return directory;
}

function write(directory, relative, contents) {
  const full = path.join(directory, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

function cachedBundle(directory) {
  for (const adapter of ADAPTERS) write(directory, adapter.entry, "// fixture bundle\n");
  write(directory, "codex-cli/xdg-open", "#!/bin/sh\n");
  write(directory, "THIRD_PARTY_NOTICES.txt", "fixture license\n");
  const manifest = {
    layoutVersion: 2,
    buildFingerprint: "fixture",
    adapters: Object.fromEntries(ADAPTERS.map(({ id, ...info }) => [id, info])),
    ...inventory(directory),
  };
  write(directory, "manifest.json", JSON.stringify(manifest));
  return manifest;
}

test("cache checks content hashes, all resources, layout and build fingerprint", (t) => {
  const directory = temporary(t);
  const manifest = cachedBundle(directory);
  assert.equal(isCurrent(directory, "fixture"), true);
  assert.equal(isCurrent(directory, "changed script"), false);

  write(directory, ADAPTERS[0].entry, "// changed bundle\n");
  assert.equal(isCurrent(directory, "fixture"), false);
  cachedBundle(directory);
  fs.unlinkSync(path.join(directory, "codex-cli", "xdg-open"));
  assert.equal(isCurrent(directory, "fixture"), false);
  cachedBundle(directory);
  write(directory, "unexpected.txt", "leftover");
  assert.equal(isCurrent(directory, "fixture"), false);
  fs.unlinkSync(path.join(directory, "unexpected.txt"));
  write(directory, "manifest.json", JSON.stringify({ ...manifest, layoutVersion: 1 }));
  assert.equal(isCurrent(directory, "fixture"), false);
  write(directory, "manifest.json", "{ broken JSON");
  assert.equal(isCurrent(directory, "fixture"), false);
});

test("old node_modules layout is never accepted as a current bundle", (t) => {
  const directory = temporary(t);
  write(directory, "node_modules/adapter/index.js", "legacy tree");
  write(directory, "manifest.json", JSON.stringify({
    adapters: Object.fromEntries(ADAPTERS.map((a) => [a.id, { version: a.version }])),
  }));
  assert.equal(isCurrent(directory, "fixture"), false);
  assert.throws(() => inventory(directory), /node_modules/);
});

test("Tauri resource allowlist matches the compact bundle layout", (t) => {
  const directory = temporary(t);
  const manifest = cachedBundle(directory);
  const config = JSON.parse(fs.readFileSync(
    fileURLToPath(new URL("../../src-tauri/tauri.conf.json", import.meta.url)), "utf8",
  ));
  assert.deepEqual(
    [...config.bundle.resources].sort(),
    ["manifest.json", ...Object.keys(manifest.files)].map((name) => `adapters/${name}`).sort(),
  );
  assert.deepEqual(config.bundle.externalBin, ["binaries/agentikz-mcp"]);
});

test("inventory enforces native/dev file and byte limits", (t) => {
  const directory = temporary(t);
  for (const name of ["host.exe", "native.node", "debug.map", "types.d.ts", "source.mts"]) {
    write(directory, name, "unexpected");
    assert.throws(() => inventory(directory), /Unexpected runtime file/);
    fs.unlinkSync(path.join(directory, name));
  }
  write(directory, "index.mjs", "1234");
  assert.throws(() => inventory(directory, 0.000001), /exceeds/);
  assert.throws(() => inventory(directory, Number.NaN), /Invalid/);
  assert.throws(() => inventory(directory, -1), /Invalid/);
  write(directory, "huge.mjs", Buffer.alloc(5 * 1024 * 1024 + 1));
  assert.throws(() => inventory(directory), /exceeds 5 MiB/);
});

test("inventory rejects links without following them", (t) => {
  const directory = temporary(t);
  const outside = path.join(directory, "outside");
  const bundle = path.join(directory, "bundle");
  fs.mkdirSync(outside);
  fs.mkdirSync(bundle);
  fs.symlinkSync(outside, path.join(bundle, "linked"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => inventory(bundle), /Symlink/);
});

test("publish replaces the complete old tree and rolls back on failure", (t) => {
  const directory = temporary(t);
  const destination = path.join(directory, "adapters");
  const work = path.join(directory, "work");
  const staged = path.join(work, "output");
  write(destination, "node_modules/old/index.js", "old");
  write(staged, "index.mjs", "new");
  publishBundle(staged, destination, work);
  assert.equal(fs.readFileSync(path.join(destination, "index.mjs"), "utf8"), "new");
  assert.equal(fs.existsSync(path.join(destination, "node_modules")), false);
  assert.equal(fs.readFileSync(path.join(work, "previous", "node_modules", "old", "index.js"), "utf8"), "old");
  removeWithin(directory, work);
  fs.mkdirSync(work);
  assert.throws(() => publishBundle(path.join(work, "missing"), destination, work));
  assert.equal(fs.readFileSync(path.join(destination, "index.mjs"), "utf8"), "new");
  assert.equal(fs.existsSync(path.join(work, "previous")), false);
});

test("filesystem guards reject cleanup or moves outside the intended workspace", (t) => {
  const directory = temporary(t);
  assert.throws(() => removeWithin(directory, directory), /outside workspace/);
  assert.throws(() => removeWithin(directory, path.dirname(directory)), /outside workspace/);
  assert.throws(() => publishBundle(
    path.join(directory, "output"), path.join(directory, "adapters"), os.tmpdir(),
  ), /outside workspace/);
});

function packageFixture(directory, name, version = "1.0.0") {
  const pkg = path.join(directory, "node_modules", name);
  write(pkg, "package.json", JSON.stringify({ name, version, type: "module", license: "MIT" }));
  write(pkg, "LICENSE", `${name} LICENSE TEXT`);
  return pkg;
}

test("bundles resolve imports and CommonJS builtins without shipping npm trees", async (t) => {
  const directory = temporary(t);
  const install = path.join(directory, "install");
  const destination = path.join(directory, "output");
  for (const adapter of ADAPTERS) {
    const pkg = packageFixture(install, adapter.package, adapter.version);
    write(pkg, "dist/index.js", `
import version from "../package.json" with {type: "json"};
import {message} from "fixture-helper";
const sep = require("node:path").sep;
console.log(version.version + message + sep);
`);
    write(pkg, "dist/index.d.ts", "not shipped");
    write(pkg, "dist/index.js.map", "not shipped");
  }
  const helper = packageFixture(install, "fixture-helper");
  write(helper, "package.json", JSON.stringify({
    name: "fixture-helper", version: "1.0.0", type: "module", main: "index.js",
  }));
  write(helper, "index.js", 'export const message = " bundled";');
  const open = packageFixture(install, "open");
  write(open, "xdg-open", "#!/bin/sh\n# fixture Linux browser helper\n");
  const sdk = packageFixture(install, "@anthropic-ai/claude-agent-sdk");
  write(sdk, "README.md", "SDK README TERMS MUST BE PRESERVED");
  packageFixture(helper, "nested-license");

  await bundleAdapters(install, destination);
  // Remove all source dependencies before running the relocated output.
  removeWithin(directory, install);
  for (const adapter of ADAPTERS) {
    const result = execFileSync(process.execPath, [path.join(destination, adapter.entry), "--version"], {
      cwd: destination, encoding: "utf8", windowsHide: true, timeout: 10000,
    });
    assert.equal(result.trim(), `${adapter.version} bundled${path.sep}`);
  }
  const contents = inventory(destination);
  assert.equal(Object.keys(contents.files).length, 4);
  assert.ok(!Object.keys(contents.files).some((name) => name.includes("node_modules")));
  const notices = fs.readFileSync(path.join(destination, "THIRD_PARTY_NOTICES.txt"), "utf8");
  assert.match(notices, /SDK README TERMS MUST BE PRESERVED/);
  assert.match(notices, /nested-license LICENSE TEXT/);
  if (process.platform !== "win32") {
    assert.ok(fs.statSync(path.join(destination, "codex-cli", "xdg-open")).mode & 0o111);
  }
});

test("notices include scoped and nested package licenses and NOTICE files", (t) => {
  const directory = temporary(t);
  const pkg = packageFixture(directory, "@scope/package");
  write(pkg, "NOTICE.txt", "ATTRIBUTION");
  packageFixture(pkg, "nested");
  const notices = thirdPartyNotices(directory);
  assert.match(notices, /@scope\/package@1.0.0/);
  assert.match(notices, /ATTRIBUTION/);
  assert.match(notices, /nested LICENSE TEXT/);
});
