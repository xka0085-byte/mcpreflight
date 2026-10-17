# Changelog

## 0.4.0 - x402 challenge drift

- New `baseline` command. Records the x402 challenge shape your endpoint serves to an anonymous caller, into a json file you commit.
- New `drift` command. Re-checks the same endpoint and exits 1 when the shape has moved, with a field-level diff of what changed.
- GitHub Action gains `mode: baseline` and `mode: drift`, plus a `baseline` input for the committed file path.
- The fingerprint is semantic, normalized accepts fields and dialect only, so whitespace, key order or a rotating signature is never reported as drift.
- Still fully read-only. No wallet, no signing, no settlement, no payment, no retries.

Verification:

```bash
npm test
npx @eidonze/mcpreflight baseline https://402cron.com/buy/trial
npx @eidonze/mcpreflight drift https://402cron.com/buy/trial
```

## 0.1.6
- fix: parse SSE-wrapped JSON-RPC responses (Streamable HTTP servers may answer POST with text/event-stream, e.g. mcp.deepwiki.com) — found by cross-validating against a live registry server
- fix: CLI-reported inspectorVersion now follows package.json instead of a stale constant

## 0.1.5 - Visibility release

- Reworked the README around the two real entry points: `schema` and `inspect`.
- Fixed the GitHub Action example to use `xka0085-byte/mcpreflight@v1`.
- Added npm, CI and license badges, stable exit-code documentation, examples and feedback guidance.
- Added a copyable Secure MCP Server Starter workflow.
- Added task-oriented npm keywords for MCP schema and endpoint diagnostics.
- Kept the tool read-only: no tool calls, signing, payment, retries, or credentials.

Verification:

```bash
npm test
npm pack --dry-run
```
