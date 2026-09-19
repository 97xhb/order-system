import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  ReviewStatus,
  SettlementStatus,
  ShipmentStatus,
} from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateAdminOrderDto } from './dto/create-admin-order.dto';
import { OrdersService } from './orders.service';

describe('OrdersService batch creation', () => {
  const admin: AuthenticatedAdmin = {
    id: 'admin-id',
    username: 'admin',
    displayName: '管理员',
  };

  it('keeps processing later rows when one order fails', async () => {
    const service = new OrdersService({} as PrismaService);
    const createSpy = jest.spyOn(service, 'create');
    createSpy
      .mockResolvedValueOnce({ id: 'order-1', serialNo: 101 } as never)
      .mockRejectedValueOnce(new ConflictException('该平台订单号已经存在'))
      .mockResolvedValueOnce({ id: 'order-3', serialNo: 103 } as never);

    const orders = [{}, {}, {}] as CreateAdminOrderDto[];
    const result = await service.createBatch({ orders }, admin);

    expect(createSpy).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      total: 3,
      successCount: 2,
      failureCount: 1,
      results: [
        { index: 0, success: true, id: 'order-1', serialNo: 101 },
        { index: 1, success: false, message: '该平台订单号已经存在' },
        { index: 2, success: true, id: 'order-3', serialNo: 103 },
      ],
    });
  });
});

describe('OrdersService progress linkage', () => {
  const admin: AuthenticatedAdmin = {
    id: 'admin-id',
    username: 'admin',
    displayName: '管理员',
  };

  it('keeps a partially received amount in the unpaid status until fully received', () => {
    const service = new OrdersService({} as PrismaService);
    const deriveSettlementStatus = (
      service as unknown as {
        deriveSettlementStatus(
          target: Prisma.Decimal,
          paid: Prisma.Decimal,
        ): SettlementStatus;
      }
    ).deriveSettlementStatus.bind(service);

    expect(
      deriveSettlementStatus(new Prisma.Decimal(100), new Prisma.Decimal(40)),
    ).toBe(SettlementStatus.UNPAID);
    expect(
      deriveSettlementStatus(new Prisma.Decimal(100), new Prisma.Decimal(100)),
    ).toBe(SettlementStatus.PAID);
  });

  it('marks the shipment as delivered when customer payment is completed', async () => {
    const decimal = (value: number) => new Prisma.Decimal(value);
    const existing = {
      id: 'order-1',
      reviewStatus: ReviewStatus.APPROVED,
      shipmentStatus: ShipmentStatus.NOT_SHIPPED,
      receivableStatus: SettlementStatus.UNPAID,
      submitterSettlementStatus: SettlementStatus.UNPAID,
      saleAmount: decimal(100),
      customerReceivedAmount: decimal(0),
      orderAmount: decimal(80),
      submitterSettlementAmount: decimal(70),
      submitterPaidAmount: decimal(0),
      paymentDiscountAmount: decimal(0),
      platformRebateAmount: decimal(0),
      shippingCostAmount: decimal(0),
      serviceFeeAmount: decimal(0),
      otherIncomeAmount: decimal(0),
      otherCostAmount: decimal(0),
      profitAdjustment: decimal(0),
      expectedProfit: decimal(0),
      settledProfit: decimal(0),
      profitRuleSnapshot: null,
      shipmentLink: null,
    };
    const orderUpdate = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
      }),
    );
    const transaction = {
      order: { update: orderUpdate },
      shipment: { update: jest.fn() },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      order: { findFirst: jest.fn(async () => existing) },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new OrdersService(prisma);

    await service.updateProgress(
      'order-1',
      { receivableStatus: SettlementStatus.PAID },
      admin,
    );

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shipmentStatus: ShipmentStatus.DELIVERED,
          receivableStatus: SettlementStatus.PAID,
        }),
      }),
    );
  });

  it('keeps the customer receivable unpaid when only submitter settlement is completed', async () => {
    const decimal = (value: number) => new Prisma.Decimal(value);
    const existing = {
      id: 'order-settlement-only',
      reviewStatus: ReviewStatus.APPROVED,
      shipmentStatus: ShipmentStatus.NOT_SHIPPED,
      receivableStatus: SettlementStatus.UNPAID,
      submitterSettlementStatus: SettlementStatus.UNPAID,
      saleAmount: decimal(0),
      customerReceivedAmount: decimal(0),
      orderAmount: decimal(100),
      submitterSettlementAmount: decimal(80),
      submitterPaidAmount: decimal(0),
      paymentDiscountAmount: decimal(0),
      platformRebateAmount: decimal(0),
      shippingCostAmount: decimal(0),
      serviceFeeAmount: decimal(0),
      otherIncomeAmount: decimal(0),
      otherCostAmount: decimal(0),
      profitAdjustment: decimal(0),
      expectedProfit: decimal(0),
      settledProfit: decimal(0),
      profitRuleSnapshot: null,
      shipmentLink: null,
    };
    const orderUpdate = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
      }),
    );
    const transaction = {
      order: { update: orderUpdate },
      shipment: { update: jest.fn() },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      order: { findFirst: jest.fn(async () => existing) },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new OrdersService(prisma);

    await service.updateProgress(
      existing.id,
      {
        submitterPaidAmount: 80,
        submitterSettlementStatus: SettlementStatus.PAID,
      },
      admin,
    );

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shipmentStatus: undefined,
          receivableStatus: SettlementStatus.UNPAID,
          submitterSettlementStatus: SettlementStatus.PAID,
        }),
      }),
    );
  });

  it('keeps submitter settlement unpaid when only customer receivable is completed', async () => {
    const decimal = (value: number) => new Prisma.Decimal(value);
    const existing = {
      id: 'order-receivable-only',
      reviewStatus: ReviewStatus.APPROVED,
      shipmentStatus: ShipmentStatus.SHIPPED,
      receivableStatus: SettlementStatus.UNPAID,
      submitterSettlementStatus: SettlementStatus.UNPAID,
      saleAmount: decimal(100),
      customerReceivedAmount: decimal(0),
      orderAmount: decimal(100),
      submitterSettlementAmount: decimal(0),
      submitterPaidAmount: decimal(0),
      paymentDiscountAmount: decimal(0),
      platformRebateAmount: decimal(0),
      shippingCostAmount: decimal(0),
      serviceFeeAmount: decimal(0),
      otherIncomeAmount: decimal(0),
      otherCostAmount: decimal(0),
      profitAdjustment: decimal(0),
      expectedProfit: decimal(0),
      settledProfit: decimal(0),
      profitRuleSnapshot: null,
      shipmentLink: null,
    };
    const orderUpdate = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
      }),
    );
    const transaction = {
      order: { update: orderUpdate },
      shipment: { update: jest.fn() },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      order: { findFirst: jest.fn(async () => existing) },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new OrdersService(prisma);

    await service.updateProgress(
      existing.id,
      {
        customerReceivedAmount: 100,
        receivableStatus: SettlementStatus.PAID,
      },
      admin,
    );

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shipmentStatus: ShipmentStatus.DELIVERED,
          receivableStatus: SettlementStatus.PAID,
          submitterSettlementStatus: SettlementStatus.UNPAID,
        }),
      }),
    );
  });
});

