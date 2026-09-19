import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encryptSensitiveValue } from '../security/sensitive-value';
import { LogisticsService } from './logistics.service';

const encryptionKey = 'logistics-test-encryption-key-with-enough-entropy';

function createService(
  settingOverrides: Partial<{
    enabled: boolean;
    appKeyEncrypted: string | null;
  }> = {},
) {
  const settings = {
    id: 'default',
    provider: 'APIZERO',
    enabled: true,
    businessId: null,
    appKeyEncrypted: null,
    endpoint: 'https://v1.apizero.cn/api/express-pro',
    requestType: 'GET',
    autoDetectType: 'AUTO',
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    ...settingOverrides,
  };
  const prisma = {
    logisticsSetting: {
      upsert: jest.fn().mockResolvedValue(settings),
    },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        logisticsSetting: {
          upsert: jest.fn(
            async ({
              create,
              update,
            }: {
              create: Record<string, unknown>;
              update: Record<string, unknown>;
            }) =>
              Object.assign({}, settings, create, update, {
                updatedAt: new Date(),
              }),
          ),
        },
        auditLog: { create: jest.fn() },
      }),
    ),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'DATA_ENCRYPTION_KEY') return encryptionKey;
      throw new Error(`Unexpected config key: ${key}`);
    }),
  };
  return {
    service: new LogisticsService(
      prisma as never,
      config as unknown as ConfigService,
    ),
    prisma,
  };
}

describe('LogisticsService ApiZero adapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses Bearer authentication and normalizes ApiZero traces', async () => {
    const apiKey = 'sk_test_logistics_123456789';
    const { service } = createService({
      appKeyEncrypted: encryptSensitiveValue(apiKey, encryptionKey),
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          msg: '成功',
          data: {
            number: 'YT7460266600081',
            com: 'yto',
            com_name: '圆通快递',
            status: 'TRANSIT',
            status_desc: '运输中',
            traces: [
              {
                time: '2026-08-19 10:00:00',
                content: '快件已到达福州转运中心',
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    // com 不传，由 PRO 接口按单号自动识别快递公司。
    const result = await service.test('YT7460266600081', '1234');

    expect(result).toMatchObject({
      success: true,
      trackingNo: 'YT7460266600081',
      carrierCode: 'yto',
      carrierName: '圆通快递',
      state: 'TRANSIT',
      stateText: '运输中',
    });
    expect(result.traces[0]).toMatchObject({
      time: '2026-08-19 10:00:00',
      station: '快件已到达福州转运中心',
    });
    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    const url = new URL(String(requestUrl));
    expect(url.origin + url.pathname).toBe(
      'https://v1.apizero.cn/api/express-pro',
    );
    expect(url.searchParams.get('number')).toBe('YT7460266600081');
    expect(url.searchParams.has('com')).toBe(false);
    expect(url.searchParams.get('phone')).toBe('1234');
    expect(requestInit?.headers).toMatchObject({
      authorization: `Bearer ${apiKey}`,
    });
  });

  it('PRO 接口没有匿名额度，缺少 API Key 时提示先配置', async () => {
    const { service } = createService();
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(service.test('YT7460266600081')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('自动识别时不带 com 和 phone，只带 number', async () => {
    const apiKey = 'sk_test_logistics_123456789';
    const { service } = createService({
      appKeyEncrypted: encryptSensitiveValue(apiKey, encryptionKey),
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          msg: '成功',
          data: {
            number: 'YT7460266600081',
            com: 'yto',
            com_name: '圆通快递',
            status: 'EMPTY',
            status_desc: '查询结果为空，未查到物流轨迹信息',
            traces: [],
          },
        }),
        { status: 200 },
      ),
    );

    const result = await service.test('YT7460266600081');

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    const url = new URL(String(requestUrl));
    expect(url.searchParams.has('com')).toBe(false);
    expect(url.searchParams.has('phone')).toBe(false);
    expect(requestInit?.headers).toMatchObject({
      authorization: `Bearer ${apiKey}`,
    });
    expect(result.stateText).toBe('暂无轨迹');
    expect(result.reason).toBe('查询结果为空，未查到物流轨迹信息');
  });

  it('validates the tracking number and phone suffix before requesting', async () => {
    const { service } = createService();
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(service.test('123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.test('YT7460266600081', '12ab'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('从运单号里拆出手机尾号后分开提交', async () => {
    const { service } = createService({
      appKeyEncrypted: encryptSensitiveValue(
        'sk_test_logistics_123456789',
        encryptionKey,
      ),
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: { number: 'SF5137788186075', com: 'sf', traces: [] },
        }),
        { status: 200 },
      ),
    );

    await service.test('SF5137788186075-1429');

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('number')).toBe('SF5137788186075');
    expect(url.searchParams.get('phone')).toBe('1429');
  });

  it('只在末尾是四位数字时才视为手机尾号', () => {
    const { service } = createService();
    const parser = service as unknown as {
      splitTrackingNo: (value: string) => {
        trackingNo: string;
        phoneSuffix: string | null;
      };
    };

    expect(parser.splitTrackingNo('SF5137788186075-1429')).toEqual({
      trackingNo: 'SF5137788186075',
      phoneSuffix: '1429',
    });
    expect(parser.splitTrackingNo('SF5137788186075')).toEqual({
      trackingNo: 'SF5137788186075',
      phoneSuffix: null,
    });
    expect(parser.splitTrackingNo('YT1234567890-2026-0012')).toEqual({
      trackingNo: 'YT1234567890-2026',
      phoneSuffix: '0012',
    });
  });

  it('rejects queries when the integration is disabled', async () => {
    const { service } = createService({ enabled: false });
    await expect(service.test('YT7460266600081')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('保存接口地址并回读，数据库不再使用固定地址', async () => {
    const { service } = createService();
    const admin = { id: 'admin-1' } as never;

    const result = await service.updateSettings(
      {
        enabled: true,
        endpoint: 'https://v1.apizero.cn/api/express-pro?from=panel',
      },
      admin,
      {},
    );

    expect(result.endpoint).toBe(
      'https://v1.apizero.cn/api/express-pro?from=panel',
    );
  });

  it('拒绝非法接口地址', async () => {
    const { service } = createService();
    const admin = { id: 'admin-1' } as never;

    await expect(
      service.updateSettings(
        { enabled: true, endpoint: 'ftp://example.com/api' },
        admin,
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateSettings(
        { enabled: true, endpoint: 'not-a-url' },
        admin,
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateSettings(
        { enabled: true, endpoint: 'https://user:pass@example.com/api' },
        admin,
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps non-zero ApiZero responses to a gateway error', async () => {
    const { service } = createService({
      appKeyEncrypted: encryptSensitiveValue(
        'sk_test_logistics_123456789',
        encryptionKey,
      ),
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 40101, msg: 'API Key 无效' }), {
        status: 200,
      }),
    );

    await expect(service.test('YT7460266600081')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
