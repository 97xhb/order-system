export type ShareFormFieldKey =
  | 'wechatNickname'
  | 'platformId'
  | 'categoryId'
  | 'productName'
  | 'orderedAt'
  | 'platformOrderNo'
  | 'dispatchStatus'
  | 'inboundTrackingNo'
  | 'purchaseAddress'
  | 'receiverName'
  | 'fundingType'
  | 'orderAmount'
  | 'paymentDiscountAmount'
  | 'rebateScanned'
  | 'submitterSettlementAmount'
  | 'notes';

export type ShareFormBatchScope = 'SHARED' | 'ROW';

export type ShareFormFieldKind =
  | 'text'
  | 'textarea'
  | 'money'
  | 'date'
  | 'boolean'
  | 'platform'
  | 'category'
  | 'funding'
  | 'dispatch';

export interface ShareFormFieldMeta {
  key: ShareFormFieldKey;
  label: string;
  kind: ShareFormFieldKind;
  /** 是否允许在批量报单中逐行填写。 */
  rowCapable: boolean;
  /** 批量报单时默认的填写范围。 */
  defaultBatchScope: ShareFormBatchScope;
  /** 粘贴表格时可用于识别该列的表头别名。 */
  headerAliases: string[];
}

export interface ShareFormFieldRule {
  visible: boolean;
  editable: boolean;
  required: boolean;
  batchScope: ShareFormBatchScope;
  note?: string;
  noteColor?: string;
}

export interface ShareFormFieldConfig {
  schemaVersion: 1;
  fields: Record<ShareFormFieldKey, ShareFormFieldRule>;
  settlementAmount: {
    mode: 'FREE' | 'PRESET' | 'FIXED' | 'ADMIN_ONLY';
    fixedAmount?: number;
    options: number[];
  };
}

export const SHARE_FORM_FIELD_KEYS: ShareFormFieldKey[] = [
  'wechatNickname',
  'platformId',
  'categoryId',
  'productName',
  'orderedAt',
  'platformOrderNo',
  'dispatchStatus',
  'inboundTrackingNo',
  'purchaseAddress',
  'receiverName',
  'fundingType',
  'orderAmount',
  'paymentDiscountAmount',
  'rebateScanned',
  'submitterSettlementAmount',
  'notes',
];

/** 批量报单中公共信息与逐行字段的展示顺序。 */
export const SHARE_FORM_FIELD_ORDER: ShareFormFieldKey[] = [
  'wechatNickname',
  'platformId',
  'categoryId',
  'productName',
  'orderedAt',
  'fundingType',
  'rebateScanned',
  'dispatchStatus',
  'platformOrderNo',
  'purchaseAddress',
  'receiverName',
  'inboundTrackingNo',
  'orderAmount',
  'paymentDiscountAmount',
  'submitterSettlementAmount',
  'notes',
];

const ROW_CAPABLE_KEYS: ShareFormFieldKey[] = [
  'platformOrderNo',
  'purchaseAddress',
  'receiverName',
  'inboundTrackingNo',
  'orderAmount',
  'paymentDiscountAmount',
  'notes',
  'orderedAt',
  'productName',
  'submitterSettlementAmount',
];

export const SHARE_FORM_FIELD_META: Record<ShareFormFieldKey, ShareFormFieldMeta> = {
  wechatNickname: {
    key: 'wechatNickname',
    label: '下单人（微信昵称）',
    kind: 'text',
    rowCapable: false,
    defaultBatchScope: 'SHARED',
    headerAliases: ['下单人', '微信昵称', '下单人微信昵称', '昵称'],
  },
  platformId: {
    key: 'platformId',
    label: '平台',
    kind: 'platform',
    rowCapable: false,
    defaultBatchScope: 'SHARED',
    headerAliases: ['平台', '下单平台', '平台名称'],
  },
  categoryId: {
    key: 'categoryId',
    label: '品类',
    kind: 'category',
    rowCapable: false,
    defaultBatchScope: 'SHARED',
    headerAliases: ['品类', '分类'],
  },
  productName: {
    key: 'productName',
    label: '商品/方案*数量',
    kind: 'textarea',
    rowCapable: true,
    defaultBatchScope: 'SHARED',
    headerAliases: ['商品/方案*数量', '商品方案', '商品', '方案', '数量'],
  },
  orderedAt: {
    key: 'orderedAt',
    label: '下单日期',
    kind: 'date',
    rowCapable: true,
    defaultBatchScope: 'SHARED',
    headerAliases: ['下单日期', '日期', '下单时间'],
  },
  platformOrderNo: {
    key: 'platformOrderNo',
    label: '平台订单号',
    kind: 'text',
    rowCapable: true,
    defaultBatchScope: 'ROW',
    headerAliases: ['平台订单号', '订单号', '单号', '平台单号'],
  },
  dispatchStatus: {
    key: 'dispatchStatus',
    label: '发货状态',
    kind: 'dispatch',
    rowCapable: false,
    defaultBatchScope: 'SHARED',
    headerAliases: ['发货状态', '状态'],
  },
  inboundTrackingNo: {
    key: 'inboundTrackingNo',
    label: '平台运单号',
    kind: 'text',
    rowCapable: true,
    defaultBatchScope: 'ROW',
    headerAliases: ['平台运单号', '运单号', '物流单号', '快递单号'],
  },
  purchaseAddress: {
    key: 'purchaseAddress',
    label: '下单地址',
    kind: 'textarea',
    rowCapable: true,
    defaultBatchScope: 'ROW',
    headerAliases: ['下单地址', '购买地址', '收货地址', '地址'],
  },
  receiverName: {
    key: 'receiverName',
    label: '收货佬',
    kind: 'text',
    rowCapable: true,
    defaultBatchScope: 'ROW',
    headerAliases: ['收货佬', '收货人', '收件人'],
  },
  fundingType: {
    key: 'fundingType',
    label: '支付方式',
    kind: 'funding',
    rowCapable: false,
    defaultBatchScope: 'SHARED',
    headerAliases: ['支付方式', '付款方式'],
  },
  orderAmount: {
    key: 'orderAmount',
    label: '下单金额',
    kind: 'money',
    rowCapable: true,
    defaultBatchScope: 'ROW',
    headerAliases: ['下单金额', '订单金额', '金额'],
  },
  paymentDiscountAmount: {
    key: 'paymentDiscountAmount',
    label: '支付优惠',
    kind: 'money',
    rowCapable: true,
    defaultBatchScope: 'ROW',
    headerAliases: ['支付优惠', '优惠', '优惠金额'],
  },
  rebateScanned: {
    key: 'rebateScanned',
    label: '扫码返利',
    kind: 'boolean',
    rowCapable: false,
    defaultBatchScope: 'SHARED',
    headerAliases: ['扫码返利', '是否扫码', '扫码'],
  },
  submitterSettlementAmount: {
    key: 'submitterSettlementAmount',
    label: '结算金额',
    kind: 'money',
    rowCapable: true,
    defaultBatchScope: 'ROW',
    headerAliases: ['结算金额', '给下单人结算金额'],
  },
  notes: {
    key: 'notes',
    label: '备注',
    kind: 'textarea',
    rowCapable: true,
    defaultBatchScope: 'ROW',
    headerAliases: ['备注', '说明', '补充说明'],
  },
};

export const isRowCapableField = (key: ShareFormFieldKey) => ROW_CAPABLE_KEYS.includes(key);
