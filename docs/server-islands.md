# Server islands

Astro server islands let a page ship its shell immediately and stream in deferred fragments after. The adapter supports them out of the box.

## How they work on Fastly

1. The page is rendered. Any `<Component server:defer>` becomes a placeholder pointing at `/_server-islands/<id>?<query>`.
2. The browser fetches that URL.
3. The Fastly Compute entry sees the path starts with `/_server-islands/` and **bypasses the static publisher** — islands are dynamic by definition. The request goes straight to Astro's SSR handler.
4. Astro looks up the component in the server-island manifest, renders it, and returns the HTML fragment.
5. The fragment is swapped into the page client-side.

## Caching

Default: `Cache-Control: no-store` for islands. They often contain personalized data, so caching is conservative.

To opt in:

```ts
fastlyCompute({
  cache: {
    islandMaxAge: 60,                         // 60s
    cacheResponsesWithSetCookie: false,       // still skip caching if Set-Cookie present
  },
});
```

Islands carrying `Set-Cookie` are **never** cached unless `cacheResponsesWithSetCookie: true` is set.

## Demo

The bundled example app has a working server island at [`examples/app/src/pages/islands.astro`](../examples/app/src/pages/islands.astro). The component is in [`examples/app/src/components/DeferredGreeting.astro`](../examples/app/src/components/DeferredGreeting.astro).

```astro
<DeferredGreeting name="Fastly Compute" server:defer>
  <p slot="fallback"><em>Loading…</em></p>
</DeferredGreeting>
```

The shell paints with the fallback, then the browser fetches `/_server-islands/...` and the rendered HTML replaces the placeholder.

## Acceptance check

After `astro build`, then from `dist/fastly` run `npm install`, `npm run dev:publish`, and `npm run dev:start`:

```bash
# 1. Page shell renders
curl -i http://localhost:7676/islands | head -20

# 2. Island endpoint responds
curl -i 'http://localhost:7676/_server-islands/<the_id_from_the_html>?<the_props_from_the_html>'
# → 200 with text/html and the rendered island fragment
```

Open `/islands` in a browser to see it stream visually.
