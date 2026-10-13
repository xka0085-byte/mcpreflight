# Troubleshooting mcpreflight Errors

## `NO_402`

The endpoint returned a status other than HTTP 402. Confirm the paid route, HTTP method, and public hostname. A gateway or body-validation middleware may be running before x402.

```bash
npx @eidonze/mcpreflight@0.1.5 inspect https://your-api.example/paid --method=POST --json
```

## `NO_PAYMENT_DOCUMENT` or `NO_ACCEPTS`

The response did not contain a supported payment document or its `accepts[]` requirements were not recognized. Check the response headers and body against the x402 version used by the service. Required fields include scheme, network, asset, amount, and payTo.

## `INITIALIZE_RESPONSE_INVALID`

The MCP initialize response did not include a protocol version. Confirm that the endpoint is an MCP endpoint, that the request reaches the MCP handler, and that the response is valid JSON-RPC.

## `TOOLS_LIST_INVALID`

The server did not return `result.tools[]`. Inspect the raw response and confirm that the endpoint supports the streamable HTTP request shape used by this read-only checker.

## `REQUIRED_PROPERTY_UNDEFINED`

A tool schema lists a required property that is not declared under `properties`. Make the names match exactly, then rerun `schema`.

## `UNKNOWN` / `REQUEST_FAILED`

The endpoint could not be observed within the timeout or response-size limits, or the request failed at DNS/TLS/network level. Check public reachability, certificates, rate limits, redirects, and the URL. This MVP does not accept credentials.

## Report a reproducible issue

Open a [GitHub issue](https://github.com/xka0085-byte/mcpreflight/issues) with the command, redacted output, Node version, and endpoint type. Never include tokens, payment signatures, credentials, private URLs, or response data that you are not allowed to share.

[Home](index.html) · [MCP schema guide](mcp-schema-checker.html) · [x402 guide](x402-endpoint-inspector.html)
