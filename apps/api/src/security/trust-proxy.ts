export type TrustProxySetting = boolean | string;

const DEFAULT_TRUST_PROXY = 'loopback';

export function resolveTrustProxySetting(
  value?: string | null,
): TrustProxySetting {
  const normalized = value?.trim() || DEFAULT_TRUST_PROXY;
  const lowered = normalized.toLowerCase();

  if (lowered === 'false' || lowered === 'off' || lowered === '0') {
    return false;
  }
  if (lowered === 'true' || lowered === 'on') {
    return true;
  }
  if (/^\d+$/.test(normalized)) {
    throw new Error(
      'TRUST_PROXY 不接受代理跳数，请填写 loopback、代理 IP 或 CIDR',
    );
  }

  return normalized;
}