describe('OrdersService deletion and ordering', () => {
  const admin: AuthenticatedAdmin = {
    id: 'admin-id',
    username: 'admin',
    displayName: '管理员',
  };

  it('soft deletes an order and writes an audit record', async () => {
    const existing = {
      id: 'order-1',
      serialNo: 12,
      reviewStatus: ReviewStatus.APPROVED,
      platformOrderNo: 'JD-12',
      productNameSnapshot: '测试商品',
      deletedAt: null,
    };
    const orderUpdate = jest.fn(
      async ({ data }: { data: { deletedAt: Date } }) => ({
        id: existing.id,
        serialNo: existing.serialNo,
        deletedAt: data.deletedAt,
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

    const result = await service.remove(existing.id, admin);

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: { deletedAt: expect.any(Date) },
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ORDER_DELETED' }),
      }),
    );
    expect(result.deletedAt).toBeInstanceOf(Date);
  });

  it('clears every visible edit reason without deleting the order audit records', async () => {
    const auditUpdate = jest.fn(async ({ data }: { data: unknown }) => data);
    const auditCreate = jest.fn(async ({ data }: { data: unknown }) => data);
    const transaction = {
      auditLog: {
        findMany: jest.fn(async () => [
          { id: 'log-1', afterData: { reason: '第一次修改', status: 'PAID' } },
          { id: 'log-2', afterData: { reason: '管理员完整编辑订单' } },
          { id: 'log-3', afterData: { reason: '第二次修改' } },
        ]),
        update: auditUpdate,
        create: auditCreate,
      },
    };
    const prisma = {
      order: {
        findFirst: jest.fn(async () => ({ id: 'order-1', serialNo: 18 })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new OrdersService(prisma);

    const result = await service.clearEditReasons('order-1', admin);

    expect(auditUpdate).toHaveBeenCalledTimes(2);
    expect(auditUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'log-1' },
        data: { afterData: { status: 'PAID' } },
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ORDER_EDIT_REASONS_CLEARED',
          afterData: { clearedCount: 2 },
        }),
      }),
    );
    expect(result).toEqual({ id: 'order-1', serialNo: 18, clearedCount: 2 });
  });

  it('sorts serial numbers ascending by default and supports descending order', async () => {
    const orderFindMany = jest.fn(async () => []);
    const prisma = {
      order: {
        findMany: orderFindMany,
        count: jest.fn(async () => 0),
        aggregate: jest.fn(async () => ({
          _sum: {
            submitterSettlementAmount: null,
            settledProfit: null,
            saleAmount: null,
          },
        })),
      },
      platform: { findMany: jest.fn(async () => []) },
      category: { findMany: jest.fn(async () => []) },
      orderScheme: { findMany: jest.fn(async () => []) },
      submitter: { findMany: jest.fn(async () => []) },
      customFieldDefinition: { findMany: jest.fn(async () => []) },
    } as unknown as PrismaService;
    const service = new OrdersService(prisma);

    await service.list({});

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ serialNo: 'asc' }, { createdAt: 'asc' }],
      }),
    );

    orderFindMany.mockClear();
    await service.list({ serialSort: 'desc' });

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ serialNo: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  });

  it('requires independent order filters to match together', async () => {
    const orderFindMany = jest.fn(async () => []);
    const prisma = {
      order: {
        findMany: orderFindMany,
        count: jest.fn(async () => 0),
        aggregate: jest.fn(async () => ({
          _sum: {
            submitterSettlementAmount: null,
            settledProfit: null,
            saleAmount: null,
          },
        })),
      },
      platform: { findMany: jest.fn(async () => []) },
      category: { findMany: jest.fn(async () => []) },
      orderScheme: { findMany: jest.fn(async () => []) },
      submitter: { findMany: jest.fn(async () => []) },
      customFieldDefinition: { findMany: jest.fn(async () => []) },
    } as unknown as PrismaService;
    const service = new OrdersService(prisma);

    await service.list({
      platformIds: 'platform-vip',
      submitterIds: 'submitter-7727',
      categoryIds: 'category-beauty',
      receivableStatus: SettlementStatus.UNPAID,
      submitterSettlementStatus: SettlementStatus.PAID,
    });

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { deletedAt: null },
            { platformId: { in: ['platform-vip'] } },
            { submitterId: { in: ['submitter-7727'] } },
            { categoryId: { in: ['category-beauty'] } },
            { receivableStatus: SettlementStatus.UNPAID },
            { submitterSettlementStatus: SettlementStatus.PAID },
          ]),
        },
      }),
    );
  });

  it('matches rejected, shipment, receivable or settlement exceptions in the exception view', async () => {
    const orderFindMany = jest.fn(async () => []);
    const prisma = {
      order: {
        findMany: orderFindMany,
        count: jest.fn(async () => 0),
        aggregate: jest.fn(async () => ({
          _sum: {
            submitterSettlementAmount: null,
            settledProfit: null,
            saleAmount: null,
          },
        })),
      },
      platform: { findMany: jest.fn(async () => []) },
      category: { findMany: jest.fn(async () => []) },
      orderScheme: { findMany: jest.fn(async () => []) },
      submitter: { findMany: jest.fn(async () => []) },
      customFieldDefinition: { findMany: jest.fn(async () => []) },
    } as unknown as PrismaService;
    const service = new OrdersService(prisma);

    await service.list({ exceptionOnly: true });

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { reviewStatus: ReviewStatus.REJECTED },
                { shipmentStatus: ShipmentStatus.EXCEPTION },
                { receivableStatus: SettlementStatus.EXCEPTION },
                { submitterSettlementStatus: SettlementStatus.EXCEPTION },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('returns all edit reasons with timestamps and order custom-field metadata', async () => {
    const decimal = (value: number) => new Prisma.Decimal(value);
    const order = {
      id: 'order-1',
      serialNo: 18,
      saleAmount: decimal(100),
      customerReceivedAmount: decimal(40),
      submitterSettlementAmount: decimal(60),
      submitterPaidAmount: decimal(10),
      customValues: [{ definitionId: 'field-1', value: '高优先级' }],
    };
    const customField = {
      id: 'field-1',
      key: 'priority',
      label: '优先级',
      type: 'SINGLE_SELECT',
      showInTable: false,
      filterable: true,
      sortOrder: 1,
    };
    const prisma = {
      order: {
        findMany: jest.fn(async () => [order]),
        count: jest.fn(async () => 1),
        aggregate: jest.fn(async () => ({
          _sum: {
            submitterSettlementAmount: decimal(60),
            settledProfit: decimal(20),
            saleAmount: decimal(100),
          },
        })),
      },
      platform: { findMany: jest.fn(async () => []) },
      category: { findMany: jest.fn(async () => []) },
      orderScheme: { findMany: jest.fn(async () => []) },
      submitter: { findMany: jest.fn(async () => []) },
      customFieldDefinition: {
        findMany: jest.fn(async () => [customField]),
      },
      auditLog: {
        findMany: jest.fn(async () => [
          {
            entityId: order.id,
            afterData: { reason: '管理员完整编辑订单' },
            createdAt: new Date('2026-08-14T03:00:00.000Z'),
          },
          {
            entityId: order.id,
            afterData: { reason: '补录寄件单号' },
            createdAt: new Date('2026-08-14T02:00:00.000Z'),
          },
          {
            entityId: order.id,
            afterData: { reason: '旧说明' },
            createdAt: new Date('2026-08-14T01:00:00.000Z'),
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new OrdersService(prisma);

    const result = await service.list({});

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        editReasonHistory: [
          {
            reason: '补录寄件单号',
            createdAt: '2026-08-14T02:00:00.000Z',
          },
          { reason: '旧说明', createdAt: '2026-08-14T01:00:00.000Z' },
        ],
      }),
    );
    expect(result.summary).toEqual({
      submitterSettlementAmount: '60',
      settledProfit: '20',
      saleAmount: '100',
    });
    expect(result.options.customFields).toEqual([customField]);
  });
});
