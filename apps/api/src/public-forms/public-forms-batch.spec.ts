import { ConfigService } from '@nestjs/config';
import { ConflictException, GoneException } from '@nestjs/common';
import { ReviewStatus, ShareFormStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SHARE_FORM_FIELD_CONFIG } from '../schemes/share-form-config';
import { PublicFormsService } from './public-forms.service';

describe('PublicFormsService batch order submission', () => {
  const identity = {
    id: 'identity-1',
    displayCode: 'WX-TEST',
    submitterId: 'submitter-1',
  };

  const form = {
    id: 'form-1',
    allowEditBeforeApproval: true,
    allowDeleteBeforeApproval: false,
    fieldConfig: DEFAULT_SHARE_FORM_FIELD_CONFIG,
    submissionLimit: null,
    status: ShareFormStatus.ACTIVE,
    startsAt: null,
    expiresAt: null,
    scheme: {
      enabled: true,
      name: '测试方案',
      productName: '测试商品*1',
      defaultValues: {},
    },
  };

  const createService = () => {
    const createdOrders: Array<Record<string, unknown>> = [];
    const orderCreate = jest.fn(async ({ data }) => {
      const order = {
        id: `order-${createdOrders.length + 1}`,
        serialNo: createdOrders.length + 1,
        reviewStatus: ReviewStatus.PENDING,
        createdAt: new Date('2026-11-19T00:00:00+08:00'),
        ...data,
      };
      createdOrders.push(data);
      return order;
    });
    const transaction = {
      order: { create: orderCreate, count: jest.fn(async () => 0) },
      auditLog: { create: jest.fn(async () => ({})) },
      fundingMethod: {
        findFirst: jest.fn(async () => ({ code: 'SELF_PAID' })),
      },
      externalIdentity: {
        findUnique: jest.fn(async () => ({
          id: 'identity-1',
          status: 'ACTIVE',
          displayCode: 'WX-TEST',
          submitter: null,
        })),
      },
      submitter: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'submitter-1' })),
        update: jest.fn(async () => ({ id: 'submitter-1' })),
      },
    };
    const prisma = {
      shareForm: {
        findUnique: jest.fn(async () => form),
      },
      platform: { findFirst: jest.fn(async () => ({ id: 'platform-1' })) },
      category: { findFirst: jest.fn(async () => null) },
      fundingMethod: {
        findFirst: jest.fn(async () => ({ code: 'SELF_PAID' })),
      },
      order: {
        findMany: jest.fn(
          async (): Promise<
            Array<{ platformId: string; platformOrderNo: string | null }>
          > => [],
        ),
      },
      $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const service = new PublicFormsService(
      prisma as unknown as PrismaService,
      {} as ConfigService,
    );
    (
      service as unknown as {
        resolveOrderSubmitter: (...args: unknown[]) => Promise<unknown>;
      }
    ).resolveOrderSubmitter = jest
      .fn()
      .mockResolvedValue({ id: 'submitter-1' });
    return { service, orderCreate, createdOrders, prisma };
  };

  const baseItem = {
    platformId: '11111111-1111-4111-8111-111111111111',
    wechatNickname: '测试下单人',
    productName: '测试商品*1',
    orderedAt: '2026-11-18',
    platformOrderNo: 'ORDER-1',
    purchaseAddress: '测试地址',
    orderAmount: 100,
  };

  it('creates every item and reports success count', async () => {
    const { service, orderCreate } = createService();

    const result = await service.createBatch(
      'token-1',
      identity as never,
      {
        items: [
          { ...baseItem, platformOrderNo: 'ORDER-1' },
          { ...baseItem, platformOrderNo: 'ORDER-2' },
        ],
      },
      {},
    );

    expect(orderCreate).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      total: 2,
      successCount: 2,
      failureCount: 0,
    });
    expect(result.results.every((item) => item.success)).toBe(true);
  });

  it('marks rows whose order number is already registered and still saves the rest', async () => {
    const { service, orderCreate, prisma } = createService();
    prisma.order.findMany = jest.fn(async () => [
      {
        platformId: '11111111-1111-4111-8111-111111111111',
        platformOrderNo: 'ORDER-DUP',
      },
    ]);

    const result = await service.createBatch(
      'token-1',
      identity as never,
      {
        items: [
          { ...baseItem, platformOrderNo: 'ORDER-DUP' },
          { ...baseItem, platformOrderNo: 'ORDER-OK' },
        ],
      },
      {},
    );

    expect(result).toMatchObject({
      total: 2,
      successCount: 1,
      failureCount: 1,
    });
    expect(result.results[0]).toMatchObject({
      index: 0,
      success: false,
      message: '平台订单号已经登记',
    });
    expect(result.results[1]).toMatchObject({ index: 1, success: true });
  });

  it('marks duplicated order numbers inside the same batch', async () => {
    const { service, orderCreate } = createService();

    const result = await service.createBatch(
      'token-1',
      identity as never,
      {
        items: [
          { ...baseItem, platformOrderNo: 'ORDER-SAME' },
          { ...baseItem, platformOrderNo: 'ORDER-SAME' },
        ],
      },
      {},
    );

    expect(orderCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      total: 2,
      successCount: 1,
      failureCount: 1,
    });
    expect(result.results[1]).toMatchObject({
      index: 1,
      success: false,
      message: '平台订单号已经登记',
    });
  });

  it('marks rows that fail validation without touching the database', async () => {
    const { service, orderCreate } = createService();

    const result = await service.createBatch(
      'token-1',
      identity as never,
      {
        items: [
          { ...baseItem, platformOrderNo: '' },
          { ...baseItem, platformOrderNo: 'ORDER-OK' },
        ],
      },
      {},
    );

    expect(orderCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      total: 2,
      successCount: 1,
      failureCount: 1,
    });
    expect(result.results[0]).toMatchObject({
      index: 0,
      success: false,
      message: '平台订单号为必填项',
    });
  });

  it('rejects the whole batch when the scheme is disabled', async () => {
    const { service } = createService();
    (
      service as unknown as {
        getForm: (...args: unknown[]) => Promise<unknown>;
      }
    ).getForm = jest.fn().mockResolvedValue({
      ...form,
      scheme: { ...form.scheme, enabled: false },
    });

    await expect(
      service.createBatch(
        'token-1',
        identity as never,
        { items: [{ ...baseItem }] },
        {},
      ),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('only fails the invalid row and keeps the other rows working', async () => {
    const { service, orderCreate } = createService();

    const result = await service.createBatch(
      'token-1',
      identity as never,
      {
        items: [
          { ...baseItem, platformOrderNo: 'ORDER-BAD', orderAmount: 'abc' },
          { ...baseItem, platformOrderNo: 'ORDER-OK' },
        ],
      },
      {},
    );

    expect(orderCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      total: 2,
      successCount: 1,
      failureCount: 1,
    });
    expect(result.results[0]).toMatchObject({
      success: false,
      message: expect.stringContaining('下单金额'),
    });
    expect(result.results[1]).toMatchObject({ index: 1, success: true });
  });

  it('does not require hidden fields', async () => {
    const { service, orderCreate } = createService();
    (
      service as unknown as {
        getForm: (...args: unknown[]) => Promise<unknown>;
      }
    ).getForm = jest.fn().mockResolvedValue({
      ...form,
      fieldConfig: {
        ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
        fields: {
          ...DEFAULT_SHARE_FORM_FIELD_CONFIG.fields,
          platformOrderNo: {
            visible: false,
            editable: false,
            required: false,
            batchScope: 'SHARED',
          },
        },
      },
    });

    const result = await service.createBatch(
      'token-1',
      identity as never,
      {
        items: [
          { ...baseItem, platformOrderNo: '' },
          { ...baseItem, platformOrderNo: '' },
        ],
      },
      {},
    );

    expect(orderCreate).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ successCount: 2, failureCount: 0 });
  });

  it('does not require read-only fields', async () => {
    const { service, orderCreate } = createService();
    (
      service as unknown as {
        getForm: (...args: unknown[]) => Promise<unknown>;
      }
    ).getForm = jest.fn().mockResolvedValue({
      ...form,
      fieldConfig: {
        ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
        fields: {
          ...DEFAULT_SHARE_FORM_FIELD_CONFIG.fields,
          purchaseAddress: {
            visible: true,
            editable: false,
            required: false,
            batchScope: 'ROW',
          },
        },
      },
    });

    const result = await service.createBatch(
      'token-1',
      identity as never,
      {
        items: [
          { ...baseItem, platformOrderNo: 'ORDER-A', purchaseAddress: '' },
          { ...baseItem, platformOrderNo: 'ORDER-B', purchaseAddress: '' },
        ],
      },
      {},
    );

    expect(orderCreate).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ successCount: 2, failureCount: 0 });
  });
});
