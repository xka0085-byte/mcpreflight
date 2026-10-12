# Agent Evidence 72 小时样本报告执行计划（GPT-6 三审后启动）

日期：2026-10-13。产品暂定名 Agent Evidence，母品牌 Agent Trust Infrastructure。品牌承诺：可检查、可复核、可追踪。严禁总分式 Trust Score，PASS 不代表 agent 可信。

## 报告结构（GPT 规定，必须区分五类结论）

对一批可识别的 ERC-8004 agent，逐个比较：注册信息、公开端点、能力声明、可获取的验证记录。每项结论分五级：

1. 完全一致
2. 部分一致
3. 存在冲突
4. 无法验证
5. 数据缺失

红线：未找到记录不等于记录造假。每个 agent 的报告必须包含证据来源、采集时间、覆盖范围、无法验证项及原因。

## 已完成侦察

- 主网 IdentityRegistry 合约确认：0x8004A169FB4a3325136EB29fA0ceB6D2e539a432（ERC-721，agentURI 指向注册文件）
- ReputationRegistry 合约存在，地址部分确认：0x8004BAa17C55a88189AE136b182e5fdA19dE9b...
- 直接 RPC eth_call totalSupply 被 revert，原因待查（疑似代理合约或函数受限）。改走 explorer API 路线：8004scan.io 或 erc-8004.quicknode.com 的公开接口
- 我方资产：9,991 端点扫描含 finalStatus、findings、时间戳、每周历史（trust-history.json）

## 72 小时交付

1. 从 8004 explorer API 拉取注册 agent 样本（优先挑有公开 MCP 端点的）
2. 端点匹配我方 scan.json（按 URL 精确匹配），每条产出五级结论
3. 样本量 20 到 50 个 agent 的 HTML 报告，发布到 docs/agent-evidence-sample.html，进 sitemap
4. 报告页脚附方法、局限、采集时间

## 第 4 至 7 天

- 从报告接触 10 个目标：agent 目录维护者、agent 市场团队、工作流开发者
- 行为式访谈五问（脚本在 trust-data/interview-script.md，问题改为 agent 接入前检查场景）
- 目标：8 个有效对话，5 个真实试用，2 个持续反馈

## 停止条件（GPT 修正版，替代原重叠率条件）

- 数据可获得性：关键证据长期无法稳定获取
- 问题真实性：访谈找不到重复出现的具体工作问题
- 产品使用：目标用户看完报告后不采取任何行动
- 产品差异化：现有免费工具已充分满足目标用户需求
- 付费可能性：90 天真实试用后仍无付费意愿证据

## 定价实验（后续，勿现在定）

个人版 9 至 19 美元月（限监控数量）、团队试点 29 至 49 美元月、平台按检查量报价。计费单位三选一验证：个人订阅、按监控 agent 数、按检查量。首个付费客户比价格表重要。
