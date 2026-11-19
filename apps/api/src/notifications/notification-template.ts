export type NotificationVariables = Record<string, string | number | null | undefined>;

const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * 渲染通知模板：把 {{变量}} 替换成真实内容。
 * 未提供的变量统一替换成「-」，避免通知里出现空白断层。
 */
export const renderNotificationTemplate = (
  template: string,
  variables: NotificationVariables,
): string =>
  template.replace(TEMPLATE_PATTERN, (_match, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null || value === '') return '-';
    return String(value);
  });

export interface NotificationChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface OrderChangeSnapshot {
  productName: string;
  platformOrderNo: string;
  platform: string;
  category: string;
  fundingType: string;
  orderedAt: string;
  receiverName: string;
  purchaseAddress: string;
  inboundTrackingNo: string;
  orderAmount: string;
  submitterSettlementAmount: string;
  paymentDiscountAmount: string;
  rebateScanned: boolean | null;
  dispatchStatus: string;
  notes: string;
}

export interface OrderChangeSnapshotInput {
  productNameSnapshot?: string | null;
  platformOrderNo?: string | null;
  platformName?: string | null;
  categoryName?: string | null;
  fundingType?: string | null;
  orderedAt?: Date | string | null;
  receiverName?: string | null;
  purchaseAddress?: string | null;
  inboundTrackingNo?: string | null;
  orderAmount?: unknown;
  submitterSettlementAmount?: unknown;
  paymentDiscountAmount?: unknown;
  rebateScanned?: boolean | null;
  dispatchStatus?: string | null;
  notes?: string | null;
}

/** 把订单对象转成用于比对的快照，保证前后字段口径一致。 */
export const buildOrderChangeSnapshot = (
  input: OrderChangeSnapshotInput,
): OrderChangeSnapshot => ({
  productName: input.productNameSnapshot ?? '',
  platformOrderNo: input.platformOrderNo ?? '',
  platform: input.platformName ?? '',
  category: input.categoryName ?? '',
  fundingType: input.fundingType ?? '',
  orderedAt: input.orderedAt ? new Date(input.orderedAt).toISOString() : '',
  receiverName: input.receiverName ?? '',
  purchaseAddress: input.purchaseAddress ?? '',
  inboundTrackingNo: input.inboundTrackingNo ?? '',
  orderAmount: normalize(input.orderAmount),
  submitterSettlementAmount: normalize(input.submitterSettlementAmount),
  paymentDiscountAmount: normalize(input.paymentDiscountAmount),
  rebateScanned: input.rebateScanned ?? null,
  dispatchStatus: input.dispatchStatus ?? '',
  notes: input.notes ?? '',
});

const DIFF_FIELDS: { key: string; label: string }[] = [
  { key: 'productName', label: '商品/方案' },
  { key: 'platformOrderNo', label: '平台订单号' },
  { key: 'category', label: '品类' },
  { key: 'platform', label: '平台' },
  { key: 'fundingType', label: '支付方式' },
  { key: 'orderedAt', label: '下单日期' },
  { key: 'receiverName', label: '收货人' },
  { key: 'purchaseAddress', label: '下单地址' },
  { key: 'inboundTrackingNo', label: '寄件运单号' },
  { key: 'orderAmount', label: '下单金额' },
  { key: 'submitterSettlementAmount', label: '结算金额' },
  { key: 'paymentDiscountAmount', label: '支付优惠' },
  { key: 'rebateScanned', label: '扫码返利' },
  { key: 'dispatchStatus', label: '发货状态' },
  { key: 'notes', label: '备注' },
];

const normalize = (value: unknown) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'toString' in (value as object)) {
    const asDecimal = value as { toString(): string };
    return asDecimal.toString();
  }
  return String(value);
};

/**
 * 对比下单人修改前后的订单内容，得出具体改了哪些字段。
 * 只比较订单本身的核心字段，忽略审核状态、更新时间等系统字段。
 */
export const diffOrderChanges = (
  before: object | null | undefined,
  after: object | null | undefined,
): NotificationChange[] => {
  if (!before || !after) return [];
  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  const changes: NotificationChange[] = [];
  for (const field of DIFF_FIELDS) {
    const beforeValue = normalize(beforeRecord[field.key]);
    const afterValue = normalize(afterRecord[field.key]);
    if (beforeValue === afterValue) continue;
    changes.push({
      field: field.key,
      label: field.label,
      before: beforeValue || '-',
      after: afterValue || '-',
    });
  }
  return changes;
};

export const formatChangeDetail = (changes: NotificationChange[]) =>
  changes
    .map((change) => `- ${change.label}：${change.before} → ${change.after}`)
    .join('\n');

