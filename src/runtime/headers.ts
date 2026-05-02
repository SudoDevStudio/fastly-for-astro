import type { ResolvedAdapterOptions, SecurityHeadersOptions, CacheOptions } from "../options.js";

export type ResponseClass = "static-asset" | "html" | "api" | "island" | "redirect" | "error";

export function classifyResponse(request: Request, response: Response, url: URL): ResponseClass {
  if (response.status >= 300 && response.status < 400) return "redirect";
  if (response.status >= 500) return "error";

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const path = url.pathname;

  if (path.startsWith("/_server-islands/")) return "island";
  if (path.startsWith("/api/") || /\.(json|xml|txt|csv)$/.test(path)) return "api";
  if (contentType.includes("text/html")) return "html";
  if (path.startsWith("/_astro/") || /\.[a-z0-9]+$/i.test(path)) return "static-asset";
  return "html";
}

export function applySecurityHeaders(
  response: Response,
  options: false | Required<SecurityHeadersOptions>,
): Response {
  if (!options) return response;

  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  mergeSetCookieHeaders(headers, response.headers);
  if (options.contentTypeOptions && !headers.has("x-content-type-options")) {
    headers.set("x-content-type-options", "nosniff");
  }
  if (options.referrerPolicy && !headers.has("referrer-policy")) {
    headers.set("referrer-policy", options.referrerPolicy);
  }
  if (options.frameOptions && !headers.has("x-frame-options")) {
    headers.set("x-frame-options", options.frameOptions);
  }
  if (options.permissionsPolicy && !headers.has("permissions-policy")) {
    headers.set("permissions-policy", options.permissionsPolicy);
  }
  if (options.contentSecurityPolicy && !headers.has("content-security-policy")) {
    headers.set("content-security-policy", options.contentSecurityPolicy);
  }
  if (options.strictTransportSecurity && !headers.has("strict-transport-security")) {
    headers.set("strict-transport-security", options.strictTransportSecurity);
  }
  if (options.crossOriginOpenerPolicy && !headers.has("cross-origin-opener-policy")) {
    headers.set("cross-origin-opener-policy", options.crossOriginOpenerPolicy);
  }
  if (options.crossOriginResourcePolicy && !headers.has("cross-origin-resource-policy")) {
    headers.set("cross-origin-resource-policy", options.crossOriginResourcePolicy);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function applyCacheHeaders(
  request: Request,
  response: Response,
  responseClass: ResponseClass,
  cache: Required<CacheOptions>,
  url: URL,
): Response {
  if (response.headers.has("cache-control")) return response;

  const hasSetCookie = response.headers.has("set-cookie");
  const hasReqCookie = request.headers.has("cookie");
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  mergeSetCookieHeaders(headers, response.headers);

  let directive: string | null = null;

  switch (responseClass) {
    case "static-asset": {
      const isHashed = isHashedAsset(url.pathname);
      if (isHashed) {
        directive = `public, max-age=${cache.staticMaxAge}, immutable`;
      } else {
        directive = `public, max-age=${Math.min(cache.staticMaxAge, 3600)}${
          cache.staleWhileRevalidate ? `, stale-while-revalidate=${cache.staleWhileRevalidate}` : ""
        }`;
      }
      break;
    }
    case "html": {
      if (hasSetCookie && !cache.cacheResponsesWithSetCookie) {
        directive = "private, no-store";
      } else if (hasReqCookie && !cache.cacheHtmlWithCookies) {
        directive = "private, no-store";
      } else if (cache.htmlMaxAge > 0) {
        directive = `public, max-age=${cache.htmlMaxAge}${
          cache.staleWhileRevalidate ? `, stale-while-revalidate=${cache.staleWhileRevalidate}` : ""
        }`;
      } else {
        directive = "no-store";
      }
      break;
    }
    case "island": {
      if (hasSetCookie && !cache.cacheResponsesWithSetCookie) {
        directive = "private, no-store";
      } else if (cache.islandMaxAge > 0) {
        directive = `public, max-age=${cache.islandMaxAge}`;
      } else {
        directive = "no-store";
      }
      break;
    }
    case "api": {
      if (cache.apiMaxAge > 0 && !hasSetCookie) {
        directive = `public, max-age=${cache.apiMaxAge}`;
      } else {
        directive = "no-store";
      }
      break;
    }
    case "redirect":
    case "error":
      directive = "no-store";
      break;
  }

  if (directive) headers.set("cache-control", directive);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isHashedAsset(pathname: string): boolean {
  // Astro emits assets like /_astro/Component.<8hex>.js
  return /\.[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(pathname);
}

export function mergeSetCookieHeaders(target: Headers, source: Headers): void {
  // Headers.getSetCookie() returns array (Node 20+/edge runtimes).
  const cookies =
    typeof (source as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (source as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : ((): string[] => {
          const single = source.get("set-cookie");
          return single ? [single] : [];
        })();
  for (const c of cookies) target.append("set-cookie", c);
}
