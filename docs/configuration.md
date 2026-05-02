# Configuration

All options are passed to the adapter factory:

```ts
import fastlyCompute from "@sudodevstudio/fastly-for-astro";

export default defineConfig({
  output: "server",
  adapter: fastlyCompute({ /* options */ }),
});
```

## Top-level options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | `string` | `"astro-fastly-app"` | Service / Compute app name. Written to `fastly.toml`. |
| `description` | `string` | `"Astro app on Fastly Compute"` | Description for the Compute app. |
| `author` | `string` | `""` | Author for the Compute app. |
| `serviceId` | `string` | `""` | Existing Fastly service ID. Empty string lets the CLI create one. |
| `kvStoreName` | `string` | `"astro-site-content"` | KV store used by the static publisher. Validated to `[a-zA-Z0-9_-]+`. |
| `staticCollection` | `string` | `"live"` | Default collection name. |
| `publishId` | `string` | `"astro"` | Prefix for keys in the KV store. |
| `staticPublisherWorkingDir` | `string` | `"./.static-publisher"` | Local working dir for the publisher CLI. |
| `assetsPrefix` | `string` | `"/_astro/"` | Path prefix for hashed assets. Must start with `/`. |
| `publicDir` | `string` | `"public"` | Directory copied verbatim. |
| `compression` | `boolean` | `true` | When true, `br` and `gzip` variants are precomputed and stored in KV. |

## Security headers

```ts
fastlyCompute({
  securityHeaders: true, // shorthand for the defaults below
  // OR an object:
  securityHeaders: {
    contentTypeOptions: true,
    referrerPolicy: "strict-origin-when-cross-origin",
    frameOptions: "SAMEORIGIN",
    permissionsPolicy: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    contentSecurityPolicy: false,                    // off by default
    strictTransportSecurity: false,                  // off by default
    crossOriginOpenerPolicy: "same-origin",
    crossOriginResourcePolicy: "same-origin",
  },
});
```

Set any field to `false` to omit that header. See [security.md](./security.md).

## Cache

```ts
cache: {
  staticMaxAge: 31536000,              // hashed assets: 1y immutable
  htmlMaxAge: 0,                       // HTML: no-store by default
  apiMaxAge: 0,
  islandMaxAge: 0,
  staleWhileRevalidate: 0,
  cacheHtmlWithCookies: false,         // do not cache HTML when request has Cookie
  cacheResponsesWithSetCookie: false,  // do not cache responses with Set-Cookie
}
```

Per-class behaviour is described in [caching.md](./caching.md).

## Observability

```ts
observability: {
  enabled: false,                 // structured request logs to console
  logLevel: "info",
  serverTiming: false,            // adds Server-Timing + X-Request-Id headers
}
```

## Runtime

```ts
runtime: {
  streaming: true,                // pass response bodies as streams when possible
  preserveHostHeader: true,       // honor X-Forwarded-Host / Host
  trustForwardedProto: true,      // honor X-Forwarded-Proto
  maxRequestBodyBytes: 10485760,  // request body cap (advisory)
}
```

## Experimental

```ts
experimental: {
  serverIslands: true,            // route /_server-islands/* directly to SSR
  kvPrerenderedPages: false,      // (planned) push prerendered HTML to KV explicitly
  edgeMiddleware: false,          // emit a separate middleware bundle (advanced)
}
```
