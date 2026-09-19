import { Injectable } from '@nestjs/common';
import {
  createLihuaXiongCustom,
  createLihuaXiongSignature,
  decodeLihuaXiongPayload,
  LIHUAXIONG_PROTOCOL,
  type LihuaXiongResponseEnvelope,
} from './lihuaxiong.codec';

export interface LihuaXiongCredentials {
  xid: string;
  signatureSalt: string;
  token: string;
  device?: string | null;
  promotionId?: string | null;
}

export interface LihuaXiongConversionInput {
  content: string;
  apiBaseUrl?: string | null;
  credentials: LihuaXiongCredentials;
}

export interface LihuaXiongConversionResult {
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

interface StringLeaf {
  key: string;
  value: string;
}

const extractFirstUrl = (value: string) => {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  return match?.[0]?.replace(/[),，。；;]+$/u, '') ?? null;
};

const normalizeKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/gu, '');

const collectStringLeaves = (
  value: unknown,
  prefix = '',
  depth = 0,
): StringLeaf[] => {
  if (depth > 6 || value === null || value === undefined) return [];
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? [{ key: prefix, value: normalized }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectStringLeaves(item, `${prefix}[${index}]`, depth + 1),
    );
  }
  if (typeof value !== 'object') return [];

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, item]) =>
      collectStringLeaves(item, prefix ? `${prefix}.${key}` : key, depth + 1),
  );
};

const firstLeafByKey = (
  leaves: StringLeaf[],
  keys: string[],
  requireUrl = false,
) =>
  leaves.find((leaf) => {
    const normalizedKey = normalizeKey(leaf.key);
    return (
      keys.some((key) => normalizedKey.includes(key)) &&
      (!requireUrl || Boolean(extractFirstUrl(leaf.value)))
    );
  })?.value ?? null;

const payloadHasContent = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

const stringifyOutput = (value: unknown, promotionText: string | null) => {
  if (typeof value === 'string') return value.trim();
  if (promotionText) return promotionText;
  return JSON.stringify(value, null, 2);
};

const resolveEndpoint = (configured?: string | null) => {
  const raw = configured?.trim() || LIHUAXIONG_PROTOCOL.defaultEndpoint;
  const url = new URL(raw);
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/api/goods/linkConvert';
  }
  return url.toString();
};

const providerMessage = (envelope: LihuaXiongResponseEnvelope) =>
  typeof envelope.msg === 'string' && envelope.msg.trim()
    ? envelope.msg.trim()
    : null;

const providerCode = (envelope: LihuaXiongResponseEnvelope) =>
  typeof envelope.code === 'string' || typeof envelope.code === 'number'
    ? envelope.code
    : null;

@Injectable()
export class LihuaXiongAffiliateAdapter {
  async convert(
    input: LihuaXiongConversionInput,
  ): Promise<LihuaXiongConversionResult> {
    const content = input.content.trim();
    const time = Math.floor(Date.now() / 1_000).toString();
    const custom = createLihuaXiongCustom();
    const device =
      input.credentials.device?.trim() || LIHUAXIONG_PROTOCOL.device;
    const sign = createLihuaXiongSignature({
      xid: input.credentials.xid,
      signatureSalt: input.credentials.signatureSalt,
      time,
      token: input.credentials.token,
      custom,
      device,
    });
    const body = new URLSearchParams({
      content,
      special_goods: '0',
      tb_url_type: '',
      check_beian: '1',
    });
    const endpoint = resolveEndpoint(input.apiBaseUrl);
    const endpointUrl = new URL(endpoint);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Encoding': 'deflate, br, zstd',
          'Accept-Language': LIHUAXIONG_PROTOCOL.acceptLanguage,
          Connection: 'keep-alive',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Host: endpointUrl.host,
          Origin: LIHUAXIONG_PROTOCOL.origin,
          Referer: LIHUAXIONG_PROTOCOL.referer,
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
          'User-Agent': LIHUAXIONG_PROTOCOL.userAgent,
          custom,
          device,
          encrypt: LIHUAXIONG_PROTOCOL.encrypt,
          'sec-ch-ua': LIHUAXIONG_PROTOCOL.secChUa,
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          sign,
          time,
          token: input.credentials.token,
          version: LIHUAXIONG_PROTOCOL.version,
          xid: input.credentials.xid,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error('梨花熊接口请求超时');
      }
      throw new Error(
        `梨花熊接口连接失败：${error instanceof Error ? error.message : '未知错误'}`,
      );
    }

    const responseText = await response.text();
    let envelope: LihuaXiongResponseEnvelope;
    try {
      const parsed: unknown = JSON.parse(responseText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('response is not an object');
      }
      envelope = parsed as LihuaXiongResponseEnvelope;
    } catch {
      throw new Error(`梨花熊接口返回格式不正确（HTTP ${response.status}）`);
    }

    if (!response.ok) {
      throw new Error(
        providerMessage(envelope) ??
          `梨花熊接口请求失败（HTTP ${response.status}）`,
      );
    }

    const rawData = decodeLihuaXiongPayload(envelope);
    const message = providerMessage(envelope);
    const code = providerCode(envelope);
    if (
      String(code) === '401' ||
      (message ? /请登录后操作/u.test(message) : false)
    ) {
      throw new Error(
        '梨花熊拒绝当前鉴权信息。请核对 Token 与 device 是否来自同一客户端（PC：pcweb，APP：web）',
      );
    }
    if (!payloadHasContent(rawData)) {
      throw new Error(message ?? '梨花熊接口没有返回转换结果');
    }

    const leaves = collectStringLeaves(rawData);
    const shortUrlValue = firstLeafByKey(
      leaves,
      ['shorturl', 'shortlink', 'shortclickurl', 'duanlian'],
      true,
    );
    const promotionUrlValue = firstLeafByKey(
      leaves.filter((leaf) => !normalizeKey(leaf.key).includes('short')),
      [
        'promotionurl',
        'converturl',
        'clickurl',
        'couponurl',
        'shareurl',
        'itemurl',
        'goodsurl',
        'link',
        'url',
      ],
      true,
    );
    const promotionText = firstLeafByKey(leaves, [
      'promotiontext',
      'copywriting',
      'content',
      'command',
      'kouling',
      'tpwd',
      'text',
    ]);
    const productExternalId = firstLeafByKey(leaves, [
      'productid',
      'goodsid',
      'itemid',
      'skuid',
    ]);
    const outputText = stringifyOutput(rawData, promotionText);
    const promotionUrl = promotionUrlValue
      ? extractFirstUrl(promotionUrlValue)
      : extractFirstUrl(outputText);
    const shortUrl = shortUrlValue ? extractFirstUrl(shortUrlValue) : null;

    return {
      normalizedUrl: extractFirstUrl(content),
      productExternalId,
      promotionUrl,
      shortUrl,
      promotionText,
      outputText,
      providerCode: code,
      providerMessage: message,
      rawData,
    };
  }
}
