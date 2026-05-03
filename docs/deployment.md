# Deployment

## Prerequisites

- Node.js 20+ (validated in CI on Node.js 20.19.0 and 22.22.2)
- The [Fastly CLI](https://www.fastly.com/documentation/reference/tools/cli/)
- A Fastly account with permission to create Compute services and KV stores

```bash
brew install fastly/tap/fastly
fastly profile create
```

## First-time setup

```bash
# 1. Build the Astro app
astro build
# → dist/client, dist/server, and dist/fastly are generated automatically

# 2. Install the generated Fastly app dependencies
cd dist/fastly
npm install
```

## Local development

```bash
# Publish content to the simulated local KV store
npm run dev:publish

# Start the local Fastly Compute server (default: http://localhost:7676)
npm run dev:start
```

Re-run `astro build` when your Astro app changes. After each rebuild, run `npm run dev:publish` again so the local KV store matches the latest `dist/client/` output.

## Deploy

```bash
# 1. Build and publish the Compute service
npm run fastly:deploy

# 2. Upload the static assets to the production KV store
npm run fastly:publish -- --collection-name=live
```

`npm run fastly:deploy` wraps `fastly compute publish`. The first publish can be interactive while Fastly creates the service; after that, `service_id` is stored in `fastly.toml` and later deploys are usually non-interactive.

## Staged rollouts via collections

Collections let you publish a candidate set of static assets, validate it, then promote to production atomically.

```bash
# Publish to a staging collection (expires automatically)
npm run fastly:publish -- \
  --collection-name=staging-$(date +%s) \
  --expires-in=7d

# Verify (point a preview deploy at the staging collection)
# Then promote
npm run promote -- \
  --collection-name=staging-12345 --to=live
```

## Cleanup

```bash
# Remove expired collections from KV
npx @fastly/compute-js-static-publish clean --delete-expired-collections
```

## Troubleshooting deploys

See [troubleshooting.md](./troubleshooting.md).
