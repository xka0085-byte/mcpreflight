# Agent Evidence 外联名单与访谈五问（agent 接入前检查场景）

生成：2026-10-12。依据：docs/agent-evidence-sample.html 样本报告（88 token、40 端点实测）。
纪律：Reddit/X/Discord 不做程序化抓取与自动发帖，全部人工。话术两三句、小写开头、无列表。每次外联必须附检查时间与方法局限。首轮目标：8 个有效对话、5 个真实试用、2 个持续反馈。

## 优先级 A：agent 平台与市场（替用户把关的角色，最痛）

1. Rasphia（rasphia.com，Base）
   - 我方实测：MCP 端点 401 需鉴权，unverifiable。注册文件工程质量全样本最高，声明 MCP、A2A、Web Bot Auth 密钥三件套
   - 切入点：它自己做多协议声明，是全生态最需要第三方交叉核验的团队。顺带告诉它 401 匿名检查口径下它的展示效果
2. Claw Plaza（clawplaza.ai，Base）
   - 我方实测：work.clawplaza.ai/mcp/clawdia 握手通过，但注册文件是 ipfs 且当时网关限流未独立复核，partially consistent
   - 切入点：市场形态，帮卖家做接入前把关是它的本职，报告直接可用
3. Quack AI（quackai.ai，BNB Chain）
   - 我方实测：Q402 agent 端点 405，unverifiable。16 个 token 复用同一端点，批量铸造明显
   - 切入点：x402 支付 agent 网络，商业闭环清晰，批量铸造正是它需要向买家解释的点
4. 8004scan（8004scan.io）
   - 关系：数据源。它有评分 v5.2 与 endpoint verified 标记，我方五级核验是互补层
   - 切入点：分享批量铸造发现（一个端点 18 token），这类发现对它的反刷榜有直接价值

## 优先级 B：金融与工作流 agent 团队（在乎信任背书）

5. Panda Financial（pandafinancial.org，Base）
   - 我方实测：fully consistent，35 个工具，样本里最丰富的健康端点
   - 切入点：夸它，然后送可对外展示的核验徽章思路
6. Surf AI（surfliquid.com，BNB Chain）
   - 我方实测：fully consistent
   - 切入点：DeFi 场景，接入前证据可以直接写进它的文档
7. ACK（ack-onchain.dev，IOTA EVM）
   - 我方实测：fully consistent，3 token 共用端点
   - 切入点：非 EVM 主流链的早期生态，工具少，容易被引用
8. Singularry（app.singularry.org，BNB Chain）
   - 我方实测：fully consistent，proto 2025-06-18，版本较新
   - 切入点：协议版本升级路径的话题切入

## 优先级 C：观察到的问题方（核验价值最直接）

9. Zyf.ai（zyf.ai，Base）
   - 我方实测：401 需鉴权，5 token 共用端点，注册文件 fetch 失败
   - 切入点：yield agent 管钱，接入方最需要证据，先帮它把 401 的原因讲清楚
10. OpenOdds.Ai（openodds.ai）
   - 我方实测：握手通过但 27 个工具属性缺 description，partially consistent
   - 切入点：具体 schema 问题清单送上门，tools 描述缺失直接影响 agent 调用率

## 行为式访谈五问（agent 接入前检查版）

1. 上一次把一个 agent 接进产品或工作流之前，你检查了什么？当时发生了什么？
2. 你是怎么发现它名不副实，或者确认它没问题的？
3. 那次经历让你付出了什么代价，返工、事故、用户流失都算？
4. 现在用什么办法做这类检查，人工还是工具，流程走一遍给我看？
5. 如果有一份可以拿给用户看的接入前核验报告，你愿意为什么付钱，按月、按 agent 数、还是按次？

追问规则：只问过去发生的事，不问"你会不会用"。对方给不出具体事件就标记为弱信号，不计入 8 个有效对话。

## 首轮话术模板（英文，手发，每条按目标改一句）

> hi, we run a small read-only checker for erc-8004 agents. we cross-checked 40 registered endpoints this week, 24 completed a clean anonymous mcp handshake, and one endpoint was claimed by 18 different tokens. report is here, checks ran 2026-10-12, anonymous handshake only, no tools invoked, limits listed at the bottom. if you vet agents before listing or wiring them, i'd love to hear how you do that today.

变体规则：对平台和市场提"listing 前把关"，对金融团队提"给用户的证据"，对有 schema 问题的目标把问题编号直接给出来。禁止承诺分数、排名或背书。

## 触达渠道与记录

- 渠道：官网邮箱、GitHub issue 或 discussion、8004scan 站内（如有）、X 私信人工。X 与 Discord 只人工操作
- 记录：每条外联写入 trust-data/outreach-done.json 现有结构，标 agent-evidence 支线标签，检查时间、范围、方法局限三件套必须带
- 复用：主线 178 条外联里若有 8004 相关回复者，优先二度触达
