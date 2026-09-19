import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  PayoutMethodStatus,
  PayoutMethodType,
  SubmitterStatus,
} from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { encryptSensitiveValue } from '../security/sensitive-value';
import { SubmittersService } from './submitters.service';

describe('SubmittersService payout registrations', () => {
  const admin: AuthenticatedAdmin = {
    id: 'admin-id',
    username: 'admin',
    displayName: '管理员',
  };
  const encryptionKey = 'submitter-test-encryption-key';
  const config = {
    getOrThrow: jest.fn(() => encryptionKey),
  } as unknown as ConfigService;

  it('only counts orders that have not been soft deleted', async () => {
    const findMany = jest.fn(async () => []);
    const prisma = {
      submitter: { findMany },
    } as unknown as PrismaService;
    const service = new SubmittersService(prisma, config);

    await service.list(true);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: {
            select: expect.objectContaining({
              orders: { where: { deletedAt: null } },
            }),
          },
        }),
      }),
    );
  });

  it('purges unreferenced soft-deleted orders before deleting a submitter', async () => {
    const transaction = {
      submitter: {
        findUnique: jest.fn(async () => ({
          id: 'submitter-id',
          code: 'WX-TEST',
          name: '验收昵称',
          status: SubmitterStatus.DISABLED,
          _count: {
            payoutMethods: 0,
            externalIdentities: 1,
            orders: 0,
            payouts: 0,
          },
        })),
        delete: jest.fn(async () => ({})),
      },
      order: {
        findFirst: jest.fn(async () => null),
        deleteMany: jest.fn(async () => ({ count: 2 })),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new SubmittersService(prisma, config);

    await expect(
      service.remove('submitter-id', admin),
    ).resolves.toBeUndefined();
    expect(transaction.order.deleteMany).toHaveBeenCalledWith({
      where: { submitterId: 'submitter-id', deletedAt: { not: null } },
    });
    expect(transaction.submitter.delete).toHaveBeenCalledWith({
      where: { id: 'submitter-id' },
    });
  });

  it('still blocks deletion when the submitter has an active order', async () => {
    const transaction = {
      submitter: {
        findUnique: jest.fn(async () => ({
          id: 'submitter-id',
          code: null,
          name: '仍在使用',
          status: SubmitterStatus.ACTIVE,
          _count: {
            payoutMethods: 0,
            externalIdentities: 0,
            orders: 1,
            payouts: 0,
          },
        })),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new SubmittersService(prisma, config);

    await expect(service.remove('submitter-id', admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('keeps the identity code empty for an admin-created submitter', async () => {
    const create = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'manual-submitter',
        code: null,
        ...data,
      }),
    );
    const transaction = {
      submitter: { create },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new SubmittersService(prisma, config);

    await expect(
      service.create(
        {
          name: '后台手动昵称',
          nickname: '后台手动昵称',
          status: SubmitterStatus.ACTIVE,
        },
        admin,
      ),
    ).resolves.toMatchObject({ code: null });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('code');
  });

  it('stores WeChat transfer without unrelated account fields', async () => {
    const create = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'method-id',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        qrCodeStorageKey: null,
        _count: { payouts: 0 },
      }),
    );
    const transaction = {
      payoutMethod: { create, updateMany: jest.fn() },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      submitter: { findUnique: jest.fn(async () => ({ id: 'submitter-id' })) },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new SubmittersService(prisma, config);

    await service.createPayoutMethod(
      'submitter-id',
      {
        type: PayoutMethodType.WECHAT,
        accountName: '不应保存',
        accountValue: '不应保存',
        bankName: '不应保存',
        isDefault: true,
        status: PayoutMethodStatus.ACTIVE,
      },
      admin,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: PayoutMethodType.WECHAT,
          label: '微信转账',
          accountName: null,
          accountValueEncrypted: null,
          bankName: null,
        }),
      }),
    );
  });

  it('requires an Alipay account', async () => {
    const prisma = {
      submitter: { findUnique: jest.fn(async () => ({ id: 'submitter-id' })) },
    } as unknown as PrismaService;
    const service = new SubmittersService(prisma, config);

    await expect(
      service.createPayoutMethod(
        'submitter-id',
        { type: PayoutMethodType.ALIPAY },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires the real name, bank and card number for a bank transfer', async () => {
    const prisma = {
      submitter: { findUnique: jest.fn(async () => ({ id: 'submitter-id' })) },
    } as unknown as PrismaService;
    const service = new SubmittersService(prisma, config);

    await expect(
      service.createPayoutMethod(
        'submitter-id',
        {
          type: PayoutMethodType.BANK_CARD,
          accountValue: '6222021234567890',
        },
        admin,
      ),
    ).rejects.toThrow('请填写银行卡真实姓名');
  });

  it('decrypts an account value only through the admin detail endpoint', async () => {
    const prisma = {
      payoutMethod: {
        findUnique: jest.fn(async () => ({
          id: 'method-id',
          deletedAt: null,
          accountValueEncrypted: encryptSensitiveValue(
            'person@example.com',
            encryptionKey,
          ),
        })),
      },
    } as unknown as PrismaService;
    const service = new SubmittersService(prisma, config);

    await expect(
      service.getPayoutMethodAccountValue('method-id'),
    ).resolves.toEqual({
      accountValue: 'person@example.com',
    });
  });
});
