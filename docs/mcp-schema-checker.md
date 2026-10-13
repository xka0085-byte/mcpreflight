# How to Validate MCP `tools/list` and Tool JSON Schemas

When an MCP client cannot select a tool, the failure is often visible before any tool is called: the server's `initialize` response or `tools/list` schema is malformed, incomplete, or internally inconsistent.

## Run a read-only check

```bash
npx @eidonze/mcpreflight@0.1.5 schema https://your-mcp-server.example/mcp --json
```

The command sends only two JSON-RPC requests:

1. `initialize`
2. `tools/list`

It does not invoke a tool, execute a server command, send a token, or modify data.

## Checks performed

The checker verifies:

- the initialize response contains a protocol version;
- `tools/list` returns `result.tools[]`;
- every tool has a non-empty name;
- every tool has a description;
- every `inputSchema` declares `type: object`;
- `properties` is an object when present;
- every `required` property is declared;
- properties have descriptions.

## Common failure: required property is missing

A server may return a schema like this:

```json
{
  "name": "search",
  "inputSchema": {
    "type": "object",
    "properties": { "q": { "type": "string" } },
    "required": ["query"]
  }
}
```

The model is told that `query` is required, but the schema only declares `q`. The result is:

```text
FAIL REQUIRED_PROPERTY_UNDEFINED tools[0] requires undeclared property query
```

Fix the server so the name in `required` exactly matches a property, then run the check again.

## GitHub Actions

```yaml
name: MCP Schema Check
on: [pull_request]

jobs:
  schema:
    runs-on: ubuntu-latest
    steps:
      - uses: xka0085-byte/mcpreflight@v1
        with:
          endpoint: https://your-mcp-server.example/mcp
          mode: schema
          format: markdown
```

## What PASS means

PASS means this version observed a valid response for the deterministic checks above. It does not prove that every MCP client will select the tool, that authorization is correct, or that the tool is safe to invoke.

See also: [MCP Security CI](mcp-security-ci.html), [Troubleshooting](troubleshooting.html), and the [MCP protocol specification](https://modelcontextprotocol.io/specification/2025-06-18).

[Run mcpreflight](https://github.com/xka0085-byte/mcpreflight) · [npm package](https://www.npmjs.com/package/@eidonze/mcpreflight)
