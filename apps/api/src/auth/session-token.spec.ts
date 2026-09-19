import { createSessionToken, hashSessionToken } from './session-token';

describe('admin session token', () => {
  it('creates unpredictable tokens and stores a deterministic hash', () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashSessionToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(first)).toBe(hashSessionToken(first));
  });
});
