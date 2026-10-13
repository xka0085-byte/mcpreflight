# Why an x402 Endpoint Returning 400 Breaks Buyers

An x402 buyer normally learns that payment is required from an HTTP `402 Payment Required` response. If an endpoint validates an empty request body first and returns `400`, an agent client may never receive the payment challenge and cannot know how to continue.

## Inspect the endpoint without paying

```bash
npx @eidonze/mcpreflight@0.1.5 inspect https://your-api.example/paid --method=POST --json
```

The probe is read-only. It does not sign a payment, contact a facilitator, retry the request, or submit a transaction.

## Example failure

```json
{
  "finalStatus": "FAIL",
  "http": { "status": 400 },
  "findings": [
    { "status": "FAIL", "code": "NO_402", "message": "Expected HTTP 402, received 400" }
  ]
}
```

## Typical causes

- the server validates required business fields before issuing the challenge;
- the client used the wrong HTTP method;
- the paid route is different from the documented route;
- an API gateway rewrites the response;
- authentication middleware runs before x402 middleware;
- a proxy strips the payment response.

## Server-side debugging checklist

1. Send the same method that an unpaid buyer uses.
2. Confirm the unpaid request reaches the x402 middleware.
3. Confirm the response status is exactly `402`.
4. Confirm the payment document is in a supported header or response body.
5. Confirm `accepts[]` includes scheme, network, asset, amount, and payTo.
6. Test through the public hostname, not only localhost.

## GitHub Actions

```yaml
- uses: xka0085-byte/mcpreflight@v1
  with:
    endpoint: https://your-api.example/paid
    mode: inspect
    format: markdown
```

## Boundaries

A PASS only means the observed challenge had recognizable fields. It does not mean payment will settle, delivery will occur, or the service is trustworthy.

See [x402 Endpoint Inspector](x402-endpoint-inspector.html), [Troubleshooting](troubleshooting.html), and the [x402 protocol site](https://www.x402.org/).

[Source and releases](https://github.com/xka0085-byte/mcpreflight) · [npm package](https://www.npmjs.com/package/@eidonze/mcpreflight)
