import {
  createExternalIdentityCredentials,
  generateIdentityDisplayCode,
  hashIdentityToken,
} from './identity-token';

describe('external identity credentials', () => {
  it('generates a readable WeChat visitor code', () => {
    expect(generateIdentityDisplayCode()).toMatch(/^WX-[2-9A-HJ-NP-Z]{10}$/);
  });

  it('generates a session token and stores only its hash', () => {
    const credentials = createExternalIdentityCredentials();

    expect(credentials.sessionToken.length).toBeGreaterThan(30);
    expect(credentials.sessionTokenHash).toBe(
      hashIdentityToken(credentials.sessionToken),
    );
    expect(credentials.sessionTokenHash).not.toBe(credentials.sessionToken);
  });
});
