## 0.1.6
- fix: parse SSE-wrapped JSON-RPC responses (Streamable HTTP servers may answer POST with text/event-stream, e.g. mcp.deepwiki.com) — found by cross-validating against a live registry server
- fix: CLI-reported inspectorVersion now follows package.json instead of a stale constant

# Changelog

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
