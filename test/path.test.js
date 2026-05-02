import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePath, reconstructUrl, isServerIslandRequest, isAstroAssetRequest } from "../dist/runtime/path.js";

test("normalizePath: collapses ..", () => {
  assert.equal(normalizePath("/a/b/../c"), "/a/c");
  assert.equal(normalizePath("/../etc/passwd"), "/etc/passwd");
});

test("normalizePath: collapses .", () => {
  assert.equal(normalizePath("/a/./b"), "/a/b");
});

test("normalizePath: rejects null bytes", () => {
  assert.equal(normalizePath("/a\0b"), "/");
});

test("normalizePath: preserves trailing slash", () => {
  assert.equal(normalizePath("/a/b/"), "/a/b/");
  assert.equal(normalizePath("/"), "/");
});

test("reconstructUrl: honors X-Forwarded-Proto when trusted", () => {
  const req = new Request("http://internal/page", {
    headers: { "x-forwarded-proto": "https", "x-forwarded-host": "example.com" },
  });
  const url = reconstructUrl(req, { trustForwardedProto: true, preserveHostHeader: true });
  assert.equal(url.protocol, "https:");
  assert.equal(url.host, "example.com");
});

test("reconstructUrl: ignores X-Forwarded-Proto when distrusted", () => {
  const req = new Request("http://internal/page", {
    headers: { "x-forwarded-proto": "https" },
  });
  const url = reconstructUrl(req, { trustForwardedProto: false, preserveHostHeader: false });
  assert.equal(url.protocol, "http:");
});

test("isServerIslandRequest: matches /_server-islands/ prefix", () => {
  assert.equal(isServerIslandRequest("/_server-islands/abc"), true);
  assert.equal(isServerIslandRequest("/foo"), false);
});

test("isAstroAssetRequest: matches assetsPrefix and /_astro/", () => {
  assert.equal(isAstroAssetRequest("/_astro/foo.js", "/_astro/"), true);
  assert.equal(isAstroAssetRequest("/_assets/foo.js", "/_assets/"), true);
  assert.equal(isAstroAssetRequest("/page", "/_astro/"), false);
});
