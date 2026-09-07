// Test the astro-encryption shim that Vite swaps in for
// `astro/dist/core/encryption.js` at build time. The shim must preserve
// Astro's public API surface and round-trip encryptString/decryptString
// the same way the original does.

import { test } from "node:test";
import assert from "node:assert/strict";

const {
  createKey,
  encodeKey,
  decodeKey,
  encryptString,
  decryptString,
  generateContentHash,
  hashCryptoKey,
} = await import("../dist/runtime/shims/astro-encryption.js");

test("encryption shim: createKey + encodeKey + decodeKey round trip", async () => {
  const key = await createKey();
  const encoded = await encodeKey(key);
  assert.equal(typeof encoded, "string");
  const decoded = await decodeKey(encoded);
  assert.equal(typeof decoded, "object");
  assert.ok(decoded.raw instanceof Uint8Array);
  assert.equal(decoded.raw.byteLength, 32);
});

test("encryption shim: encryptString → decryptString round trip", async () => {
  const key = await createKey();
  const plaintext = JSON.stringify({ name: "Fastly Compute", count: 42 });
  const encrypted = await encryptString(key, plaintext);
  // Format: 24 hex chars (12-byte IV) + base64 ciphertext+tag
  assert.match(encrypted.slice(0, 24), /^[0-9A-F]{24}$/);
  const decrypted = await decryptString(key, encrypted);
  assert.equal(decrypted, plaintext);
});

test("encryption shim: matches Astro's wire format (hex IV + base64 body)", async () => {
  // Same format Astro v6 uses: encodeHexUpperCase(iv) + encodeBase64(buffer)
  const key = await createKey();
  const plaintext = "hello world";
  const encrypted = await encryptString(key, plaintext);
  const ivHex = encrypted.slice(0, 24);
  const bodyB64 = encrypted.slice(24);
  // IV must be 24 uppercase hex chars
  assert.equal(ivHex, ivHex.toUpperCase());
  assert.equal(ivHex.length, 24);
  // Body must be valid base64 (even length when no padding present, or N % 4 chars otherwise)
  assert.match(bodyB64, /^[A-Za-z0-9+/]+=*$/);
});

test("encryption shim: decrypt with wrong key fails", async () => {
  const k1 = await createKey();
  const k2 = await createKey();
  const encrypted = await encryptString(k1, "secret");
  await assert.rejects(decryptString(k2, encrypted));
});

test("encryption shim: decodeKey accepts a base64-encoded raw key (Astro's manifest format)", async () => {
  // Astro's manifest stores a base64 raw key like "IJuEfh59wHYh1ABeN/w1oRnmk3XLjxej7wiVADxBgJM="
  const k1 = await createKey();
  const encoded = await encodeKey(k1);
  const k2 = await decodeKey(encoded);
  // Same key bytes → encrypt with one, decrypt with the other
  const cipher = await encryptString(k1, "round-trip across encode/decode");
  const out = await decryptString(k2, cipher);
  assert.equal(out, "round-trip across encode/decode");
});

test("encryption shim: additionalData is authenticated (Astro v7 server islands)", async () => {
  const key = await createKey();
  const cipher = await encryptString(key, "island props", "props:Greeting");

  // Same context decrypts.
  assert.equal(await decryptString(key, cipher, "props:Greeting"), "island props");

  // A different context — another component, or the slots field of the same
  // component — must not. This is what stops ciphertext from being replayed
  // across islands.
  await assert.rejects(decryptString(key, cipher, "props:Other"));
  await assert.rejects(decryptString(key, cipher, "slots:Greeting"));
  await assert.rejects(decryptString(key, cipher));
});

test("encryption shim: no additionalData still round-trips (Astro v6)", async () => {
  const key = await createKey();
  const cipher = await encryptString(key, "plain");
  assert.equal(await decryptString(key, cipher), "plain");
  await assert.rejects(decryptString(key, cipher, "props:Greeting"));
});

test("encryption shim: hashCryptoKey is a stable lowercase hex SHA-256", async () => {
  const key = await createKey();
  const hash = await hashCryptoKey(key);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, await hashCryptoKey(await decodeKey(await encodeKey(key))));
  assert.notEqual(hash, await hashCryptoKey(await createKey()));
});

test("encryption shim: generateContentHash returns SHA-256 base64", async () => {
  const data = new TextEncoder().encode("hello");
  const hash = await generateContentHash(data);
  // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
  // base64 of those 32 bytes:
  assert.equal(hash, "LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=");
});
