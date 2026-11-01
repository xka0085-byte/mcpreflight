> 数字口径提示（2026-11-01）：文中 9,991 / 47.6% 等为 300 页截断旧基线，勿再对外引用。现行全量普查：35,327 远程端点，20,908 PASS (59.2%)，10,032 AUTH_GATED，4,232 UNKNOWN，155 FAIL。

# Newsletter 投稿信（D 打法，等报告第二期数据后可发）

## 投 TLDR AI（dailytesla 类似的 AI 版面，编辑推荐邮箱 tldr-ai@tldr.tech 或投稿表单）

主题：We scanned all 9,991 MCP servers. Half gave no response.

正文：

Hi TLDR team,

Quick data story you might like: we ran a read-only health check against every endpoint in the official MCP Registry, all 9,991 of them, and rescanned weekly since October.

The numbers: 4,879 endpoints (48.8%) completed a clean handshake. 43 failed validation. 5,069 (50.7%) gave no anonymous response. One odd finding: all 213 smithery-registered endpoints failed the anonymous check, 0 passes, versus 49.7% unknown elsewhere in the registry. Looks like a registry hygiene problem, not random decay.

Everything is reproducible: per-server JSON reports, methodology, and the weekly tracker are public. Tool is open source, zero deps.

Report: https://xka0085-byte.github.io/mcpreflight/state-of-mcp-2026-10.html
Weekly pulse: https://xka0085-byte.github.io/mcpreflight/trust/pulse.html
Repo: https://github.com/xka0085-byte/mcpreflight

Happy to provide the dataset if useful.

[name]

## 投 Hacker Newsletter / changelog 类的短版

We health-checked all 9,991 MCP Registry endpoints (read-only, reproducible). 48.8% pass, 50.7% no response, and all 213 smithery-registered endpoints failed. Weekly tracker: https://xka0085-byte.github.io/mcpreflight/trust/pulse.html

## 使用规则

- 一次只投一家，隔一周投下一家，被拒就换下家
- 数字必须和 pulse 页当天显示一致，发之前核一遍
- 编辑回复率最高的窗口是美东上午，对应北京晚上 9 到 11 点
- 如果编辑要求独家，给 pulse 页链接但说明数据报告本身是公开 repo
