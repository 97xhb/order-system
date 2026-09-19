/**
 * 订单列表的基础列元数据。
 *
 * 订单列表前端会把 API 返回的这份元数据转换成表格列；订单查询配置
 * 则使用 payoutKey 作为公开查询字段 key。这样新增/调整订单列时，
 * 客户可见分类不再需要另外维护一份固定列表。
 *
 * 基础字段不在代码里写死为“后台专用”；实际锁定状态由
 * PayoutRegistrationForm.lookupLockedFields 持久化控制。publicAllowed /
 * externallyVisible 仅用于兼容旧配置并生成首次初始化状态。
 */
export interface OrderTableFieldDefinition {
  key: string;
  payoutKey: string;
  label: string;
  description: string;
  width?: number;
  minWidth?: number;
  defaultVisible?: boolean;
  publicAllowed: boolean;
  publicDefaultVisible: boolean;
  /** 仅用于标记默认隐藏倾向，不参与客户访问控制。 */
  sensitive?: boolean;
}

export const ORDER_TABLE_FIELD_DEFINITIONS: readonly OrderTableFieldDefinition[] =
  [
    {
      key: 'serialNo',
      payoutKey: 'serialNo',
      label: '序号',
      description: '订单在列表中的序号',
      width: 68,
      defaultVisible: true,
      publicAllowed: true,
      publicDefaultVisible: false,
    },
    {
      key: 'orderedAt',
      payoutKey: 'orderedAt',
      label: '下单日期',
      description: '订单实际下单日期和时间',
      width: 104,
      defaultVisible: true,
      publicAllowed: true,
      publicDefaultVisible: true,
    },
    {
      key: 'platform',
      payoutKey: 'platform',
      label: '平台',
      description: '订单下单平台',
      width: 82,
      defaultVisible: true,
      publicAllowed: true,
      publicDefaultVisible: false,
    },
    {
      key: 'submitter',
      payoutKey: 'submitter',
      label: '下单人',
      description: '订单关联的下单人微信昵称/名称',
      width: 125,
      defaultVisible: true,
      publicAllowed: true,
      publicDefaultVisible: false,
    },
    {
      key: 'category',
      payoutKey: 'category',
      label: '品类',
      description: '订单所属下单品类',
      width: 82,
      defaultVisible: true,
      publicAllowed: true,
      publicDefaultVisible: false,
    },
    {
      key: 'product',
      payoutKey: 'schemeName',
      label: '商品/方案*数量',
      description: '商品或方案名称及数量',
      minWidth: 210,
      defaultVisible: true,
      publicAllowed: true,
      publicDefaultVisible: true,
    },
    {
      key: 'platformOrderNo',
      payoutKey: 'platformOrderNo',
      label: '平台订单号',
      description: '订单在下单平台的订单号',
      width: 145,
      publicAllowed: true,
      publicDefaultVisible: false,
    },
    {
      key: 'inboundTrackingNo',
      payoutKey: 'platformTrackingNo',
      label: '平台运单号',
      description: '平台发货产生的运单号',
      width: 175,
      defaultVisible: true,
      publicAllowed: true,
      publicDefaultVisible: true,
    },
    {
      key: 'purchaseAddress',
      payoutKey: 'purchaseAddress',
      label: '下单地址',
      description: '订单登记的下单地址',
      minWidth: 180,
      publicAllowed: true,
      publicDefaultVisible: false,
    },
    {
      key: 'shipmentTrackingNo',
      payoutKey: 'shipmentTrackingNo',
      label: '寄件运单号',
      description: '寄给下单人的寄件运单号',
      width: 175,
      publicAllowed: true,
      publicDefaultVisible: true,
    },
    {
      key: 'shipmentStatus',
      payoutKey: 'shipmentStatus',
      label: '寄件状态',
      description: '未寄出、已寄出、已签收或异常',
      width: 102,
      publicAllowed: true,
      publicDefaultVisible: false,
    },
    {
      key: 'fundingType',
      payoutKey: 'fundingType',
      label: '支付方式',
      description: '订单支付方式',
      width: 108,
      publicAllowed: true,
      publicDefaultVisible: false,
    },
    {
      key: 'paymentDiscountAmount',
      payoutKey: 'paymentDiscountAmount',
      label: '支付优惠',
      description: '支付优惠金额',
      width: 105,
      publicAllowed: true,
      publicDefaultVisible: false,
    },
    {
      key: 'orderAmount',
      payoutKey: 'orderAmount',
      label: '下单金额',
      description: '订单下单金额',
      width: 108,
      defaultVisible: true,
      publicAllowed: true,
      publicDefaultVisible: true,
    },
    {
      key: 'submitterSettlementAmount',
      payoutKey: 'settlementAmount',
      label: '结算金额',
      description: '给下单人的结算金额',
      width: 108,
      defaultVisible: true,
      publicAllowed: true,
      publicDefaultVisible: true,
    },
    {
      key: 'platformRebateAmount',
      payoutKey: 'platformRebateAmount',
      label: '扫码返利',
      description: '扫码返利实际到账金额',
      width: 132,
      publicAllowed: true,
      publicDefaultVisible: false,
      sensitive: true,
    },
    {
      key: 'submitterSettlementStatus',
      payoutKey: 'settlementStatus',
      label: '结算状态',
      description: '未结算、已结算或异常',
      width: 132,
      defaultVisible: true,
      publicAllowed: true,
      publicDefaultVisible: true,
    },
    {
      key: 'saleAmount',
      payoutKey: 'saleAmount',
      label: '回款金额',
      description: '收货佬给管理员的回款金额',
      width: 108,
      publicAllowed: true,
      publicDefaultVisible: false,
      sensitive: true,
    },
    {
      key: 'receivableStatus',
      payoutKey: 'receivableStatus',
      label: '回款状态',
      description: '收货佬回款状态',
      width: 132,
      publicAllowed: true,
      publicDefaultVisible: false,
      sensitive: true,
    },
    {
      key: 'profit',
      payoutKey: 'profit',
      label: '利润',
      description: '订单预结算/已结算利润',
      width: 150,
      publicAllowed: true,
      publicDefaultVisible: false,
      sensitive: true,
    },
    {
      key: 'notes',
      payoutKey: 'notes',
      label: '备注',
      description: '订单内部备注',
      minWidth: 190,
      publicAllowed: true,
      publicDefaultVisible: false,
      sensitive: true,
    },
    {
      key: 'editReasonHistory',
      payoutKey: 'editReasonHistory',
      label: '修改说明',
      description: '订单修改记录及时间',
      minWidth: 260,
      publicAllowed: true,
      publicDefaultVisible: false,
    },
  ] as const;

