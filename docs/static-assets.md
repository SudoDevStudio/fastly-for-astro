# Static assets

The adapter delegates static asset delivery to [`@fastly/compute-js-static-publish`](https://github.com/fastly/compute-js-static-publish). It uploads everything in `dist/client/` to a Fastly KV store and serves it from the edge.

## What gets published

- `dist/client/_astro/*` — hashed JS / CSS bundles
- `dist/client/<page>/index.html` — prerendered routes
- `public/*` — anything you put in your `public/` directory

The generated `publish-content.config.js` looks like:

```js
{
  rootDir: "../client",
  excludeDirs: ["node_modules"],
  excludeDotfiles: true,
  includeWellKnown: true,
  kvStoreAssetInclusionTest: () => true,
  contentCompression: ["br", "gzip"],
  server: {
    publicDir: "../client",
    autoIndex: ["index.html"],
    autoExt: [".html"],
    staticItems: ["/_astro/"],
    allowedEncodings: ["br", "gzip"],
    notFoundPageFile: "/404.html",
  },
}
```

## Cache headers

`PublisherServer` sets sensible defaults — strong caching with content hashing for fingerprinted assets. The adapter does **not** override headers the publisher already set; it only ensures `Set-Cookie` is never returned with a static response.

## Adding non-Astro static files

In the bundled example app, drop them in [`examples/app/public/`](../examples/app/public). More generally, Astro copies your project's `public/` directory into `dist/client/` during build, and the publisher uploads it.

## How requests are routed

```
GET /index.html       → publisher    (prerendered)
GET /_astro/foo.abc.js → publisher    (immutable, 1y cache)
GET /robots.txt       → publisher    (from /public)
GET /ssr              → SSR          (publisher returned null)
GET /_server-islands/X → SSR (always — publisher is bypassed)
POST /api/echo        → SSR          (POST is never static)
```

## Forcing a re-publish

Static content is re-uploaded only when you run `publish-content`. After deploying a new Wasm binary, also run:

```bash
npx @fastly/compute-js-static-publish publish-content --collection-name=live
```

This is a separate step from `fastly compute publish` because the binary and the KV contents have independent lifecycles.
