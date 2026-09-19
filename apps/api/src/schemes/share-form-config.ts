export const SHARE_FORM_FIELD_KEYS = [
  'wechatNickname',
  'platformId',
  'categoryId',
  'productName',
  'orderedAt',
  'platformOrderNo',
  'inboundTrackingNo',
  'purchaseAddress',
  'fundingType',
  'orderAmount',
  'paymentDiscountAmount',
  'rebateScanned',
  'submitterSettlementAmount',
  'notes',
] as const;

export type ShareFormFieldKey = (typeof SHARE_FORM_FIELD_KEYS)[number];
export type SettlementAmountMode = 'FREE' | 'PRESET' | 'FIXED' | 'ADMIN_ONLY';

export interface ShareFormFieldRule {
  visible: boolean;
  /** Whether the external submitter may provide or change this field. */
  editable: boolean;
  required: boolean;
}

export interface ShareFormFieldConfig {
  schemaVersion: 1;
  fields: Record<ShareFormFieldKey, ShareFormFieldRule>;
  settlementAmount: {
    mode: SettlementAmountMode;
    fixedAmount?: number;
    options: number[];
  };
}

export const DEFAULT_SHARE_FORM_FIELD_CONFIG: ShareFormFieldConfig = {
  schemaVersion: 1,
  fields: {
    wechatNickname: { visible: true, editable: true, required: true },
    platformId: { visible: true, editable: true, required: true },
    categoryId: { visible: true, editable: true, required: false },
    productName: { visible: true, editable: true, required: false },
    orderedAt: { visible: true, editable: true, required: true },
    platformOrderNo: { visible: true, editable: true, required: true },
    inboundTrackingNo: { visible: true, editable: true, required: false },
    purchaseAddress: { visible: true, editable: true, required: false },
    fundingType: { visible: false, editable: false, required: false },
    orderAmount: { visible: true, editable: true, required: true },
    paymentDiscountAmount: { visible: false, editable: false, required: false },
    rebateScanned: { visible: true, editable: true, required: false },
    submitterSettlementAmount: {
      visible: true,
      editable: true,
      required: false,
    },
    notes: { visible: true, editable: true, required: false },
  },
  settlementAmount: {
    mode: 'FREE',
    options: [],
  },
};

const SETTLEMENT_MODES = new Set<SettlementAmountMode>([
  'FREE',
  'PRESET',
  'FIXED',
  'ADMIN_ONLY',
]);

function validMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function normalizeShareFormFieldConfig(
  input: unknown,
): ShareFormFieldConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('分享表单字段配置必须是对象');
  }

  const candidate = input as {
    schemaVersion?: unknown;
    fields?: unknown;
    settlementAmount?: unknown;
  };
  if (candidate.schemaVersion !== 1) {
    throw new Error('暂不支持该分享表单配置版本');
  }
  if (!candidate.fields || typeof candidate.fields !== 'object') {
    throw new Error('分享表单缺少字段配置');
  }

  const sourceFields = candidate.fields as Record<string, unknown>;
  const fields = Object.fromEntries(
    SHARE_FORM_FIELD_KEYS.map((key) => {
      const source = sourceFields[key];
      const fallback = DEFAULT_SHARE_FORM_FIELD_CONFIG.fields[key];
      if (source === undefined) return [key, { ...fallback }];
      if (!source || typeof source !== 'object') {
        throw new Error(`字段 ${key} 的配置格式不正确`);
      }

      const rule = source as Partial<ShareFormFieldRule>;
      if (
        typeof rule.visible !== 'boolean' ||
        typeof rule.required !== 'boolean'
      ) {
        throw new Error(`字段 ${key} 必须明确设置显示和必填状态`);
      }
      const editable =
        rule.editable === undefined ? rule.visible : rule.editable;
      if (typeof editable !== 'boolean') {
        throw new Error(`字段 ${key} 的填写权限配置不正确`);
      }
      if (!rule.visible && rule.required) {
        throw new Error(`隐藏字段 ${key} 不能设置为必填`);
      }
      if (!rule.visible && editable) {
        throw new Error(`隐藏字段 ${key} 不能开放填写`);
      }
      if (!editable && rule.required) {
        throw new Error(`只读字段 ${key} 不能设置为必填`);
      }
      return [
        key,
        { visible: rule.visible, editable, required: rule.required },
      ];
    }),
  ) as Record<ShareFormFieldKey, ShareFormFieldRule>;

  for (const key of ['platformId', 'wechatNickname'] as const) {
    if (!fields[key].visible) {
      throw new Error('公开登记必须显示下单平台和下单人微信昵称');
    }
    fields[key].editable = true;
    fields[key].required = true;
  }

  const settlementSource = candidate.settlementAmount;
  if (!settlementSource || typeof settlementSource !== 'object') {
    throw new Error('分享表单缺少回款金额配置');
  }
  const settlement = settlementSource as {
    mode?: unknown;
    fixedAmount?: unknown;
    options?: unknown;
  };
  if (
    typeof settlement.mode !== 'string' ||
    !SETTLEMENT_MODES.has(settlement.mode as SettlementAmountMode)
  ) {
    throw new Error('预计回款金额模式不正确');
  }

  const mode = settlement.mode as SettlementAmountMode;
  const options = Array.isArray(settlement.options)
    ? [...new Set(settlement.options)].filter(validMoney).sort((a, b) => a - b)
    : [];
  if (mode === 'PRESET' && options.length === 0) {
    throw new Error('预设金额模式至少需要一个金额选项');
  }
  if (options.length > 50) {
    throw new Error('预设金额选项不能超过 50 个');
  }
  if (mode === 'FIXED' && !validMoney(settlement.fixedAmount)) {
    throw new Error('固定金额模式必须填写有效金额');
  }

  if (mode === 'ADMIN_ONLY') {
    fields.submitterSettlementAmount = {
      visible: false,
      editable: false,
      required: false,
    };
  } else {
    fields.submitterSettlementAmount.visible = true;
  }

  return {
    schemaVersion: 1,
    fields,
    settlementAmount: {
      mode,
      fixedAmount:
        mode === 'FIXED' ? (settlement.fixedAmount as number) : undefined,
      options: mode === 'PRESET' ? options : [],
    },
  };
}