export interface PayoutQueryFieldOption {
  key: string;
  orderColumnKey: string;
  label: string;
  description: string;
  width?: number;
  minWidth?: number;
  defaultVisible: boolean;
  publicAllowed: boolean;
  sensitive?: boolean;
  customFieldId?: string;
  customFieldType?: string;
}

export type PayoutQueryFieldKey = string;

const basePayoutQueryFieldOptions = ORDER_TABLE_FIELD_DEFINITIONS.map(
  (field): PayoutQueryFieldOption => ({
    key: field.payoutKey,
    orderColumnKey: field.key,
    label: field.label,
    description: field.description,
    width: field.width,
    minWidth: field.minWidth,
    defaultVisible: field.publicDefaultVisible,
    publicAllowed: field.publicAllowed,
    sensitive: field.sensitive,
  }),
);

/** 固定列的回退选项；动态自定义字段会在服务层追加。 */
export const PAYOUT_QUERY_FIELD_OPTIONS = basePayoutQueryFieldOptions;

export const DEFAULT_PAYOUT_QUERY_FIELDS: PayoutQueryFieldKey[] =
  PAYOUT_QUERY_FIELD_OPTIONS.filter(
    (field) => field.defaultVisible && field.publicAllowed,
  ).map((field) => field.key);

/**
 * 首次启用订单查询时的初始后台专用字段。
 *
 * 这只是数据库尚未保存配置时的初始化值；管理员保存后，实际权限完全
 * 由 PayoutRegistrationForm.lookupLockedFields 控制，后续不再由代码强制。
 */
export const DEFAULT_PAYOUT_QUERY_LOCKED_FIELDS: PayoutQueryFieldKey[] =
  PAYOUT_QUERY_FIELD_OPTIONS.filter(
    (field) => field.sensitive || !field.publicAllowed,
  ).map((field) => field.key);

