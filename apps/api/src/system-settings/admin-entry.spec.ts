import {
  createAdminEntryGrant,
  isValidAdminEntryPath,
  verifyAdminEntryGrant,
} from './admin-entry';

describe('admin security entry grants', () => {
  const secret = 'admin-entry-test-secret';
  const entry = 'Entry123';

  it('creates a valid signed grant for the configured entry', () => {
    const expiresAt = Date.now() + 60_000;
    const token = createAdminEntryGrant(entry, secret, expiresAt);

    expect(verifyAdminEntryGrant(token, entry, secret, expiresAt - 1)).toBe(
      true,
    );
  });

  it('invalidates the grant after the entry path changes or expires', () => {
    const expiresAt = Date.now() + 60_000;
    const token = createAdminEntryGrant(entry, secret, expiresAt);

    expect(
      verifyAdminEntryGrant(token, 'NewEntry9', secret, expiresAt - 1),
    ).toBe(false);
    expect(verifyAdminEntryGrant(token, entry, secret, expiresAt)).toBe(false);
  });

  it('requires 5 to 12 alphanumeric characters with letters and numbers', () => {
    expect(isValidAdminEntryPath('abc12')).toBe(true);
    expect(isValidAdminEntryPath('lettersOnly')).toBe(false);
    expect(isValidAdminEntryPath('123456')).toBe(false);
    expect(isValidAdminEntryPath('ab-12')).toBe(false);
    expect(isValidAdminEntryPath('a1')).toBe(false);
    expect(isValidAdminEntryPath('abcdefghijk12')).toBe(false);
  });
});
