#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
EXAMPLE_DIR="$ROOT_DIR/examples/app"
EXAMPLE_PKG_DIR="$EXAMPLE_DIR/node_modules/@sudodevstudio/fastly-for-astro"
PACKAGE_TGZ=""
NPM_CACHE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/fastly-for-astro-npm-cache.XXXXXX")
UNPACK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/fastly-for-astro-pack.XXXXXX")

cleanup() {
  if [ -n "$PACKAGE_TGZ" ] && [ -f "$ROOT_DIR/$PACKAGE_TGZ" ]; then
    rm -f "$ROOT_DIR/$PACKAGE_TGZ"
  fi
  if [ -d "$NPM_CACHE_DIR" ]; then
    rm -rf "$NPM_CACHE_DIR"
  fi
  if [ -d "$UNPACK_DIR" ]; then
    rm -rf "$UNPACK_DIR"
  fi
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"
npm run build
PACKAGE_TGZ=$(npm_config_cache="$NPM_CACHE_DIR" npm pack --silent)

tar -xzf "$ROOT_DIR/$PACKAGE_TGZ" -C "$UNPACK_DIR"
rm -rf "$EXAMPLE_PKG_DIR"
mkdir -p "$(dirname "$EXAMPLE_PKG_DIR")"
cp -R "$UNPACK_DIR/package" "$EXAMPLE_PKG_DIR"

npm run build --prefix "$EXAMPLE_DIR"
