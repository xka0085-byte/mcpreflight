# Visibility snapshot

This folder contains a small, opt-in snapshot workflow for public metrics. It does not add telemetry to mcpreflight and does not collect endpoint URLs or command output.

Record weekly values from npm, GitHub Traffic, releases and external references. Treat downloads and clones as distribution signals, not unique users.

Suggested columns:

```text
date,npm_last_week,npm_last_month,github_clones,unique_cloners,github_views,unique_views,stars,forks,issues,external_action_refs,external_badges,notes
```

Useful public endpoints:

- `https://registry.npmjs.org/@eidonze%2Fmcpreflight`
- `https://api.npmjs.org/downloads/point/last-week/@eidonze%2Fmcpreflight`
- GitHub `Insights → Traffic` for views, clones and referrers
- GitHub Code Search for `xka0085-byte/mcpreflight@v1`, `@eidonze/mcpreflight`, and `mcpreflight schema`
