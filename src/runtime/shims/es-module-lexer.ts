// Shim for `es-module-lexer` in the Fastly Compute SSR bundle.
//
// es-module-lexer initializes a WebAssembly module at top level. Astro's SSR
// bundle imports it for side effects, but the runtime never actually parses ES
// modules — the lexer is only needed during dev/build. Loading WebAssembly at
// module-init time fails the Fastly Compute Wizer pre-initializer
// ("ReferenceError: WebAssembly is not defined").
//
// This shim provides the same export surface with no Wasm initialization.

export const init: Promise<void> = Promise.resolve();

export function parse(_source: string, _name?: string): readonly [readonly unknown[], readonly unknown[], boolean, boolean] {
  return [[], [], false, false] as const;
}

export default { init, parse };
