# HANDOFF：mcpdoctor 项目总交接书

用途：换 Trae 账号或新会话接手时，先读完本文档再动手。自包含，不需要任何历史对话。生成日期 2026-10-14。

## 一、一句话定位

mcpdoctor 是开源（MIT）零依赖的 MCP 与 x402 端点只读预检工具，母品牌 Agent Trust Infrastructure，品牌承诺三词：可检查、可复核、可追踪。严禁 Trust Score 式总分，PASS 不代表 agent 可信。

## 二、必读文件（都在仓库内）

| 文件 | 内容 |
|---|---|
| README.md | 产品三形态与用法 |
| trust-data/agent-evidence-plan.md | 押注 A 的 72 小时计划与停止条件 |
| trust-data/interview-script.md | 用户访谈脚本（行为式五问，探索性研究框架） |
| trust-data/growth-bets.md | 发散增长打法库 |
| trust-data/exclusions.json | 维护者要求的目录移除记录（承诺必须兑现） |
| trust-data/competitor-contextiq.md | 竞品情报 |
| trust-data/geo-research-2026-10.md | AI 引用机制研究结论 |
| trust-data/agent-evidence-outreach.md | 押注 A 外联名单（支线会话维护） |

仓库外的两份关键文档：C:\Users\eqzyz\AppData\Local\Temp\mcpdoctor-strategy-brief-for-gpt.md（战略参谋书）、C:\Users\eqzyz\AppData\Local\Temp\ai-web3-future-bets-2026-10.md（web3 深度调研）。

旧账号的 Trae 项目记忆在磁盘上仍可读：c:\Users\eqzyz\.trae-cn\memory\projects\-c-Users-eqzyz-Documents-Trae-CN-temp-20261010-01--p2-effb7512b60c64c8edf7\project_memory.md，其中含全部历史纪律，新会话应主动用文件工具读一遍。

## 三、当前状态速查

- 主产品：CLI 0.1.7（npx @eidonze/mcpdoctor）、GitHub Action mcp-trust-check、MCP server 模式（bin/mcpdoctor-mcp.mjs）
- 数据：Trust Directory 9,991 端点每周一自动重扫（workflow trust-rescan，UTC 02:00，已修缓存与翻页 bug）。最新周数据 PASS 4,764 / FAIL 41 / UNKNOWN 5,186，一周内 115 个端点从 PASS 翻 UNKNOWN（周流失 2.4%，独家发现）
- 采用漏斗（每日自动测）：npm 周下载 464 基线；公开 CI 集成 0；徽章嵌入 0。口径纪律：零集成必须说未发现可验证的公开集成
- 外联：178 条 issue 约 1% 真实互动率，两个 VIP（joxo 作者、kirbah）；5 个模板 PR 在途；x402 官方文档 PR #3766 在途
- AI 引用基线：三家 AI 均 0 引用，每月重测
- 押注 A（Agent Evidence，支线会话在跑）：40 个 ERC-8004 端点五级核验样本报告已上线，M1 达标，下一步 10 个外联访谈验证 M2

## 四、自动运转的东西（新账号不要重复建设）

- GitHub Actions：trust-rescan（每周一重扫，会自动 git pull --rebase 防撞车）、cve-watch（每日）、dependency-review、codeql、scorecard、outreach-replies（每日外联巡检加漏斗测量，有变化自动开 digest issue）
- 定时任务（旧账号 Trae 的 Schedule，新账号需重建）：外联 VIP 日报每天 09:30（含邮箱巡检）、邮箱晚间巡检 21:00
- 邮箱监控：node scripts/mail-watch.mjs，凭据在用户主目录 .mail-watch.json（Gmail 应用专用密码），读新邮件不碰已读状态

## 五、凭据与账号清单（只列位置，本机已登录，换 Trae 账号不受影响）

| 项 | 位置/账号 |
|---|---|
| GitHub CLI | gh 已登录 xka0085-byte |
| npm | granular token，7 天后过期需续 |
| Gmail 监控 | xka0085@gmail.com，应用密码在 ~/.mail-watch.json |
| GSC | xka0085@gmail.com，属性 https://xka0085-byte.github.io/mcp-doctor/ |
| 用户本人待办 | Reddit/X/MCP Discord 发帖（手动，禁止程序化） |

## 六、纪律红线（全部由三轮 GPT 评审与用户要求沉淀，违反会伤及信任资产）

1. 渠道扩张冻结：新增自动化必须指明改善指标，新增功能必须对应真实用户问题
2. 数据表述：下载量只证明分发；零集成说未发现可验证的公开集成；不用市场总量当产品指标
3. Reddit/X/Discord 禁止程序化抓取与自动发帖（用户本人手动）；Scrapling 类爬虫只允许目录站收录监控
4. token-last 不发币；按席位或按量收费不按流水抽成
5. 里程碑 M1 技术有效、M2 问题有效、M3 使用有效、M4 商业有效，不可互相替代
6. 话术像真人：英文外联两三句、小写开头、无列表；报告引用可溯源
7. 双会话协作：主线（本会话）管 mcpdoctor 与数据，支线管 Agent Evidence；共用工作树，提交前 pull --rebase，只 add 自己的文件，避开周一 UTC 02:00 重扫窗口；新页面必须同步 gen-sitemap.mjs

## 七、待办队列（按优先级）

1. 用户本人：今晚三连发（r/mcp 20:30、X 21:00、MCP Discord 21:30），之后每天 10 分钟搜提问帖用手稿回复
2. 支线会话：发出 Agent Evidence 第一批外联，跑行为式访谈，验证 M2
3. 主线：smithery 213 端点发现写入 State of MCP 报告；各内容页开头补答案段；Scorecard 连续失败待查（不阻塞）
4. 验证触发：访谈达标才做 Schema Diff，Bazaar 质量报告实验待排，90 天首个付费客户是目标不是唯一标准

## 八、新账号接入步骤

1. 读本文档与第五节列出的旧记忆文件
2. git pull 确认仓库最新
3. 重建两个 Schedule 定时任务（第四节所列两条）
4. 核对 gh auth status 与 npm 登录状态
5. 从待办队列第 1 项开始，不要新建任何渠道
