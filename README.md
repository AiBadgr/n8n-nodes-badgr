# n8n-nodes-badgr

n8n community node for [Badgr](https://aibadgr.com). Operations: **Run Workload**, **Deploy Model**, **Check Result**, **Stop**.

## Install

In n8n: Settings, Community Nodes, install `n8n-nodes-badgr`. Create a **Badgr API** credential with your API key.

## Spending limits

Run Workload and Deploy Model both require **Max Price per Hour**. Deploy Model also requires **Max Runtime (Minutes)**, so a workflow can never start an open-ended endpoint. Use **Stop** at the end of a workflow to end billing early.

## Limits of this version

Run Workload splits the command on spaces. Put anything with quoting in a script in the Docker image.

## Develop

```bash
npm install && npm run build && npm test
```

## Publishing (manual)

1. Publish to npm with provenance from a GitHub Actions workflow in the public `aibadgr/n8n-nodes-badgr` repo.
2. Submit the package for n8n community node verification so it appears in the node picker without manual install. n8n's verification expects TypeScript source, no runtime dependencies and a clean `@n8n/node-cli` lint. The lint was run here with `@n8n/node-cli` 0.51.4's ESLint config and passes except one rule: it requires `"license": "MIT"` in `package.json`, and this package is Apache-2.0. Pick the license before submitting; it was left unchanged. Provenance publishing from GitHub Actions was not set up.
