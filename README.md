# mcpreflight

**Point it at any MCP or x402 endpoint and get a verdict in one command. Read-only: no API key, no wallet, no tool calls.**

```bash
npx -y @eidonze/mcpreflight schema https://your-mcp-server.example/mcp
```

```text
Status: PASS | FAIL | UNKNOWN   exit 0 | 1 | 2, so CI can gate on it
```

Reach for it when an agent client, a buyer, or a CI job is about to depend on an endpoint whose source you cannot read, including endpoints you do not own. It reads only what the endpoint already sends to any anonymous caller: the `initialize` handshake, `tools/list`, and the HTTP 402 / x402 payment document.

| Form | Run it | Use it for |
|---|---|---|
| CLI | `npx -y @eidonze/mcpreflight ...` | one-off checks and scripts |
| GitHub Action | `uses: xka0085-byte/mcpreflight@v1` | fail a PR when a handshake, a tool schema or an x402 challenge drifts |
| stdio MCP server | `npx -y -p @eidonze/mcpreflight mcpreflight-mcp` | let an agent check an endpoint before it connects |

No install to try it: run the check in the browser, free and without signup: [check-your-mcp-endpoint](https://xka0085-byte.github.io/mcpreflight/check-your-mcp-endpoint.html)

[![npm](https://img.shields.io/npm/v/@eidonze/mcpreflight?logo=npm)](https://www.npmjs.com/package/@eidonze/mcpreflight)
[![CI](https://github.com/xka0085-byte/mcpreflight/actions/workflows/ci.yml/badge.svg)](https://github.com/xka0085-byte/mcpreflight/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/xka0085-byte/mcpreflight)

Listed in the official MCP Registry as `io.github.xka0085-byte/mcpreflight` ([browse](https://registry.modelcontextprotocol.io/?q=mcpreflight)) and on the [GitHub Marketplace](https://github.com/marketplace/actions/mcp-trust-preflight).

## What it is

Read-only MCP and x402 preflight: it reads `initialize` + `tools/list` and x402 payment documents. No API key, no wallet, no payment, no tool calls.

This is an endpoint preflight, not a source audit. Tools that read your repository or fuzz a server you launch need a checkout and a start command; this one needs only a URL, so it can check the deployment an agent is about to connect to, including one you do not own.

## Check an endpoint you do not own

The same read-only check runs weekly against every remote endpoint listed in the official MCP Registry, and the results are published as pages and as JSON:

- [Trust Directory](https://xka0085-byte.github.io/mcpreflight/trust/) — 35,325 endpoints, one report each: status, protocol version, tool count, findings, and whether credentials are required.
- [JSON API](https://xka0085-byte.github.io/mcpreflight/trust/api.html) — `/trust/api/{slug}.json` per endpoint, plus batch indexes and a JSON Schema. No key, no signup, no rate limit.
- [x402 census dataset](https://xka0085-byte.github.io/mcpreflight/x402-mcp-payments-data.html) — the payment slice of the same sweep: 1,583 of 35,327 endpoints advertise x402 or HTTP-402, with a weekly series, a status distribution against the registry-wide baseline, and downloadable CSV/JSON.

Read the vocabulary before quoting any number: in the 2026-11-02 scan, 20,701 endpoints answered anonymously (`PASS`), 10,236 refused with `401` because they require credentials by design (`AUTH_GATED`), 167 were reachable but invalid (`FAIL`), and 4,223 gave no anonymous handshake (`UNKNOWN`, usually an auth wall we cannot see past). A "dead MCP servers" count taken from this data would be wrong — 41% of the registry cannot be checked without credentials at all.

## Use it as an MCP server

The stdio entry point is `bin/mcpreflight-mcp.mjs`, published as the `mcpreflight-mcp` bin in the same npm package. It implements the MCP lifecycle a client expects: `initialize` returns serverInfo `mcpreflight` with the package version, `notifications/initialized` is accepted, and `tools/list` returns two tools.

| Tool | What it does |
|---|---|
| `schema_check` | Runs the read-only preflight against a server URL: `initialize` handshake, `tools/list`, then tool input schema validation. Returns PASS/FAIL/UNKNOWN with findings. Never calls a tool, never reads data. |
| `x402_inspect` | Reads an HTTP 402 challenge without paying: validates the payment document shape, the `accepts[]` entries and discovery manifests. Never signs or settles. |

Add it to an MCP client:

```json
{
  "mcpServers": {
    "mcpreflight": {
      "command": "npx",
      "args": ["-y", "-p", "@eidonze/mcpreflight", "mcpreflight-mcp"]
    }
  }
}
```

Both tools do the same work as the CLI and return the same findings, so an agent can check an endpoint before it connects to it. Read-only by construction: the transport issues only GET and POST to the URL you pass, holds no key and has no wallet.

## Seen in use

- [joxo](https://github.com/JoxoAI/joxo) serves an MCP endpoint that is auth-gated by design. Their maintainer read the 0.2.0 source to confirm the check was two plain POSTs with no dependencies, then ran `npx @eidonze/mcpreflight@0.2.0 schema https://joxo.ai/api/mcp` and got `UNKNOWN: MCP initialize returned HTTP 401` against a deliberate OAuth 2.1 gate ([#50](https://github.com/JoxoAI/joxo/issues/50#issuecomment-6193300049)). That report is the reason 0.3.0 classifies an OAuth challenge as `AUTH_GATED`, with the RFC 9728 resource metadata verified, instead of reading as a dead endpoint. They re-checked on 2026-11-01 and closed it: "The endpoint is sign-in only, so no anonymous handshake is expected. Thanks for the AUTH_GATED handling; closing." ([#50](https://github.com/JoxoAI/joxo/issues/50#issuecomment-6561602206)).
- A maintainer of [cueframe-mcp](https://github.com/cueframe-ai/cueframe-mcp) reran the scan after a fix and reported the result back: `@eidonze/mcpdoctor@0.1.8` (the earlier npm name) now exits 0 on their endpoint, with the anonymous `tools/list` payload down from 1,399,189 to 550,377 bytes — under the scanner's 1 MiB limit ([#11](https://github.com/cueframe-ai/cueframe-mcp/issues/11#issuecomment-6532425615)).
- Listed in [awesome-mcp-lists](https://github.com/collabnix/awesome-mcp-lists) under MCP Toolkits / Testing Tools ([#226](https://github.com/collabnix/awesome-mcp-lists/pull/226)).

These are examples of the check being run, not endorsements or a claim that a `PASS` makes a server safe.

## Start here

Exit codes are stable for CI: `0` PASS, `1` FAIL, `2` UNKNOWN/network, `3` usage. Requires Node.js 18+.

`mode` is `schema` (MCP handshake plus tool schemas), `inspect` (one-off x402 preflight), `baseline` (record the current 402 challenge shape) or `drift` (fail the job when that shape moves away from the committed baseline). The report is also appended to the job summary, and `steps.<id>.outputs.status` carries the exit code so later steps can branch on it without parsing logs.

## Find the right guide

- [Public documentation site](https://xka0085-byte.github.io/mcpreflight/)
- [MCP schema checker](docs/mcp-schema-checker.md)
- [x402 endpoint inspector](docs/x402-endpoint-inspector.md)
- [x402 payments in the MCP Registry: census dataset](https://xka0085-byte.github.io/mcpreflight/x402-mcp-payments-data.html)
- [MCP security CI](docs/mcp-security-ci.md)
- [Troubleshooting](docs/troubleshooting.md)
- [OAuth scope and current limits](docs/mcp-oauth-diagnostics.md)

## Run it now

Check an MCP server without calling any tools:

```bash
npx @eidonze/mcpreflight schema https://your-mcp-server.example/mcp --json
```

Check an x402 endpoint without paying:

```bash
npx @eidonze/mcpreflight inspect https://your-api.example/paid --method=POST --json
npx @eidonze/mcpreflight inspect https://your-api.example/paid --x402   # payment layer only, one request
```

Requires Node.js 18+. No API key or wallet is needed.

Example schema run against a live endpoint:

```text
$ npx @eidonze/mcpreflight schema https://your-mcp-server.example/mcp

MCP Tool Schema Report
- Status: FAIL
- Endpoint: https://your-mcp-server.example/mcp
- Protocol: 2025-06-18
- Tools: 12

- FAIL REQUIRED_PROPERTY_UNDEFINED: tools[3] requires undeclared property query
- WARN PROPERTY_DESCRIPTION_MISSING: tools[7].limit has no description
```

The exact same run against a healthy server prints `Status: PASS` and exits 0, so CI can gate on it.

## Which command?

| Command | Checks | Does not do |
|---|---|---|
| `schema` | MCP `initialize`, `tools/list`, tool names, descriptions, and JSON schemas | Does not call tools or prove runtime behavior |
| `inspect` | HTTP 402, x402 v1/v2 payment document, `accepts[]`, discovery manifests, latency and response digest | Does not sign, pay, settle, retry, or verify delivery |
| `inspect --x402` | The payment layer only: one request, the 402 challenge and its `accepts[]` entries, no MCP handshake or discovery probes | Same limits, and it says nothing about the MCP endpoint behind the payment |

Exit codes are stable for automation: `0` PASS, `1` FAIL, `2` UNKNOWN/network error, `3` usage error.

## What it does NOT check

mcpreflight is a protocol- and schema-level preflight, not a security audit. It does not:

- Detect malicious code, prompt injection, or supply-chain risk in the server's implementation
- Call tools, so it cannot prove runtime behavior, data handling, or permission scope
- Bypass, test, or evaluate authentication and authorization
- Verify payment settlement or delivery for x402 endpoints
- Certify compliance with any spec beyond the response shapes it inspects

A `PASS` means the observed handshake and schemas were well-formed at scan time. Nothing more.

## GitHub Actions

Add a read-only check to pull requests:

```yaml
name: MCP Trust Check
on: [pull_request]

jobs:
  mcp-trust:
    runs-on: ubuntu-latest
    steps:
      - uses: xka0085-byte/mcpreflight@v1
        with:
          endpoint: https://your-mcp-server.example/mcp
          mode: schema
          format: markdown
```

Use `mode: inspect` for an x402 preflight. The action fails on `FAIL` or `UNKNOWN` by default; set `fail-on: false` for an informational check. Looking for it in the Marketplace? Search "MCP Trust Preflight" or "mcp server test", or browse the [mcp-trust-preflight listing](https://github.com/marketplace/actions/mcp-trust-preflight).

## Starter template

Start a new MCP project with this check already wired in:

- [Secure MCP Server Starter](examples/secure-mcp-server-starter/)

The check is read-only and should target a public test endpoint. Do not place private keys or credentials in workflow inputs.

## What the report means

`PASS` means the observed response matched the checks in this version. It is not a security audit, protocol certification, payment-success guarantee, or proof that an endpoint is safe. `UNKNOWN` means the endpoint could not be observed within the timeout or response-size limits.

Example schema failure:

```text
FAIL REQUIRED_PROPERTY_UNDEFINED tools[0] requires undeclared property query
```

Example x402 failure:

```text
FAIL NO_402 Expected HTTP 402, received 400
```

## Why it exists

The checks come from failure modes observed while building ReceiptRail: body validation that prevents an x402 challenge, payment documents in multiple headers/body shapes, and vendor hint headers that can hide the real `accepts[]` document.

mcpreflight ships as one read-only codebase in three forms: the CLI and the GitHub Action, and a stdio MCP server (`bin/mcpreflight-mcp.mjs`, npm bin `mcpreflight-mcp`) exposing `schema_check` and `x402_inspect`. It is not affiliated with mcpreflight.dev; verify the npm scope is `@eidonze/mcpreflight`.

## Feedback

Found a false positive or a protocol shape we should support? [Open an issue](https://github.com/xka0085-byte/mcpreflight/issues). Include the command, redacted output, Node version, and whether the endpoint is MCP or x402. Never include tokens, payment signatures, or private URLs.

## License

MIT
