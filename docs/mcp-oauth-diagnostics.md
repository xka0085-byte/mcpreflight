# MCP OAuth Diagnostics

`mcpreflight` currently does **not** implement a complete MCP OAuth auditor. Do not use the schema or x402 commands as proof that OAuth is correctly configured.

For the current tool, an OAuth-protected MCP endpoint may return `401` or another response and produce `UNKNOWN`/`FAIL`. That is an observation, not a diagnosis of the authorization flow.

## What is safe to say today

- `schema` sends only the MCP initialize and tools/list requests.
- `inspect` checks an x402 challenge and never pays.
- Neither command accepts a token or performs a login.

For OAuth-specific work, follow the [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) and the [MCP security best practices](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices). OAuth diagnostics are a future extension; this page intentionally avoids claiming coverage that is not implemented.
