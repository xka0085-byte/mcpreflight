# Competitor: ContextIQ / X402 Inspector (trango-compute.com)

First seen: HN "Show HN: X402 Inspector" (2026-09-28, user contextiq, 2 points, item 49878442)
Checked: 2026-10-11, developers page + HN thread

## Product line (all API-only, closed source)

| Product | What it does | Pricing |
|---|---|---|
| x402 Inspector | Validate target's x402 challenge (shape, network, v1/v2, Bazaar extension) | $0.02 USDC/call or Pro key, 60/min, 5k/day |
| Agent Protocol Inspector | Detect MCP/A2A/ARD on URL + llms.txt + capability risk + "IGA Review Packet" | same |
| **Scan compare (CI diff)** | Two scanIds -> pass/warn/fail regression verdict, "built for CI" | same |
| ERC-8004 Inspector | On-chain identity + reputation lookup (Beta) | same |
| policy-check (Pro) | allow/warn/block score before paying + custom rubric + settlement receipts | Pro only |
| Token/DNS Inspector | LLM pricing catalog; DNS/SPF/DMARC | same |

Also: Coinbase Bazaar/Agent.market catalog pilot (x402-v2 route).

## Threat assessment

- Direct overlap: x402 Inspector ≈ our `mcpreflight inspect`; their scan-compare ≈ **our Schema Diff paid direction (shipped by them as CI-first)**. Urgency signal.
- They compose 4 products into "Agent Commerce Gate" = the Agent Trust Infrastructure layer (GPT report layer 3). Someone is already monetizing it.
- Distribution is weak: dashboard + one 2-point HN post. No OSS, no CLI, no npm, no GitHub Action, no public directory, no community.
- We hold what they lack: open-source CLI + Action on Marketplace, Trust Directory 9,991 endpoints w/ weekly rescan, State of MCP dataset, outreach funnel, SEO.

## Strategy

1. Do NOT fight on x402 API breadth. Fight on open source + dev workflow (CI/Actions) + public data.
2. Differentiate Schema Diff: ours = MCP tool-schema-level diffs, local CLI, free; paid = hosted history/alerts. Theirs = coarse protocol/capability diff, closed rubric, per-call fee. "Open vs closed trust" is our wedge.
3. Their compare is protocol-level; schema-level (tool added/removed/required-changed) is finer grained and what maintainers actually need.
4. Potential future data talk: they scan URLs on demand; our weekly registry-scale rescan dataset is unique. Park until we have traction (per GPT: don't overreach).
5. Outreach use-case: "closed paid version exists; own the open-source one" — good line for A-group messages, keep factual.

## Do next (P1, after 10-12 rescan)

- Ship Schema Diff MVP before they add MCP-schema-level detail (currently they diff capabilities, not tool JSON schemas).
- Add "state history" per server in Trust Directory (we already have weekly snapshots) = free-tier proof of the paid feature.
