# 有赞助手聚合返利接口对接说明

本文说明 `youzai_assistant`（有赞助手 / 查券小淘小程序）在返利转换里的完整对接方式。
协议结论全部来自小程序 `wx1389dff5517f1cc8` 解包源码与真实接口实测，未使用推测值。

## 1. 能力边界

| 项目     | 结论                                            |
| -------- | ----------------------------------------------- |
| 服务地址 | `https://appletsvr.52youzai.com`                |
| 转链接口 | `POST /goods/convertLink`                       |
| 鉴权探测 | `POST /user/get`                                |
| 鉴权头   | `Authorization: <token>`，裸 token，不带 Bearer |
| 请求体   | `{"content": "..."}`                            |
| 业务状态 | HTTP 恒为 200，真实状态在响应体 `code`          |
| 签名     | 无。全包检索无 `signature` / `encrypt` / `aes`  |
| 支持平台 | 9 个，见第 4 节                                 |

## 2. 鉴权

### 2.1 Authorization 取值

`Authorization` 就是登录接口返回的 `token` 原样透传：

```text
POST {base}/login/union
{"authorizeCode": "<微信一次性 code>", "appId": "wx1389dff5517f1cc8", "routeParams": "{}"}
→ {"code":200,"data":{"token":"<Authorization>","openid":"..."}}
```

小程序侧请求封装固定为：

```ts
header = { 'content-type': 'application/json', Authorization: token };
```

没有 `Bearer` 前缀、没有时间戳、没有签名参数。

### 2.2 状态码

| code | 含义                | 处理方式                         |
| ---- | ------------------- | -------------------------------- |
| 200  | 成功                | 读取 `data`                      |
| 401  | 未认证 / 令牌已过期 | 提示重新获取并保存 Authorization |
| 1002 | 暂无内容 / 登录失败 | 单条无结果，按条记录，不整批失败 |

`code` 与 HTTP 状态码无关，`response.ok` 为真不代表业务成功。

## 3. 请求与响应结构

### 3.1 请求

```json
{ "content": "https://item.jd.com/100012043978.html" }
```

`content` 是字符串。实测单次内容过长会被服务端丢弃，因此按行拆分、逐条请求。

### 3.2 成功响应

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    {
      "platform": 1,
      "itemId": "DTQ5lLLLaIedLzO2LBJBQ_3VBX8N2Ilr5Lu2DohL",
      "itemName": "茅台飞天 53%vol 500ml 贵州茅台酒",
      "itemUrl": "https://u.jd.com/41JMWq0",
      "middlePageUrl": "https://u.jd.com/41JMWq0",
      "jdPwd": "76:/！Q0GeIEFlVmAmtGhW！ ZH1997 ",
      "success": true
    }
  ]
}
```

### 3.3 三类必须容错的响应

这三种形状都在真实接口里出现过，直接按数组下标取字段会抛异常或错配数据：

```json
{ "code": 1002, "msg": "暂无内容", "data": null, "success": false }
{ "code": 200, "msg": "success", "data": [null] }
{ "code": 200, "msg": "success", "data": [] }
```

统一处理为「该条未识别」，把 `noReReplyMsg` 或 `msg` 作为可读原因透出，不抛异常。

`msg` 可能是无信息量的 `"success"`，不能直接当作失败原因展示，否则会把失败描述成成功。

## 4. 平台编号与字段映射

平台编号来自小程序 `src/pages/transfer/modules/utils.ts` 的 `platformIcon`：

| 编号 | 平台   | 口令字段     | 链接字段                          |
| ---- | ------ | ------------ | --------------------------------- |
| 0    | 淘宝   | `tbPwd`      | `tbPwd` / `backupPwd` / `backPwd` |
| 1    | 京东   | `jdPwd`      | `itemUrl` / `middlePageUrl`       |
| 2    | 拼多多 | 无           | `authUrl` / `authLongUrl`         |
| 3    | 唯品会 | `vphPwd`     | `itemUrl` / `middlePageUrl`       |
| 7    | 美团   | `mtPwd`      | `itemUrl` / `middlePageUrl`       |
| 11   | 抖音   | `dyPwd`      | `itemUrl` / `middlePageUrl`       |
| 12   | 快手   | `ksPwd`      | `itemUrl` / `middlePageUrl`       |
| 14   | 1688   | `alibabaPwd` | `itemUrl` / `middlePageUrl`       |
| 17   | 知嘛   | 无           | `itemUrl` / `middlePageUrl`       |

取值规则：

- 链接按 `itemUrl` → `middlePageUrl` → `shortUrl` → `authUrl` → `authLongUrl` 顺序取第一个 `http(s)` 值。
- 只接受 `http(s)` 开头的值。淘宝等平台会把口令塞在链接字段里，不做这个判断会把口令写成推广链接。
- 复制内容优先给口令，没有口令才退回链接，与小程序 `getText()` 一致。
- 淘宝没有独立推广链接，**口令本身就是可用结果**，不按失败处理。

实测样例：京东返回 `itemUrl + jdPwd`；拼多多只返回 `authUrl + authLongUrl`，无口令；1688 返回 `itemUrl + alibabaPwd`。

## 5. 为什么逐条请求

第 3 节的三类响应之外，还有一个更隐蔽的约束：

```text
京东 + 1688 同批 → code 1002，data 为 null，两条都拿不到
京东单独       → code 200，正常返回
1688 单独      → code 200，正常返回
```

即**混入互不兼容的平台会让整批失败**。同时服务端会静默丢弃无法识别的条目，返回条数少于输入条数，按数组下标对齐会把结果错配到别的商品上。

因此适配器按行拆分输入，每行单独发一次请求：

- 输入与结果严格一对一，不存在错配。
- 单条失败只影响该条，其它条照常转换。
- 天然规避了混合平台的整批失败。

单次上限 50 条，超出直接提示分批，避免一次请求耗时过长。

## 6. 结果结构

`convert` 返回除原有字段外，额外带 `entries` 逐条明细：

```ts
{
  outputText: string; // 汇总文本，按输入顺序，失败条目写明原因
  promotionUrl: string; // 首条可用链接或口令
  promotionText: string; // 首条口令，没有口令时回落链接
  productExternalId: string; // 首条商品 ID
  providerMessage: string; // 多条时展示「共 N 条，成功 X 条，失败 Y 条」
  entries: Array<{
    platformCode: string; // taobao / jd / pdd / vipshop / meituan / douyin / kuaishou / alibaba / zhima
    platformName: string; // 中文平台名
    platformNumber: number | null;
    success: boolean;
    itemName: string | null;
    itemId: string | null;
    link: string | null;
    password: string | null;
    command: string | null; // 实际用于复制的内容
    reason: string | null; // 失败原因
  }>;
}
```

`outputText` 示例：

```text
1. 茅台飞天 53%vol 500ml 贵州茅台酒
https://u.jd.com/41JMWq0
76:/！Q0GeIEFlVmAmtGhW！ ZH1997

