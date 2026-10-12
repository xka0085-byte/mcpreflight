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

## 判定标准

- 3 人以上描述了真实痛点并给出具体场景，Schema Diff MVP 启动
- 有人愿意提供真实服务器参与试用，直接谈付费试点价格
- 5 人全部说"用免费的 CI 检查就够了"，回到 GPT 警告的重新审视需求分支，主推方向改为目录数据服务
