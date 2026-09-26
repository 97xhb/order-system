import { YouzaiAssistantAffiliateAdapter } from './youzai.adapter';

const jsonResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

/** 有赞助手真实成功响应里 itemUrl 之外的大量字段，测试里保留关键项。 */
const jdItem = (overrides: Record<string, unknown> = {}) => ({
  platform: 1,
  itemId: 'DTQ5lLLLaIedLzO2LBJBQ_3VBX8N2Ilr5Lu2DohL',
  itemName: '茅台飞天 53%vol 500ml 贵州茅台酒',
  itemUrl: 'https://u.jd.com/41JMWq0',
  middlePageUrl: 'https://u.jd.com/41JMWq0',
  jdPwd: '76:/！Q0GeIEFlVmAmtGhW！ ZH1997 ',
  success: true,
  ...overrides,
});

describe('YouzaiAssistantAffiliateAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts the raw Authorization header and picks the jd link', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ code: 200, msg: 'success', data: [jdItem()] }),
      );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    const result = await adapter.convert({
      content: 'https://item.jd.com/100012043978.html',
      credentials: { token: '687bu93kzkcr2vhwgqc0pqffy80uz8ta' },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://appletsvr.52youzai.com/goods/convertLink');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('687bu93kzkcr2vhwgqc0pqffy80uz8ta');
    expect(JSON.parse(String(init?.body))).toEqual({
      content: 'https://item.jd.com/100012043978.html',
    });
    expect(result.promotionUrl).toBe('https://u.jd.com/41JMWq0');
    expect(result.productExternalId).toBe(
      'DTQ5lLLLaIedLzO2LBJBQ_3VBX8N2Ilr5Lu2DohL',
    );
    expect(result.outputText).toContain('茅台飞天');
  });

  it('maps every platform number the mini program supports', async () => {
    const cases = [
      { platform: 0, code: 'taobao', name: '淘宝' },
      { platform: 1, code: 'jd', name: '京东' },
      { platform: 2, code: 'pdd', name: '拼多多' },
      { platform: 3, code: 'vipshop', name: '唯品会' },
      { platform: 7, code: 'meituan', name: '美团' },
      { platform: 11, code: 'douyin', name: '抖音' },
      { platform: 12, code: 'kuaishou', name: '快手' },
      { platform: 14, code: 'alibaba', name: '1688' },
      { platform: 17, code: 'zhima', name: '知嘛' },
    ];

    for (const item of cases) {
      const link = `https://example.com/${item.code}`;
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          code: 200,
          msg: 'success',
          data: [
            {
              platform: item.platform,
              itemId: `id-${item.code}`,
              itemName: `${item.name}商品`,
              itemUrl: link,
              authUrl: link,
              success: true,
            },
          ],
        }),
      );
      const adapter = new YouzaiAssistantAffiliateAdapter();
      const result = await adapter.convert({
        content: `${item.name}链接`,
        credentials: { token: 'token-value' },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].platformCode).toBe(item.code);
      expect(result.entries[0].platformName).toBe(item.name);
      expect(result.entries[0].platformNumber).toBe(item.platform);
      expect(result.entries[0].link).toBe(link);
      expect(result.entries[0].success).toBe(true);
      jest.restoreAllMocks();
    }
  });

  it('falls back to authUrl for pinduoduo results', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 200,
        msg: 'success',
        data: [
          {
            platform: 2,
            authUrl: 'https://p.pinduoduo.com/r5NkvCYJ?sc=EFAC',
            authLongUrl: 'https://mobile.yangkeduo.com/duo_coupon_landing.html',
            success: true,
          },
        ],
      }),
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
        jsonResponse({ code: 401, msg: '未认证: 令牌已过期' }),
      );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    await expect(
      adapter.convert({
        content: 'https://v.douyin.com/abc/',
        credentials: { token: 'expired-token' },
      }),
    ).rejects.toThrow('Authorization 已过期');
  });

  it('rejects dirty 200 responses instead of echoing msg as an error', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 200,
        msg: 'success',
        data: [
          { platform: null, itemId: 'https://item.taobao.com/item.htm?id=1' },
        ],
      }),
    );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    await expect(
      adapter.convert({
        content: 'https://item.taobao.com/item.htm?id=1',
        credentials: { token: 'token-value' },
      }),
    ).rejects.toThrow('未识别的平台');
  });

  it('explains when no item could be parsed at all', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ code: 200, msg: 'success', data: [] }));
    const adapter = new YouzaiAssistantAffiliateAdapter();

    await expect(
      adapter.convert({
        content: 'hello world',
        credentials: { token: 'token-value' },
      }),
    ).rejects.toThrow('请确认粘贴的是完整商品链接或分享口令');
  });

  it('does not surface the placeholder msg as the failure reason', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 200,
        msg: 'success',
        data: [{ platform: null, success: false }],
      }),
    );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    const error = await adapter
      .convert({
        content: 'https://item.taobao.com/item.htm?id=1',
        credentials: { token: 'token-value' },
      })
      .catch((thrown: Error) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('：success');
  });

  it('survives a null data array returned with code 1002', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 1002,
        msg: '暂无内容',
        data: null,
        success: false,
      }),
    );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    await expect(
      adapter.convert({
        content: 'https://v.kuaishou.com/abcdefg',
        credentials: { token: 'token-value' },
      }),
    ).rejects.toThrow('暂无内容');
  });

  it('survives a data array containing a null element', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ code: 200, msg: 'success', data: [null] }),
      );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    await expect(
      adapter.convert({
        content: 'https://detail.1688.com/offer/777.html',
        credentials: { token: 'token-value' },
      }),
    ).rejects.toThrow('未解析出该条内容');
  });

  it('requests each line separately so one failure cannot break the batch', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, msg: 'success', data: [jdItem()] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ code: 1002, msg: '暂无内容', data: null }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          msg: 'success',
          data: [
            {
              platform: 14,
              itemId: '123456789',
              itemName: '1688商品',
              itemUrl: 'https://qr.1688.com/s/1O2QlFml',
              success: true,
            },
          ],
        }),
      );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    const result = await adapter.convert({
      content: [
        'https://item.jd.com/100012043978.html',
        'https://item.taobao.com/item.htm?id=1',
        'https://detail.1688.com/offer/123456789.html',
      ].join('\n'),
      credentials: { token: 'token-value' },
    });

    // 三次输入 → 三次独立请求，顺序与输入一致。
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      content: 'https://item.jd.com/100012043978.html',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      content: 'https://detail.1688.com/offer/123456789.html',
    });

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].platformCode).toBe('jd');
    expect(result.entries[1].link).toBeNull();
    expect(result.entries[1].reason).toBe('暂无内容');
    expect(result.entries[2].platformCode).toBe('alibaba');
    expect(result.providerMessage).toBe('共 3 条，成功 2 条，失败 1 条');
    expect(result.outputText).toContain('1. 茅台飞天');
    expect(result.outputText).toContain('2. 未识别');
    expect(result.outputText).toContain('转换失败：暂无内容');
    expect(result.outputText).toContain('3. 1688商品');
  });

  it('keeps password and link together for command platforms', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 200,
        msg: 'success',
        data: [
          {
            platform: 1,
            itemId: '1001',
            itemName: '京东商品',
            itemUrl: 'https://u.jd.com/xyz',
            jdPwd: '京东口令文本',
            success: true,
          },
        ],
      }),
    );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    const result = await adapter.convert({
      content: 'https://item.jd.com/1001.html',
      credentials: { token: 'token-value' },
    });

    expect(result.entries[0].password).toBe('京东口令文本');
    expect(result.entries[0].link).toBe('https://u.jd.com/xyz');
    expect(result.promotionText).toBe('京东口令文本');
    expect(result.outputText).toContain('京东口令文本');
    expect(result.outputText).toContain('https://u.jd.com/xyz');
  });

  it('never treats a plain password as the promotion url', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 200,
        msg: 'success',
        data: [
          {
            platform: 0,
            itemName: '淘宝商品',
            itemUrl: '不是链接的口令文本',
            tbPwd: '3$ABC$:// CZ3148',
            success: true,
          },
        ],
      }),
    );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    const result = await adapter.convert({
      content: 'https://item.taobao.com/item.htm?id=1',
      credentials: { token: 'token-value' },
    });

    expect(result.entries[0].link).toBeNull();
    expect(result.entries[0].password).toBe('3$ABC$:// CZ3148');
    expect(result.promotionText).toBe('3$ABC$:// CZ3148');
  });

  it('rejects more than the per-request item limit', async () => {
    const adapter = new YouzaiAssistantAffiliateAdapter();
    const content = Array.from({ length: 51 }, (_, i) => `链接${i}`).join('\n');

    await expect(
      adapter.convert({ content, credentials: { token: 'token-value' } }),
    ).rejects.toThrow('一次最多转换 50 条');
  });

  it('verifies an Authorization through /user/get', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 200,
        msg: 'success',
        data: { userId: '2099309414589894656', nickName: '测试账号' },
      }),
    );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    const result = await adapter.verifyToken('valid-token');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://appletsvr.52youzai.com/user/get');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'valid-token',
    );
    expect(result).toMatchObject({ valid: true, account: '测试账号' });
  });

  it('reports an expired Authorization as invalid', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ code: 401, msg: '未认证: 令牌已过期' }),
      );
    const adapter = new YouzaiAssistantAffiliateAdapter();

    const result = await adapter.verifyToken('expired-token');

    expect(result.valid).toBe(false);
    expect(result.message).toContain('令牌已过期');
  });
});
