import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const FORMAT_VERSION = 'v1';

function deriveKey(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSensitiveValue(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSensitiveValue(value: string, secret: string): string {
  const [version, ivValue, tagValue, ciphertextValue, ...rest] =
    value.split(':');
  if (
    version !== FORMAT_VERSION ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    rest.length > 0
  ) {
    throw new Error('不支持的加密数据格式');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(secret),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskSensitiveValue(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';

  const atIndex = normalized.indexOf('@');
  if (atIndex > 0) {
    return `${normalized.slice(0, 1)}***${normalized.slice(atIndex)}`;
  }

  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  if (normalized.length <= 7) {
    return `${normalized.slice(0, 1)}***${normalized.slice(-1)}`;
  }

  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}
