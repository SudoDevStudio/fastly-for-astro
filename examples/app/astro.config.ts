import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import fastlyCompute from "@sudodevstudio/fastly-for-astro";

export default defineConfig({
  output: "server",
  integrations: [react()],
  adapter: fastlyCompute({
    name: "astro-fastly-demo",
    description: "Demo Astro v6 app on Fastly Compute",
    kvStoreName: "astro-site-content",
    staticCollection: "live",
    assetsPrefix: "/_astro/",
    compression: true,
    securityHeaders: true,
    cache: {
      staticMaxAge: 31536000,
      htmlMaxAge: 0,
      apiMaxAge: 0,
      islandMaxAge: 0,
      staleWhileRevalidate: 60,
    },
    observability: {
      enabled: true,
      logLevel: "info",
      serverTiming: true,
    },
    runtime: {
      streaming: false,
    },
  }),
});
