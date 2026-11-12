import { Prisma } from '@prisma/client';

/**
 * 订单列表与归档分组共用的完整订单字段。
 * 归档后仍要能打开同一个订单详情弹窗，因此字段必须与列表保持一致。
 */
export const ORDER_LIST_SELECT = {
  id: true,
  serialNo: true,
  reviewStatus: true,
  orderedAt: true,
  productNameSnapshot: true,
  platformOrderNo: true,
  inboundTrackingNo: true,
  purchaseAddress: true,
  receiverName: true,
  dispatchStatus: true,
  textColor: true,
  fundingType: true,
  customData: true,
  shipmentStatus: true,
  orderAmount: true,
  paymentDiscountAmount: true,
  saleAmount: true,
  customerReceivedAmount: true,
  receivableStatus: true,
  submitterSettlementAmount: true,
  submitterPaidAmount: true,
  submitterSettlementStatus: true,
  scanAmount: true,
  platformRebateAmount: true,
  expectedProfit: true,
  settledProfit: true,
  rebateScanned: true,
  notes: true,
  platform: { select: { id: true, name: true } },
  submitter: { select: { id: true, code: true, name: true } },
  category: { select: { id: true, name: true } },
  shipmentLink: {
    select: {
      shipment: {
        select: {
          trackingNo: true,
        },
      },
    },
  },
  customValues: {
    select: { definitionId: true, value: true },
  },
} satisfies Prisma.OrderSelect;
