# 当前系统架构

## 1. 总体结构

系统采用前后端分离的模块化单体架构：

```text
管理后台 / 公开 H5
       Vue 3 + TypeScript
                │ REST API
                ▼
             NestJS
  ├─ Auth              管理员认证与设备会话
  ├─ SystemSettings    访问规则、运行状态、维护与审计
  ├─ Catalog           平台与品类
  ├─ Orders            订单、筛选、审核和状态
  ├─ Schemes           在线报单模板和分享配置
  ├─ PublicForms       公开报单与外部身份
  ├─ Submitters        下单人、回款资料和只读查询
  ├─ ProfitRules       结构化利润规则
  └─ Affiliate         返利配置与链接转换
                │ Prisma
                ▼
            PostgreSQL
```

第一阶段保持单一 API，避免把强关联订单、身份、状态和审计拆成难以维护的分布式事务。Bot、定时同步和耗时任务后续可作为 Worker，但必须通过统一业务服务或 API 操作数据。

## 2. Web

- Vue 3、TypeScript、Vite、Pinia、Vue Router。
- Element Plus 负责常规控件，VXE Table 负责高密度订单表格。
- 管理后台和公开页面位于同一应用，通过路由和布局隔离。
- API 默认使用同源 `/api`，正式部署由 Web 入口反向代理到 API。
- 全局主题变量位于 `apps/web/src/style.css`，具体规则见 `docs/ui-guidelines.md`。

主要路由：

```text
/                         域名首页规则
/后台安全入口             管理员手动启用后的外网后台入口验证
/login                    管理员登录
/admin/dashboard          业务总览
/admin/orders             订单列表
/admin/schemes            在线报单
/admin/submitters         回款登记
/admin/settings/*         基础设置
/admin/system-settings    系统设置
/admin/api-directory      API 接口目录
/form/:token              公开报单
/payout/:token            回款资料填写
/order-query/:token       本人订单查询
```

未知路由、缺失 Token 和失效业务链接统一进入 404 或业务失效页，不重定向登录。

## 3. API

- NestJS REST API，统一前缀 `/api`。
- `ValidationPipe` 开启白名单、转换和未知字段拒绝。
- 全局限流，登录、后台入口、身份恢复和公开写入使用更严格路由限流。
- 管理 API 使用 `AdminSessionGuard`；公开业务依赖高强度分享 Token 和外部身份会话。
- OpenAPI/Swagger 由当前 Controller 自动生成，前端 API 目录直接读取文档 JSON。
- 可信代理由 `TRUST_PROXY` 显式控制，默认只信任本机代理。

接口前缀：

```text
/api/auth/*
/api/system/*
/api/admin/system/*
/api/admin/orders/*
/api/admin/platforms/*
/api/admin/categories/*
/api/admin/schemes/*
/api/admin/submitters/*
/api/admin/payout-registration/*
/api/admin/payout-query/*
/api/admin/profit-rules/*
/api/admin/affiliate-platforms/*
/api/public/forms/*
/api/public/payout-registration/*
/api/public/payout-query/*
```

## 4. 数据库

- 正式数据库使用 PostgreSQL；本机 PGlite 只作为 PostgreSQL 兼容开发环境。
- Prisma schema：`apps/api/prisma/schema.prisma`。
- 迁移：`apps/api/prisma/migrations`。
- 订单是一笔不可拆分的业务登记单位。
- 平台、品类、下单人、收货佬、包裹、回款方式、利润规则、公开表单、外部身份、返利和审计使用独立实体。
- 低频扩展字段使用 `CustomFieldDefinition` 与 `OrderCustomFieldValue`；参与资金、状态或高频筛选的字段使用正式列。
- 删除订单和业务档案优先软删除；关键变化写入 `AuditLog`。

## 5. 身份与会话

### 管理员

- 密码使用 scrypt。
- 会话 Token 只以哈希形式保存。
- 浏览器生成稳定设备 ID；同设备重新登录撤销旧会话。
- Cookie 为 HttpOnly，HTTPS 正式环境强制 Secure。
- 全新安装未配置安全入口时允许管理员直接登录；管理员手动保存入口后，外网后台才需要先通过该入口获得 HMAC 授权 Cookie。

### 下单人

```text
首次打开公开页面
  → 创建设备身份与会话 Cookie
  → 暂不创建正式下单人
  → 首次成功提交微信昵称
  → 绑定/建立下单人并补充唯一识别码
```

识别码归属于下单人，可绑定多设备。新设备输入原识别码后绑定到同一档案；昵称被其他档案占用时拒绝提交。未来微信 OAuth 作为新的外部身份 Provider 接入，不替换现有识别码。

## 6. 访问控制

- 本机回环地址直达后台。
- 后台外网开关只控制管理员页面、登录、管理 API 和接口文档。
- 公开报单、回款登记和订单查询由各自 Token、状态和开关控制。
- 域名访问必须命中动态白名单；IP 访问按现行规则允许。
- 域名首页可显示 404 或跳转到受校验的 http/https 地址。
- Web 入口、API 中间件和前端路由共同保证错误链接不进入登录页。

## 7. 金额与利润

- 数据库金额为 `Decimal(18, 2)`。
- 当前利润规则只允许：支付优惠、下单金额、结算金额、扫码返利、回款金额或固定金额。
- 公式保存为结构化 JSON，不使用 `eval`。
- 订单保存规则 ID、版本和快照，历史订单不随规则更新静默变化。
- 收货佬未标记已回款时，主表已结算利润为 0。

## 8. 返利适配器

```text
后台 / 后续 Bot
      ↓
AffiliateService.convert
      ↓
平台识别、标准化、凭证读取
      ↓
LihuaXiongAdapter / 后续官方 Adapter
      ↓
统一转换结果与历史记录
```

适配器负责鉴权、签名、请求和响应标准化；核心订单模块不依赖第三方原始字段。凭证使用 AES-256-GCM，明文不进入普通日志或管理响应。

## 9. 未来扩展边界

- 备份/恢复和系统更新进入独立维护模块。
- 企业微信、公众号或其他 Bot 使用 Adapter + Outbox + Worker。
- 物流查询使用统一 Provider Adapter。
- 正式回款与结算使用流水和分摊表汇总订单状态。
- 详细验收范围见 `docs/roadmap.md`。
