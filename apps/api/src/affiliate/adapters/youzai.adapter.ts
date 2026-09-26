import { Injectable } from '@nestjs/common';

export interface YouzaiAssistantCredentials {
  token: string;
}

export interface YouzaiAssistantConversionInput {
  content: string;
  apiBaseUrl?: string | null;
  credentials: YouzaiAssistantCredentials;
}

export interface YouzaiConversionEntry {
  platformCode: string;
  platformName: string;
  platformNumber: number | null;
  success: boolean;
  itemName: string | null;
  itemId: string | null;
  link: string | null;
  password: string | null;
  command: string | null;
  reason: string | null;
}

export interface YouzaiAssistantConversionResult {
  normalizedUrl: string | null;
  productExternalId: string | null;
  promotionUrl: string | null;
  shortUrl: string | null;
  promotionText: string | null;
  outputText: string;
  providerCode: string | number | null;
  providerMessage: string | null;
  rawData: unknown;
  entries: YouzaiConversionEntry[];
}

interface YouzaiConvertItem {
  platform?: number | string | null;
  itemId?: string | null;
  itemName?: string | null;
  itemUrl?: string | null;
  middlePageUrl?: string | null;
  shortUrl?: string | null;
  authUrl?: string | null;
  authLongUrl?: string | null;
  wxurl?: string | null;
  minaShortLink?: string | null;
  tbPwd?: string | null;
  backupPwd?: string | null;
  backPwd?: string | null;
  jdPwd?: string | null;
  dyPwd?: string | null;
  ksPwd?: string | null;
  vphPwd?: string | null;
  mtPwd?: string | null;
  alibabaPwd?: string | null;
  noReReplyMsg?: string | null;
  success?: boolean | null;
}

interface YouzaiEnvelope {
  code?: number | string | null;
  msg?: string | null;
  data?: Array<YouzaiConvertItem | null> | null;
}

export interface YouzaiPlatformRule {
  code: string;
  name: string;
  /** 小程序 transfer 页 platformIcon 使用的平台编号。 */
  number: number;
  /** 该平台的商品口令字段名，没有口令的平台为 null。 */
  passwordField: string | null;
}

export const YOUZAI_ASSISTANT_PROTOCOL = {
  defaultBaseUrl: 'https://appletsvr.52youzai.com',
  convertPath: '/goods/convertLink',
  userPath: '/user/get',
  /** 单次粘贴的条数上限，避免批量转换耗时过长。 */
  maxItems: 50,
} as const;

/**
 * 平台编号来源：小程序 wx1389dff5517f1cc8
 * src/pages/transfer/modules/utils.ts 的 platformIcon。
 *
 * 0 淘宝 / 1 京东 / 2 拼多多 / 3 唯品会 / 7 美团 /
 * 11 抖音 / 12 快手 / 14 1688 / 17 知嘛。
 */
export const YOUZAI_PLATFORM_RULES: YouzaiPlatformRule[] = [
  { code: 'taobao', name: '淘宝', number: 0, passwordField: 'tbPwd' },
  { code: 'jd', name: '京东', number: 1, passwordField: 'jdPwd' },
  { code: 'pdd', name: '拼多多', number: 2, passwordField: null },
  { code: 'vipshop', name: '唯品会', number: 3, passwordField: 'vphPwd' },
  { code: 'meituan', name: '美团', number: 7, passwordField: 'mtPwd' },
  { code: 'douyin', name: '抖音', number: 11, passwordField: 'dyPwd' },
  { code: 'kuaishou', name: '快手', number: 12, passwordField: 'ksPwd' },
  { code: 'alibaba', name: '1688', number: 14, passwordField: 'alibabaPwd' },
  { code: 'zhima', name: '知嘛', number: 17, passwordField: null },
];

export const YOUZAI_PLATFORM_RULE_BY_NUMBER = new Map(
  YOUZAI_PLATFORM_RULES.map((rule) => [rule.number, rule]),
);

/**
 * 推广链接字段优先级。实测：京东/抖音/1688 走 itemUrl + middlePageUrl，
 * 拼多多只回 authUrl + authLongUrl，因此统一按此顺序取第一个 http(s) 值。
 */
const LINK_FIELDS = [
  'itemUrl',
  'middlePageUrl',
  'shortUrl',
  'authUrl',
  'authLongUrl',
  'minaShortLink',
  'wxurl',
] as const;

const clean = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

/**
 * 服务端在“没有解析出商品”时可能只回 msg:"success"，把它当失败原因
 * 展示会让管理员以为是成功。这里过滤掉无信息量的占位文案。
 */
const cleanReason = (value?: string | null) => {
  const normalized = clean(value);
  if (!normalized) return null;
  return /^(success|ok|成功)$/i.test(normalized) ? null : normalized;
};

const extractFirstUrl = (value: string) => {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  return match?.[0]?.replace(/[),，。；;]+$/u, '') ?? null;
};

