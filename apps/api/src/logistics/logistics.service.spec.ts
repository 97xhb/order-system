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
    endpoint: 'https://v1.apizero.cn/api/express',
    requestType: 'GET',
    autoDetectType: 'AUTO',
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    ...settingOverrides,
  };
  const prisma = {
    logisticsSetting: {
      upsert: jest.fn().mockResolvedValue(settings),
    },
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

    const result = await service.test('YT7460266600081', '圆通', '1234');

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
    expect(url.origin + url.pathname).toBe('https://v1.apizero.cn/api/express');
    expect(url.searchParams.get('number')).toBe('YT7460266600081');
    expect(url.searchParams.get('com')).toBe('yto');
    expect(url.searchParams.get('phone')).toBe('1234');
    expect(requestInit?.headers).toMatchObject({
      authorization: `Bearer ${apiKey}`,
    });
  });

  it('supports anonymous automatic detection without com and phone', async () => {
    const { service } = createService();
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
    expect(requestInit?.headers).not.toHaveProperty('authorization');
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
      service.test('YT7460266600081', undefined, '12ab'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects queries when the integration is disabled', async () => {
    const { service } = createService({ enabled: false });
    await expect(service.test('YT7460266600081')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('maps non-zero ApiZero responses to a gateway error', async () => {
    const { service } = createService();
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
