import { LihuaXiongAffiliateAdapter } from './lihuaxiong.adapter';
import { createLihuaXiongSignature } from './lihuaxiong.codec';

describe('LihuaXiongAffiliateAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the reconstructed headers and normalizes a converted response', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          encrypt: 0,
          msg: '转换成功',
          data: {
            goods_id: 'SKU-1001',
            content: '返利文案 https://promo.example/item/1001',
            short_url: 'https://s.example/1001',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new LihuaXiongAffiliateAdapter();

    const result = await adapter.convert({
      content: '商品 https://item.example/1001',
      credentials: {
        xid: 'bb21f9',
        signatureSalt: 'SIGN_SALT',
        token: 'CURRENT_TOKEN',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://bb21f9.xapi2159.dhcc.wang/api/goods/linkConvert');
    const headers = init?.headers as Record<string, string>;
    expect(headers.xid).toBe('bb21f9');
    expect(headers.device).toBe('pcweb');
    expect(headers.version).toBe('1.0.1');
    expect(headers.encrypt).toBe('2');
    expect(headers.custom).toMatch(/^[a-z0-9]{11}$/);
    expect(headers.Host).toBe('bb21f9.xapi2159.dhcc.wang');
    expect(headers['Accept-Language']).toBe(
      'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    );
    expect(headers['Sec-Fetch-Dest']).toBe('empty');
    expect(headers['Sec-Fetch-Mode']).toBe('cors');
    expect(headers['Sec-Fetch-Site']).toBe('cross-site');
    expect(headers['User-Agent']).toContain('Edg/139.0.0.0');
    expect(headers['sec-ch-ua']).toContain('Microsoft Edge');
    expect(headers['sec-ch-ua-mobile']).toBe('?0');
    expect(headers['sec-ch-ua-platform']).toBe('"Windows"');
    expect(headers.sign).toBe(
      createLihuaXiongSignature({
        xid: 'bb21f9',
        signatureSalt: 'SIGN_SALT',
        time: headers.time,
        token: 'CURRENT_TOKEN',
        custom: headers.custom,
      }),
    );
    expect((init?.body as URLSearchParams).get('content')).toBe(
      '商品 https://item.example/1001',
    );
    expect(result).toMatchObject({
      normalizedUrl: 'https://item.example/1001',
      productExternalId: 'SKU-1001',
      promotionUrl: 'https://promo.example/item/1001',
      shortUrl: 'https://s.example/1001',
      promotionText: '返利文案 https://promo.example/item/1001',
      providerMessage: '转换成功',
    });
  });

  it('uses the provider message when the token has expired', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          encrypt: 0,
          msg: '请登录后操作',
          data: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new LihuaXiongAffiliateAdapter();

    await expect(
      adapter.convert({
        content: 'https://item.example/1001',
        credentials: {
          xid: 'bb21f9',
          signatureSalt: 'SIGN_SALT',
          token: 'EXPIRED_TOKEN',
        },
      }),
    ).rejects.toThrow(
      '梨花熊拒绝当前鉴权信息。请核对 Token 与 device 是否来自同一客户端（PC：pcweb，APP：web）',
    );
  });

  it('uses the configured device in both the request header and signature', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          encrypt: 0,
          msg: '转换成功',
          data: { content: 'https://promo.example/app' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new LihuaXiongAffiliateAdapter();

    await adapter.convert({
      content: 'https://item.example/app',
      credentials: {
        xid: 'bb21f9',
        signatureSalt: 'SIGN_SALT',
        token: 'CURRENT_TOKEN',
        device: 'web',
      },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers.device).toBe('web');
    expect(headers.sign).toBe(
      createLihuaXiongSignature({
        xid: 'bb21f9',
        signatureSalt: 'SIGN_SALT',
        time: headers.time,
        token: 'CURRENT_TOKEN',
        custom: headers.custom,
        device: 'web',
      }),
    );
  });
});
