import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveOptions } from "../dist/options.js";

test("defaults: no options yields safe defaults", () => {
  const o = resolveOptions(undefined);
  assert.equal(o.aot, false);
  assert.equal(o.kvStoreName, "astro-site-content");
  assert.equal(o.staticCollection, "live");
  assert.equal(o.assetsPrefix, "/_astro/");
  assert.equal(o.compression, true);
  assert.equal(o.cache.staticMaxAge, 31536000);
  assert.equal(o.cache.htmlMaxAge, 0);
  assert.equal(o.cache.cacheHtmlWithCookies, false);
  assert.equal(o.cache.cacheResponsesWithSetCookie, false);
  assert.notEqual(o.securityHeaders, false);
  assert.equal(o.experimental.serverIslands, true);
});

test("validation: kvStoreName must be alphanumeric/_/-", () => {
  assert.throws(() => resolveOptions({ kvStoreName: "with spaces" }));
  assert.throws(() => resolveOptions({ kvStoreName: "" }));
  assert.doesNotThrow(() => resolveOptions({ kvStoreName: "ok-123_X" }));
});

test("validation: staticCollection format", () => {
  assert.throws(() => resolveOptions({ staticCollection: "bad/name" }));
  assert.doesNotThrow(() => resolveOptions({ staticCollection: "staging-2025" }));
});

test("validation: assetsPrefix must start with /", () => {
  assert.throws(() => resolveOptions({ assetsPrefix: "_astro/" }));
  assert.doesNotThrow(() => resolveOptions({ assetsPrefix: "/_assets/" }));
});

test("validation: cache numbers must be non-negative", () => {
  assert.throws(() => resolveOptions({ cache: { staticMaxAge: -1 } }));
  assert.throws(() => resolveOptions({ cache: { htmlMaxAge: -1 } }));
});

test("securityHeaders: false disables", () => {
  const o = resolveOptions({ securityHeaders: false });
  assert.equal(o.securityHeaders, false);
});

test("securityHeaders: object merges with defaults", () => {
  const o = resolveOptions({
    securityHeaders: { contentSecurityPolicy: "default-src 'self'" },
  });
  assert.notEqual(o.securityHeaders, false);
  assert.equal(o.securityHeaders.contentSecurityPolicy, "default-src 'self'");
  assert.equal(o.securityHeaders.contentTypeOptions, true); // default preserved
});

test("aot: opt-in is preserved", () => {
  const o = resolveOptions({ aot: true });
  assert.equal(o.aot, true);
});
