
import {
  Prisma,
  ReviewStatus,
  SettlementStatus,
} from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

describe('OrdersService revert to pending', () => {
  const admin: AuthenticatedAdmin = {
    id: 'admin-id',
    username: 'admin',
    displayName: '管理员',
  };

  const buildExisting = (overrides: Record<string, unknown> = {}) => ({
    id: 'order-approved',
    reviewStatus: ReviewStatus.APPROVED,
    approvedAt: new Date('2026-11-01T00:00:00.000Z'),
    approvedById: 'admin-id',
    receivableStatus: SettlementStatus.UNPAID,
    submitterSettlementStatus: SettlementStatus.UNPAID,
    expectedProfit: new Prisma.Decimal(20),
    settledProfit: new Prisma.Decimal(10),
    notes: '原备注',
    ...overrides,
  });

  it('rejects reverting an order that is not approved', async () => {
    const prisma = {
      order: {
        findFirst: jest.fn(async () =>
          buildExisting({ reviewStatus: ReviewStatus.PENDING }),
        ),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new OrdersService(prisma);

    await expect(
      service.revertToPending('order-approved', { reason: 'x' }, admin),
    ).rejects.toThrow('只有已确认的订单才能退回待确认');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reverting an order that already received payment', async () => {
    const prisma = {
      order: {
        findFirst: jest.fn(async () =>
          buildExisting({ receivableStatus: SettlementStatus.PAID }),
        ),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new OrdersService(prisma);

    await expect(
      service.revertToPending('order-approved', { reason: 'x' }, admin),
    ).rejects.toThrow('订单已完成回款或结算，不能退回待确认');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reverts an approved order back to pending and records the audit log', async () => {
    const existing = buildExisting();
    const orderUpdate = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
      }),
    );
    const auditCreate = jest.fn(async () => ({}));
    const transaction = {
      order: { update: orderUpdate },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      order: { findFirst: jest.fn(async () => existing) },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new OrdersService(prisma);

    const result = await service.revertToPending(
      existing.id,
      { reason: '需要补充地址' },
      admin,
    );

    expect(orderUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = orderUpdate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data.reviewStatus).toBe(ReviewStatus.PENDING);
    expect(updateArgs.data.approvedAt).toBeNull();
    expect(updateArgs.data.approvedById).toBeNull();
    expect(updateArgs.data.revertedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.notes).toContain('退回说明：需要补充地址');
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ORDER_REVERTED_TO_PENDING',
          entityId: existing.id,
        }),
      }),
    );
    expect(result.reviewStatus).toBe(ReviewStatus.PENDING);
  });
});
