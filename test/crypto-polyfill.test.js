// End-to-end test of the AES-GCM polyfill against the same shape of operations
// Astro v6 performs for server-island prop encryption.
// Run with: node --test test/crypto-polyfill.test.js

import { test } from "node:test";
import assert from "node:assert/strict";

// We can't import the polyfill template directly (it's a .js template, not part
// of the dist build). Re-import as a regular module. The template lives at
// templates/crypto-polyfill.js relative to the package root.
const { installCryptoPolyfill } = await import("../templates/crypto-polyfill.js");

test("polyfill: round-trips AES-GCM encrypt/decrypt with a 256-bit key", async () => {
  installCryptoPolyfill();

  // Astro's actual flow: importKey("raw", bytes, "AES-GCM", true, ["encrypt","decrypt"])
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer,
    "AES-GCM",
    true,
    ["encrypt", "decrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({ name: "Fastly Compute" }));

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  assert.ok(ciphertext instanceof ArrayBuffer);
  assert.notDeepEqual(new Uint8Array(ciphertext), plaintext);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  assert.deepEqual(new Uint8Array(decrypted), plaintext);
});

test("polyfill: handles algorithm passed as string vs object", async () => {
  installCryptoPolyfill();
  const keyBytes = crypto.getRandomValues(new Uint8Array(16));
  // Astro passes "AES-GCM" (string) to importKey but { name: "AES-GCM", iv } to encrypt
  const key = await crypto.subtle.importKey("raw", keyBytes.buffer, "AES-GCM", true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const result = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new Uint8Array([1, 2, 3]));
  assert.ok(result instanceof ArrayBuffer);
});

test("polyfill: decrypt with wrong key fails", async () => {
  installCryptoPolyfill();
  const k1 = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)).buffer, "AES-GCM", true, ["encrypt", "decrypt"]);
  const k2 = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)).buffer, "AES-GCM", true, ["decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k1, new TextEncoder().encode("secret"));
  await assert.rejects(crypto.subtle.decrypt({ name: "AES-GCM", iv }, k2, ct));
});

test("polyfill: digest still works (delegated to native)", async () => {
  installCryptoPolyfill();
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("hello"));
  assert.ok(result instanceof ArrayBuffer);
  assert.equal(result.byteLength, 32);
});

test("polyfill: replays Astro's exact encryptString/decryptString sequence", async () => {
  installCryptoPolyfill();

  // Faithful copy of the relevant Astro v6 internal helpers (from
  // node_modules/astro/dist/runtime/server/encryption.js):
  const ALGORITHM = "AES-GCM";
  const IV_LENGTH = 24;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const decodeBase64 = (s) => Uint8Array.from(Buffer.from(s, "base64"));
  const encodeBase64 = (u8) => Buffer.from(u8).toString("base64");
  const encodeHexUpper = (u8) => Buffer.from(u8).toString("hex").toUpperCase();
  const decodeHex = (s) => Uint8Array.from(Buffer.from(s, "hex"));

  async function decodeKey(encoded) {
    const bytes = decodeBase64(encoded);
    return crypto.subtle.importKey("raw", bytes.buffer, ALGORITHM, true, ["encrypt", "decrypt"]);
  }
  async function encryptString(key, raw) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH / 2));
    const data = encoder.encode(raw);
    const buffer = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, data);
    return encodeHexUpper(iv) + encodeBase64(new Uint8Array(buffer));
  }
  async function decryptString(key, encoded) {
    const iv = decodeHex(encoded.slice(0, IV_LENGTH));
    const dataArray = decodeBase64(encoded.slice(IV_LENGTH));
    const buffer = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, dataArray);
    return decoder.decode(buffer);
  }

  // Astro's manifest holds a base64-encoded 32-byte key; we generate one.
  const keyBase64 = encodeBase64(crypto.getRandomValues(new Uint8Array(32)));
  const key = await decodeKey(keyBase64);
  const props = JSON.stringify({ name: "Fastly Compute", count: 42 });

  const encoded = await encryptString(key, props);
  assert.ok(encoded.length > IV_LENGTH);

  const decoded = await decryptString(key, encoded);
  assert.equal(decoded, props);
});
