// Polyfill for crypto.subtle.encrypt / decrypt with AES-GCM on Fastly
// Compute. The platform's SubtleCrypto implementation supports digest, sign,
// verify, and importKey (HMAC/RSA/ECDSA) — but not encrypt/decrypt for any
// algorithm, and not importKey for AES-GCM. Astro v6/v7 use AES-GCM to encrypt
// server-island props, so without this polyfill, every page using
// `server:defer` returns 500 ("Supplied algorithm is not yet supported").
//
// We replace `crypto.subtle` with a wrapper object that delegates to the
// native SubtleCrypto for everything except AES-GCM, where we use
// @noble/ciphers (pure JS, audited, no dependencies). Replacing the whole
// `subtle` object avoids problems with non-writable properties on the
// platform's built-in subtle instance.

import { gcm } from "@noble/ciphers/aes.js";

const SUPPORTED_AES_KEY_LENGTHS = new Set([16, 24, 32]);

// Stash AES-GCM raw key bytes against the synthetic CryptoKey identity
// returned by importKey. The platform doesn't synthesize AES-GCM keys, so
// we have to track them ourselves.
const aesKeyBytes = new WeakMap();

function isAesGcm(algorithm) {
  if (!algorithm) return false;
  if (typeof algorithm === "string") return algorithm.toUpperCase() === "AES-GCM";
  return typeof algorithm.name === "string" && algorithm.name.toUpperCase() === "AES-GCM";
}

function toUint8(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError("Expected BufferSource");
}