export function buildPayoutQueryFieldOptions(
  customFields: Array<{
    id: string;
    label: string;
    type: string;
    showInTable: boolean;
    externallyVisible: boolean;
  }> = [],
): PayoutQueryFieldOption[] {
  const options = [...PAYOUT_QUERY_FIELD_OPTIONS];
  for (const field of customFields) {
    options.push({
      key: `custom:${field.id}`,
      orderColumnKey: `custom:${field.id}`,
      label: field.label,
      description: '订单扩展字段',
      minWidth: field.type === 'LONG_TEXT' ? 210 : 140,
      defaultVisible: field.showInTable && field.externallyVisible,
      publicAllowed: field.externallyVisible,
      customFieldId: field.id,
      customFieldType: field.type,
    });
  }
  return options;
}

export function orderTableFieldOptions() {
  return ORDER_TABLE_FIELD_DEFINITIONS.map((field) => ({
    key: field.key,
    label: field.label,
    description: field.description,
    width: field.width,
    minWidth: field.minWidth,
    defaultVisible: field.defaultVisible !== false,
  }));
}

export function normalizePayoutQueryFields(
  value: unknown,
  fieldOptions: readonly PayoutQueryFieldOption[] = PAYOUT_QUERY_FIELD_OPTIONS,
  lockedFields?: readonly PayoutQueryFieldKey[],
): PayoutQueryFieldKey[] {
  const locked = new Set(lockedFields ?? []);
  const isAllowed = (field: PayoutQueryFieldOption) =>
    !locked.has(field.key) &&
    (lockedFields !== undefined ? true : field.publicAllowed);

  if (!Array.isArray(value)) {
    return fieldOptions
      .filter((field) => field.defaultVisible && isAllowed(field))
      .map((field) => field.key);
  }

  const allowed = new Set(
    fieldOptions.filter(isAllowed).map((field) => field.key),
  );
  const normalized: PayoutQueryFieldKey[] = [];
  for (const item of value) {
    const candidate =
      typeof item === 'string'
        ? (LEGACY_PAYOUT_QUERY_FIELD_ALIASES[item] ?? item)
        : item;
    if (
      typeof candidate === 'string' &&
      allowed.has(candidate) &&
      !normalized.includes(candidate)
    ) {
      normalized.push(candidate);
    }
  }
  return normalized;
}

/** 将数据库里的锁定字段规范化为当前仍存在的订单列。 */
export function normalizePayoutQueryLockedFields(
  value: unknown,
  fieldOptions: readonly PayoutQueryFieldOption[] = PAYOUT_QUERY_FIELD_OPTIONS,
): PayoutQueryFieldKey[] {
  if (!Array.isArray(value)) {
    return fieldOptions
      .filter((field) => field.sensitive || !field.publicAllowed)
      .map((field) => field.key);
  }

  const allowed = new Set(fieldOptions.map((field) => field.key));
  const normalized: PayoutQueryFieldKey[] = [];
  for (const item of value) {
    const candidate =
      typeof item === 'string'
        ? (LEGACY_PAYOUT_QUERY_FIELD_ALIASES[item] ?? item)
        : item;
    if (
      typeof candidate === 'string' &&
      allowed.has(candidate) &&
      !normalized.includes(candidate)
    ) {
      normalized.push(candidate);
    }
  }
  return normalized;
}

/** 返回当前允许公开的字段；管理员锁定状态是唯一的动态权限来源。 */
export function publicPayoutQueryFieldOptions(
  fieldOptions: readonly PayoutQueryFieldOption[],
  lockedFields: readonly PayoutQueryFieldKey[],
): PayoutQueryFieldOption[] {
  const locked = new Set(lockedFields);
  return fieldOptions.filter((field) => !locked.has(field.key));
}

/**
 * 订单列表字段对应到旧订单查询 key 的兼容映射。
 * 目前主要用于已有浏览器/数据库配置迁移时保持稳定。
 */
export const LEGACY_PAYOUT_QUERY_FIELD_ALIASES: Record<string, string> = {
  product: 'schemeName',
  inboundTrackingNo: 'platformTrackingNo',
  submitterSettlementAmount: 'settlementAmount',
  submitterSettlementStatus: 'settlementStatus',
};
