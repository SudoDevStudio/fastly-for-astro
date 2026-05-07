import type { SSRManifest } from "astro";
import { App } from "astro/app";
import { createHandler, type ClientContext } from "./handler.js";
// Virtual module: populated at build time by the adapter's Vite plugin.
// eslint-disable-next-line import/no-unresolved
import runtimeConfig from "virtual:fastly-for-astro/runtime-config";

/**
 * Astro server entrypoint. Astro's build pipeline invokes this with the
 * generated SSR manifest and re-exports whatever we return from `entry.mjs`.
 */
export function createExports(manifest: SSRManifest) {
  const app = new App(manifest, runtimeConfig.runtime.streaming);
  const handle = createHandler({ app, config: runtimeConfig });

  return {
    default: handle,
    handle,
    /** Direct access to the App for advanced consumers. */
    app,
  };
}

export type { ClientContext };
