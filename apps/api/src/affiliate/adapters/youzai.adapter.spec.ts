import { YouzaiAssistantAffiliateAdapter } from './youzai.adapter';

describe('YouzaiAssistantAffiliateAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts the raw Authorization header and picks the douyin link', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          msg: 'success',
          data: [
            {
              platform: 11,
              itemId: '3832635966917575063',
              itemName: '测试商品',
              itemUrl: 'https://v.buydouke.com/abc/',
              middlePageUrl: 'https://v.buydouke.com/abc/',
              dyPwd: '6@N.w 05/27p/',
              success: true,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    const result = await adapter.convert({
      content: 'https://v.douyin.com/o0cWHnv2UyU/',
      credentials: { token: '687bu93kzkcr2vhwgqc0pqffy80uz8ta' },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://appletsvr.52youzai.com/goods/convertLink');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('687bu93kzkcr2vhwgqc0pqffy80uz8ta');
    expect(JSON.parse(String(init?.body))).toEqual({
      content: 'https://v.douyin.com/o0cWHnv2UyU/',
    });
    expect(result.promotionUrl).toBe('https://v.buydouke.com/abc/');
    expect(result.productExternalId).toBe('3832635966917575063');
    expect(result.outputText).toContain('测试商品');
  });

  it('falls back to authUrl for pinduoduo results', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          msg: 'success',
          data: [
            {
              platform: 2,
              authUrl: 'https://p.pinduoduo.com/r5NkvCYJ?sc=EFAC',
              authLongUrl:
                'https://mobile.yangkeduo.com/duo_coupon_landing.html',
              success: true,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    const result = await adapter.convert({
      content: '拼多多口令',
      credentials: { token: 'token-value' },
    });

    expect(result.promotionUrl).toBe(
      'https://p.pinduoduo.com/r5NkvCYJ?sc=EFAC',
    );
  });

  it('treats body code 401 as an expired Authorization', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 401, msg: '未认证: 令牌已过期' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    await expect(
      adapter.convert({
        content: 'https://v.douyin.com/abc/',
        credentials: { token: 'expired-token' },
      }),
    ).rejects.toThrow('Authorization 已过期');
  });

  it('prefers itemUrl over a dirty itemId for jd results', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          msg: 'success',
          data: [
            {
              platform: 1,
              itemId: 'https://item.jd.com/1001.html',
              itemUrl: 'https://u.jd.com/xyz',
              jdPwd: '京东口令',
              success: true,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    const result = await adapter.convert({
      content: 'https://item.jd.com/1001.html',
      credentials: { token: 'token-value' },
    });

    expect(result.promotionUrl).toBe('https://u.jd.com/xyz');
  });
});
