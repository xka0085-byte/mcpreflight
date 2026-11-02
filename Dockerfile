FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY bin ./bin

# mcpreflight-mcp is a stdio MCP server, zero dependencies, so no install step.
# It exposes schema_check(url) and x402_inspect(url): read-only checks, no tool calls, no payment.
ENTRYPOINT ["node", "/app/bin/mcpreflight-mcp.mjs"]
