import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySecurityHeaders,
  applyCacheHeaders,
  classifyResponse,
} from "../dist/runtime/headers.js";

const SECURITY_DEFAULTS = {
  contentTypeOptions: true,
  referrerPolicy: "strict-origin-when-cross-origin",
  frameOptions: "SAMEORIGIN",
  permissionsPolicy: "camera=()",
  contentSecurityPolicy: false,
  strictTransportSecurity: false,
  crossOriginOpenerPolicy: "same-origin",
  crossOriginResourcePolicy: "same-origin",
};

const CACHE_DEFAULTS = {
  staticMaxAge: 31536000,
  htmlMaxAge: 0,
  apiMaxAge: 0,
  islandMaxAge: 0,
  staleWhileRevalidate: 0,
  cacheHtmlWithCookies: false,
  cacheResponsesWithSetCookie: false,
};

test("applySecurityHeaders: applies defaults", () => {
  const res = new Response("hi");
  const out = applySecurityHeaders(res, SECURITY_DEFAULTS);
  assert.equal(out.headers.get("x-content-type-options"), "nosniff");
  assert.equal(out.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(out.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(out.headers.get("content-security-policy"), null);
});

test("applySecurityHeaders: respects existing headers", () => {
  const res = new Response("hi", { headers: { "x-frame-options": "DENY" } });
  const out = applySecurityHeaders(res, SECURITY_DEFAULTS);
  assert.equal(out.headers.get("x-frame-options"), "DENY");
});

test("applySecurityHeaders: false disables", () => {
  const res = new Response("hi");
  const out = applySecurityHeaders(res, false);
  assert.equal(out.headers.get("x-content-type-options"), null);
});

test("classifyResponse: html for text/html", () => {
  const url = new URL("https://example.com/foo");
  const req = new Request("https://example.com/foo");
  const res = new Response("<html></html>", { headers: { "content-type": "text/html" } });
  assert.equal(classifyResponse(req, res, url), "html");
});

test("classifyResponse: redirect for 3xx", () => {
  const url = new URL("https://example.com/foo");
  const req = new Request("https://example.com/foo");
  const res = new Response(null, { status: 302, headers: { location: "/" } });
  assert.equal(classifyResponse(req, res, url), "redirect");
});

test("classifyResponse: island for /_server-islands/*", () => {
  const url = new URL("https://example.com/_server-islands/abc123");
  const req = new Request(url);
  const res = new Response("<div/>", { headers: { "content-type": "text/html" } });
  assert.equal(classifyResponse(req, res, url), "island");
});

test("classifyResponse: api for /api/*", () => {
  const url = new URL("https://example.com/api/echo");
  const req = new Request(url);
  const res = new Response("{}", { headers: { "content-type": "application/json" } });
  assert.equal(classifyResponse(req, res, url), "api");
});

test("applyCacheHeaders: hashed asset gets immutable", () => {
  const url = new URL("https://example.com/_astro/Foo.abcdef12.js");
  const req = new Request(url);
  const res = new Response("//js");
  const out = applyCacheHeaders(req, res, "static-asset", CACHE_DEFAULTS, url);
  assert.match(out.headers.get("cache-control"), /immutable/);
});

test("applyCacheHeaders: html with request Cookie defaults to no-store", () => {
  const url = new URL("https://example.com/page");
  const req = new Request(url, { headers: { cookie: "sid=abc" } });
  const res = new Response("<html/>");
  const out = applyCacheHeaders(req, res, "html", CACHE_DEFAULTS, url);
  assert.equal(out.headers.get("cache-control"), "private, no-store");
});

test("applyCacheHeaders: response Set-Cookie defaults to no-store", () => {
  const url = new URL("https://example.com/page");
  const req = new Request(url);
  const res = new Response("<html/>", { headers: { "set-cookie": "x=1" } });
  const out = applyCacheHeaders(req, res, "html", CACHE_DEFAULTS, url);
  assert.equal(out.headers.get("cache-control"), "private, no-store");
  assert.equal(out.headers.get("set-cookie"), "x=1");
});

test("applyCacheHeaders: respects pre-existing Cache-Control", () => {
  const url = new URL("https://example.com/api/products");
  const req = new Request(url);
  const res = new Response("[]", {
    headers: { "cache-control": "public, max-age=60", "content-type": "application/json" },
  });
  const out = applyCacheHeaders(req, res, "api", CACHE_DEFAULTS, url);
  assert.equal(out.headers.get("cache-control"), "public, max-age=60");
});

test("applyCacheHeaders: api default no-store", () => {
  const url = new URL("https://example.com/api/x");
  const req = new Request(url);
  const res = new Response("{}");
  const out = applyCacheHeaders(req, res, "api", CACHE_DEFAULTS, url);
  assert.equal(out.headers.get("cache-control"), "no-store");
});

test("applyCacheHeaders: island default no-store", () => {
  const url = new URL("https://example.com/_server-islands/x");
  const req = new Request(url);
  const res = new Response("<div/>");
  const out = applyCacheHeaders(req, res, "island", CACHE_DEFAULTS, url);
  assert.equal(out.headers.get("cache-control"), "no-store");
});

test("applyCacheHeaders: html caching opt-in works", () => {
  const url = new URL("https://example.com/page");
  const req = new Request(url);
  const res = new Response("<html/>");
  const cache = { ...CACHE_DEFAULTS, htmlMaxAge: 60, staleWhileRevalidate: 300 };
  const out = applyCacheHeaders(req, res, "html", cache, url);
  assert.equal(out.headers.get("cache-control"), "public, max-age=60, stale-while-revalidate=300");
});

test("applySecurityHeaders: preserves Set-Cookie", () => {
  const res = new Response("hi", { headers: { "set-cookie": "visits=2; Path=/; HttpOnly" } });
  const out = applySecurityHeaders(res, SECURITY_DEFAULTS);
  assert.equal(out.headers.get("set-cookie"), "visits=2; Path=/; HttpOnly");
});
