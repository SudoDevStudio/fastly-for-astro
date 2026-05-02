import { mkdir, writeFile, copyFile, readdir, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import type { ResolvedAdapterOptions } from "../options.js";

interface GenerateArgs {
  projectRoot: string;
  outDir: string;
  fastlyOutDir: string;
  adapterRoot: string;
  options: ResolvedAdapterOptions;
}

export async function generateComputeApp(args: GenerateArgs): Promise<void> {
  const { outDir, fastlyOutDir, adapterRoot, options } = args;

  await mkdir(fastlyOutDir, { recursive: true });
  await mkdir(join(fastlyOutDir, "src"), { recursive: true });
  await mkdir(join(fastlyOutDir, "static-publisher"), { recursive: true });

  const serverEntryPath = join(outDir, "server", "entry.mjs");
  if (!existsSync(serverEntryPath)) {
    throw new Error(
      `[fastly-for-astro] expected Astro server output at ${serverEntryPath} but it was not found. ` +
        `Ensure 'output: "server"' is set in astro.config.`,
    );
  }

  const templatesDir = join(adapterRoot, "templates");

  // Compute paths the generated files will reference.
  const relServerEntry = posix(relative(join(fastlyOutDir, "src"), serverEntryPath));
  const relClientDir = posix(relative(fastlyOutDir, join(outDir, "client")));

  await writeFromTemplate(join(templatesDir, "compute-entry.js"), join(fastlyOutDir, "src", "index.js"), {
    SERVER_ENTRY_IMPORT: JSON.stringify(relServerEntry),
    ASSETS_PREFIX: JSON.stringify(options.assetsPrefix),
  });

  // Copy the crypto polyfill verbatim — no template substitutions.
  await copyFile(
    join(templatesDir, "crypto-polyfill.js"),
    join(fastlyOutDir, "src", "crypto-polyfill.js"),
  );

  await writeFromTemplate(
    join(templatesDir, "static-publish.rc.js"),
    join(fastlyOutDir, "static-publish.rc.js"),
    {
      KV_STORE_NAME: JSON.stringify(options.kvStoreName),
      DEFAULT_COLLECTION: JSON.stringify(options.staticCollection),
      PUBLISH_ID: JSON.stringify(options.publishId),
      WORKING_DIR: JSON.stringify(options.staticPublisherWorkingDir),
    },
  );

  await writeFromTemplate(
    join(templatesDir, "publish-content.config.js"),
    join(fastlyOutDir, "publish-content.config.js"),
    {
      ROOT_DIR: JSON.stringify(relClientDir),
      ASSETS_PREFIX: JSON.stringify(options.assetsPrefix),
      COMPRESSION: JSON.stringify(options.compression ? ["br", "gzip"] : []),
    },
  );

  await writeFromTemplate(join(templatesDir, "fastly.toml"), join(fastlyOutDir, "fastly.toml"), {
    NAME: tomlString(options.name),
    DESCRIPTION: tomlString(options.description),
    AUTHOR: tomlString(options.author || "anonymous"),
    SERVICE_ID: tomlString(options.serviceId),
    KV_STORE_NAME: tomlString(options.kvStoreName),
  });

  await writeFromTemplate(
    join(templatesDir, "compute-package.json"),
    join(fastlyOutDir, "package.json"),
    {
      NAME: JSON.stringify(`${options.name}-compute`),
      DESCRIPTION: JSON.stringify(options.description),
    },
  );

  // .gitignore for the generated app.
  await writeFile(
    join(fastlyOutDir, ".gitignore"),
    [
      "node_modules/",
      "bin/",
      "pkg/",
      ".fastly/",
      ".static-publisher/",
      "kvstore.json",
      "*.log",
      "",
    ].join("\n"),
    "utf-8",
  );

  // README explaining the generated app.
  await writeFile(
    join(fastlyOutDir, "README.md"),
    generatedReadme(options),
    "utf-8",
  );
}

async function writeFromTemplate(
  templatePath: string,
  outputPath: string,
  replacements: Record<string, string>,
): Promise<void> {
  const tpl = await readFile(templatePath, "utf-8");
  let out = tpl;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(`__${key}__`).join(value);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, out, "utf-8");
}

function posix(p: string): string {
  return p.split("\\").join("/");
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function generatedReadme(options: ResolvedAdapterOptions): string {
  return `# ${options.name}

Generated Fastly Compute application for an Astro v6 site.
Do not edit by hand — regenerated each \`astro build\`.

## How it fits

Install the adapter in your Astro app, run \`astro build\`, and this Compute app is generated automatically in \`dist/fastly\`.
You do not need any special project structure or custom build pipeline for generation itself.

## Local development

\`\`\`bash
npm install
npm run dev
\`\`\`

## Deploy

\`\`\`bash
npm run deploy
npm run publish
\`\`\`

## Files

- \`src/index.js\` — Compute fetch handler. Tries the static publisher first, falls back to Astro SSR.
- \`static-publish.rc.js\` — KV store + collection config (compiled into the Wasm).
- \`publish-content.config.js\` — Drives \`publish-content\` uploads and runtime serving.
- \`fastly.toml\` — Fastly service manifest.
`;
}
