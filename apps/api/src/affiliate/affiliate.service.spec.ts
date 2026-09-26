import type { ConfigService } from '@nestjs/config';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
} from '../security/sensitive-value';
import { LihuaXiongAffiliateAdapter } from './adapters/lihuaxiong.adapter';
import { YouzaiAssistantAffiliateAdapter } from './adapters/youzai.adapter';
import { AffiliateService } from './affiliate.service';

describe('AffiliateService', () => {
  const admin: AuthenticatedAdmin = {
    id: 'admin-id',
    username: 'admin',
    displayName: '管理员',
  };
  const encryptionKey = 'affiliate-test-encryption-key';
  const config = {
    getOrThrow: jest.fn(() => encryptionKey),
  } as unknown as ConfigService;
  const adapter = new LihuaXiongAffiliateAdapter();
  const youzaiAdapter = new YouzaiAssistantAffiliateAdapter();

  it('returns the third-party and official provider framework in fixed order', async () => {
    const prisma = {
      affiliatePlatform: { findMany: jest.fn(async () => []) },
    } as unknown as PrismaService;
    const service = new AffiliateService(
      prisma,
      config,
      adapter,
      youzaiAdapter,
    );

    const result = await service.list();

    expect(result.items.map((item) => item.code)).toEqual([
      'third_party_aggregator',
      'youzai_assistant',
      'taobao_union',
      'jingfen',
      'weixiangke',
    ]);
    expect(result.items[0]).toMatchObject({
      providerType: 'THIRD_PARTY',
      enabled: false,
      device: 'pcweb',
    });
    expect(result.items[0].supportedPlatforms.map((item) => item.name)).toEqual(
      [
        '淘宝',
        '京东',
        '唯品会',
        '拼多多',
        '抖音',
        '快手',
        '美团',
        '闪购',
        '团购',
      ],
    );
    expect(result.items[1].supportedPlatforms).toEqual([
      { code: 'douyin', name: '抖音' },
      { code: 'jd', name: '京东' },
      { code: 'pdd', name: '拼多多' },
    ]);
    expect(result.items[2].supportedPlatforms).toEqual([
      { code: 'taobao', name: '淘宝' },
    ]);
    expect(result.items[3].supportedPlatforms).toEqual([
      { code: 'jd', name: '京东' },
    ]);
    expect(result.items[4].supportedPlatforms).toEqual([
      { code: 'vipshop', name: '唯品会' },
    ]);
  });

  it('encrypts credentials and never returns or audits their plaintext', async () => {
    let encryptedCredentials = '';
    const platform = {
      id: 'affiliate-platform-id',
      code: 'taobao_union',
      name: '淘宝联盟',
      enabled: true,
      config: {
        schemaVersion: 1,
        providerType: 'OFFICIAL',
        supportedPlatformCodes: ['taobao'],
        apiBaseUrl: 'https://api.example.test',
        notes: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const account = {
      id: 'affiliate-account-id',
      affiliatePlatformId: platform.id,
      name: '主账号',
      enabled: true,
      tokenExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      credentialsEncrypted: '',
    };
    const accountCreate = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => {
        encryptedCredentials = String(data.credentialsEncrypted);
        account.credentialsEncrypted = encryptedCredentials;
        return { ...account, ...data };
      },
    );
    const auditCreate = jest.fn(async (_args: unknown) => ({}));
    const transaction = {
      affiliatePlatform: { upsert: jest.fn(async () => platform) },
      affiliateAccount: { create: accountCreate, update: jest.fn() },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      affiliatePlatform: {
        findUnique: jest.fn(async () => null),
        findUniqueOrThrow: jest.fn(async () => ({
          ...platform,
          accounts: [account],
        })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new AffiliateService(
      prisma,
      config,
      adapter,
      youzaiAdapter,
    );

    const result = await service.update(
      'taobao_union',
      {
        enabled: true,
        accountName: '主账号',
        apiBaseUrl: 'https://api.example.test',
        credentials: {
          apiKey: 'plain-app-key',
          apiSecret: 'plain-app-secret',
          promotionId: 'pid-1001',
        },
      },
      admin,
    );

    expect(encryptedCredentials).not.toContain('plain-app-secret');
    expect(
      JSON.parse(decryptSensitiveValue(encryptedCredentials, encryptionKey)),
    ).toEqual({
      apiKey: 'plain-app-key',
      apiSecret: 'plain-app-secret',
      promotionId: 'pid-1001',
    });
    expect(result).not.toHaveProperty('credentials');
    expect(result.configuredCredentialFields).toEqual([
      'apiKey',
      'apiSecret',
      'promotionId',
    ]);
    const auditPayload = JSON.stringify(auditCreate.mock.calls[0][0]);
    expect(auditPayload).not.toContain('plain-app-key');
    expect(auditPayload).not.toContain('plain-app-secret');
  });

  it('keeps an existing secret when the replacement input is blank', async () => {
    const originalEncrypted = encryptSensitiveValue(
      JSON.stringify({ apiKey: 'existing-key', apiSecret: 'existing-secret' }),
      encryptionKey,
    );
    let updatedEncrypted = originalEncrypted;
    const platform = {
      id: 'affiliate-platform-id',
      code: 'jingfen',
      name: '京粉',
      enabled: false,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const account = {
      id: 'affiliate-account-id',
      affiliatePlatformId: platform.id,
      name: '京粉默认接口',
      enabled: false,
      tokenExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      credentialsEncrypted: originalEncrypted,
    };
    const accountUpdate = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => {
        updatedEncrypted = String(data.credentialsEncrypted);
        account.credentialsEncrypted = updatedEncrypted;
        return { ...account, ...data };
      },
    );
    const transaction = {
      affiliatePlatform: {
        upsert: jest.fn(async () => ({ ...platform, enabled: true })),
      },
      affiliateAccount: { create: jest.fn(), update: accountUpdate },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      affiliatePlatform: {
        findUnique: jest.fn(async () => ({ ...platform, accounts: [account] })),
        findUniqueOrThrow: jest.fn(async () => ({
          ...platform,
          enabled: true,
          accounts: [account],
        })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new AffiliateService(
      prisma,
      config,
      adapter,
      youzaiAdapter,
    );

    await service.update(
      'jingfen',
      { enabled: true, credentials: { apiKey: '   ' } },
      admin,
    );

    expect(
      JSON.parse(decryptSensitiveValue(updatedEncrypted, encryptionKey)),
    ).toEqual({ apiKey: 'existing-key', apiSecret: 'existing-secret' });
  });

  it('parses an online Authorization endpoint response and only returns the token', async () => {
    const auditCreate = jest.fn(async (_args: unknown) => ({}));
    const prisma = {
      affiliatePlatform: {
        findUnique: jest.fn(async () => ({
          id: 'affiliate-platform-id',
          config: {
            schemaVersion: 1,
            providerType: 'THIRD_PARTY',
            supportedPlatformCodes: ['douyin'],
            apiBaseUrl: null,
            tokenEndpoint: null,
            device: null,
            notes: null,
          },
        })),
      },
      auditLog: { create: auditCreate },
    } as unknown as PrismaService;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ code: 0, data: { token: 'online-token-1234' } }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const service = new AffiliateService(
      prisma,
      config,
      adapter,
      youzaiAdapter,
    );

    const result = await service.refreshAuthorization(
      'youzai_assistant',
      { endpoint: 'https://token.example.test/api/token' },
      admin,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://token.example.test/api/token',
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
    expect(result.authorization).toBe('online-token-1234');
    const auditPayload = JSON.stringify(auditCreate.mock.calls[0][0]);
    expect(auditPayload).not.toContain('online-token-1234');
  });

  it('rejects an internal network Authorization endpoint', async () => {
    const prisma = {
      affiliatePlatform: { findUnique: jest.fn(async () => null) },
      auditLog: { create: jest.fn() },
    } as unknown as PrismaService;
    const service = new AffiliateService(
      prisma,
      config,
      adapter,
      youzaiAdapter,
    );

    await expect(
      service.refreshAuthorization(
        'youzai_assistant',
        { endpoint: 'http://192.168.1.10:8080/token' },
        admin,
      ),
    ).rejects.toThrow('不能指向本机或内网地址');
  });

  it('converts through the Youzai adapter and saves conversion history', async () => {
    const credentialsEncrypted = encryptSensitiveValue(
      JSON.stringify({ accessToken: 'youzai-token' }),
      encryptionKey,
    );
    const platform = {
      id: 'youzai-platform-id',
      code: 'youzai_assistant',
      name: '有赞助手聚合返利接口',
      enabled: true,
      config: {
        schemaVersion: 1,
        providerType: 'THIRD_PARTY',
        supportedPlatformCodes: ['douyin', 'jd', 'pdd'],
        apiBaseUrl: null,
        tokenEndpoint: null,
        device: null,
        notes: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      accounts: [
        {
          id: 'youzai-account-id',
          affiliatePlatformId: 'youzai-platform-id',
          name: '默认账号',
          enabled: true,
          credentialsEncrypted,
          tokenExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    const conversion = {
      id: 'youzai-conversion-id',
      affiliatePlatformId: platform.id,
      promotionChannelId: null,
      originalUrl: 'https://v.douyin.com/abc/',
      normalizedUrl: 'https://v.douyin.com/abc/',
      productExternalId: '3832635966917575063',
      promotionUrl: 'https://v.buydouke.com/abc/',
      shortUrl: null,
      promotionText: 'https://v.buydouke.com/abc/',
      source: 'ADMIN_WEB',
      status: 'SUCCESS',
      errorMessage: null,
      expiresAt: null,
      createdAt: new Date(),
    };
    const conversionCreate = jest.fn(async () => conversion);
    const transaction = {
      affiliateLinkConversion: { create: conversionCreate },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      affiliatePlatform: { findUnique: jest.fn(async () => platform) },
      affiliateLinkConversion: { create: jest.fn() },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const convert = jest.fn(async () => ({
      normalizedUrl: 'https://v.douyin.com/abc/',
      productExternalId: '3832635966917575063',
      promotionUrl: 'https://v.buydouke.com/abc/',
      shortUrl: null,
      promotionText: 'https://v.buydouke.com/abc/',
      outputText: 'https://v.buydouke.com/abc/',
      providerCode: 200,
      providerMessage: 'success',
      rawData: { code: 200 },
    }));
    const youzaiAdapterMock = {
      convert,
    } as unknown as YouzaiAssistantAffiliateAdapter;
    const service = new AffiliateService(
      prisma,
      config,
      adapter,
      youzaiAdapterMock,
    );

    const result = await service.convert(
      'youzai_assistant',
      { content: 'https://v.douyin.com/abc/' },
      admin,
    );

    expect(convert).toHaveBeenCalledWith({
      content: 'https://v.douyin.com/abc/',
      apiBaseUrl: 'https://appletsvr.52youzai.com',
      credentials: { token: 'youzai-token' },
    });
    expect(result).toMatchObject({
      platformCode: 'youzai_assistant',
      promotionUrl: 'https://v.buydouke.com/abc/',
      status: 'SUCCESS',
    });
  });

  it('converts through the LihuaXiong adapter and saves conversion history', async () => {
    const credentialsEncrypted = encryptSensitiveValue(
      JSON.stringify({
        apiKey: 'bb21f9',
        apiSecret: 'signature-salt',
        accessToken: 'current-token',
      }),
      encryptionKey,
    );
    const platform = {
      id: 'affiliate-platform-id',
      code: 'third_party_aggregator',
      name: '梨花熊聚合返利接口',
      enabled: true,
      config: {
        schemaVersion: 1,
        providerType: 'THIRD_PARTY',
        supportedPlatformCodes: ['taobao', 'jd'],
        apiBaseUrl: 'https://bb21f9.xapi2159.dhcc.wang/api/goods/linkConvert',
        device: 'web',
        notes: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      accounts: [
        {
          id: 'affiliate-account-id',
          affiliatePlatformId: 'affiliate-platform-id',
          name: '默认账号',
          enabled: true,
          credentialsEncrypted,
          tokenExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    const conversion = {
      id: 'conversion-id',
      affiliatePlatformId: platform.id,
      promotionChannelId: null,
      originalUrl: 'https://item.example/1001',
      normalizedUrl: 'https://item.example/1001',
      productExternalId: '1001',
      promotionUrl: 'https://promo.example/1001',
      shortUrl: 'https://s.example/1001',
      promotionText: '返利文案 https://promo.example/1001',
      source: 'ADMIN_WEB',
      status: 'SUCCESS',
      errorMessage: null,
      expiresAt: null,
      createdAt: new Date(),
    };
    const conversionCreate = jest.fn(async () => conversion);
    const auditCreate = jest.fn(async () => ({}));
    const transaction = {
      affiliateLinkConversion: { create: conversionCreate },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      affiliatePlatform: { findUnique: jest.fn(async () => platform) },
      affiliateLinkConversion: { create: jest.fn() },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const convert = jest.fn(async () => ({
      normalizedUrl: 'https://item.example/1001',
      productExternalId: '1001',
      promotionUrl: 'https://promo.example/1001',
      shortUrl: 'https://s.example/1001',
      promotionText: '返利文案 https://promo.example/1001',
      outputText: '返利文案 https://promo.example/1001',
      providerCode: 1,
      providerMessage: '转换成功',
      rawData: { content: '返利文案 https://promo.example/1001' },
    }));
    const conversionAdapter = {
      convert,
    } as unknown as LihuaXiongAffiliateAdapter;
    const service = new AffiliateService(
      prisma,
      config,
      conversionAdapter,
      youzaiAdapter,
    );

    const result = await service.convert(
      'third_party_aggregator',
      { content: 'https://item.example/1001' },
      admin,
    );

    expect(convert).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'https://item.example/1001',
        credentials: {
          xid: 'bb21f9',
          signatureSalt: 'signature-salt',
          token: 'current-token',
          device: 'web',
        },
      }),
    );
    expect(conversionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        affiliatePlatformId: platform.id,
        status: 'SUCCESS',
        promotionUrl: 'https://promo.example/1001',
      }),
    });
    expect(auditCreate).toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'conversion-id',
      platformName: '梨花熊聚合返利接口',
      outputText: '返利文案 https://promo.example/1001',
    });
  });

  it('returns paginated conversion history in newest-first order', async () => {
    const createdAt = new Date('2026-08-15T08:00:00.000Z');
    const findMany = jest.fn(async () => [
      {
        id: 'conversion-id',
        affiliatePlatformId: 'affiliate-platform-id',
        promotionChannelId: null,
        originalUrl: 'https://item.example/1001',
        normalizedUrl: 'https://item.example/1001',
        productExternalId: '1001',
        promotionUrl: 'https://promo.example/1001',
        shortUrl: 'https://s.example/1001',
        promotionText: '返利文案 https://promo.example/1001',
        source: 'ADMIN_WEB',
        status: 'SUCCESS',
        errorMessage: null,
        expiresAt: null,
        createdAt,
      },
    ]);
    const prisma = {
      affiliatePlatform: {
        findUnique: jest.fn(async () => ({ id: 'affiliate-platform-id' })),
      },
      affiliateLinkConversion: {
        findMany,
        count: jest.fn(async () => 21),
      },
    } as unknown as PrismaService;
    const service = new AffiliateService(
      prisma,
      config,
      adapter,
      youzaiAdapter,
    );

    const result = await service.listConversions('third_party_aggregator', {
      page: 2,
      pageSize: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
    expect(result.items[0]).toMatchObject({
      id: 'conversion-id',
      originalText: 'https://item.example/1001',
      outputText: '返利文案 https://promo.example/1001',
    });
  });

  it('deletes one conversion history record and writes an audit log', async () => {
    const conversion = {
      id: 'conversion-id',
      affiliatePlatformId: 'affiliate-platform-id',
      promotionChannelId: null,
      originalUrl: 'https://item.example/1001',
      normalizedUrl: 'https://item.example/1001',
      productExternalId: '1001',
      promotionUrl: 'https://promo.example/1001',
      shortUrl: 'https://s.example/1001',
      promotionText: '返利文案',
      source: 'ADMIN_WEB',
      status: 'SUCCESS',
      errorMessage: null,
      expiresAt: null,
      createdAt: new Date(),
    };
    const deleteRecord = jest.fn(async () => conversion);
    const auditCreate = jest.fn(async () => ({}));
    const transaction = {
      affiliateLinkConversion: { delete: deleteRecord },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      affiliatePlatform: {
        findUnique: jest.fn(async () => ({ id: 'affiliate-platform-id' })),
      },
      affiliateLinkConversion: {
        findFirst: jest.fn(async () => conversion),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new AffiliateService(
      prisma,
      config,
      adapter,
      youzaiAdapter,
    );

    await service.deleteConversion(
      'third_party_aggregator',
      'conversion-id',
      admin,
    );

    expect(deleteRecord).toHaveBeenCalledWith({
      where: { id: 'conversion-id' },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DELETE',
        entityId: 'conversion-id',
      }),
    });
  });

  it('clears all conversion history for the selected platform only', async () => {
    const deleteMany = jest.fn(async () => ({ count: 6 }));
    const auditCreate = jest.fn(async () => ({}));
    const transaction = {
      affiliateLinkConversion: { deleteMany },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      affiliatePlatform: {
        findUnique: jest.fn(async () => ({ id: 'affiliate-platform-id' })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new AffiliateService(
      prisma,
      config,
      adapter,
      youzaiAdapter,
    );

    const result = await service.clearConversions(
      'third_party_aggregator',
      admin,
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: { affiliatePlatformId: 'affiliate-platform-id' },
    });
    expect(result).toEqual({ success: true, deletedCount: 6 });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CLEAR',
        beforeData: expect.objectContaining({ deletedCount: 6 }),
      }),
    });
  });
});
