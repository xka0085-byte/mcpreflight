# Secure MCP Server Starter

A minimal project template for an MCP server that runs a read-only Trust Check in CI.

## Use this template

1. Copy this directory into a new repository.
2. Deploy a public test MCP endpoint.
3. Replace the example URL in `.github/workflows/mcp-trust.yml`.
4. Open a pull request and review the schema report.

The workflow only sends `initialize` and `tools/list`. It does not call tools, sign, pay, or use credentials.

For local checks:

```bash
npx @eidonze/mcpreflight@0.1.5 schema https://your-mcp-server.example/mcp --json
```

Read the [mcpreflight documentation](https://github.com/xka0085-byte/mcpreflight) before using this with a production endpoint.
