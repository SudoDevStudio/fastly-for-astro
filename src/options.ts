export interface SecurityHeadersOptions {
  contentTypeOptions?: boolean;
  referrerPolicy?: string | false;
  frameOptions?: "DENY" | "SAMEORIGIN" | false;
  permissionsPolicy?: string | false;
  contentSecurityPolicy?: string | false;
  strictTransportSecurity?: string | false;
  crossOriginOpenerPolicy?: string | false;
  crossOriginResourcePolicy?: string | false;
}

export interface CacheOptions {
  staticMaxAge?: number;
  htmlMaxAge?: number;
  apiMaxAge?: number;
  islandMaxAge?: number;
  staleWhileRevalidate?: number;
  cacheHtmlWithCookies?: boolean;
  cacheResponsesWithSetCookie?: boolean;
}

export interface ObservabilityOptions {
  enabled?: boolean;
  logLevel?: "debug" | "info" | "warn" | "error";
  serverTiming?: boolean;
}

export interface RuntimeOptions {
  streaming?: boolean;
  preserveHostHeader?: boolean;
  trustForwardedProto?: boolean;
  maxRequestBodyBytes?: number;
}

export interface ExperimentalOptions {
  serverIslands?: boolean;
  kvPrerenderedPages?: boolean;
  edgeMiddleware?: boolean;
}

export interface FastlyComputeAdapterOptions {
  serviceId?: string;
  name?: string;
  description?: string;
  author?: string;
  kvStoreName?: string;
  staticCollection?: string;
  staticPublisherWorkingDir?: string;
  publishId?: string;
  assetsPrefix?: string;
  publicDir?: string;
  compression?: boolean;
  securityHeaders?: boolean | SecurityHeadersOptions;
  cache?: CacheOptions;
  observability?: ObservabilityOptions;
  runtime?: RuntimeOptions;
  experimental?: ExperimentalOptions;
}

export interface ResolvedAdapterOptions {
  serviceId: string;
  name: string;
  description: string;
  author: string;
  kvStoreName: string;
  staticCollection: string;
  staticPublisherWorkingDir: string;
  publishId: string;
  assetsPrefix: string;
  publicDir: string;
  compression: boolean;
  securityHeaders: false | Required<SecurityHeadersOptions>;
  cache: Required<CacheOptions>;
  observability: Required<ObservabilityOptions>;
  runtime: Required<RuntimeOptions>;
  experimental: Required<ExperimentalOptions>;
}

const DEFAULT_SECURITY_HEADERS: Required<SecurityHeadersOptions> = {
  contentTypeOptions: true,
  referrerPolicy: "strict-origin-when-cross-origin",
  frameOptions: "SAMEORIGIN",
  permissionsPolicy: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  contentSecurityPolicy: false,
  strictTransportSecurity: false,
  crossOriginOpenerPolicy: "same-origin",
  crossOriginResourcePolicy: "same-origin",
};

const DEFAULT_CACHE: Required<CacheOptions> = {
  staticMaxAge: 31536000,
  htmlMaxAge: 0,
  apiMaxAge: 0,
  islandMaxAge: 0,
  staleWhileRevalidate: 0,
  cacheHtmlWithCookies: false,
  cacheResponsesWithSetCookie: false,
};

const DEFAULT_OBSERVABILITY: Required<ObservabilityOptions> = {
  enabled: false,
  logLevel: "info",
  serverTiming: false,
};

const DEFAULT_RUNTIME: Required<RuntimeOptions> = {
  streaming: true,
  preserveHostHeader: true,
  trustForwardedProto: true,
  maxRequestBodyBytes: 10 * 1024 * 1024,
};

const DEFAULT_EXPERIMENTAL: Required<ExperimentalOptions> = {
  serverIslands: true,
  kvPrerenderedPages: false,
  edgeMiddleware: false,
};

export function resolveOptions(
  options: FastlyComputeAdapterOptions | undefined,
): ResolvedAdapterOptions {
  const o = options ?? {};
  validate(o);

  const securityHeaders =
    o.securityHeaders === false
      ? false
      : typeof o.securityHeaders === "object"
        ? { ...DEFAULT_SECURITY_HEADERS, ...o.securityHeaders }
        : DEFAULT_SECURITY_HEADERS;

  return {
    serviceId: o.serviceId ?? "",
    name: o.name ?? "astro-fastly-app",
    description: o.description ?? "Astro app on Fastly Compute",
    author: o.author ?? "",
    kvStoreName: o.kvStoreName ?? "astro-site-content",
    staticCollection: o.staticCollection ?? "live",
    staticPublisherWorkingDir: o.staticPublisherWorkingDir ?? "./.static-publisher",
    publishId: o.publishId ?? "astro",
    assetsPrefix: o.assetsPrefix ?? "/_astro/",
    publicDir: o.publicDir ?? "public",
    compression: o.compression ?? true,
    securityHeaders,
    cache: { ...DEFAULT_CACHE, ...(o.cache ?? {}) },
    observability: { ...DEFAULT_OBSERVABILITY, ...(o.observability ?? {}) },
    runtime: { ...DEFAULT_RUNTIME, ...(o.runtime ?? {}) },
    experimental: { ...DEFAULT_EXPERIMENTAL, ...(o.experimental ?? {}) },
  };
}

function validate(o: FastlyComputeAdapterOptions): void {
  if (o.kvStoreName !== undefined) {
    if (typeof o.kvStoreName !== "string" || o.kvStoreName.length === 0) {
      throw new Error("[fastly-for-astro] kvStoreName must be a non-empty string");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(o.kvStoreName)) {
      throw new Error(
        "[fastly-for-astro] kvStoreName must contain only alphanumerics, underscores, and hyphens",
      );
    }
  }
  if (o.staticCollection !== undefined && !/^[a-zA-Z0-9_-]+$/.test(o.staticCollection)) {
    throw new Error(
      "[fastly-for-astro] staticCollection must contain only alphanumerics, underscores, and hyphens",
    );
  }
  if (o.assetsPrefix !== undefined && !o.assetsPrefix.startsWith("/")) {
    throw new Error("[fastly-for-astro] assetsPrefix must start with '/'");
  }
  if (o.cache?.staticMaxAge !== undefined && o.cache.staticMaxAge < 0) {
    throw new Error("[fastly-for-astro] cache.staticMaxAge must be >= 0");
  }
  if (o.cache?.htmlMaxAge !== undefined && o.cache.htmlMaxAge < 0) {
    throw new Error("[fastly-for-astro] cache.htmlMaxAge must be >= 0");
  }
  if (o.runtime?.maxRequestBodyBytes !== undefined && o.runtime.maxRequestBodyBytes < 0) {
    throw new Error("[fastly-for-astro] runtime.maxRequestBodyBytes must be >= 0");
  }
}
