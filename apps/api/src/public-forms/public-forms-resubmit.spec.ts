import { ConfigService } from '@nestjs/config';
import {
  DispatchStatus,
  FundingType,
  OrderSource,
  OrderStatus,
  Prisma,
  ReviewStatus,
  SettlementStatus,
} from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SHARE_FORM_FIELD_CONFIG } from '../schemes/share-form-config';
import { PublicFormsService } from './public-forms.service';

describe('PublicFormsService rejected order resubmission', () => {
  const form = {
    id: 'form-1',
    allowEditBeforeApproval: true,
    allowDeleteBeforeApproval: false,
    fieldConfig: DEFAULT_SHARE_FORM_FIELD_CONFIG,
  };
  const identity = {
    id: 'identity-1',
    displayCode: 'WX-TEST',
    submitterId: 'submitter-1',
  };
  const rejectedOrder = {
    id: 'order-1',
    serialNo: 18,
    source: OrderSource.SHARE,
    status: OrderStatus.ACTIVE,
    reviewStatus: ReviewStatus.REJECTED,
    shareFormId: form.id,
    externalIdentityId: identity.id,
    submitterId: identity.submitterId,
    platformId: 'platform-1',
    submitterWechatNickname: '测试下单人',
    categoryId: null,
    productNameSnapshot: '测试商品*1',
    orderedAt: new Date('2026-10-29T00:00:00+08:00'),
    platformOrderNo: 'OLD-ORDER-NO',
    dispatchStatus: DispatchStatus.NOT_SHIPPED,
    inboundTrackingNo: null,
    purchaseAddress: null,
    receiverName: null,
    fundingType: FundingType.SELF_PAID,
    orderAmount: new Prisma.Decimal(100),
    paymentDiscountAmount: new Prisma.Decimal(0),
    rebateScanned: false,
    submitterSettlementAmount: new Prisma.Decimal(80),
    submitterSettlementStatus: SettlementStatus.UNPAID,
    customData: null,
    notes: null,
    approvedAt: null,
    approvedById: null,
    createdAt: new Date('2026-10-29T01:00:00+08:00'),
    updatedAt: new Date('2026-10-29T01:00:00+08:00'),
    platform: { id: 'platform-1', name: '测试平台' },
    category: null,
    submitter: {
      id: 'submitter-1',
      name: '测试下单人',
      nickname: '测试下单人',
    },
  };

  const createService = (
    allowEditBeforeApproval = true,
    schemeEnabled = true,
    existingReviewStatus = ReviewStatus.REJECTED,
  ) => {
    const existingOrder = {
      ...rejectedOrder,
      reviewStatus: existingReviewStatus,
    };
    const orderUpdate = jest.fn(async ({ data }) => ({
      ...existingOrder,
      ...data,
      updatedAt: new Date('2026-10-29T02:00:00+08:00'),
    }));
    const auditCreate = jest.fn(async () => ({}));
    const orderFindMany = jest.fn(async () => [
      rejectedOrder,
      {
        ...rejectedOrder,
        id: 'order-2',
        reviewStatus: ReviewStatus.APPROVED,
      },
    ]);
    const orderFindFirst = jest.fn(async () => existingOrder);
    const transaction = {
      order: { update: orderUpdate },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      shareForm: {
        findUnique: jest.fn(async () => ({
          ...form,
          allowEditBeforeApproval,
          scheme: { enabled: schemeEnabled },
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
    );
    (
      service as unknown as {
        resolveOrderSubmitter: (...args: unknown[]) => Promise<unknown>;
      }
    ).resolveOrderSubmitter = jest
      .fn()
      .mockResolvedValue({ id: 'submitter-1' });
    return {
      service,
      orderUpdate,
      auditCreate,
      orderFindMany,
      orderFindFirst,
    };
  };

  it('lists orders by submitter after a new device identity is relinked', async () => {
    const { service, orderFindMany } = createService();

    await service.listMine('token-1', {
      id: 'identity-new-device',
      displayCode: 'WX-TEST',
      submitterId: 'submitter-1',
    });

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shareFormId: form.id,
          submitterId: 'submitter-1',
          deletedAt: null,
        },
      }),
    );
  });

  it('always shows edit for rejected orders but not approved orders', async () => {
    const { service } = createService(false);

    const result = await service.listMine('token-1', identity as never);

    expect(result[0]).toMatchObject({
      reviewStatus: ReviewStatus.REJECTED,
      canEdit: true,
      canDelete: true,
    });
    expect(result[1]).toMatchObject({
      reviewStatus: ReviewStatus.APPROVED,
      canEdit: false,
      canDelete: false,
    });
  });

  it('returns a rejected order to pending review after resubmission', async () => {
    const { service, orderUpdate, auditCreate, orderFindFirst } =
      createService(false);

    await service.updateMine(
      'token-1',
      rejectedOrder.id,
      identity as never,
      {
        platformOrderNo: 'NEW-ORDER-NO',
        amountFormulas: {
          orderAmount: '=100+5',
          paymentDiscountAmount: '=9+1',
          submitterSettlementAmount: '=80',
        },
      },
      {},
    );

    expect(orderFindFirst).toHaveBeenCalledWith({
      where: {
        id: rejectedOrder.id,
        shareFormId: form.id,
        submitterId: 'submitter-1',
        deletedAt: null,
      },
    });
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewStatus: ReviewStatus.PENDING,
          approvedAt: null,
          approvedById: null,
          platformOrderNo: 'NEW-ORDER-NO',
          customData: {
            amountFormulas: {
              orderAmount: '=100+5',
              submitterSettlementAmount: '=80',
            },
          },
        }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ORDER_RESUBMITTED_AFTER_REJECTION',
          beforeData: expect.objectContaining({
            reviewStatus: ReviewStatus.REJECTED,
          }),
          afterData: expect.objectContaining({
            reviewStatus: ReviewStatus.PENDING,
          }),
        }),
      }),
    );
  });

  it('allows a rejected order to be resubmitted when the scheme is disabled', async () => {
    const { service, orderUpdate } = createService(true, false);

    await service.updateMine(
      'token-1',
      rejectedOrder.id,
      identity as never,
      { platformOrderNo: 'NEW-ORDER-NO' },
      {},
    );

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewStatus: ReviewStatus.PENDING,
          platformOrderNo: 'NEW-ORDER-NO',
        }),
      }),
    );
  });

  it('allows a pending order to be updated when the scheme is disabled', async () => {
    const { service, orderUpdate } = createService(
      true,
      false,
      ReviewStatus.PENDING,
    );

    await service.updateMine(
      'token-1',
      rejectedOrder.id,
      identity as never,
      { platformOrderNo: 'UPDATED-ORDER-NO' },
      {},
    );

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewStatus: ReviewStatus.PENDING,
          platformOrderNo: 'UPDATED-ORDER-NO',
        }),
      }),
    );
  });

  it('marks the order as shipped when a tracking number is provided', async () => {
    const { service, orderUpdate } = createService(false);

    await service.updateMine(
      'token-1',
      rejectedOrder.id,
      identity as never,
      {
        inboundTrackingNo: 'YT123456789',
        dispatchStatus: DispatchStatus.NOT_SHIPPED,
      },
      {},
    );

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inboundTrackingNo: 'YT123456789',
          dispatchStatus: DispatchStatus.SHIPPED,
        }),
      }),
    );
  });
});
