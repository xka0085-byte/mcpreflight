# MCP Server Security Checks in GitHub Actions

A pull request can validate an MCP server's advertised tool surface before a client depends on it. mcpreflight provides a credential-free, read-only check that fits an existing GitHub workflow.

## Add the check

```yaml
name: MCP Trust Check

on:
  pull_request:
  workflow_dispatch:

jobs:
  mcp-trust:
    runs-on: ubuntu-latest
    steps:
      - uses: xka0085-byte/mcpreflight@v1
        with:
          endpoint: https://your-mcp-server.example/mcp
          mode: schema
          format: markdown
          fail-on: true
```

For an x402 route, use `mode: inspect` and `method` is currently selected by the endpoint action's default behavior. For local code, use the CLI directly.

## Exit behavior

```text
0  PASS
1  FAIL
2  UNKNOWN / network or timeout
3  usage error
```

Set `fail-on: false` while introducing the check as an advisory signal. Keep credentials out of workflow inputs and prefer a public test endpoint.

## What this check protects against

The schema mode catches malformed `initialize` and `tools/list` responses, missing descriptions, invalid object schemas, and required fields that are not declared. It does not invoke tools, so it cannot prove runtime authorization or side effects.

## What it does not claim

This is not a complete MCP security audit. It does not certify prompt-injection resistance, OAuth correctness, sandboxing, data quality, or production safety. A deterministic CI result is evidence about the observed response, not a universal security guarantee.

## Troubleshooting a failed build

- `NO_402`: the inspected endpoint returned a non-402 status;
- `NO_PAYMENT_DOCUMENT`: no supported payment document was observed;
- `TOOLS_LIST_INVALID`: the MCP response did not contain `result.tools[]`;
- `REQUIRED_PROPERTY_UNDEFINED`: the JSON Schema is internally inconsistent;
- `UNKNOWN`: the endpoint could not be observed within the limits.

See [MCP Schema Checker](mcp-schema-checker.html), [x402 Inspector](x402-endpoint-inspector.html), and [Troubleshooting](troubleshooting.html).

[Action source](https://github.com/xka0085-byte/mcpreflight/blob/main/action.yml) · [npm package](https://www.npmjs.com/package/@eidonze/mcpreflight)
