import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const DEFAULT_ADMIN_ENTRY_COOKIE = 'order_admin_entry';
export const DEFAULT_ADMIN_ENTRY_TTL_DAYS = 30;
export const ADMIN_ENTRY_COOKIE_PATH = '/';
export const ADMIN_ENTRY_PATH_PATTERN =
  /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{5,12}$/;

const TOKEN_VERSION = 'v1';
const RESERVED_ENTRY_PATHS = new Set([
  'admin',
  'api',
  'favicon.ico',
  'form',
  'login',
  'order-query',
  'payout',
]);

export function normalizeAdminEntryPath(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, '');
}

export function isValidAdminEntryPath(value: string) {
  return (
    ADMIN_ENTRY_PATH_PATTERN.test(value) &&
    !RESERVED_ENTRY_PATHS.has(value.toLowerCase())
  );
}

function signaturePayload(expiresAtMs: number, adminEntryPath: string) {
  return `${TOKEN_VERSION}.${expiresAtMs}.${adminEntryPath}`;
}

export function createAdminEntryGrant(
  adminEntryPath: string,
  secret: string,
  expiresAtMs: number,
) {
  const signature = createHmac('sha256', secret)
    .update(signaturePayload(expiresAtMs, adminEntryPath))
    .digest('base64url');
  return `${TOKEN_VERSION}.${expiresAtMs}.${signature}`;
}

export function verifyAdminEntryGrant(
  token: string,
  adminEntryPath: string,
  secret: string,
  nowMs = Date.now(),
) {
  const [version, rawExpiresAt, signature, extra] = token.split('.');
  if (version !== TOKEN_VERSION || !rawExpiresAt || !signature || extra) {
    return false;
  }

  const expiresAtMs = Number(rawExpiresAt);
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= nowMs) return false;

  const expected = createHmac('sha256', secret)
    .update(signaturePayload(expiresAtMs, adminEntryPath))
    .digest();

  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function matchesAdminEntryPath(candidate: string, expected: string) {
  const candidateHash = createHash('sha256').update(candidate).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}
