import type { ResolvedAdapterOptions } from "../options.js";

/**
 * The runtime config is supplied to Astro's SSR bundle via the Vite virtual
 * module declared in `src/index.ts`. There's nothing to write to disk for the
 * SSR side, but we keep this hook so future runtime config (e.g. service
 * bindings, KV credentials) can be persisted alongside the build output if
 * needed.
 */
export async function writeRuntimeConfig(_args: {
  adapterRoot: string;
  options: ResolvedAdapterOptions;
}): Promise<void> {
  // Intentionally empty: runtime config is injected via the virtual module.
}
