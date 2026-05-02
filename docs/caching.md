# Caching

The adapter never overrides a `Cache-Control` header your route already set. If you write `response.headers.set("cache-control", "public, max-age=300")` in an API route, that wins.

If your route doesn't set one, the adapter applies a per-class default.

## Response classes

| Class | When | Default `Cache-Control` |
| --- | --- | --- |
| `static-asset` (hashed) | Path matches `/_astro/...` and ends with a content hash | `public, max-age=31536000, immutable` |
| `static-asset` (other) | Asset extension but no hash | `public, max-age=min(staticMaxAge, 3600)[, stale-while-revalidate=N]` |
| `html` | `Content-Type: text/html` | `no-store` (default) — see below |
| `island` | Path starts with `/_server-islands/` | `no-store` (default) |
| `api` | Path starts with `/api/` or has data extension | `no-store` (default) |
| `redirect` | Status 3xx | `no-store` |
| `error` | Status 5xx | `no-store` |

## HTML caching is conservative on purpose

Defaults to `no-store` because:

- Cookie-bearing requests usually represent an authenticated session.
- Astro pages can call `Astro.cookies.set(...)` and produce a per-user response.
- Caching the wrong page across users is the kind of bug that makes the 6 pm news.

To enable caching:

```ts
cache: {
  htmlMaxAge: 60,
  staleWhileRevalidate: 300,
  cacheHtmlWithCookies: false,        // still skip when request has Cookie
  cacheResponsesWithSetCookie: false, // still skip when response has Set-Cookie
}
```

If you set `cacheHtmlWithCookies: true`, you are asserting "my pages do not vary by cookie." Be sure.

## Stale-while-revalidate

When `staleWhileRevalidate > 0`, it's appended to `static-asset (non-hashed)` and `html` directives. Fastly serves the stale response immediately and revalidates in the background.

## Per-route overrides

The cleanest pattern: set the header in the route.

```ts
// src/pages/api/products.ts
export const GET: APIRoute = async () => {
  const data = await fetchProducts();
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
};
```

The adapter sees a `Cache-Control` already set and leaves it alone.

## Conditional GETs

For static assets, `PublisherServer` handles `If-None-Match` / `If-Modified-Since` natively and returns `304` when appropriate. SSR responses don't get conditional handling automatically — set `ETag`/`Last-Modified` in the route if you want it.
