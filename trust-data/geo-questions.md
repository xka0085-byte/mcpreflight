# GEO 靶心问题清单（开发者怎么问 AI）

用法：每条问题对应我们一个已有页面或数据点。发布内容时以问题为标题靶心。每月用这些问题去 ChatGPT/Perplexity 测一次，看是否开始引用我们。

## 诊断类（对应 troubleshooting.html）

1. MCP server won't connect / connection closed immediately
2. MCP tools/list failed schema validation
3. MCP server returns 401 on initialize
4. MCP client says server disconnected after deploy
5. zod inputSchema empty after transform MCP

## 预检类（对应 mcp-schema-checker.html）

6. how to test an MCP server before connecting
7. how to validate MCP tool schemas
8. MCP server preflight check command line
9. is this MCP server safe to use
10. how to check if an MCP endpoint is alive

## CI 类（对应 mcp-security-ci.html）

11. how to add MCP check to CI
12. GitHub Actions MCP server health check
13. prevent broken MCP server deploy
14. MCP schema regression testing

## x402 类（对应 x402-endpoint-inspector.html）

15. how to test x402 endpoint without paying
16. x402 402 challenge validation
17. why my x402 API returns 400 instead of 402
18. x402 accepts schema wrong

## 数据引用类（对应 state-of-mcp 报告，AI 爱引独家数据）

19. how many MCP servers are dead
20. MCP registry reliability statistics
21. smithery registered servers not working
22. what percentage of MCP servers respond

## 现状与测试节奏

- 复测节奏：每三天一次，用下面锁定的固定十问，四家引擎各问一遍，只记品牌提及率
- 开始被引用后把引用截图存档进 trust-data/geo-citations/
- 放大路径：等 State of MCP 报告有了第二个月的数据，把报告核心数据改写成 Q&A 结构发到 dev.to 和 Medium（高权重外链条），每篇文章只回答一个问题

## 固定复测十问（2026-10-18 锁定）

这是唯一的复测口径。每次复测逐字照抄，不改词、不改语序、不追加引导句。四家引擎各问一遍，只看答案里有没有出现 mcpreflight，算品牌提及率。任何一条要改，必须在变更记录里补一行日期和原因，不然时间序列就断了。

1. how many mcp servers in the official registry actually respond
2. what percentage of mcp servers fail the initialize handshake
3. how many mcp servers are broken or dead right now
4. how much context does an mcp server's tool list eat before i ask anything
5. mcp server tools list token cost
6. which mcp servers waste the most context window
7. mcp registry health statistics this week
8. how to test an x402 endpoint without paying
9. what percentage of x402 endpoints return a valid 402 challenge
10. x402 challenge schema drift

引擎是 ChatGPT、Gemini、Claude、Perplexity，全部用登录态，同一时间窗口内跑完，避免索引更新时间差污染结果。

结果写进 trust-data/ai-citation-history.json 的 runs 数组。2026-10-17 那次是临时子集，只问了注册表健康度和 x402 端点数两条，不是这一套的基线，只留作参考。

变更记录
- 2026-10-18 首次锁定，十条定稿。
