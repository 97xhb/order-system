# 微信 Bot 对接建议

## 1. 推荐组合

建议把“管理员通知”和“下单人身份/交互”分开处理：

- 管理员通知：优先使用企业微信自建应用；只发群消息时可先用企业微信群机器人。
- 下单人身份：优先使用微信公众号/服务号 H5 OAuth，把 `openid`、条件允许时的 `unionid` 绑定到现有下单人识别码。
- 客户自助：继续使用当前在线报单、回款登记和订单查询 H5，Bot 只负责菜单、提醒和链接入口，不在聊天消息里重新实现整套表单。
- 返利转换：Bot 收到链接后调用现有 `AffiliateModule`，返回最终推广文本、短链接或二维码。

不建议把个人微信客户端的非官方自动化作为核心链路。此类方案容易受登录环境、版本升级、风控和掉线影响，可作为个人辅助工具，但业务数据仍必须通过正式 API 入库并审计。

## 2. 适合先做的功能

### 管理员侧

- 新报单待确认提醒。
- 回款资料待确认提醒。
- 订单异常、物流异常和返利转换失败提醒。
- 数据库不可用、备份失败、更新失败和磁盘不足提醒。
- 每日订单、回款、结算和利润摘要。

### 下单人侧

- 菜单打开在线报单、回款登记和订单查询。
- 报单提交成功、审核通过/驳回提醒。
- 已寄出、已签收、已结算状态提醒。
- 识别码绑定后的本人查询入口。
- 返利链接转换结果返回。

## 3. 建议架构

```text
微信平台
   │ 回调事件
   ▼
Bot Gateway
   ├─ 验证签名、时间戳、Nonce
   ├─ 解密消息
   ├─ 生成幂等事件 ID
   └─ 快速返回平台要求的响应
          │
          ▼
消息队列 / Outbox
          │
          ▼
Bot Worker
   ├─ 调用 NestJS 内部 API
   ├─ 渲染消息模板
   ├─ 重试与失败归档
   └─ 写入 Bot 投递日志
```

核心原则：

- Bot 不直接写数据库，统一调用业务服务/API。
- 微信回调先验签、解密、去重，再进入业务处理。
- 回调接口快速响应，耗时转换、查询和群发交给队列。
- 业务事务与待发送消息使用 Outbox，避免订单成功但通知丢失。
- 每次发送保存渠道、接收人、模板、业务实体、状态、重试次数和平台消息 ID。

## 4. 身份绑定

现有模型已支持设备 Cookie 和唯一识别码，接入微信后建议：

1. H5 OAuth 获得 `openid`；同一开放平台下有条件时保存 `unionid`。
2. 服务端只保存 Provider Key 的哈希和加密值，不把明文写日志。
3. 首次访问时提示确认当前下单人昵称或输入已有识别码。
4. 绑定成功后，把微信身份作为新的 `ExternalIdentityProvider` 关联到原下单人。
5. 设备 Cookie、识别码、openid 可同时存在，不因更换手机创建第二个下单人。
6. 昵称冲突仍按现有规则拒绝自动覆盖，交由管理员处理。

## 5. 接口边界

建议新增统一适配层：

```ts
interface BotAdapter {
  verifyWebhook(input: WebhookInput): Promise<VerifiedEvent>;
  sendText(target: BotTarget, text: string): Promise<DeliveryResult>;
  sendTemplate(target: BotTarget, template: BotTemplate): Promise<DeliveryResult>;
  sendLink(target: BotTarget, link: BotLink): Promise<DeliveryResult>;
}
```

业务模块只产生标准事件：

```text
ORDER_SUBMITTED
ORDER_APPROVED
ORDER_REJECTED
SHIPMENT_UPDATED
RECEIVABLE_PAID
SUBMITTER_SETTLED
PAYOUT_PROFILE_PENDING
AFFILIATE_CONVERSION_FAILED
BACKUP_FAILED
UPDATE_FAILED
```

由通知模块决定发送到企业微信、公众号或后续其他渠道。

## 6. 安全与稳定性

- 回调验签失败直接拒绝，不返回内部错误细节。
- 使用事件 ID、业务 ID 和接收人组成幂等键，防止重复通知。
- Access Token 放入加密配置，短期缓存，到期前刷新；日志只记录末尾少量字符或配置状态。
- 对外请求设置连接/响应超时、指数退避和最大重试次数。
- 群发、模板消息和返利转换分别限流。
- 所有管理员指令再次校验后台账号或一次性操作确认，不能只凭聊天昵称授权。
- 公开链接继续依赖现有 Token、开关、识别码和服务端权限，Bot 不绕过。

## 7. 推荐实施顺序

1. 企业微信群机器人：只做待审核、异常和备份失败通知。
2. 企业微信自建应用：支持定向管理员通知、菜单和身份管理。
3. 公众号/服务号 OAuth：稳定绑定下单人，减少手动识别码输入。
4. Outbox、队列和重试后台。
5. 返利链接转换与订单状态主动通知。

第一阶段先保证“通知可达、失败可见、重复可控”，再增加聊天指令和复杂自动化。
