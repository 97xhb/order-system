import { createCipheriv, createHash } from 'node:crypto';
import {
  createLihuaXiongCustom,
  createLihuaXiongSignature,
  decodeLihuaXiongPayload,
  LIHUAXIONG_PROTOCOL,
} from './lihuaxiong.codec';

describe('LihuaXiong codec', () => {
  it('generates the 11-character custom value used by the E-language source', () => {
    const custom = createLihuaXiongCustom();

    expect(custom).toHaveLength(LIHUAXIONG_PROTOCOL.customLength);
    expect(custom).toMatch(/^[a-z0-9]{11}$/);
  });

  it('reproduces the lowercase MD5 request signature from the E-language protocol', () => {
    expect(
      createLihuaXiongSignature({
        xid: 'bb21f9',
        signatureSalt: '9NvC3gKk2dUM',
        time: '1723680000',
        token: 'TOKEN_EXAMPLE',
        custom: 'abc123xyz',
      }),
    ).toBe('8941314a2bf9360f8b9e0dbddc25312b');
  });

  it('decrypts AES-128-CBC zero-padded response data', () => {
    const responseSign = 'response-sign-example';
    const time = '1723680001';
    const plain = Buffer.from(
      JSON.stringify({ content: '复制文案 https://s.example/abc' }),
      'utf8',
    );
    const paddedLength = Math.ceil(plain.length / 16) * 16;
    const padded = Buffer.alloc(paddedLength);
    plain.copy(padded);
    const key = createHash('md5').update(responseSign).digest();
    const iv = createHash('md5').update(`key_${time}`).digest();
    const cipher = createCipheriv('aes-128-cbc', key, iv);
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);

    expect(
      decodeLihuaXiongPayload({
        data: encrypted.toString('base64'),
        encrypt: 1,
        sign: responseSign,
        time,
      }),
    ).toEqual({ content: '复制文案 https://s.example/abc' });
  });

  it('keeps compatibility with unencrypted JSON responses', () => {
    expect(
      decodeLihuaXiongPayload({
        data: '[{"url":"https://example.test/promotion"}]',
        encrypt: 0,
      }),
    ).toEqual([{ url: 'https://example.test/promotion' }]);
  });
});
