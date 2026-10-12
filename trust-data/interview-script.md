# 用户访谈脚本（验证 Schema Diff 付费需求，行为式提问）

## 候选名单（按接触热度）

1. mahmoudalbustan1，joxo 作者，已主动感谢我们，关系最热
2. kirbah，mcp-youtube 作者，给了 registry 情报，技术对话已建立
3. exa-labs，5108 星，徽章贺信已发，等回复
4. Cotal 324 星，徽章贺信已发
5. glama 团队，TDQS issue 在途，平台视角的访谈对象

## 接触方式

优先在现有 issue 回复里自然带出，不新开 issue。模板：

"separate topic: we are trying to understand how mcp server maintainers handle config drift after deploys. mind if I ask 3 quick questions about how you handle it today? no pitch, just research."

## 行为式问题（不问"你愿意买吗"）

1. 上一次 deploy 之后发现 server 行为变了，是什么时候？怎么发现的？
2. 当时花了多长时间定位？用了什么工具？
3. 有没有因为 schema 变更坑到下游用户或者 client 的情况？谁负责善后？
4. 现在是怎么防这类问题的？code review 能拦住吗？
5. 如果部署后自动对比 tools/list 的 diff 并且推送告警，你会把它放进哪个环节？CI、通知还是人工看？
6. 这类问题在你心里值多少钱一个月，还是完全用免费方案就够？

## 判定标准（探索性研究，不直接触发开发）

访谈目的是发现可重复的痛点，不是用五个人代表市场。每人都按下面五问打分：

1. 问题是否真实：过去确实发生过 schema 或配置变化导致的故障
2. 是否重复发生：不止一次，或明确表达持续监控需求
3. 现有方案是否不足：说得出目前的检测手段和缺陷
4. 解决问题是否有价值：为此投入过时间、产生过损失或风险
5. 付费信号：愿意讨论预算、试点范围，或接受付费试用

推进路径：三人以上描述相似、具体、重复的问题，进入下一阶段，向他们展示一个最小方案（基准保存加 diff 提醒的流程图即可，不用开发完），争取一个真实试点。试点有人接再写代码。目录数据服务独立验证，不因 Schema Diff 受阻自动成立。
