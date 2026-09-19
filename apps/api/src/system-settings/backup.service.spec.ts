import type { ConfigService } from '@nestjs/config';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { BackupService } from './backup.service';

const MODEL_NAMES = [
  'adminUser',
  'systemSetting',
  'logisticsSetting',
  'platform',
  'submitter',
  'category',
  'orderScheme',
  'shareForm',
  'customer',
  'profitRule',
  'payoutRegistrationForm',
  'externalIdentity',
  'customFieldDefinition',
  'affiliatePlatform',
  'adminSession',
  'payoutMethod',
  'order',
  'shipment',
  'receipt',
  'payout',
  'externalIdentitySession',
  'shipmentOrder',
  'receiptAllocation',
  'payoutAllocation',
  'orderCustomFieldValue',
  'affiliateAccount',
  'affiliatePromotionChannel',
  'affiliateLinkConversion',
  'affiliateOrder',
  'auditLog',
] as const;

type DelegateMock = {
  findMany: jest.Mock;
  createMany: jest.Mock;
  upsert: jest.Mock;
  updateMany: jest.Mock;
  create: jest.Mock;
  findUnique: jest.Mock;
};

const createPrismaMock = () => {
  const delegates = Object.fromEntries(
    MODEL_NAMES.map((name) => [
      name,
      {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ count: data.length }),
          ),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      } satisfies DelegateMock,
    ]),
  ) as Record<(typeof MODEL_NAMES)[number], DelegateMock>;
  const executeRaw = jest.fn().mockResolvedValue(0);
  const prisma: Record<string, unknown> = {
    ...delegates,
    $executeRawUnsafe: executeRaw,
  };
  prisma.$transaction = jest.fn(
    async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback(prisma),
  );
  return { prisma, delegates, executeRaw };
};

const configMock = {
  getOrThrow: jest.fn((key: string) => {
    if (key === 'DATA_ENCRYPTION_KEY') return 'backup-service-test-key';
    throw new Error('Missing config: ' + key);
  }),
} as unknown as ConfigService;

const admin = {
  id: '10000000-0000-0000-0000-000000000001',
  username: 'admin',
  displayName: '管理员',
} as AuthenticatedAdmin;

describe('BackupService selective backup', () => {
  it('exports order data with required references as a selective backup', async () => {
    const { prisma, delegates } = createPrismaMock();
    delegates.platform.findMany.mockResolvedValue([
      { id: '20000000-0000-0000-0000-000000000001', code: 'JD', name: '京东' },
    ]);
    delegates.order.findMany.mockResolvedValue([
      {
        id: '30000000-0000-0000-0000-000000000001',
        serialNo: 1,
        platformId: '20000000-0000-0000-0000-000000000001',
      },
    ]);
    const service = new BackupService(
      prisma as unknown as PrismaService,
      configMock,
    );

    const exported = await service.exportBackup(['orders']);
    const inspected = await service.inspect(exported.buffer.toString('base64'));

    expect(exported.scope).toBe('SELECTIVE');
    expect(inspected.scope).toBe('SELECTIVE');
    expect(inspected.categories).toEqual(['orders']);
    expect(inspected.categoryLabels).toEqual(['订单列表']);
    expect(inspected.primaryRecordCount).toBe(1);
    expect(inspected.dependencyRecordCount).toBe(1);
    expect(inspected.tables.some((table) => table.model === 'order')).toBe(
      true,
    );
    expect(
      inspected.tables.find((table) => table.model === 'platform')?.dependency,
    ).toBe(true);
    expect(delegates.systemSetting.findMany).not.toHaveBeenCalled();
    expect(delegates.logisticsSetting.findMany).not.toHaveBeenCalled();
  });

  it('merges selected data without truncating or touching unselected modules', async () => {
    const { prisma, delegates, executeRaw } = createPrismaMock();
    delegates.order.findMany.mockResolvedValue([
      {
        id: '30000000-0000-0000-0000-000000000001',
        serialNo: 1,
        platformId: '20000000-0000-0000-0000-000000000001',
      },
    ]);
    delegates.adminUser.findUnique.mockResolvedValue({ id: admin.id });
    const service = new BackupService(
      prisma as unknown as PrismaService,
      configMock,
    );
    jest
      .spyOn(
        service as unknown as { assertAdminPassword: () => Promise<void> },
        'assertAdminPassword',
      )
      .mockResolvedValue();
    const exported = await service.exportBackup(['orders']);

    const result = await service.restore(
      exported.buffer.toString('base64'),
      'password',
      'RESTORE',
      admin,
    );

    expect(result.scope).toBe('SELECTIVE');
    expect(result.requiresRelogin).toBe(false);
    expect(executeRaw).not.toHaveBeenCalled();
    expect(delegates.order.upsert).toHaveBeenCalledTimes(1);
    expect(delegates.systemSetting.upsert).not.toHaveBeenCalled();
    expect(delegates.logisticsSetting.upsert).not.toHaveBeenCalled();
    expect(delegates.adminSession.updateMany).not.toHaveBeenCalled();
  });

  it('continues to inspect version 1 full backups', async () => {
    const { prisma } = createPrismaMock();
    const service = new BackupService(
      prisma as unknown as PrismaService,
      configMock,
    );
    const current = await service.exportBackup();
    const internals = service as unknown as {
      decrypt: (value: Buffer) => Buffer;
      encrypt: (value: Buffer) => Buffer;
    };
    const payload = JSON.parse(
      gunzipSync(internals.decrypt(current)).toString('utf8'),
    ) as Record<string, unknown>;
    payload.version = 1;
    delete payload.scope;
    delete payload.categories;
    delete payload.primaryModels;
    delete payload.dependencyModels;
    const legacy = internals.encrypt(
      gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')),
    );

    const inspected = await service.inspect(legacy.toString('base64'));

    expect(inspected.version).toBe(1);
    expect(inspected.scope).toBe('FULL');
    expect(inspected.requiresRelogin).toBe(true);
    expect(inspected.tables).toHaveLength(MODEL_NAMES.length);
  });
});
