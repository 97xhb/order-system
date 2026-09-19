# 返利平台与链接转换

## 1. 当前状态

- 基础设置中的“返利平台配置”只负责接口、启用状态和凭证。
- 左侧独立“返利转换”页面负责实际转换、结果二维码和历史记录。
- 梨花熊聚合返利接口已经接入真实 Adapter。
- 淘宝联盟、京粉、唯享客等官方接口保留统一配置框架，后续逐个实现。

## 2. 统一流程

```text
输入商品链接或推广内容
  → 读取当前启用的返利接口
  → 识别/标准化内容
  → Adapter 签名并请求第三方
  → 解密、校验并标准化响应
  → 展示最终转换内容
  → 可复制或根据最终内容生成二维码
  → 保存成功/失败历史
```

二维码必须使用最终转换结果原文，不使用中间推广长链或其他字段替代。

## 3. 梨花熊 Adapter

代码位置：

```text
apps/api/src/affiliate/adapters/lihuaxiong.adapter.ts
apps/api/src/affiliate/adapters/lihuaxiong.codec.ts
```

当前协议：

- 请求生成秒级时间戳和 11 位随机 `custom`。
- `device` 同时进入请求头和签名；PC Token 使用 `pcweb`，APP Token 使用 `web`。
- 使用重建的 MD5 签名、AES-128-CBC 解密和 ZeroPadding 清理。
- Token、签名盐、Key、Secret、推广位等由后台配置并加密保存。
- 明文凭证不返回前端、不写普通日志。

支持平台展示为：淘宝、京东、唯品会、拼多多、抖音、快手、美团、闪购、团购等。

## 4. 配置模型

每个返利 Provider 包含：

```text
Provider code / name
第三方聚合或官方类型
启用状态
API 地址
Device
凭证字段状态
默认账号
支持平台
更新时间
```

凭证使用 `AffiliateAccount.credentialsEncrypted` 保存。管理 API 只返回已经配置的字段名和可读状态，不回显明文。

## 5. 转换历史

`AffiliateLinkConversion` 保存：

```text
原始输入
标准链接/商品 ID（有时）
最终推广长链、短链或推广文本
Provider 与渠道
成功/失败状态
错误摘要
有效期
创建时间
```

页面支持：

- 复制最终结果。
- 单条删除。
- 二次确认清空。
- 分页查看。
- 根据最终结果在右侧生成二维码，不弹窗、不下载。

历史当前按每次请求保留，不自动去重。

## 6. 官方接口扩展

后续 Adapter 统一实现：

```ts
interface AffiliatePlatformAdapter {
  supports(input: string): boolean;
  convert(input: ConvertAffiliateLinkInput): Promise<AffiliateLinkResult>;
  syncOrders?(input: SyncAffiliateOrdersInput): Promise<AffiliateOrderResult[]>;
  syncCommissions?(input: SyncCommissionInput): Promise<CommissionResult[]>;
}
```

- 淘宝联盟只处理淘宝。
- 京粉只处理京东。
- 唯享客只处理唯品会。
- 第三方聚合接口可处理其声明支持的多个平台。
- 核心业务只读取统一转换结果，不使用 Provider 私有字段。

## 7. 返利订单与利润

平台支持后再同步推广订单和佣金：

```text
推广订单号
平台订单号
商品 ID
付款金额
预估/确认/结算佣金
佣金状态
下单与结算时间
渠道
原始响应
```

只有已结算佣金进入已结算利润；预估和待确认佣金只用于预估。订单关联优先使用平台订单号，无法自动确认时进入人工匹配。

## 8. Bot 分发

Bot 接收链接后调用现有转换 API，不直接读取加密凭证或写数据库。消息提取、幂等、队列、重试、投递日志和微信身份建议见 `docs/wechat-bot.md`。
