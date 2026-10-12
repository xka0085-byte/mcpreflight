# AI 引用机制研究（2026-10-12，子代理全网调研）

## 各引擎机制

- ChatGPT Search：主要经 Bing 索引发现页面，自家爬虫 OAI-SearchBot 抓取，GPTBot 训练用。进 Bing 索引是底线（IndexNow 已提交）
- Perplexity：自建索引加重排，有手工权威白名单，github.com 和 reddit.com 在列；Reddit 是被引最多域名 6.6%
- Google AI Overviews 和 Gemini：走 Google 自家索引，约 97% 引用来自自然结果前 20，但有独立来源池约 30%
- Claude：走 Brave Search，引用与 Brave 结果重合 86.7%，最偏爱官方产品文档，官方域名占引用 64%

## 证据强度排序的设计结论

1. 可达性是第一位的：全放行爬虫、稳定 200、语义 HTML。我们的 robots.txt 已全放行
2. 每页开头放带原始统计数字的答案段，引用外部来源。GEO 论文实测统计和引用来源可提升 40% 以上，低排名站点高达 115%。fan-out 检索按段落评估不按整页
3. 品牌提及的权重约为外链的 3 倍。Ahrefs 1700 万引用数据。Reddit、HN、README 里保持 mcpdoctor 命名一致就是在积累被引概率
4. 被引内容比自然前 10 新 25.7%，90 天内内容有 25 到 40% 引用溢价。每周一更的 pulse 页正中靶心，报告页带日期是刚需
5. FAQ JSON-LD 证据冲突，算低风险卫生项不是救命稻草。已做不亏

## 被证伪的传说

- llms.txt 基本无效：Google 两次公开否定，13.7 万域名里 97% 零请求。留着零成本，但不指望它
- 纯格式化技巧作用有限，站点权威和可达性才是大头
- GEO 论文的 40%、115% 是 2024 年合成引擎的上界，不是均值
- github.io 裸域不如自有域名利于品牌信号，置信度中等。长期可考虑买 mcpdoctor.dev 或 .com 做跳转或迁移

## 对我们项目的三条硬指令

1. 每个内容页开头 100 词内必须有：定义句、原始数字、指向外部来源的引用。pulse 页已达标，其他页逐步补
2. 品牌一致性：所有渠道统一叫 mcpdoctor，README 加一句 what it is 的标准表述
3. 每周一 pulse 页自动刷新就是我们的 freshness 引擎，这是小站对抗权威站的最大杠杆

来源清单在子代理报告里（OpenAI help center、Ahrefs、arXiv 2311.09735、Zyppy、SIGI 2026 等 17 个）。
