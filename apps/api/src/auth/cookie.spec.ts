import type { Request } from 'express';
import { readCookie } from './cookie';

describe('readCookie', () => {
  it('reads the requested cookie without accepting similarly named cookies', () => {
    const request = {
      headers: {
        cookie: 'other=value; order_admin_session=abc%20123; order_admin=wrong',
      },
    } as Request;

    expect(readCookie(request, 'order_admin_session')).toBe('abc 123');
    expect(readCookie(request, 'missing')).toBeNull();
  });
});
