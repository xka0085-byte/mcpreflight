# MCP Tool Ergonomics Gate (MVP)

## Checks

- tool list is non-empty;
- each tool has a non-empty name, description and object `inputSchema`;
- schema properties are objects and required fields exist;
- flags missing property descriptions and overly vague/long names;
- emits deterministic JSON/Markdown findings.

## Limits

This is static schema lint only. It does not predict model tool selection, prove cross-client behavior, invoke side-effecting tools, or certify security.

## CLI

```powershell
node mcpreflight/bin/mcpreflight.mjs schema https://your-mcp-server.example/mcp --json
```

## MCP method behavior

For streamable HTTP, the CLI sends only `initialize` and `tools/list`. It does not call tools. Servers requiring OAuth credentials return UNKNOWN with instructions; credentials are not accepted by this MVP.
