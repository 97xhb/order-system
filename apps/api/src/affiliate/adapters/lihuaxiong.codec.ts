import { createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const LIHUAXIONG_PROTOCOL = {
  defaultXid: 'bb21f9',
  defaultSignatureSalt: '9NvC3gKk2dUM',
  device: 'pcweb',
  version: '1.0.1',
  encrypt: '2',
  customLength: 11,
  signaturePath: '/api/goods/linkconvert',
  defaultEndpoint: 'https://bb21f9.xapi2159.dhcc.wang/api/goods/linkConvert',
  origin: 'http://bb21f9.webtool.hndhsoft.cn',
  referer: 'http://bb21f9.webtool.hndhsoft.cn/',
  acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
  secChUa: '"Not;A=Brand";v="99", "Microsoft Edge";v="139", "Chromium";v="139"',
} as const;

export interface LihuaXiongSignatureInput {
  xid: string;
  signatureSalt: string;
  time: string;
  token: string;
  custom: string;
  device?: string;
  version?: string;
  signaturePath?: string;
}

export interface LihuaXiongResponseEnvelope {
  code?: unknown;
  data?: unknown;
  encrypt?: unknown;
  msg?: unknown;
  sign?: unknown;
  time?: unknown;
}

const RANDOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const md5 = (value: string) => createHash('md5').update(value, 'utf8').digest();

export const createLihuaXiongCustom = (
  length = LIHUAXIONG_PROTOCOL.customLength,
) => {
  const bytes = randomBytes(length);
  let result = '';
  for (const byte of bytes) {
    result += RANDOM_ALPHABET[byte % RANDOM_ALPHABET.length];
  }
  return result;
};

export const createLihuaXiongSignature = (input: LihuaXiongSignatureInput) => {
  const device = input.device ?? LIHUAXIONG_PROTOCOL.device;
  const version = input.version ?? LIHUAXIONG_PROTOCOL.version;
  const signaturePath =
    input.signaturePath ?? LIHUAXIONG_PROTOCOL.signaturePath;
  const plainText =
    input.xid +
    input.signatureSalt +
    signaturePath +
    input.time +
    device +
    version +
    input.token +
    input.custom;

  return createHash('md5').update(plainText, 'utf8').digest('hex');
};

const encryptedFlag = (value: unknown) =>
  value === true || value === 1 || value === '1' || value === 'true';

const parseJsonText = (value: string): unknown => {
  const normalized = value.replace(/^\uFEFF/, '').trim();
  if (!normalized) return '';

  let parsed: unknown = normalized;
  for (let index = 0; index < 2 && typeof parsed === 'string'; index += 1) {
    const text = parsed.trim();
    if (!text || !['{', '[', '"'].includes(text[0])) break;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      break;
    }
  }
  return parsed;
};

const decodeUtf8 = (value: Buffer) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    return null;
  }
};

export const decodeLihuaXiongPayload = (
  envelope: LihuaXiongResponseEnvelope,
): unknown => {
  if (!encryptedFlag(envelope.encrypt)) {
    return typeof envelope.data === 'string'
      ? parseJsonText(envelope.data)
      : envelope.data;
  }

  if (typeof envelope.data !== 'string' || !envelope.data.trim()) {
    throw new Error('梨花熊接口加密响应缺少 data');
  }
  if (typeof envelope.sign !== 'string' || !envelope.sign.trim()) {
    throw new Error('梨花熊接口加密响应缺少 sign');
  }
  if (typeof envelope.time !== 'string' && typeof envelope.time !== 'number') {
    throw new Error('梨花熊接口加密响应缺少 time');
  }

  const encrypted = Buffer.from(envelope.data, 'base64');
  if (!encrypted.length || encrypted.length % 16 !== 0) {
    throw new Error('梨花熊接口密文长度不正确');
  }

  const key = md5(envelope.sign);
  const iv = md5(`key_${String(envelope.time)}`);
  const decipher = createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  let end = decrypted.length;
  while (end > 0 && decrypted[end - 1] === 0) end -= 1;
  const clear = decrypted.subarray(0, end);
  const utf8 = decodeUtf8(clear);

  if (utf8 === null) {
    return {
      encoding: 'hex',
      value: clear.toString('hex'),
    };
  }
  return parseJsonText(utf8);
};
