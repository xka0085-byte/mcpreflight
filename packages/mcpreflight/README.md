# mcpreflight

Short install name for [`@eidonze/mcpreflight`](https://www.npmjs.com/package/@eidonze/mcpreflight) — read-only MCP and x402 endpoint preflight checks. No API key, no wallet, no tool calls.

```bash
npx mcpreflight schema https://your-mcp-server.example/mcp --json
npx mcpreflight inspect https://your-api.example/paid --method=POST --json
```

GitHub Action:

```yaml
- uses: xka0085-byte/mcpreflight@v1
  with:
    endpoint: https://your-mcp-server.example/mcp
```

- Repository: https://github.com/xka0085-byte/mcpreflight
- Docs: https://xka0085-byte.github.io/mcpreflight/
- Check your endpoint (free, no signup): https://xka0085-byte.github.io/mcpreflight/check-your-mcp-endpoint.html

This package is a launcher only: it depends on the pinned `@eidonze/mcpreflight` version and forwards arguments and exit codes unchanged (`0` PASS, `1` FAIL, `2` UNKNOWN/network, `3` usage). Requires Node.js 18+.

MIT licensed. The implementation lives in `@eidonze/mcpreflight`.