function toArrayBuffer(u8) {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

// Sentinel that lets us tell whether globalThis.crypto.subtle is our wrapper
// vs. the host's native subtle. Fastly's runtime appears to re-bind
// `crypto.subtle` after Wizer snapshot restore, so a one-shot install at
// module-init time doesn't survive into request handling. ensureCrypto-
// Polyfill() must be called from the top of every fetch handler.
const POLYFILL_TAG = Symbol.for("@sudodevstudio/fastly-for-astro::crypto-polyfill");

let installCount = 0;
let ensureCount = 0;

export function ensureCryptoPolyfill() {
  ensureCount += 1;
  const subtle = globalThis.crypto?.subtle;
  const hasTag = subtle?.[POLYFILL_TAG] === true;
  if (ensureCount <= 3) {
    // Log on stderr so it shows up in `fastly compute serve` output.
    console.error(`[fastly-for-astro] ensure #${ensureCount}: hasTag=${hasTag}, encryptType=${typeof subtle?.encrypt}`);
  }
  if (hasTag) return;
  installCryptoPolyfill();
}

function logInstalled(strategy) {
  installCount += 1;
  console.error(`[fastly-for-astro] AES-GCM polyfill installed via ${strategy} (count=${installCount})`);
}

export function installCryptoPolyfill() {
  if (typeof globalThis.crypto === "undefined") {
    console.warn("[fastly-for-astro] global crypto is undefined; AES-GCM polyfill skipped");
    return;
  }

  const nativeSubtle = globalThis.crypto.subtle;
  if (!nativeSubtle) {
    console.warn("[fastly-for-astro] crypto.subtle is undefined; AES-GCM polyfill skipped");
    return;
  }

  const bind = (name) => {
    const fn = nativeSubtle[name];
    return typeof fn === "function" ? fn.bind(nativeSubtle) : null;
  };

  const wrappedSubtle = {
    [POLYFILL_TAG]: true,
    digest: bind("digest"),
    sign: bind("sign"),
    verify: bind("verify"),
    generateKey: bind("generateKey"),
    deriveKey: bind("deriveKey"),
    deriveBits: bind("deriveBits"),
    exportKey: bind("exportKey"),
    wrapKey: bind("wrapKey"),
    unwrapKey: bind("unwrapKey"),

    async importKey(format, keyData, algorithm, extractable, keyUsages) {
      if (format === "raw" && isAesGcm(algorithm)) {
        const bytes = toUint8(keyData);
        if (!SUPPORTED_AES_KEY_LENGTHS.has(bytes.byteLength)) {
          throw new Error(`Invalid AES key length: ${bytes.byteLength * 8} bits (must be 128, 192, or 256)`);
        }
        const stored = new Uint8Array(bytes);
        const key = {
          type: "secret",
          extractable: !!extractable,
          algorithm: { name: "AES-GCM", length: stored.byteLength * 8 },
          usages: Array.isArray(keyUsages) ? keyUsages.slice() : [],
        };
        aesKeyBytes.set(key, stored);
        return key;
      }
      const native = bind("importKey");
      if (!native) throw new Error("crypto.subtle.importKey is unavailable on this runtime");
      return native(format, keyData, algorithm, extractable, keyUsages);
    },

    async encrypt(algorithm, key, data) {
      if (isAesGcm(algorithm)) {
        const keyBytes = aesKeyBytes.get(key);
        if (!keyBytes) {
          throw new Error("AES-GCM key was not registered with the polyfill — call importKey via the polyfilled crypto.subtle");
        }
        const iv = toUint8(algorithm.iv);
        const additionalData = algorithm.additionalData ? toUint8(algorithm.additionalData) : undefined;
        const cipher = gcm(keyBytes, iv, additionalData);
        const ciphertext = cipher.encrypt(toUint8(data));
        return toArrayBuffer(ciphertext);
      }
      const native = bind("encrypt");
      if (!native) throw new Error(`crypto.subtle.encrypt: algorithm not supported (${algorithm?.name ?? algorithm})`);
      return native(algorithm, key, data);
    },

    async decrypt(algorithm, key, data) {
      if (isAesGcm(algorithm)) {
        const keyBytes = aesKeyBytes.get(key);
        if (!keyBytes) {
          throw new Error("AES-GCM key was not registered with the polyfill — call importKey via the polyfilled crypto.subtle");
        }
        const iv = toUint8(algorithm.iv);
        const additionalData = algorithm.additionalData ? toUint8(algorithm.additionalData) : undefined;
        const cipher = gcm(keyBytes, iv, additionalData);
        const plaintext = cipher.decrypt(toUint8(data));
        return toArrayBuffer(plaintext);
      }
      const native = bind("decrypt");
      if (!native) throw new Error(`crypto.subtle.decrypt: algorithm not supported (${algorithm?.name ?? algorithm})`);
      return native(algorithm, key, data);
    },
  };

  // Try the gentle approach first: redefine crypto.subtle as a writable,
  // configurable property pointing at our wrapper. If that fails (built-in
  // is sealed), fall back to replacing crypto wholesale.
  try {
    Object.defineProperty(globalThis.crypto, "subtle", {
      value: wrappedSubtle,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    // Verify the assignment took. If the host re-binds the property after
    // defineProperty (or silently rejects), we'll know.
    if (globalThis.crypto.subtle?.[POLYFILL_TAG] !== true) {
      throw new Error("defineProperty appeared to succeed but crypto.subtle is not our wrapper");
    }
    logInstalled("defineProperty(crypto.subtle)");
    return;
  } catch (err) {
    // crypto.subtle is non-configurable or host re-bound it. Replace
    // globalThis.crypto entirely.
    try {
      const wrappedCrypto = {
        subtle: wrappedSubtle,
        getRandomValues: globalThis.crypto.getRandomValues?.bind(globalThis.crypto),
        randomUUID: globalThis.crypto.randomUUID?.bind(globalThis.crypto),
      };
      Object.defineProperty(globalThis, "crypto", {
        value: wrappedCrypto,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      if (globalThis.crypto.subtle?.[POLYFILL_TAG] !== true) {
        throw new Error("globalThis.crypto replacement appeared to succeed but subtle is not our wrapper");
      }
      logInstalled("replace(globalThis.crypto)");
    } catch (err2) {
      console.error("[fastly-for-astro] failed to install AES-GCM polyfill", err?.message ?? err, err2?.message ?? err2);
    }
  }
}
