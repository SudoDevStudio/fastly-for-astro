import type { App } from "astro/app";
import { applyCacheHeaders, applySecurityHeaders, classifyResponse, mergeSetCookieHeaders } from "./headers.js";
import { reconstructUrl } from "./path.js";
import { buildServerTimingHeader, generateRequestId, makeLogger, now, startTimings } from "./observability.js";

interface RuntimeConfig {
  securityHeaders: false | Required<import("../options.js").SecurityHeadersOptions>;
  cache: Required<import("../options.js").CacheOptions>;
  observability: Required<import("../options.js").ObservabilityOptions>;
  runtime: Required<import("../options.js").RuntimeOptions>;
  experimental: Required<import("../options.js").ExperimentalOptions>;
  assetsPrefix: string;
}

export interface ClientContext {
  /** Optional client IP (Fastly: fastly.env or client.address) */
  clientAddress?: string;
  /** Geo info from Fastly's geolocation lookup */
  geo?: Record<string, unknown>;
  /** Underlying Fastly fetch event for advanced use */
  fastlyEvent?: unknown;
}

export interface HandlerOptions {
  app: App;
  config: RuntimeConfig;
}

export function createHandler({ app, config }: HandlerOptions) {
  const logger = makeLogger(config.observability.enabled, config.observability.logLevel);

  return async function handle(
    request: Request,
    ctx: ClientContext = {},
  ): Promise<Response> {
    const requestId = request.headers.get("x-request-id") ?? generateRequestId();
    const timings = startTimings();
    const url = reconstructUrl(request, {
      trustForwardedProto: config.runtime.trustForwardedProto,
      preserveHostHeader: config.runtime.preserveHostHeader,
    });

    let normalizedRequest = request;
    if (url.toString() !== request.url) {
      normalizedRequest = new Request(url.toString(), request);
    }

    const locals: Record<string, unknown> = {
      requestId,
      clientAddress: ctx.clientAddress,
      geo: ctx.geo,
    };

    let response: Response;
    try {
      timings.ssrStart = now();
      const routeData = app.match(normalizedRequest);
      if (!routeData) {
        response = await app.render(normalizedRequest, { locals, addCookieHeader: true });
      } else {
        response = await app.render(normalizedRequest, {
          routeData,
          locals,
          clientAddress: ctx.clientAddress,
          addCookieHeader: true,
        });
      }
      timings.ssrEnd = now();
    } catch (error) {
      timings.ssrEnd = now();
      const isProd = !config.observability.enabled;
      logger.error("SSR error", {
        requestId,
        method: request.method,
        path: url.pathname,
        message: error instanceof Error ? error.message : String(error),
      });
      response = renderErrorResponse(error, isProd, requestId);
    }

    timings.total = now();

    const cls = classifyResponse(normalizedRequest, response, url);
    if (response.status >= 400) {
      logger.warn("SSR response", {
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        statusText: response.statusText,
        class: cls,
      });
    }
    response = applyCacheHeaders(normalizedRequest, response, cls, config.cache, url);
    response = applySecurityHeaders(response, config.securityHeaders);

    if (config.observability.serverTiming) {
      const header = buildServerTimingHeader(timings);
      if (header) {
        const headers = new Headers(response.headers);
        headers.delete("set-cookie");
        mergeSetCookieHeaders(headers, response.headers);
        headers.set("server-timing", header);
        headers.set("x-request-id", requestId);
        response = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    }

    return response;
  };
}

function renderErrorResponse(error: unknown, isProd: boolean, requestId: string): Response {
  const body = isProd
    ? `Internal Server Error\nrequest-id: ${requestId}\n`
    : `Internal Server Error\nrequest-id: ${requestId}\n\n${
        error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
      }`;
  return new Response(body, {
    status: 500,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-request-id": requestId,
      "cache-control": "no-store",
    },
  });
}
