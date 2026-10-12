# 发散增长打法库（按离谱程度和杠杆排序）

## 已落地

- GEO 三件套：llms.txt、22 个靶心问题、7 页 FAQ JSON-LD（2026-10-12）
- 常规：9991 目录 SEO、GSC、IndexNow、外联实验、模板 PR x5、每日监控

## 打法 A：反向徽章运动（下个执行，杠杆最大）

常规工具骂烂 server，我们表扬好 server。给 4879 个 PASS 的维护者发"你的 server 通过了全注册表检查"徽章，附 README 嵌入代码。预期 5% 嵌入就是 240 个外链加 AI 引用点。关键设计：徽章 SVG 从我们域名出，每周重扫后自动变色，server 坏了徽章变灰，维护者为了保住绿徽章会持续关注我们。这把一次性表扬变成长期钩子。

## 打法 B：把自己变成 MCP server（生态寄生）

mcpdoctor 本身包一层 MCP server 接口，注册进官方 registry 和所有目录。以后 AI 客户端里直接说"帮我检查 ai.smithery/brave 的健康度"就能调用我们。我们扫一万个体，自己也是其中一员，被别人扫到时还显示 PASS，本身就是广告。成本低，一个 stdio 薄壳。

## 打法 C：每周死亡报告（引用诱饵）

静态页"MCP Registry Weekly Pulse"，每周重扫后自动更新：本周死了几个、复活几个、smithery 孤儿数。标题本身就是 AI 答不了的问题，我们是唯一数据源。页面带时间戳， freshness 是 GEO 强信号。挂进 trust-rescan workflow 自动生成，零维护。

## 打法 D：Newsletter 数据投放

State of MCP 第二期有环比数据后（"本周 X 个 server 死亡"比存量数据更抓人），把独家数字投给 TLDR AI、Hacker Newsletter、changelog。一封信 10 万开发者读者，只投一个数字加一张图加报告链接。

## 打法 E：AI 幻觉纠正页

AI 现在 100% 答错"有多少 MCP server 存活"（没数据源只能编）。做一个标题即问题的页面，开头第一句就是测量答案。AI 引擎偏好有确定性数字的页面，这是标准的 citation trap。已被 C 打法覆盖，C 就是 E 的自动化版。

## 打法 F：VS Code / Cursor 插件（P2，产品级）

校验 .mcp.json 的编辑器插件。Cursor 用户基数大且都是目标用户，装了插件每次改配置自动提示跑 mcpdoctor。重投入，等 Schema Diff 方向验证后再动。

## 打法 G：devcontainer 预装（低优先级）

MCP 模板的 devcontainer.json 里预装 mcpdoctor，开发者开容器即有。比 workflow PR 更深一层，跟随模板渠道一起投。

## 执行顺序

1. A 徽章运动试点 20 个高星 PASS server（本周）
2. C pulse 页挂进 trust-rescan workflow（今晚重扫后）
3. B mcp server 薄壳（下周末）
4. D newsletter 投放（第二期报告数据后）
