import { ConfigService } from '@nestjs/config';
import {
  DispatchStatus,
  OrderSource,
  OrderStatus,
  Prisma,
  ReviewStatus,
  SettlementStatus,
} from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SHARE_FORM_FIELD_CONFIG } from '../schemes/share-form-config';
import { createNotificationsStub } from './notifications.stub';
import { PublicFormsService } from './public-forms.service';

describe('PublicFormsService reverted order editing', () => {
  const form = {
    id: 'form-1',
    allowEditBeforeApproval: false,
    allowDeleteBeforeApproval: false,
    fieldConfig: DEFAULT_SHARE_FORM_FIELD_CONFIG,
  };
  const identity = {
    id: 'identity-1',
    displayCode: 'WX-TEST',
    submitterId: 'submitter-1',
  };

  const buildOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'order-reverted',
    serialNo: 88,
    source: OrderSource.SHARE,
    status: OrderStatus.ACTIVE,
    reviewStatus: ReviewStatus.PENDING,
    revertedAt: new Date('2026-11-20T00:00:00+08:00'),
    shareFormId: form.id,
    externalIdentityId: identity.id,
    submitterId: identity.submitterId,
    platformId: 'platform-1',
    submitterWechatNickname: '测试下单人',
    categoryId: null,
    productNameSnapshot: '测试商品*1',
    orderedAt: new Date('2026-11-19T00:00:00+08:00'),
    platformOrderNo: 'ORDER-NO',
    dispatchStatus: DispatchStatus.NOT_SHIPPED,
    inboundTrackingNo: null,
    purchaseAddress: null,
    receiverName: null,
    fundingType: 'SELF_PAID',
    orderAmount: new Prisma.Decimal(100),
    paymentDiscountAmount: new Prisma.Decimal(0),
    rebateScanned: false,
    submitterSettlementAmount: new Prisma.Decimal(80),
    submitterSettlementStatus: SettlementStatus.UNPAID,
    customData: null,
    notes: null,
    approvedAt: null,
    approvedById: null,
    createdAt: new Date('2026-11-19T01:00:00+08:00'),
    updatedAt: new Date('2026-11-19T01:00:00+08:00'),
    platform: { id: 'platform-1', name: '测试平台' },
    category: null,
    submitter: {
      id: 'submitter-1',
      name: '测试下单人',
      nickname: '测试下单人',
    },
    ...overrides,
  });

  const createService = (existingOrder: Record<string, unknown>) => {
    const orderUpdate = jest.fn(async ({ data }) => ({
      ...existingOrder,
      ...data,
      updatedAt: new Date('2026-11-20T02:00:00+08:00'),
    }));
    const auditCreate = jest.fn(async () => ({}));
    const orderFindMany = jest.fn(async () => [existingOrder]);
    const orderFindFirst = jest.fn(async () => existingOrder);
    const transaction = {
      order: { update: orderUpdate },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      shareForm: {
        findUnique: jest.fn(async () => ({
          ...form,
          scheme: { enabled: true },
        })),
      },
      order: {
        findMany: orderFindMany,
        findFirst: orderFindFirst,
      },
      platform: { findFirst: jest.fn(async () => ({ id: 'platform-1' })) },
      category: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const service = new PublicFormsService(
      prisma as unknown as PrismaService,
      {} as ConfigService,
      createNotificationsStub(),
    );
    (
      service as unknown as {
        resolveOrderSubmitter: (...args: unknown[]) => Promise<unknown>;
      }
    ).resolveOrderSubmitter = jest
      .fn()
      .mockResolvedValue({ id: 'submitter-1' });
    return { service, orderUpdate, auditCreate, orderFindFirst };
  };

  it('allows editing a reverted order even when the form blocks edits before approval', async () => {
    const existingOrder = buildOrder();
    const { service } = createService(existingOrder);

    const result = await service.listMine('token-1', identity as never);

    expect(result[0]).toMatchObject({
      reviewStatus: ReviewStatus.PENDING,
      canEdit: true,
    });
  });

  it('keeps editing blocked for a pending order that was never reverted', async () => {
    const existingOrder = buildOrder({ revertedAt: null });
    const { service } = createService(existingOrder);

    const result = await service.listMine('token-1', identity as never);

    expect(result[0]).toMatchObject({
      reviewStatus: ReviewStatus.PENDING,
      canEdit: false,
    });
  });

  it('accepts an update from the submitter for a reverted order', async () => {
    const existingOrder = buildOrder();
    const { service, orderUpdate } = createService(existingOrder);

    await service.updateMine(
      'token-1',
      existingOrder.id,
      identity as never,
      { platformOrderNo: 'NEW-ORDER-NO' },
      {},
    );

    expect(orderUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = orderUpdate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data.reviewStatus).toBe(ReviewStatus.PENDING);
    expect(updateArgs.data.platformOrderNo).toBe('NEW-ORDER-NO');
  });
});
