import { resolveTrustProxySetting } from './trust-proxy';

describe('resolveTrustProxySetting', () => {
  it('defaults to loopback so direct clients cannot spoof forwarded IPs', () => {
    expect(resolveTrustProxySetting()).toBe('loopback');
    expect(resolveTrustProxySetting('')).toBe('loopback');
  });

  it('accepts explicit proxy addresses and named ranges', () => {
    expect(resolveTrustProxySetting('10.0.0.8')).toBe('10.0.0.8');
    expect(resolveTrustProxySetting('loopback, 10.0.0.0/8')).toBe(
      'loopback, 10.0.0.0/8',
    );
  });

  it('supports explicit boolean values', () => {
    expect(resolveTrustProxySetting('false')).toBe(false);
    expect(resolveTrustProxySetting('on')).toBe(true);
  });

  it('rejects hop-count trust because it is unsafe when API is directly exposed', () => {
    expect(() => resolveTrustProxySetting('1')).toThrow('代理跳数');
  });
});
