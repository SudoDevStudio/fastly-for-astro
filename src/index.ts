import type { AstroAdapter, AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import {
  type FastlyComputeAdapterOptions,
  type ResolvedAdapterOptions,
  resolveOptions,
} from "./options.js";
import { generateComputeApp } from "./build/generate-compute-app.js";
import { writeRuntimeConfig } from "./build/runtime-config.js";

export type { FastlyComputeAdapterOptions } from "./options.js";

const PACKAGE_NAME = "@sudodevstudio/fastly-for-astro";
const SERVER_ENTRYPOINT = `${PACKAGE_NAME}/entrypoints/server.js`;
const VIRTUAL_RUNTIME_CONFIG = "virtual:fastly-for-astro/runtime-config";
const RESOLVED_VIRTUAL_RUNTIME_CONFIG = "\0" + VIRTUAL_RUNTIME_CONFIG;

// Injected at the top of the SSR bundle (after imports, before bundled
// top-level code). Two distinct concerns:
//
// 1. Wizer's pre-init env lacks Intl and WebAssembly — stub them so module
//    initialization doesn't trap. Real APIs are available at request time
//    (we only install on globalThis when the platform doesn't already
//    provide them).
//
// 2. Fastly Compute's JS engine omits ICU. `String.prototype.normalize()`
//    throws at runtime, which breaks Astro's `sanitizeParams` for any
//    dynamic route. We replace it with an identity function — Unicode
//    normalization is unnecessary for URL params on this platform.
//
// 3. Some transitive toolchain/runtime modules assume worker-style globals
//    like MessageChannel / MessagePort exist. Fastly may omit them, so install
//    a minimal in-memory implementation to avoid ReferenceErrors during module
//    initialization.
const WIZER_GLOBALS_SHIM = `
if (typeof String.prototype.normalize !== "function" || (function(){
  try { "a".normalize(); return false; } catch (_) { return true; }
})()) {
  Object.defineProperty(String.prototype, "normalize", {
    value: function normalize() { return String(this); },
    writable: true, configurable: true,
  });
}
if (typeof globalThis.Intl === "undefined") {
  function _stubFmt() { return ""; }
  function _stubFmtParts() { return []; }
  function _stubResolved() { return { locale: "en-US" }; }
  class _StubDTF { format = _stubFmt; formatToParts = _stubFmtParts; resolvedOptions = _stubResolved; formatRange = _stubFmt; formatRangeToParts = _stubFmtParts; }
  class _StubNF  { format = _stubFmt; formatToParts = _stubFmtParts; resolvedOptions = _stubResolved; formatRange = _stubFmt; formatRangeToParts = _stubFmtParts; }
  class _StubLF  { format = _stubFmt; formatToParts = _stubFmtParts; resolvedOptions = _stubResolved; }
  class _StubRTF { format = _stubFmt; formatToParts = _stubFmtParts; resolvedOptions = _stubResolved; }
  class _StubPR  { select = () => "other"; selectRange = () => "other"; resolvedOptions = _stubResolved; }
  class _StubCol { compare = () => 0; resolvedOptions = _stubResolved; }
  class _StubSeg { segment = () => ({ [Symbol.iterator]: function*(){} }); resolvedOptions = _stubResolved; }
  globalThis.Intl = {
    DateTimeFormat: _StubDTF,
    NumberFormat: _StubNF,
    ListFormat: _StubLF,
    RelativeTimeFormat: _StubRTF,
    PluralRules: _StubPR,
    Collator: _StubCol,
    Segmenter: _StubSeg,
    Locale: class { constructor(t){ this.baseName = String(t || "en-US"); } toString(){ return this.baseName; } },
    getCanonicalLocales: (t) => Array.isArray(t) ? t.map(String) : (t ? [String(t)] : []),
    supportedValuesOf: () => [],
  };
}
if (typeof globalThis.MessagePort === "undefined") {
  class _StubMessagePort {
    constructor() {
      this.onmessage = null;
      this.onmessageerror = null;
      this._peer = null;
      this._started = false;
      this._queue = [];
      this._listeners = new Map();
    }
    postMessage(value) {
      if (!this._peer) return;
      const event = { data: value, ports: [], target: this._peer, type: "message" };
      this._peer._dispatch(event);
    }
    start() {
      this._started = true;
      while (this._queue.length) {
        this._emit(this._queue.shift());
      }
    }
    close() {
      this._peer = null;
      this._queue.length = 0;
    }
    addEventListener(type, listener) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(listener);
    }
    removeEventListener(type, listener) {
      const listeners = this._listeners.get(type);
      if (!listeners) return;
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    }
    dispatchEvent(event) {
      this._dispatch(event);
      return true;
    }
    _dispatch(event) {
      if (this._started || this.onmessage || (this._listeners.get("message") || []).length) {
        this._emit(event);
      } else {
        this._queue.push(event);
      }
    }
    _emit(event) {
      if (typeof this.onmessage === "function") this.onmessage(event);
      const listeners = this._listeners.get("message") || [];
      for (const listener of listeners) listener.call(this, event);
    }
  }
  globalThis.MessagePort = _StubMessagePort;
}
if (typeof globalThis.MessageChannel === "undefined") {
  globalThis.MessageChannel = class MessageChannel {
    constructor() {
      this.port1 = new globalThis.MessagePort();
      this.port2 = new globalThis.MessagePort();
      this.port1._peer = this.port2;
      this.port2._peer = this.port1;
    }
  };
}
if (typeof globalThis.WebAssembly === "undefined") {
  // Stub returns a never-settling promise so dangling top-level WebAssembly
  // initialization (e.g. from rogue dependencies) doesn't surface as
  // "Promise rejected but never handled" during Wizer snapshot.
  const _pending = new Promise(function(){});
  globalThis.WebAssembly = {
    compile: function(){ return _pending; },
    instantiate: function(){ return _pending; },
    compileStreaming: function(){ return _pending; },
    instantiateStreaming: function(){ return _pending; },
    Module: class { static exports(){ return []; } static imports(){ return []; } static customSections(){ return []; } },
    Instance: class { constructor(){ this.exports = {}; } },
    Memory: class { constructor(){ this.buffer = new ArrayBuffer(0); } grow(){ return 0; } },
    Table: class { constructor(){ this.length = 0; } get(){} set(){} grow(){ return 0; } },
    Global: class { constructor(){ this.value = undefined; } valueOf(){ return undefined; } },
    Tag: class {},
    Exception: class {},
    CompileError: class extends Error {},
    LinkError: class extends Error {},
    RuntimeError: class extends Error {},
    validate: function(){ return false; },
  };
}
`.trim();

function getAdapter(opts: ResolvedAdapterOptions): AstroAdapter {
  return {
    name: PACKAGE_NAME,
    serverEntrypoint: SERVER_ENTRYPOINT,
    // We export `createExports(manifest)` from the entrypoint; Astro's
    // build pipeline calls it with the bound SSR manifest and re-exports
    // the resulting `default` / `handle` from `dist/server/entry.mjs`.
    exports: ["default", "handle", "createExports"],
    adapterFeatures: {
      buildOutput: "server",
      edgeMiddleware: opts.experimental.edgeMiddleware,
    },
    supportedAstroFeatures: {
      serverOutput: "stable",
      hybridOutput: "stable",
      staticOutput: "stable",
      sharpImageService: { support: "limited", message: "Use squoosh or a remote image service. Sharp requires a Node runtime not present on Fastly Compute.", suppress: "all" },
      i18nDomains: "experimental",
      envGetSecret: "stable",
    },
  };
}

export default function fastlyComputeAdapter(
  options?: FastlyComputeAdapterOptions,
): AstroIntegration {
  const resolved = resolveOptions(options);
  let astroConfig: Parameters<NonNullable<AstroIntegration["hooks"]["astro:config:done"]>>[0]["config"];
  let outDir: URL;

  return {
    name: PACKAGE_NAME,
    hooks: {
      "astro:config:setup": ({ config, updateConfig, logger }) => {
        if (config.output === "static") {
          logger.warn(
            "output is 'static' — the Fastly Compute adapter is intended for 'server' output. Static-only sites can use compute-js-static-publish directly.",
          );
        }

        if (!process.env.ASTRO_KEY) {
          logger.warn(
            "ASTRO_KEY is not set. Astro will generate a fresh server-island encryption key on every build, which can cause /_server-islands/* requests to return 400 after rebuilds, restarts, or rolling deploys. Generate one with `astro create-key` and set it in your build environment.",
          );
        }

        // Astro's default image service is `sharp`, which requires Node-only
        // built-ins (node:fs, node:child_process, etc.) and cannot be bundled
        // into the Fastly Compute Wasm runtime. Force the noop service unless
        // the user has explicitly chosen one.
        const userImageService = config.image?.service?.entrypoint;
        const shouldOverrideImageService =
          !userImageService ||
          userImageService === "astro/assets/services/sharp";
        if (shouldOverrideImageService && userImageService) {
          logger.warn(
            "image.service was 'sharp' — overriding to 'astro/assets/services/noop' because sharp is not compatible with the Fastly Compute runtime. Use a remote image service for production image optimization.",
          );
        }

        const adapterRoot = resolveAdapterRoot();
        const esModuleLexerShim = join(
          adapterRoot,
          "dist",
          "runtime",
          "shims",
          "es-module-lexer.js",
        );
        const astroEncryptionShim = join(
          adapterRoot,
          "dist",
          "runtime",
          "shims",
          "astro-encryption.js",
        );

        updateConfig({
          build: {
            client: new URL("./client/", config.outDir),
            server: new URL("./server/", config.outDir),
            serverEntry: "entry.mjs",
            redirects: false,
          },
          vite: {
            ssr: {
              noExternal: [
                PACKAGE_NAME,
                "@fastly/compute-js-static-publish",
                // @noble/ciphers powers our AES-GCM shim that replaces
                // Astro's encryption module — it must be bundled into the
                // SSR output so the Compute Wasm includes it.
                "@noble/ciphers",
              ],
              // Belt-and-braces: even if something tries to import these,
              // mark them external so esbuild/js-compute-runtime won't try
              // to bundle them.
              external: ["sharp", "detect-libc"],
              target: "webworker",
            },
            build: {
              target: "es2022",
              rollupOptions: {
                output: {
                  // Wizer (Fastly Compute's pre-initializer) runs the SSR
                  // bundle's top-level code in a snapshot environment that
                  // lacks `Intl` and `WebAssembly`. Astro's logger calls
                  // `new Intl.DateTimeFormat()` at top level. Inject minimal
                  // shims so module init doesn't trap; the real implementations
                  // are available at request time on the Compute runtime.
                  intro: WIZER_GLOBALS_SHIM,
                },
              },
            },
            resolve: {
              alias: [
                // es-module-lexer initializes WebAssembly at module load,
                // which trips Fastly Compute's Wizer pre-initializer. The
                // SSR bundle only imports it for side effects — replace
                // with a no-op shim.
                { find: "es-module-lexer", replacement: esModuleLexerShim },
              ],
            },
            plugins: [
              runtimeConfigPlugin(resolved),
              // Replace Astro's AES-GCM encryption module (which goes
              // through crypto.subtle.encrypt/decrypt) with a pure-JS
              // implementation backed by @noble/ciphers. Fastly Compute's
              // SubtleCrypto doesn't implement encrypt/decrypt and patching
              // crypto.subtle from JS is unreliable — replacing the module
              // at build time is the surgical fix. We hook resolveId so
              // we catch ALL paths to encryption.js (Astro uses relative
              // imports from many call sites, so resolve.alias misses them).
              astroEncryptionAliasPlugin(astroEncryptionShim),
              // Fastly's runtime appears to surface an empty `s=` server-island
              // query param as a null-ish value in Astro's endpoint code,
              // which then gets treated as an encrypted slots payload and
              // rejected with 400. Normalize empty slots to "" before
              // Astro's decrypt path runs.
              astroServerIslandsEndpointPatchPlugin(),
            ],
          },
          image: shouldOverrideImageService
            ? {
                endpoint: { entrypoint: undefined, route: "/_image" },
                service: { entrypoint: "astro/assets/services/noop" },
              }
            : {
                endpoint: { entrypoint: undefined, route: "/_image" },
              },
        });
      },

      "astro:config:done": ({ config, setAdapter, logger }) => {
        astroConfig = config;
        outDir = config.outDir;
        setAdapter(getAdapter(resolved));
        logger.info(`adapter configured. KV store: ${resolved.kvStoreName}, collection: ${resolved.staticCollection}`);
      },

      "astro:build:done": async ({ logger }) => {
        // In Astro v6 `astro:build:done` no longer hands us the project outDir
        // directly. Use the value captured from `astro:config:done`.
        const outDirPath = fileURLToPath(outDir);
        const projectRoot = fileURLToPath(astroConfig.root);
        const fastlyOutDir = resolve(outDirPath, "fastly");
        const adapterRoot = resolveAdapterRoot();

        await writeRuntimeConfig({ adapterRoot, options: resolved });
        await generateComputeApp({
          projectRoot,
          outDir: outDirPath,
          fastlyOutDir,
          adapterRoot,
          options: resolved,
        });

        logger.info(`Fastly Compute app generated at ${fastlyOutDir}`);
        logger.info(`Next steps:`);
        logger.info(`  cd ${fastlyOutDir}`);
        logger.info(`  npm install`);
        logger.info(`  fastly compute serve   # local dev`);
        logger.info(`  fastly compute publish # deploy`);
      },
    },
  };
}

function resolveAdapterRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * Vite plugin that redirects every import resolving to Astro's
 * `core/encryption.js` to our pure-JS shim. We hook `resolveId` (rather than
 * using `resolve.alias`) because Astro imports the module via relative paths
 * from many call sites — alias only matches the import specifier as written,
 * not the resolved file path.
 */
function astroEncryptionAliasPlugin(shimAbsPath: string) {
  // Match either Unix or Windows separators between segments.
  const SEP = /[\\/]+/.source;
  const PATTERN = new RegExp(`${SEP}astro${SEP}dist${SEP}core${SEP}encryption\\.js$`);

  return {
    name: "fastly-for-astro:astro-encryption-alias",
    enforce: "pre" as const,
    async resolveId(this: { resolve: (id: string, importer?: string, opts?: object) => Promise<{ id: string } | null> }, id: string, importer: string | undefined) {
      // Let Vite resolve the import to a real path first. If that path is
      // Astro's encryption.js, swap it out.
      const resolved = await this.resolve(id, importer, { skipSelf: true });
      if (resolved && PATTERN.test(resolved.id)) {
        return { id: shimAbsPath };
      }
      return null;
    },
  };
}

function astroServerIslandsEndpointPatchPlugin() {
  const SEP = /[\\/]+/.source;
  const PATTERN = new RegExp(`${SEP}astro${SEP}dist${SEP}core${SEP}server-islands${SEP}endpoint\\.js$`);

  return {
    name: "fastly-for-astro:server-islands-endpoint-patch",
    enforce: "pre" as const,
    async transform(
      code: string,
      id: string,
    ) {
      if (!PATTERN.test(id)) return null;

      const needle = 'const encryptedSlots = params.get("s");';
      if (!code.includes(needle)) return null;

      return code.replace(
        needle,
        'const encryptedSlots = params.get("s") ?? "";',
      );
    },
  };
}

function runtimeConfigPlugin(opts: ResolvedAdapterOptions) {
  const serializableConfig = {
    securityHeaders: opts.securityHeaders,
    cache: opts.cache,
    observability: opts.observability,
    runtime: opts.runtime,
    experimental: opts.experimental,
    assetsPrefix: opts.assetsPrefix,
  };

  return {
    name: "fastly-for-astro:runtime-config",
    resolveId(id: string) {
      if (id === VIRTUAL_RUNTIME_CONFIG) return RESOLVED_VIRTUAL_RUNTIME_CONFIG;
      return null;
    },
    load(id: string) {
      if (id === RESOLVED_VIRTUAL_RUNTIME_CONFIG) {
        return `export default ${JSON.stringify(serializableConfig)};`;
      }
      return null;
    },
  };
}
