// Build-time replacement for `astro/dist/core/encryption.js`.
//
// Astro v6 encrypts server-island props with AES-GCM via crypto.subtle.
// Fastly Compute's SubtleCrypto doesn't implement encrypt/decrypt for any
// algorithm, and patching crypto.subtle from JS is fragile (the host
// re-binds it at runtime). Instead, the adapter aliases Astro's encryption
// module to this file via Vite's resolve.alias — every Astro import of the
// encryption helpers gets our pure-JS implementation, which uses
// @noble/ciphers under the hood.
//
// The exported function signatures match Astro's public surface verbatim.
// If Astro's encryption module changes shape across versions, this shim
// must change with it.

import { decodeBase64, decodeHex, encodeBase64, encodeHexUpperCase } from "@oslojs/encoding";
import { gcm } from "@noble/ciphers/aes.js";

// Inlined from astro/dist/core/csp/config.js (not exported via Astro's public
// "exports" map, so we can't import it cleanly). If Astro adds a new CSP
// hash algorithm, mirror it here.
const ALGORITHMS: Record<string, string> = {
  "SHA-256": "sha256-",
  "SHA-384": "sha384-",
  "SHA-512": "sha512-",
};

const KEY_BYTES = 32;
const IV_BYTES = 12;
const IV_HEX_LENGTH = IV_BYTES * 2;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface AesGcmKey {
  readonly __astroFastlyAesGcmKey: true;
  readonly raw: Uint8Array;
}

function isAesGcmKey(value: unknown): value is AesGcmKey {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as AesGcmKey).__astroFastlyAesGcmKey === true &&
    (value as AesGcmKey).raw instanceof Uint8Array
  );
}

export async function createKey(): Promise<AesGcmKey> {
  const raw = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(raw);
  return { __astroFastlyAesGcmKey: true, raw };
}

export async function encodeKey(key: AesGcmKey): Promise<string> {
  if (!isAesGcmKey(key)) throw new TypeError("encodeKey: not an AES-GCM key from this shim");
  return encodeBase64(key.raw);
}

export async function decodeKey(encoded: string): Promise<AesGcmKey> {
  const bytes = decodeBase64(encoded);
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (raw.byteLength !== KEY_BYTES && raw.byteLength !== 16 && raw.byteLength !== 24) {
    throw new Error(`decodeKey: invalid key length ${raw.byteLength * 8} bits`);
  }
  return { __astroFastlyAesGcmKey: true, raw };
}

export async function encryptString(key: AesGcmKey, raw: string): Promise<string> {
  if (!isAesGcmKey(key)) throw new TypeError("encryptString: not an AES-GCM key from this shim");
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const data = encoder.encode(raw);
  const ciphertext = gcm(key.raw, iv).encrypt(data);
  return encodeHexUpperCase(iv) + encodeBase64(ciphertext);
}

export async function decryptString(key: AesGcmKey, encoded: string): Promise<string> {
  if (!isAesGcmKey(key)) throw new TypeError("decryptString: not an AES-GCM key from this shim");
  const iv = decodeHex(encoded.slice(0, IV_HEX_LENGTH));
  const dataArray = decodeBase64(encoded.slice(IV_HEX_LENGTH));
  const ivBytes = iv instanceof Uint8Array ? iv : new Uint8Array(iv);
  const ciphertext = dataArray instanceof Uint8Array ? dataArray : new Uint8Array(dataArray);
  const plaintext = gcm(key.raw, ivBytes).decrypt(ciphertext);
  return decoder.decode(plaintext);
}

const ENVIRONMENT_KEY_NAME = "ASTRO_KEY";

function getEncodedEnvironmentKey(): string {
  // Fastly Compute exposes env vars via fastly:env; for now, return empty.
  // Astro's manifest bakes in the build-time key, so this is rarely used at
  // runtime in practice.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc: any = (globalThis as any).process;
  return proc?.env?.[ENVIRONMENT_KEY_NAME] || "";
}

export function hasEnvironmentKey(): boolean {
  return getEncodedEnvironmentKey() !== "";
}

export async function getEnvironmentKey(): Promise<AesGcmKey> {
  if (!hasEnvironmentKey()) {
    throw new Error("There is no environment key defined.");
  }
  return decodeKey(getEncodedEnvironmentKey());
}

export async function generateCspDigest(data: string, algorithm: string): Promise<string> {
  // Hashing IS available on Fastly Compute's SubtleCrypto — delegate.
  const hashBuffer = await crypto.subtle.digest(algorithm, encoder.encode(data));
  const hash = encodeBase64(new Uint8Array(hashBuffer));
  return `${ALGORITHMS[algorithm] ?? ""}${hash}`;
}

export async function generateContentHash(data: BufferSource): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return encodeBase64(hashArray);
}