2. 未识别
转换失败：【没一有】
需重新另选宝贝发送查询
```

历史记录仍只保存汇总文本与首条链接，`entries` 只随本次响应返回，不改变历史表结构。

## 7. 前端行为

返利转换页面：

- 输入框一行一条，`placeholder` 与实际支持平台一致。
- 多条结果以逐条卡片展示，成功条目显示平台标签与复制内容，失败条目显示原因。
- 单条时保持原有简洁展示，不出现序号。
- 汇总文本、复制结果、二维码均使用 `outputText` 原文。

## 8. 代码位置

```text
apps/api/src/affiliate/adapters/youzai.adapter.ts        协议与平台映射
apps/api/src/affiliate/adapters/youzai.adapter.spec.ts   15 个用例的桩测试
apps/api/src/affiliate/affiliate-platform.constants.ts   声明支持平台
apps/api/src/affiliate/affiliate.service.ts              convert 编排与历史落库
apps/web/src/views/AffiliateConversionView.vue           转换页面
```

## 9. 测试覆盖

`youzai.adapter.spec.ts` 覆盖：

- 全部 9 个平台编号的映射与链接取值。
- 拼多多 `authUrl` 回退。
- `code 401` 判为令牌过期。
- `data: null`、`data: [null]`、`data: []` 三类容错。
- `msg` 为 `success` 时不作为失败原因。
- 三行输入触发三次独立请求，中间一条失败不影响其余两条。
- 口令与链接同时保留，口令不会被当成推广链接。
- 超过 50 条被拒绝。
- `/user/get` 校验有效与过期两种情况。

## 10. Authorization 运维要点

### 10.1 token 是单会话，重新生成会作废旧的

实测同一个账号连续生成 4 次 token，只有最新的有效，之前 3 个全部返回 `401 未认证: 令牌已过期`：

```text
第 1 次 tf6a6wm8... → 401
第 2 次 ykhuon2d... → 401
第 3 次 gfoj3m4m... → 401
第 4 次 8y5zxct1... → 200
```

因此：

- 重新生成 Authorization 后，**必须立刻到返利平台配置里更新并保存**，否则转换会全量失败。
- 不要在转换正常时频繁重新生成，一次生成、保存即用。
- 出现 `401` 提示时，按第 2.2 节重新走一次生成流程即可恢复。

### 10.2 生成 Authorization

使用配套脚本 `xt_token.py`（应用宝协议，取一次性 code 换 token）：

```text
python xt_token.py -n 浪里个浪 -q     只输出 Authorization 值
python xt_token.py -n 浪里个浪 --json 输出昵称与耗时
python xt_token.py -l                 只列出在线账号
```

生成的 32 位字符串直接填入「返利平台配置 → 有赞助手 → Authorization」，保存后点击「测试 Authorization」确认返回有效即可。

### 10.3 关于「在线获取」

配置里的在线获取地址由服务端代请求，且**禁止指向本机与内网地址**（防 SSRF，见 `assertTokenEndpoint`）。

本机跑取 token 服务无法用于该入口。两种可行方式：

- 手动生成后粘贴保存（推荐，最简单）。
- 把取 token 接口部署到公网可访问地址，且响应为纯文本或 `token` / `authorization` / `access_token` / `data.token` 结构。

## 11. 验证方式

```bash
# 单仓验证
pnpm --filter @order-system/api test
pnpm -r typecheck
pnpm format:check
```

真实链路验证：用有效的 Authorization 调用 `/goods/convertLink`，确认京东、拼多多、1688、抖音返回可用结果，淘宝、快手、唯品会按条返回可读原因，且返回条数与输入条数一致。
