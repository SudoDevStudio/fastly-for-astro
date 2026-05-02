declare module "virtual:fastly-for-astro/runtime-config" {
  import type { ResolvedAdapterOptions } from "../options.js";
  const config: Pick<
    ResolvedAdapterOptions,
    "securityHeaders" | "cache" | "observability" | "runtime" | "experimental" | "assetsPrefix"
  >;
  export default config;
}