const resolveEndpoint = (
  configured: string | null | undefined,
  path: string,
) => {
  const raw = configured?.trim() || YOUZAI_ASSISTANT_PROTOCOL.defaultBaseUrl;
  const url = new URL(raw);
  if (!url.pathname || url.pathname === '/') url.pathname = path;
  return url.toString();
};

/** 按换行拆成单条，一条一行，空行丢弃。 */
export const splitConversionItems = (content: string) =>
  content
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * 有赞助手小程序转链接口：Authorization 为裸 token，HTTP 状态码恒为 200，
 * 真实业务状态在 body.code。
 *
 * 实测得到的三条硬约束（决定了这里为什么逐条请求）：
 * 1) data 可能是 null（code 1002 暂无内容），也可能是 [null]，直接按数组取字段会抛错；
 * 2) 同一批 content 混入不兼容平台（如京东 + 1688）会让整批返回 code 1002，
 *    拆分后单独请求则各自正常；
 * 3) 服务端会静默丢弃无法识别的条目，返回条数可能少于输入条数，
 *    按下标对齐会把结果错配到别的商品上。
 * 逐条请求让输入与结果严格一对一，同时天然解决上面三点。
 */
@Injectable()
export class YouzaiAssistantAffiliateAdapter {
  async convert(
    input: YouzaiAssistantConversionInput,
  ): Promise<YouzaiAssistantConversionResult> {
    const content = input.content.trim();
    const items = splitConversionItems(content);
    if (!items.length) {
      throw new Error('请先粘贴商品链接或分享文本');
    }
    if (items.length > YOUZAI_ASSISTANT_PROTOCOL.maxItems) {
      throw new Error(
        `一次最多转换 ${YOUZAI_ASSISTANT_PROTOCOL.maxItems} 条，当前 ${items.length} 条，请分批粘贴`,
      );
    }

    const entries: YouzaiConversionEntry[] = [];
    const rawResponses: unknown[] = [];
    let lastMessage: string | null = null;

    for (const item of items) {
      const envelope = await this.request(input, item);
      rawResponses.push(envelope);
      lastMessage = clean(envelope.msg) ?? lastMessage;
      entries.push(this.toEntry(item, envelope));
    }

    const usable = entries.filter((entry) => entry.command);
    if (!usable.length) {
      throw new Error(this.describeFailure(entries));
    }

    return this.buildResult(content, entries, usable, {
      providerCode: 200,
      providerMessage: lastMessage,
      rawData: rawResponses.length === 1 ? rawResponses[0] : rawResponses,
    });
  }

  /** 汇总单条结果，保持输入顺序。 */
  buildResult(
    content: string,
    entries: YouzaiConversionEntry[],
    usable: YouzaiConversionEntry[],
    meta: {
      providerCode: string | number | null;
      providerMessage: string | null;
      rawData: unknown;
    },
  ): YouzaiAssistantConversionResult {
    const primary = usable[0];
    const multiple = entries.length > 1;

    const sections = entries.map((entry, index) => {
      const heading = multiple ? `${index + 1}. ` : '';
      if (!entry.command) {
        return [
          `${heading}${entry.itemName ?? '未识别'}`,
          `转换失败：${entry.reason ?? '该平台暂未返回推广链接'}`,
        ].join('\n');
      }

      const lines = [`${heading}${entry.itemName ?? entry.platformName}`];
      if (entry.link) lines.push(entry.link);
      if (entry.password && entry.password !== entry.link) {
        lines.push(entry.password);
      }
      return lines.join('\n');
    });

    const failedCount = entries.length - usable.length;
    const summary =
      failedCount > 0
        ? `共 ${entries.length} 条，成功 ${usable.length} 条，失败 ${failedCount} 条`
        : null;

    return {
      normalizedUrl: extractFirstUrl(content),
      productExternalId: primary.itemId,
      promotionUrl: primary.link ?? primary.command,
      shortUrl: null,
      promotionText: primary.command ?? primary.link,
      outputText: sections.join('\n\n'),
      providerCode: meta.providerCode,
      providerMessage: summary ?? meta.providerMessage,
      rawData: meta.rawData,
      entries,
    };
  }

