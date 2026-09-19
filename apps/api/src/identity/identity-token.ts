import { createHash, randomBytes } from 'node:crypto';

const DISPLAY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface ExternalIdentityCredentials {
  displayCode: string;
  sessionToken: string;
  sessionTokenHash: string;
}

export function hashIdentityToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateIdentityDisplayCode(length = 10): string {
  const bytes = randomBytes(length);
  let result = '';

  for (let index = 0; index < length; index += 1) {
    result += DISPLAY_ALPHABET[bytes[index] % DISPLAY_ALPHABET.length];
  }

  return `WX-${result}`;
}

export function createExternalIdentityCredentials(): ExternalIdentityCredentials {
  const sessionToken = randomBytes(32).toString('base64url');

  return {
    displayCode: generateIdentityDisplayCode(),
    sessionToken,
    sessionTokenHash: hashIdentityToken(sessionToken),
  };
}
