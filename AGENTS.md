# 项目维护规则

## 默认读取顺序

1. 只先读 `PROJECT_CONTEXT.md`。
2. 再读任务直接涉及的源码。
3. 产品规则不明确时，只读 `docs/requirements.md` 对应章节。
4. UI 任务读 `docs/ui-guidelines.md`；部署任务读 `docs/deployment.md`；安全任务读 `docs/security-audit.md`。
5. 不加载与当前任务无关的专题文档。

## 上下文维护

- 项目不保留聊天过程、废弃要求、重复强调、旧上下文归档或逐条变更流水。
- 新要求与旧要求冲突时，直接替换现行条目，不并列保留两个版本。
- `PROJECT_CONTEXT.md` 只保存当前技术状态、稳定规则、确定待办和文档入口。
- 已实现功能更新 `PROJECT_CONTEXT.md`；现行产品规则更新 `docs/requirements.md`；视觉规则更新 `docs/ui-guidelines.md`；部署变化更新 `docs/deployment.md`；确定但未实现的功能更新 `docs/roadmap.md`。
- 项目部署只维护 `docs/deployment.md`，不恢复旧部署过程文件或另建重复说明。
- 最终回复只汇报本次结果、关键文件和验证情况，不重复完整需求。

## 开发约定

- 默认使用简体中文；代码标识符保持英文。
- 业务状态以后端数据和资金流水为准。
- 数据库结构变化必须提供 Prisma 迁移；业务删除默认软删除并保留审计。
- 金额使用数据库定点数或最小货币单位，不直接使用浮点数累计。
- 密码、Token、账号明文和生产密钥不得写入源码、文档或普通日志。
- 筛选优先使用服务端筛选、排序和分页；不同字段使用 AND，同字段多选使用 OR。
- 微信 H5 优先保证小屏、弱网和单手操作。
- 新功能必须接通真实 API、持久化、权限和错误处理，不创建只有界面的占位开关。
- 页面修改至少运行 Prettier、Web typecheck 和 Web build；后端修改至少运行 API typecheck 和相关测试。
