import { Injectable } from '@nestjs/common';

export interface YouzaiAssistantCredentials {
  token: string;
}

export interface YouzaiAssistantConversionInput {
  content: string;
  apiBaseUrl?: string | null;
  credentials: YouzaiAssistantCredentials;
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
}

interface YouzaiConvertItem {
  platform?: number | string | null;
  itemId?: string | null;
  itemName?: string | null;
  itemUrl?: string | null;
  middlePageUrl?: string | null;
  authUrl?: string | null;
  authLongUrl?: string | null;
  dyPwd?: string | null;
  jdPwd?: string | null;
  success?: boolean | null;
}

interface YouzaiEnvelope {
  code?: number | string | null;
  msg?: string | null;
  data?: YouzaiConvertItem[] | null;
}

export const YOUZAI_ASSISTANT_PROTOCOL = {
  defaultBaseUrl: 'https://appletsvr.52youzai.com',
  convertPath: '/goods/convertLink',
} as const;

const clean = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const extractFirstUrl = (value: string) => {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  return match?.[0]?.replace(/[),，。；;]+$/u, '') ?? null;
};

const resolveEndpoint = (configured?: string | null) => {
  const raw = configured?.trim() || YOUZAI_ASSISTANT_PROTOCOL.defaultBaseUrl;
  const url = new URL(raw);
  if (!url.pathname || url.pathname === '/') {
    url.pathname = YOUZAI_ASSISTANT_PROTOCOL.convertPath;
  }
  return url.toString();
};

/**
 * 有赞助手小程序转链接口：Authorization 为裸 token，HTTP 状态码恒为 200，
 * 必须先判断业务 code，再按 platform 分支取链接字段。
 */
@Injectable()
export class YouzaiAssistantAffiliateAdapter {
  async convert(
    input: YouzaiAssistantConversionInput,
  ): Promise<YouzaiAssistantConversionResult> {
    const content = input.content.trim();
    const endpoint = resolveEndpoint(input.apiBaseUrl);

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
    if (!response.ok || String(code) !== '200') {
      throw new Error(
        message ?? `有赞助手接口请求失败（HTTP ${response.status}）`,
      );
    }

    const items = Array.isArray(envelope.data) ? envelope.data : [];
    const usable = items.filter((item) => Boolean(this.itemLink(item)));
    if (!usable.length) {
      throw new Error(message ?? '有赞助手接口没有返回可用的转换结果');
    }

    const primary = usable[0];
    const promotionUrl = this.itemLink(primary);
    const promotionText =
      clean(primary.dyPwd) || clean(primary.jdPwd) || promotionUrl;
    const lines = usable.map((item, index) => {
      const link = this.itemLink(item);
      const name = clean(item.itemName);
      const pwd = clean(item.dyPwd) || clean(item.jdPwd);
      const head = usable.length > 1 && name ? `${index + 1}. ${name}` : name;
      return [head, pwd, link].filter(Boolean).join('\n');
    });
    const outputText = lines.join('\n\n');

    return {
      normalizedUrl: extractFirstUrl(content),
      productExternalId: clean(primary.itemId),
      promotionUrl,
      shortUrl: null,
      promotionText: promotionText ?? null,
      outputText,
      providerCode: code,
      providerMessage: message,
      rawData: envelope,
    };
  }

  private itemLink(item: YouzaiConvertItem) {
    const platform = String(item.platform ?? '');
    if (platform === '2') {
      return clean(item.authUrl) || clean(item.authLongUrl);
    }
    return (
      clean(item.itemUrl) ||
      clean(item.middlePageUrl) ||
      clean(item.authUrl) ||
      clean(item.authLongUrl) ||
      (clean(item.itemId) && extractFirstUrl(String(item.itemId))) ||
      null
    );
  }
}
