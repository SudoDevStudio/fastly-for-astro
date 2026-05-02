# Security

## Defaults

When `securityHeaders: true` (the default), the adapter applies these on every SSR response that doesn't already set them:

| Header | Default value |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |

These are **not** set:

- `Content-Security-Policy` — Astro apps frequently inline scripts/styles. A wrong CSP breaks pages silently. Opt in only after auditing your output. See below.
- `Strict-Transport-Security` — only safe to enable in production with a real domain. Opt in deliberately.

## Opting in to CSP

```ts
fastlyCompute({
  securityHeaders: {
    contentSecurityPolicy:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  },
});
```

Astro's hydration scripts and inline component styles need `'unsafe-inline'` unless you implement a nonce/hash workflow. If you do that, your routes can override `Content-Security-Policy` per-response and the adapter will preserve your value.

## Opting in to HSTS

```ts
fastlyCompute({
  securityHeaders: {
    strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
  },
});
```

Only enable once you've verified all subdomains serve HTTPS — HSTS is sticky.

## What the adapter avoids

- **No stack traces in production.** Errors return a plain 500 with the request id; the stack is logged but never sent to the client unless `observability.enabled` is true (and even then, only in the body when explicitly turned on).
- **No filesystem reads at request time.** The runtime never touches `fs`. All assets come through the static publisher / KV.
- **Path traversal protection.** URL paths are normalized before routing.
- **Cookie-bearing responses are not cached** by default — neither HTML with a request `Cookie`, nor anything with `Set-Cookie`.
- **Static responses never carry `Set-Cookie`.** If a static asset is somehow returned with one, the adapter strips it.
- **No secrets in generated files.** `service_id` is the only Fastly identifier persisted, and it's a public reference, not a credential. Read secrets at runtime from Fastly's Config Store / Secret Store / env, not from disk.

## Forwarded headers

`runtime.preserveHostHeader` and `runtime.trustForwardedProto` are on by default. If you put untrusted intermediaries in front of Fastly, set them to `false` so the adapter ignores forged `X-Forwarded-*` headers.

## Request body limits

`runtime.maxRequestBodyBytes` (default 10 MiB) is advisory — Fastly Compute already imposes platform limits. Use this to surface friendlier errors before reading large bodies.
