# Troubleshooting

## `output: "static"` warning at build time

The adapter is intended for `output: "server"`. If you're fully static, use [`@fastly/compute-js-static-publish`](https://github.com/fastly/compute-js-static-publish) directly with no adapter — it's a one-liner.

## "expected Astro server output at dist/server/entry.mjs but it was not found"

Astro didn't produce a server bundle. Check:

- `output: "server"` is set in `astro.config.ts`.
- The adapter is registered (it must be listed under `adapter:`, not `integrations:`).
- No earlier integration short-circuited the build.

## `fastly compute serve` fails with `module not found "../server/entry.mjs"`

The Compute entry imports from `../server/entry.mjs` — meaning the layout must be:

```
dist/
├── server/entry.mjs
└── fastly/src/index.js
```

If you moved files, update the import path or re-run `astro build`.

## "Module ... has no exported member 'createApp'" / TypeScript errors in the adapter

You're on a pre-v6 Astro version. The adapter requires `astro@^6.0.0`. Check `node_modules/astro/package.json`.

## "Settings not found. You may need to publish your application."

The Wasm is running but the local KV store is empty (or `fastly.toml` is pointing at the wrong file). Two-part fix:

1. Make sure you ran `publish-content --local` **after** the latest `astro build` and **before** starting the server. The publisher writes to `./.static-publisher/kvstore.json` — confirm the file exists and is non-empty.

2. Confirm `fastly.toml` binds the KV store to that path:

   ```toml
   [local_server.kv_stores]
   "astro-site-content" = "./.static-publisher/kvstore.json"
   ```

   The string-value form (file path) is what Fastly CLI uses to back a local KV store with a JSON file. The `[[local_server.kv_stores."x"]]` array-of-tables form is for inline seed data only and won't load the publisher's output.

The `npm run fastly:serve` script does the publish step before starting the server. If you're running `fastly compute serve` by hand, run the publish first.

## Static assets 404 in local dev

Run the publisher first:

```bash
cd dist/fastly
npx @fastly/compute-js-static-publish publish-content --local
fastly compute serve
```

The local publisher writes to `./.static-publisher/kvstore.json`. Without that step, `PublisherServer.serveRequest` returns null for everything.

## `/posts/[id]` (or any dynamic route) returns 500 with `sanitizeParams` in the stack

Astro's `sanitizeParams` calls `String.prototype.normalize()`. Fastly Compute's JS engine ships **without ICU**, so `normalize` throws at runtime. The adapter monkey-patches `String.prototype.normalize` to an identity function (no Unicode normalization) inside the Vite SSR bundle's intro shim. If you see this after upgrading Astro, the shim may need to be expanded — open an issue.

## Server islands return 500 with `Supplied algorithm is not yet supported`

Astro v6 encrypts server-island props with **AES-GCM**. Fastly Compute's `SubtleCrypto` implements `digest`, `sign`, `verify`, and `importKey` (HMAC/RSA/ECDSA), but **not** `encrypt`/`decrypt`. The adapter ships a pure-JS AES-GCM polyfill (`crypto-polyfill.js`) that backs `crypto.subtle.encrypt/decrypt` via [@noble/ciphers](https://github.com/paulmillr/noble-ciphers). It's installed at the top of `dist/fastly/src/index.js` before the SSR bundle's first request runs.

If you see this error, check that:
- `dist/fastly/src/crypto-polyfill.js` exists (regenerate with `astro build`)
- `dist/fastly/package.json` lists `@noble/ciphers` and you ran `npm install` inside `dist/fastly/`
- `dist/fastly/src/index.js` calls `installCryptoPolyfill()` near the top

## Server islands return 404

- Ensure your component has `server:defer` (not `client:*`).
- Check the request path starts with `/_server-islands/`. The adapter routes that prefix straight to SSR; the static publisher is bypassed.
- If you customized `assetsPrefix`, that's separate — server islands use a fixed path.

## Server islands return 400 Bad Request

Astro returns `400` here when the encrypted island payload cannot be decrypted. The most common cause is a **build key mismatch**:

- the page shell was rendered by one build
- the `/_server-islands/*` request hit a different build
- Astro generated a different encryption key because `ASTRO_KEY` was not set

Fix:

1. Generate a stable key once:

   ```bash
   astro create-key
   ```

2. Set the emitted `ASTRO_KEY=...` value in the environment where `astro build` runs.

3. Rebuild and restart Fastly Compute.

For local debugging, do a hard refresh after restarting the server so the browser drops any stale page shell that still contains island URLs from the previous build.

## SSR responses not cached even with `htmlMaxAge` set

The adapter refuses to cache HTML when:

- The request carries a `Cookie` header (and `cacheHtmlWithCookies: false`).
- The response carries a `Set-Cookie` header (and `cacheResponsesWithSetCookie: false`).
- The route already set `Cache-Control` to a no-store value.

Inspect `Set-Cookie` and `Cookie` headers, or set both opt-ins to `true` if you've verified your routes are safe to cache.

## "Sharp is not supported" / `Could not resolve "node:fs"` during `js-compute-runtime`

The adapter forces `image.service: { entrypoint: "astro/assets/services/noop" }` by default to keep `sharp` (and its `node:fs`/`node:child_process`/`detect-libc` deps) out of the SSR bundle. The Compute runtime can't load Node-only built-ins. If you need image optimization, use a remote service (Cloudinary, imgix, Fastly's own image optimizer). To opt back in to sharp at your own risk, set `image.service` to something other than `astro/assets/services/sharp` in `astro.config.ts` — the adapter only overrides when sharp would be the choice.

## `js-compute-runtime` fails with `ReferenceError: Intl is not defined` / `WebAssembly is not defined`

These come from Fastly Compute's **Wizer pre-initializer** running the SSR bundle's top-level code in a snapshot environment that lacks `Intl` and `WebAssembly`. The adapter injects shims via Vite's `output.intro` to keep module init from trapping. If you see this error after upgrading Astro and a new top-level API is missing (e.g. `Atomics`, `SharedArrayBuffer`), open an issue — the shim list lives in `WIZER_GLOBALS_SHIM` inside `src/index.ts`.

## Build prints `Promise rejected but never handled: ({})`

Cosmetic. Some async work in Astro's manifest loader runs at module-init time. Wizer reports the orphan rejection but the build still succeeds (exit 0) and `bin/main.wasm` is produced. Run `ls -la bin/` to confirm. If `main.wasm` is missing or zero bytes, that's a real failure — paste the full output into an issue.

## Deploy succeeds but the site returns 503

- Ensure both `fastly compute publish` (binary) **and** `compute-js-static-publish publish-content` (KV contents) ran.
- Check the KV store name in `fastly.toml` matches what the publisher uploaded to.
- View live logs: `fastly log-tail --service-id=...`.

## How do I get a stack trace in production?

Set `observability.enabled: true` and tail logs with `fastly log-tail`. Stack traces are never written to the response body in production (they leak source paths).

## Where do I file bugs?

In the adapter repo's issues. Include the adapter version, Astro version, the offending route, and the full error from `fastly log-tail`.
