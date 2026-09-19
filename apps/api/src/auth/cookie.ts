import type { Request } from 'express';

export function readCookie(
  request: Request,
  cookieName: string,
): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  for (const item of cookieHeader.split(';')) {
    const separatorIndex = item.indexOf('=');
    if (separatorIndex < 0) continue;

    const name = item.slice(0, separatorIndex).trim();
    if (name !== cookieName) continue;

    const value = item.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
}
