# Architecture

## High-level

```
                 ┌─────────────────────────────────────────────┐
   request ───▶  │  Fastly Compute (WASM, JavaScript runtime)  │
                 │                                             │
                 │   ┌────────────────────────────────────┐    │
                 │   │ generated entry: src/index.js      │    │
                 │   │   1. PublisherServer.serveRequest  │───▶│──▶ static asset (KV)
                 │   │      (returns null if no match)    │    │
                 │   │   2. Astro SSR handle(request)     │───▶│──▶ dynamic HTML / JSON / island
                 │   └────────────────────────────────────┘    │
                 └─────────────────────────────────────────────┘
```

## Build pipeline

```
astro build
  │
  ├── astro:config:setup    ← adapter registers Vite plugin (virtual:runtime-config),
  │                           sets ssr.target = "webworker", noExternal for SDK,
  │                           installs Fastly runtime shims/aliases
  ├── astro:config:done     ← adapter calls setAdapter(...)
  ├── (Astro builds client)
  ├── (Astro builds server)
  │     serverEntrypoint = "@sudodevstudio/fastly-for-astro/entrypoints/server.js"
  │     produces dist/server/entry.mjs with manifest + runtime config bound
  └── astro:build:done      ← adapter generates dist/fastly/:
                                src/index.js               (Compute fetch listener)
                                static-publish.rc.js       (KV store config)
                                publish-content.config.js  (publisher upload + serve config)
                                fastly.toml                (service manifest)
                                package.json               (Compute app deps + scripts)
                                README.md, .gitignore
```

## Runtime request flow

1. **Fastly Compute** receives the request as an `event` with `event.request: Request`.
2. **PublisherServer** is consulted. It serves anything published from `dist/client/` to KV — `_astro/*` bundles, `public/*` files, prerendered HTML — with strong cache headers, conditional GETs, and `br`/`gzip` variants.
3. If `serveRequest` returns `null`, control passes to the **Astro SSR handler**.
4. The handler:
   - Reconstructs a normalized URL (forwarded host/proto handling, path normalization).
   - Calls `app.match(request)` and `app.render(request, { routeData, locals })`.
   - For `/_server-islands/*` requests, the static publisher is bypassed entirely so islands always go through SSR.
   - Honors `runtime.streaming` when constructing Astro's `App`.
5. The response is post-processed:
   - Classified as `static-asset | html | api | island | redirect | error`.
   - `Cache-Control` is set per-class (configurable). Cookie-bearing or `Set-Cookie` responses are not cached unless explicitly opted in.
   - Security headers (`X-Content-Type-Options`, `Referrer-Policy`, etc.) are applied if not already present.
   - Optional `Server-Timing` and `X-Request-Id` headers added when `observability.serverTiming` is enabled.

## Why two layers (publisher + SSR)?

The static publisher serves bytes from KV at the edge — very fast and cheap. SSR is reserved for routes that genuinely need per-request rendering. The order is deliberate: prerendered routes never round-trip through SSR.

## Why `vite.ssr.target = "webworker"`?

The Fastly Compute JS runtime is closer to a Worker/edge environment than a Node.js server. Setting Vite's SSR target to `webworker` produces output without Node-only globals (`process.env`, `Buffer`, etc.) and prefers Web Streams.

## Build-time module swaps

Three modules cannot survive into the Compute Wasm as written, so the adapter replaces them during the SSR build:

| Module | Why | Replacement |
| --- | --- | --- |
| `astro/dist/core/encryption.js` | Uses `crypto.subtle.encrypt`/`decrypt`, which Fastly Compute does not implement | Pure-JS AES-GCM via [@noble/ciphers](https://github.com/paulmillr/noble-ciphers), including Astro v7's authenticated-context (`additionalData`) argument |
| `es-module-lexer` | Initializes WebAssembly at module load, which trips Wizer pre-initialization | No-op shim — the runtime never parses ES modules |
| `node:stream` | `@astrojs/react` guards a Node-only `renderToPipeableStream` fallback behind `import("node:stream")`. Astro v7's Rolldown constant-folds the specifier into a literal, so `js-compute-runtime`'s esbuild pass fails with `Could not resolve "node:stream"` | Throwing shim. The fallback is unreachable because `react-dom/server` is aliased to `react-dom/server.edge`, whose `renderToReadableStream` wins |

The `node:stream` import is marked `/* @vite-ignore */` upstream, so `resolve.alias` never sees it — the adapter rewrites the import at the source level instead.

## Manifest binding

Our `serverEntrypoint` exports `createExports(manifest)`, constructs `new App(manifest, runtimeConfig.runtime.streaming)`, and returns `{ default: handle, handle, app }`. The generated Compute entry installs Fastly compatibility shims first, then dynamically imports `dist/server/entry.mjs` so React/Astro SSR can initialize safely under Wizer.
