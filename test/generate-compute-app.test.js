// The generated Compute app is written by string substitution into templates,
// so a placeholder that lands inside an already-quoted JSON/TOML string can
// produce a file that is syntactically broken — and the failure only shows up
// when someone runs `npm install` in `dist/fastly`. These tests parse the
// generated files.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { generateComputeApp } = await import("../dist/build/generate-compute-app.js");
const { resolveOptions } = await import("../dist/options.js");

const adapterRoot = fileURLToPath(new URL("..", import.meta.url));

async function generate(options) {
  const root = await mkdtemp(join(tmpdir(), "fastly-for-astro-"));
  const outDir = join(root, "dist");
  await mkdir(join(outDir, "server"), { recursive: true });
  await writeFile(join(outDir, "server", "entry.mjs"), "export const handle = () => {};", "utf-8");

  const fastlyOutDir = join(outDir, "fastly");
  await generateComputeApp({
    projectRoot: root,
    outDir,
    fastlyOutDir,
    adapterRoot,
    options: resolveOptions(options),
  });
  return fastlyOutDir;
}

test("generated package.json is valid JSON", async () => {
  const dir = await generate({ name: "demo-site" });
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"));
  assert.equal(pkg.name, "demo-site-compute");
  assert.equal(
    pkg.scripts.build,
    "js-compute-runtime --module-mode --enable-experimental-top-level-await src/index.js bin/main.wasm",
  );
});

test("generated package.json is valid JSON with aot enabled", async () => {
  const dir = await generate({ name: "demo-site", aot: true });
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"));
  assert.match(pkg.scripts.build, /--enable-aot/);
});

test("generated package.json survives a name that needs escaping", async () => {
  const dir = await generate({ name: "demo-site", description: 'He said "hi"\\' });
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"));
  assert.equal(pkg.description, 'He said "hi"\\');
});

test("generated fastly.toml quotes the KV store name in both tables", async () => {
  const dir = await generate({ name: "demo-site", kvStoreName: "astro-site-content" });
  const toml = await readFile(join(dir, "fastly.toml"), "utf-8");
  assert.match(toml, /^"astro-site-content" = \{ file = /m);
  assert.match(toml, /^\[setup\.kv_stores\."astro-site-content"\]$/m);
});
