export const NOTIFICATION_EVENTS = [
  'ORDER_SUBMITTED',
  'ORDER_BATCH_SUBMITTED',
  'ORDER_UPDATED_BY_SUBMITTER',
  'ORDER_DELETED_BY_SUBMITTER',
] as const;

export type NotificationEventKey = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventKey, string> = {
  ORDER_SUBMITTED: '新建报单',
  ORDER_BATCH_SUBMITTED: '批量报单',
  ORDER_UPDATED_BY_SUBMITTER: '下单人修改订单',
  ORDER_DELETED_BY_SUBMITTER: '下单人删除订单',
};

export const NOTIFICATION_EVENT_DESCRIPTIONS: Record<
  NotificationEventKey,
  string
> = {
  ORDER_SUBMITTED: '下单人通过报单链接提交了一笔新订单时通知。',
  ORDER_BATCH_SUBMITTED: '下单人通过批量报单一次提交多笔订单时通知（合并成一条消息）。',
  ORDER_UPDATED_BY_SUBMITTER: '下单人在报单页修改自己提交的订单时通知，并列出变更字段。',
  ORDER_DELETED_BY_SUBMITTER: '下单人在报单页删除自己提交的订单时通知。',
};

export const DEFAULT_NOTIFICATION_RULES: Record<
  NotificationEventKey,
  { titleTemplate: string; bodyTemplate: string }
> = {
  ORDER_SUBMITTED: {
    titleTemplate: '新报单：{{submitter}} 提交了订单 {{orderNo}}',
    bodyTemplate: [
      '报单人：{{submitter}}',
      '商品：{{product}}',
      '平台：{{platform}}',
      '平台订单号：{{orderNo}}',
      '下单金额：{{amount}}',
      '报单方案：{{formName}}',
      '报单时间：{{time}}',
    ].join('\n'),
  },
  ORDER_BATCH_SUBMITTED: {
    titleTemplate: '批量报单：{{submitter}} 提交了 {{count}} 笔订单',
    bodyTemplate: [
      '报单人：{{submitter}}',
      '本次共 {{count}} 笔：',
      '{{orderList}}',
      '报单时间：{{time}}',
    ].join('\n'),
  },
  ORDER_UPDATED_BY_SUBMITTER: {
    titleTemplate: '下单人修改了订单 {{orderNo}}',
    bodyTemplate: [
      '报单人：{{submitter}}',
      '商品：{{product}}',
      '变更字段：{{changedFields}}',
      '变更明细：',
      '{{changeDetail}}',
      '修改时间：{{time}}',
    ].join('\n'),
  },
  ORDER_DELETED_BY_SUBMITTER: {
    titleTemplate: '下单人删除了订单 {{orderNo}}',
    bodyTemplate: [
      '报单人：{{submitter}}',
      '商品：{{product}}',
      '平台订单号：{{orderNo}}',
      '下单金额：{{amount}}',
      '删除时间：{{time}}',
    ].join('\n'),
  },
};

export type NotificationVariableGroup = 'general' | 'order' | 'change';

export interface NotificationVariable {
  key: string;
  label: string;
  description: string;
  group: NotificationVariableGroup;
}

export const NOTIFICATION_VARIABLES: NotificationVariable[] = [
  {
    key: 'eventLabel',
    label: '事件名称',
    description: '本次通知对应的事件，例如「新建报单」。',
    group: 'general',
  },
  {
    key: 'time',
    label: '发生时间',
    description: '订单变动发生的具体时间。',
    group: 'general',
  },
  {
    key: 'count',
    label: '订单数量',
    description: '本次涉及的订单笔数，批量报单时大于 1。',
    group: 'general',
  },
  {
    key: 'orderList',
    label: '订单明细',
    description: '批量报单时的逐行订单清单。',
    group: 'general',
  },
  {
    key: 'ip',
    label: '提交 IP',
    description: '报单请求来源的 IP 地址。',
    group: 'general',
  },
  {
    key: 'device',
    label: '提交设备',
    description: '报单请求的浏览器 / 设备信息摘要。',
    group: 'general',
  },
  {
    key: 'orderNo',
    label: '平台订单号',
    description: '订单的平台订单号。',
    group: 'order',
  },
  {
    key: 'serialNo',
    label: '订单序号',
    description: '订单在系统里的序号。',
    group: 'order',
  },
  {
    key: 'product',
    label: '商品/方案',
    description: '报单时填写的商品或方案名称。',
    group: 'order',
  },
  {
    key: 'quantity',
    label: '数量',
    description: '报单数量。',
    group: 'order',
  },
  {
    key: 'amount',
    label: '下单金额',
    description: '订单的下单金额。',
    group: 'order',
  },
  {
    key: 'settlementAmount',
    label: '结算金额',
    description: '订单的结算金额。',
    group: 'order',
  },
  {
    key: 'submitter',
    label: '下单人',
    description: '报单人的名称或微信昵称。',
    group: 'order',
  },
  {
    key: 'platform',
    label: '平台',
    description: '下单平台名称。',
    group: 'order',
  },
  {
    key: 'category',
    label: '品类',
    description: '订单所属品类。',
    group: 'order',
  },
  {
    key: 'fundingType',
    label: '支付方式',
    description: '订单的支付方式。',
    group: 'order',
  },
  {
    key: 'address',
    label: '下单地址',
    description: '订单的下单地址。',
    group: 'order',
  },
  {
    key: 'receiver',
    label: '收货人',
    description: '订单的收货人姓名。',
    group: 'order',
  },
  {
    key: 'trackingNo',
    label: '寄件运单号',
    description: '订单的寄件运单号。',
    group: 'order',
  },
  {
    key: 'notes',
    label: '备注',
    description: '订单备注。',
    group: 'order',
  },
  {
    key: 'status',
    label: '审核状态',
    description: '订单当前的审核状态。',
    group: 'order',
  },
  {
    key: 'formName',
    label: '报单方案',
    description: '本次报单使用的分享方案名称。',
    group: 'order',
  },
  {
    key: 'changedFields',
    label: '变更字段',
    description: '本次修改涉及的字段名称列表。',
    group: 'change',
  },
  {
    key: 'changeDetail',
    label: '变更明细',
    description: '逐行的「旧值 → 新值」对照。',
    group: 'change',
  },
];

export const NOTIFICATION_VARIABLE_KEYS = new Set(
  NOTIFICATION_VARIABLES.map((item) => item.key),
);

