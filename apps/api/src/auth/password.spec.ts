import { hashPassword, verifyPassword } from './password';

describe('admin password hashing', () => {
  it('hashes and verifies a password without storing plaintext', async () => {
    const password = 'A-unique-password-123';
    const encoded = await hashPassword(password);

    expect(encoded).toMatch(/^scrypt\$/);
    expect(encoded).not.toContain(password);
    await expect(verifyPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', encoded)).resolves.toBe(
      false,
    );
  });

  it('rejects malformed hashes', async () => {
    await expect(
      verifyPassword('password', 'not-a-password-hash'),
    ).resolves.toBe(false);
  });
});
