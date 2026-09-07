// Build-time replacement for `node:stream` in the Fastly Compute SSR bundle.
//
// `@astrojs/react` (and renderers modelled on it) keeps a Node-only fallback
// for React's `renderToPipeableStream`, reached behind a dynamic
// `import("node:stream")`. Under Astro v6's Rollup the specifier stayed in a
// variable, so the bundler never resolved it and js-compute-runtime's esbuild
// pass never saw it. Astro v7's Rolldown constant-folds the variable into the
// import call, so the literal survives into `entry.mjs` and the Wasm build
// fails outright:
//
//   ✘ [ERROR] Could not resolve "node:stream"
//
// The fallback is unreachable here: the adapter aliases `react-dom/server` to
// `react-dom/server.edge`, whose `renderToReadableStream` is picked first. So
// this shim exists to keep the module graph resolvable, and each export throws
// a message that names the real problem if that assumption ever breaks.

const MESSAGE =
  "node:stream is not available on Fastly Compute. Something in the SSR bundle " +
  "reached Node's stream API at runtime — for React, that means the " +
  "`react-dom/server.edge` alias did not apply and the pipeable-stream fallback " +
  "was selected. Use a web-streams-based renderer instead.";

function unavailable(): never {
  throw new Error(MESSAGE);
}

export class Writable {
  constructor() {
    unavailable();
  }
}

export class Readable {
  constructor() {
    unavailable();
  }
}

export class Duplex {
  constructor() {
    unavailable();
  }
}

export class Transform {
  constructor() {
    unavailable();
  }
}

export class PassThrough {
  constructor() {
    unavailable();
  }
}

export class Stream {
  constructor() {
    unavailable();
  }
}

export function pipeline(): never {
  unavailable();
}

export function finished(): never {
  unavailable();
}

export default {
  Writable,
  Readable,
  Duplex,
  Transform,
  PassThrough,
  Stream,
  pipeline,
  finished,
};