  private async request(
    input: YouzaiAssistantConversionInput,
    content: string,
  ): Promise<YouzaiEnvelope> {
    const endpoint = resolveEndpoint(
      input.apiBaseUrl,
      YOUZAI_ASSISTANT_PROTOCOL.convertPath,
    );

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          Authorization: input.credentials.token,
        },
        body: JSON.stringify({ content }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error('有赞助手接口请求超时');
      }
      throw new Error(
        `有赞助手接口连接失败：${error instanceof Error ? error.message : '未知错误'}`,
      );
    }

    const responseText = await response.text();
    let envelope: YouzaiEnvelope;
    try {
      const parsed: unknown = JSON.parse(responseText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('response is not an object');
      }
      envelope = parsed as YouzaiEnvelope;
    } catch {
      throw new Error('有赞助手接口返回格式不正确');
    }

    const code = envelope.code ?? null;
    const message = clean(envelope.msg);
    if (String(code) === '401') {
      throw new Error('Authorization 已过期，请在返利平台配置中重新获取并保存');
    }
    if (!response.ok) {
      throw new Error(
        message ?? `有赞助手接口请求失败（HTTP ${response.status}）`,
      );
    }
    // code 1002（暂无内容）代表这一条没有解析出商品，交给 toEntry 统一解释，
    // 不能直接抛错，否则一条失败会中断整批转换。
    return envelope;
  }

  /**
   * 单条输入对应单条响应的解释：
   * data 为 null / [null] / 空数组，或 platform 为空，都算未识别，
   * 并透出服务端 noReReplyMsg 作为可读原因。
   */
  private toEntry(
    source: string,
    envelope: YouzaiEnvelope,
  ): YouzaiConversionEntry {
    const data = Array.isArray(envelope.data) ? envelope.data : [];
    const item = data[0] ?? null;
    const fallbackReason =
      cleanReason(envelope.msg) ??
      '未解析出该条内容，请确认粘贴的是完整商品链接或分享口令';

    if (!item) {
      return {
        platformCode: 'unknown',
        platformName: '未识别',
        platformNumber: null,
        success: false,
        itemName: null,
        itemId: source,
        link: null,
        password: null,
        command: null,
        reason: fallbackReason,
      };
    }

    const platformNumber =
      item.platform === null || item.platform === undefined
        ? null
        : Number(item.platform);
    const rule =
      platformNumber === null || Number.isNaN(platformNumber)
        ? null
        : (YOUZAI_PLATFORM_RULE_BY_NUMBER.get(platformNumber) ?? null);

    const itemName = clean(item.itemName);
    const password = rule?.passwordField
      ? clean(item[rule.passwordField as keyof YouzaiConvertItem] as string)
      : null;
    const link = rule ? this.pickLink(item) : null;

    const command = this.pickCommand(password, link);
    const reason = command
      ? null
      : (clean(item.noReReplyMsg) ??
        (rule
          ? `${rule.name}暂未返回可用推广链接，请确认商品可推广`
          : '未识别的平台，该条内容无法转换'));

    return {
      platformCode: rule?.code ?? 'unknown',
      platformName: rule?.name ?? '未识别',
      platformNumber,
      success: Boolean(item.success) && Boolean(command),
      itemName,
      itemId: clean(item.itemId) ?? itemName,
      link,
      password,
      command,
      reason,
    };
  }

  /** 只接受 http(s) 值，避免把明文口令错当成推广链接。 */
  private pickLink(item: YouzaiConvertItem) {
    for (const field of LINK_FIELDS) {
      const value = clean(item[field] as string | null | undefined);
      if (value && /^https?:\/\//i.test(value)) return value;
    }
    return null;
  }

  /**
   * 复制内容优先级，与小程序 getText() 一致：
   * 有口令就给口令（淘宝 / 抖音 / 快手 / 京东 / 唯品会 / 1688 / 美团），
   * 没有口令才退回推广链接。
   */
  private pickCommand(password: string | null, link: string | null) {
    return password ?? link;
  }

  private describeFailure(entries: YouzaiConversionEntry[]) {
    const detected = [
      ...new Set(
        entries
          .map((entry) => entry.platformName)
          .filter((name) => name && name !== '未识别'),
      ),
    ];
    const reasons = [
      ...new Set(
        entries
          .map((entry) => entry.reason)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const scope = detected.length ? `（识别到 ${detected.join('、')}）` : '';
    const detail = reasons.length ? `：${reasons.join('；')}` : '';
    return `有赞助手没有返回可用推广链接${scope}${detail}`;
  }

  /** 用 /user/get 校验 Authorization 是否仍然有效，不写入任何业务数据。 */
  async verifyToken(token: string, apiBaseUrl?: string | null) {
    const endpoint = resolveEndpoint(
      apiBaseUrl,
      YOUZAI_ASSISTANT_PROTOCOL.userPath,
    );

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          Authorization: token,
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error('有赞助手接口连接失败');
    }

    let envelope: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(await response.text());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('bad payload');
      }
      envelope = parsed as Record<string, unknown>;
    } catch {
      throw new Error('有赞助手接口返回格式不正确');
    }

    const code = envelope.code ?? null;
    const message =
      typeof envelope.msg === 'string' && envelope.msg.trim()
        ? envelope.msg.trim()
        : null;
    if (String(code) === '401') {
      return {
        valid: false,
        code,
        message: message ?? '未认证: 令牌已过期',
        account: null,
      };
    }
    if (String(code) !== '200') {
      return {
        valid: false,
        code,
        message: message ?? `有赞助手接口返回异常（code ${String(code)}）`,
        account: null,
      };
    }

    const data =
      envelope.data &&
      typeof envelope.data === 'object' &&
      !Array.isArray(envelope.data)
        ? (envelope.data as Record<string, unknown>)
        : {};
    const pick = (key: string) =>
      typeof data[key] === 'string' && (data[key] as string).trim()
        ? (data[key] as string).trim()
        : null;

    return {
      valid: true,
      code,
      message: message ?? 'Authorization 有效',
      account: pick('nickName') ?? pick('nickname') ?? pick('userId'),
    };
  }
}
