import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  ExternalIdentityStatus,
  PayoutMethodStatus,
  PayoutMethodType,
  SettlementStatus,
  SubmitterStatus,
} from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import type { ResolvedPublicIdentity } from '../public-forms/public-identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import { encryptSensitiveValue } from '../security/sensitive-value';
import { PayoutRegistrationService } from './payout-registration.service';

describe('PayoutRegistrationService', () => {
  const admin: AuthenticatedAdmin = {
    id: 'admin-id',
    username: 'admin',
    displayName: '管理员',
  };
  const identity: ResolvedPublicIdentity = {
    id: 'identity-id',
    displayCode: 'WX-TEST01',
    submitterId: null,
  };
  const config = {
    getOrThrow: jest.fn(() => 'payout-registration-test-key'),
  } as unknown as ConfigService;

  it('returns one fixed public link for the admin', async () => {
    const prisma = {
      payoutRegistrationForm: {
        upsert: jest.fn(async () => ({
          id: '00000000-0000-0000-0000-000000000001',
          publicToken: 'fixed-token',
          enabled: true,
          lookupPublicToken: 'lookup-token',
          lookupEnabled: true,
          updatedAt: new Date('2026-08-15T00:00:00.000Z'),
        })),
      },
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(service.getAdminForm()).resolves.toMatchObject({
      publicToken: 'fixed-token',
      path: '/payout/fixed-token',
      enabled: true,
    });
  });

  it('returns an independent fixed order lookup link for the admin', async () => {
    const prisma = {
      payoutRegistrationForm: {
        upsert: jest.fn(async () => ({
          id: '00000000-0000-0000-0000-000000000001',
          publicToken: 'fixed-token',
          enabled: false,
          lookupPublicToken: 'lookup-token',
          lookupEnabled: true,
          updatedAt: new Date('2026-08-15T00:00:00.000Z'),
        })),
      },
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(service.getAdminLookupForm()).resolves.toMatchObject({
      publicToken: 'lookup-token',
      path: '/order-query/lookup-token',
      enabled: true,
    });
  });

  it('blocks the public link while filling permission is disabled', async () => {
    const prisma = {
      payoutRegistrationForm: {
        findUnique: jest.fn(async () => ({
          id: 'form-id',
          publicToken: 'fixed-token',
          enabled: false,
        })),
      },
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(service.ensureAvailable('fixed-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('marks the public registration link as locked after confirmation', async () => {
    const prisma = {
      payoutRegistrationForm: {
        findUnique: jest.fn(async () => ({
          id: 'form-id',
          publicToken: 'fixed-token',
          enabled: true,
        })),
      },
      externalIdentity: {
        findUnique: jest.fn(async () => ({
          id: identity.id,
          submitterId: 'submitter-id',
          submitter: {
            code: 'WX-OWNER01',
            name: '测试昵称',
            nickname: '测试昵称',
          },
        })),
      },
      payoutMethod: {
        findFirst: jest.fn(async () => ({ id: 'confirmed-method' })),
      },
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(
      service.describe('fixed-token', identity),
    ).resolves.toMatchObject({
      linked: true,
      locked: true,
    });
  });

  it('updates filling permission and writes an audit log', async () => {
    const auditCreate = jest.fn(async () => ({}));
    const update = jest.fn(async () => ({
      id: '00000000-0000-0000-0000-000000000001',
      publicToken: 'fixed-token',
      enabled: false,
      updatedAt: new Date('2026-08-15T01:00:00.000Z'),
    }));
    const transaction = {
      payoutRegistrationForm: { update },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      payoutRegistrationForm: {
        upsert: jest.fn(async () => ({
          id: '00000000-0000-0000-0000-000000000001',
          publicToken: 'fixed-token',
          enabled: true,
          updatedAt: new Date('2026-08-15T00:00:00.000Z'),
        })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(service.updateEnabled(false, admin)).resolves.toMatchObject({
      enabled: false,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      data: { enabled: false },
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PAYOUT_REGISTRATION_FORM_DISABLED',
          beforeData: { enabled: true },
          afterData: { enabled: false },
        }),
      }),
    );
  });

  it('updates lookup permission without changing filling permission', async () => {
    const auditCreate = jest.fn(async () => ({}));
    const update = jest.fn(async () => ({
      id: '00000000-0000-0000-0000-000000000001',
      publicToken: 'fixed-token',
      enabled: false,
      lookupPublicToken: 'lookup-token',
      lookupEnabled: false,
      updatedAt: new Date('2026-08-15T01:00:00.000Z'),
    }));
    const transaction = {
      payoutRegistrationForm: { update },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      payoutRegistrationForm: {
        upsert: jest.fn(async () => ({
          id: '00000000-0000-0000-0000-000000000001',
          publicToken: 'fixed-token',
          enabled: false,
          lookupPublicToken: 'lookup-token',
          lookupEnabled: true,
          updatedAt: new Date('2026-08-15T00:00:00.000Z'),
        })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(
      service.updateLookupEnabled(false, admin),
    ).resolves.toMatchObject({
      publicToken: 'lookup-token',
      enabled: false,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      data: { lookupEnabled: false },
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PAYOUT_LOOKUP_DISABLED',
          beforeData: { lookupEnabled: true },
          afterData: { lookupEnabled: false },
        }),
      }),
    );
  });

  it('blocks order lookup while lookup permission is disabled', async () => {
    const prisma = {
      payoutRegistrationForm: {
        findUnique: jest.fn(async () => ({
          id: 'form-id',
          publicToken: 'fixed-token',
          enabled: true,
          lookupPublicToken: 'lookup-token',
          lookupEnabled: false,
        })),
      },
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(
      service.lookup(
        'lookup-token',
        identity,
        { identityCode: 'WX-OWNER01', page: 1, pageSize: 20 },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('saves multiple public payout methods as pending confirmation', async () => {
    const methodCreate = jest
      .fn()
      .mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: `method-${String(data.type).toLowerCase()}`,
          ...data,
        }),
      );
    const transaction = {
      externalIdentity: {
        findUnique: jest.fn(async () => ({
          id: identity.id,
          displayCode: identity.displayCode,
          submitterId: null,
          status: ExternalIdentityStatus.ACTIVE,
          submitter: null,
        })),
        update: jest.fn(async () => ({})),
      },
      submitter: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        create: jest.fn(async () => ({
          id: 'submitter-id',
          code: identity.displayCode,
          name: '测试昵称',
          nickname: '测试昵称',
          status: SubmitterStatus.ACTIVE,
        })),
        update: jest.fn(),
      },
      payoutMethod: {
        count: jest.fn(async () => 0),
        findFirst: jest.fn(async () => null),
        create: methodCreate,
        update: jest.fn(),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      payoutRegistrationForm: {
        findUnique: jest.fn(async () => ({
          id: 'form-id',
          publicToken: 'fixed-token',
          enabled: true,
        })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(
      service.submit(
        'fixed-token',
        identity,
        {
          nickname: '测试昵称',
          methods: [
            { type: PayoutMethodType.WECHAT },
            {
              type: PayoutMethodType.ALIPAY,
              accountValue: 'test@example.com',
            },
            {
              type: PayoutMethodType.BANK_CARD,
              accountName: '测试姓名',
              bankName: '测试银行',
              accountValue: '6222021234567890',
            },
          ],
        },
        { ipAddress: '127.0.0.1', userAgent: 'jest' },
      ),
    ).resolves.toMatchObject({
      nickname: '测试昵称',
      submittedCount: 3,
      status: PayoutMethodStatus.PENDING,
    });
    expect(methodCreate).toHaveBeenCalledTimes(3);
    expect(transaction.submitter.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: identity.displayCode }),
    });
    expect(methodCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          type: PayoutMethodType.WECHAT,
          status: PayoutMethodStatus.PENDING,
          accountValueEncrypted: null,
        }),
      }),
    );
    expect(methodCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          type: PayoutMethodType.ALIPAY,
          status: PayoutMethodStatus.PENDING,
          accountValueEncrypted: expect.any(String),
        }),
      }),
    );
  });

  it('rejects public payout changes after an administrator confirms a method', async () => {
    const payoutMethodCreate = jest.fn();
    const payoutMethodUpdate = jest.fn();
    const externalIdentityUpdate = jest.fn();
    const transaction = {
      externalIdentity: {
        findUnique: jest.fn(async () => ({
          id: identity.id,
          displayCode: identity.displayCode,
          submitterId: 'submitter-id',
          status: ExternalIdentityStatus.ACTIVE,
          submitter: {
            id: 'submitter-id',
            code: identity.displayCode,
            name: '测试昵称',
            nickname: '测试昵称',
            status: SubmitterStatus.ACTIVE,
          },
        })),
        update: externalIdentityUpdate,
      },
      submitter: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        update: jest.fn(),
        create: jest.fn(),
      },
      payoutMethod: {
        count: jest.fn(async () => 1),
        findFirst: jest.fn(async () => ({ id: 'confirmed-method' })),
        create: payoutMethodCreate,
        update: payoutMethodUpdate,
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      payoutRegistrationForm: {
        findUnique: jest.fn(async () => ({
          id: 'form-id',
          publicToken: 'fixed-token',
          enabled: true,
        })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(
      service.submit(
        'fixed-token',
        identity,
        {
          nickname: '测试昵称',
          methods: [
            { type: PayoutMethodType.ALIPAY, accountValue: 'new@example.com' },
          ],
        },
        {},
      ),
    ).rejects.toThrow('回款资料已由管理员确认，如需变更请联系管理员');
    expect(payoutMethodCreate).not.toHaveBeenCalled();
    expect(payoutMethodUpdate).not.toHaveBeenCalled();
    expect(externalIdentityUpdate).not.toHaveBeenCalled();
  });

  it('fills an empty submitter code after the public nickname is submitted', async () => {
    const transaction = {
      externalIdentity: {
        findUnique: jest.fn(async () => ({
          id: identity.id,
          displayCode: identity.displayCode,
          submitterId: null,
          status: ExternalIdentityStatus.ACTIVE,
          submitter: null,
        })),
        update: jest.fn(async () => ({})),
      },
      submitter: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => [
          {
            id: 'manual-submitter',
            code: null,
            name: '测试昵称',
            nickname: '测试昵称',
            status: SubmitterStatus.ACTIVE,
            _count: { externalIdentities: 0 },
          },
        ]),
        create: jest.fn(),
        update: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'manual-submitter',
            status: SubmitterStatus.ACTIVE,
            ...data,
          }),
        ),
      },
      payoutMethod: {
        count: jest.fn(async () => 0),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'method-wechat' })),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      payoutRegistrationForm: {
        findUnique: jest.fn(async () => ({
          id: 'form-id',
          publicToken: 'fixed-token',
          enabled: true,
        })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(
      service.submit(
        'fixed-token',
        identity,
        {
          nickname: '测试昵称',
          methods: [{ type: PayoutMethodType.WECHAT }],
        },
        {},
      ),
    ).resolves.toMatchObject({ identityCode: identity.displayCode });
    expect(transaction.submitter.update).toHaveBeenCalledWith({
      where: { id: 'manual-submitter' },
      data: {
        code: identity.displayCode,
        name: '测试昵称',
        nickname: '测试昵称',
      },
    });
  });

  it('rejects a nickname that is already bound to another identity', async () => {
    const transaction = {
      externalIdentity: {
        findUnique: jest.fn(async () => ({
          id: identity.id,
          displayCode: identity.displayCode,
          submitterId: null,
          status: ExternalIdentityStatus.ACTIVE,
          submitter: null,
        })),
        update: jest.fn(async () => ({})),
      },
      submitter: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => [
          {
            id: 'other-submitter',
            code: 'WX-OTHER0001',
            name: '冲突昵称',
            nickname: '冲突昵称',
            status: SubmitterStatus.ACTIVE,
            _count: { externalIdentities: 1 },
          },
        ]),
        create: jest.fn(),
        update: jest.fn(),
      },
      payoutMethod: {
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      payoutRegistrationForm: {
        findUnique: jest.fn(async () => ({
          id: 'form-id',
          publicToken: 'fixed-token',
          enabled: true,
        })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(
      service.submit(
        'fixed-token',
        identity,
        {
          nickname: '冲突昵称',
          methods: [{ type: PayoutMethodType.WECHAT }],
        },
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.submitter.update).not.toHaveBeenCalled();
    expect(transaction.externalIdentity.update).not.toHaveBeenCalled();
    expect(transaction.payoutMethod.create).not.toHaveBeenCalled();
  });

  it('queries masked payout details and read-only order history by submitter code', async () => {
    const externalIdentityUpdate = jest.fn(async () => ({}));
    const auditCreate = jest.fn(async () => ({}));
    const prisma = {
      payoutRegistrationForm: {
        findUnique: jest.fn(async () => ({
          id: 'form-id',
          publicToken: 'fixed-token',
          enabled: false,
          lookupPublicToken: 'lookup-token',
          lookupEnabled: true,
        })),
      },
      submitter: {
        findUnique: jest.fn(async () => ({
          id: 'submitter-id',
          code: 'WX-OWNER01',
          name: '测试昵称',
          nickname: '测试昵称',
          status: SubmitterStatus.ACTIVE,
        })),
      },
      externalIdentity: { update: externalIdentityUpdate },
      auditLog: { create: auditCreate },
      payoutMethod: {
        findMany: jest.fn(async () => [
          {
            id: 'method-bank',
            type: PayoutMethodType.BANK_CARD,
            label: '银行卡转账',
            accountName: '测试姓名',
            accountValueEncrypted: encryptSensitiveValue(
              '6222021234567890',
              'payout-registration-test-key',
            ),
            bankName: '测试银行',
            isDefault: true,
            status: PayoutMethodStatus.ACTIVE,
            updatedAt: new Date('2026-08-15T01:00:00.000Z'),
          },
        ]),
      },
      order: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => [
          {
            orderedAt: new Date('2026-08-14T16:00:00.000Z'),
            productNameSnapshot: '测试商品*1',
            inboundTrackingNo: 'PT123456',
            orderAmount: '100.00',
            submitterSettlementAmount: '88.00',
            submitterSettlementStatus: SettlementStatus.PARTIAL,
            shipmentLink: { shipment: { trackingNo: 'JJ123456' } },
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(
      service.lookup(
        'lookup-token',
        identity,
        { identityCode: 'wx-owner01', page: 1, pageSize: 20 },
        { ipAddress: '127.0.0.1' },
      ),
    ).resolves.toMatchObject({
      identityCode: 'WX-OWNER01',
      nickname: '测试昵称',
      payoutMethods: [
        expect.objectContaining({
          accountMasked: '622****7890',
          accountValueEncrypted: undefined,
        }),
      ],
      orders: {
        total: 1,
        items: [
          {
            orderedAt: new Date('2026-08-14T16:00:00.000Z'),
            schemeName: '测试商品*1',
            platformTrackingNo: 'PT123456',
            shipmentTrackingNo: 'JJ123456',
            orderAmount: '100.00',
            settlementAmount: '88.00',
            settlementStatus: SettlementStatus.UNPAID,
          },
        ],
      },
    });
    expect(externalIdentityUpdate).toHaveBeenCalledWith({
      where: { id: identity.id },
      data: { submitterId: 'submitter-id' },
    });
    expect(auditCreate).toHaveBeenCalled();
  });

  it('filters public order fields according to the saved visibility settings', async () => {
    const prisma = {
      payoutRegistrationForm: {
        findUnique: jest.fn(async () => ({
          id: 'form-id',
          lookupPublicToken: 'lookup-token',
          lookupEnabled: true,
          lookupVisibleFields: ['orderedAt', 'settlementStatus'],
        })),
      },
      submitter: {
        findUnique: jest.fn(async () => ({
          id: 'submitter-id',
          code: 'WX-OWNER01',
          name: '测试昵称',
          nickname: '测试昵称',
          status: SubmitterStatus.ACTIVE,
        })),
      },
      externalIdentity: { update: jest.fn(async () => ({})) },
      auditLog: { create: jest.fn(async () => ({})) },
      payoutMethod: { findMany: jest.fn(async () => []) },
      order: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => [
          {
            orderedAt: new Date('2026-08-14T16:00:00.000Z'),
            productNameSnapshot: '不应返回的方案',
            inboundTrackingNo: '不应返回的平台单号',
            orderAmount: '100.00',
            submitterSettlementAmount: '88.00',
            submitterSettlementStatus: SettlementStatus.PAID,
            shipmentLink: { shipment: { trackingNo: '不应返回的寄件单号' } },
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await expect(
      service.lookup(
        'lookup-token',
        identity,
        { identityCode: 'WX-OWNER01', page: 1, pageSize: 20 },
        {},
      ),
    ).resolves.toMatchObject({
      visibleFields: ['orderedAt', 'settlementStatus'],
      orders: {
        items: [
          {
            orderedAt: new Date('2026-08-14T16:00:00.000Z'),
            settlementStatus: SettlementStatus.PAID,
          },
        ],
      },
    });
    const result = await service.lookup(
      'lookup-token',
      identity,
      { identityCode: 'WX-OWNER01', page: 1, pageSize: 20 },
      {},
    );
    expect(result.orders.items[0]).not.toHaveProperty('schemeName');
    expect(result.orders.items[0]).not.toHaveProperty('orderAmount');
    expect(result.orders.items[0]).not.toHaveProperty('platformTrackingNo');
    expect(result.orders.items[0]).not.toHaveProperty('shipmentTrackingNo');
    expect(result.orders.items[0]).not.toHaveProperty('settlementAmount');
  });

  it('automatically recognizes the device after a successful code lookup', async () => {
    let linkedSubmitterId: string | null = null;
    const submitter = {
      id: 'submitter-id',
      code: 'WX-OWNER01',
      name: '测试昵称',
      nickname: '测试昵称',
      status: SubmitterStatus.ACTIVE,
    };
    const prisma = {
      payoutRegistrationForm: {
        findUnique: jest.fn(async () => ({
          id: 'form-id',
          publicToken: 'fixed-token',
          enabled: true,
          lookupPublicToken: 'lookup-token',
          lookupEnabled: true,
        })),
      },
      submitter: {
        findUnique: jest.fn(async () => submitter),
      },
      externalIdentity: {
        update: jest.fn(async ({ data }: { data: { submitterId: string } }) => {
          linkedSubmitterId = data.submitterId;
          return {};
        }),
        findUnique: jest.fn(async () => ({
          id: identity.id,
          submitterId: linkedSubmitterId,
          submitter: linkedSubmitterId
            ? {
                code: submitter.code,
                name: submitter.name,
                nickname: submitter.nickname,
              }
            : null,
        })),
      },
      auditLog: { create: jest.fn(async () => ({})) },
      payoutMethod: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      order: {
        count: jest.fn(async () => 0),
        findMany: jest.fn(async () => []),
      },
    } as unknown as PrismaService;
    const service = new PayoutRegistrationService(prisma, config);

    await service.lookup(
      'lookup-token',
      identity,
      { identityCode: 'wx-owner01', page: 1, pageSize: 20 },
      {},
    );

    await expect(service.describe('fixed-token', identity)).resolves.toEqual({
      enabled: true,
      linked: true,
      identityCode: 'WX-OWNER01',
      nickname: '测试昵称',
      locked: false,
    });
  });
});
