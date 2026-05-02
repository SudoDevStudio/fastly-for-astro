# @sudodevstudio/fastly-for-astro

Astro v6 adapter for Fastly Compute. Dynamic SSR, server islands, and KV-backed static assets — without requiring any changes to your Astro app code.

## Install

```bash
npm install @sudodevstudio/fastly-for-astro
```

You also need the [Fastly CLI](https://www.fastly.com/documentation/reference/tools/cli/) on your machine.

## Configure

```ts
// astro.config.ts
import { defineConfig } from "astro/config";
import fastlyCompute from "@sudodevstudio/fastly-for-astro";

export default defineConfig({
  output: "server",
  adapter: fastlyCompute({
    kvStoreName: "astro-site-content",
    staticCollection: "live",
    assetsPrefix: "/_astro/",
    securityHeaders: true,
    compression: true,
    cache: {
      staticMaxAge: 31536000,
      htmlMaxAge: 0,
      staleWhileRevalidate: 60,
    },
  }),
});
```

That's it. No changes to your pages, components, server islands, or middleware.
Running \`astro build\` automatically generates a Fastly Compute app in \`dist/fastly\`.

If you use server islands, set a stable `ASTRO_KEY` in your build environment. Otherwise Astro generates a new encryption key on each build, and old `/_server-islands/*` URLs can start returning `400 Bad Request` after rebuilds or deploys.

## Build & deploy

```bash
# Build the Astro app — this automatically generates dist/client, dist/server, and dist/fastly
astro build

# Local Fastly Compute dev server from the generated app
cd dist/fastly
npm install
npm run dev

# Deploy to Fastly
npm run deploy
npm run publish
```

## Docs

- [architecture.md](./docs/architecture.md) — request flow and build pipeline
- [configuration.md](./docs/configuration.md) — every option, with defaults
- [deployment.md](./docs/deployment.md) — Fastly setup, KV stores, services
- [static-assets.md](./docs/static-assets.md) — how assets get to KV
- [server-islands.md](./docs/server-islands.md) — `server:defer` on the edge
- [security.md](./docs/security.md) — defaults and how to harden further
- [caching.md](./docs/caching.md) — cache policy and overrides
- [troubleshooting.md](./docs/troubleshooting.md) — common issues

## Limitations

- The Fastly Compute JS runtime is not Node.js. Avoid runtime use of `fs`, `net`, `child_process`, etc. Build-time use is fine.
- `sharp` image processing is not supported at runtime — use `squoosh` or a remote image service.
- Edge middleware mode (`adapterFeatures.middlewareMode: "edge"`) is opt-in via `experimental.edgeMiddleware`.

## License

MIT
