import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  maskSensitiveValue,
} from './sensitive-value';

describe('sensitive values', () => {
  it('encrypts and decrypts account values', () => {
    const encrypted = encryptSensitiveValue(
      '6222021234567890',
      'test-encryption-secret',
    );

    expect(encrypted).not.toContain('6222021234567890');
    expect(decryptSensitiveValue(encrypted, 'test-encryption-secret')).toBe(
      '6222021234567890',
    );
  });

  it('rejects decryption with a different secret', () => {
    const encrypted = encryptSensitiveValue('wx-account', 'secret-a');

    expect(() => decryptSensitiveValue(encrypted, 'secret-b')).toThrow();
  });

  it('masks common account values', () => {
    expect(maskSensitiveValue('6222021234567890')).toBe('622****7890');
    expect(maskSensitiveValue('person@example.com')).toBe('p***@example.com');
  });
});
