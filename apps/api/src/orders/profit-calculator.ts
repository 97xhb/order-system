import { Prisma, SettlementStatus } from '@prisma/client';

export type MoneyInput = Prisma.Decimal | string | number;

export const PROFIT_RULE_FIELD_OPTIONS = [
  { value: 'PAYMENT_DISCOUNT_AMOUNT', label: '支付优惠' },
  { value: 'ORDER_AMOUNT', label: '下单金额' },
  { value: 'SUBMITTER_SETTLEMENT_AMOUNT', label: '结算金额' },
  { value: 'PLATFORM_REBATE_AMOUNT', label: '扫码返利' },
  { value: 'CUSTOMER_RECEIVED_AMOUNT', label: '回款金额' },
] as const;

export type ProfitRuleField =
  (typeof PROFIT_RULE_FIELD_OPTIONS)[number]['value'];

export const PROFIT_RULE_FIELDS: readonly ProfitRuleField[] =
  PROFIT_RULE_FIELD_OPTIONS.map((option) => option.value);
export type ProfitRuleOperation = 'ADD' | 'SUBTRACT';

export interface ProfitRuleTerm {
  operation: ProfitRuleOperation;
  field?: ProfitRuleField;
  fixedAmount?: string | number;
  coefficient?: string | number;
}

export interface ProfitRuleDefinition {
  schemaVersion: 1;
  terms: ProfitRuleTerm[];
  roundingScale?: number;
}

export interface ProfitCalculationInput {
  receivableStatus: SettlementStatus;
  saleAmount?: MoneyInput;
  customerReceivedAmount: MoneyInput;
  orderAmount?: MoneyInput;
  submitterSettlementAmount: MoneyInput;
  submitterPaidAmount?: MoneyInput;
  paymentDiscountAmount: MoneyInput;
  platformRebateAmount: MoneyInput;
  shippingCostAmount?: MoneyInput;
  serviceFeeAmount?: MoneyInput;
  otherIncomeAmount?: MoneyInput;
  otherCostAmount?: MoneyInput;
  profitAdjustment?: MoneyInput;
}

export interface SettledProfitOptions {
  definition?: ProfitRuleDefinition;
  requiresFullCustomerPayment?: boolean;
}

export const DEFAULT_PROFIT_RULE_DEFINITION: ProfitRuleDefinition = {
  schemaVersion: 1,
  roundingScale: 2,
  terms: [
    { field: 'CUSTOMER_RECEIVED_AMOUNT', operation: 'ADD' },
    { field: 'SUBMITTER_SETTLEMENT_AMOUNT', operation: 'SUBTRACT' },
    { field: 'PAYMENT_DISCOUNT_AMOUNT', operation: 'ADD' },
    { field: 'PLATFORM_REBATE_AMOUNT', operation: 'ADD' },
  ],
};

const MAX_RULE_TERMS = 64;
const MAX_COEFFICIENT = new Prisma.Decimal('1000000');

function isSupportedField(value: unknown): value is ProfitRuleField {
  return (
    typeof value === 'string' &&
    (PROFIT_RULE_FIELDS as readonly string[]).includes(value)
  );
}

function parseFiniteDecimal(value: unknown): Prisma.Decimal | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  try {
    const decimal = new Prisma.Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

export function validateProfitRuleDefinition(definition: unknown): string[] {
  if (!definition || typeof definition !== 'object') {
    return ['规则必须是结构化对象'];
  }

  const candidate = definition as Partial<ProfitRuleDefinition>;
  const errors: string[] = [];

  if (candidate.schemaVersion !== 1) {
    errors.push('暂不支持该规则结构版本');
  }

  if (!Array.isArray(candidate.terms) || candidate.terms.length === 0) {
    errors.push('利润规则至少需要一个计算项');
    return errors;
  }

  if (candidate.terms.length > MAX_RULE_TERMS) {
    errors.push(`利润规则最多允许 ${MAX_RULE_TERMS} 个计算项`);
  }

  candidate.terms.forEach((term, index) => {
    const label = `第 ${index + 1} 项`;

    if (!term || typeof term !== 'object') {
      errors.push(`${label}格式不正确`);
      return;
    }

    if (term.operation !== 'ADD' && term.operation !== 'SUBTRACT') {
      errors.push(`${label}运算只能是加或减`);
    }

    const hasField = term.field !== undefined;
    const hasFixedAmount = term.fixedAmount !== undefined;

    if (hasField === hasFixedAmount) {
      errors.push(`${label}必须且只能选择一个金额字段或固定金额`);
    } else if (hasField && !isSupportedField(term.field)) {
      errors.push(`${label}引用了不支持的金额字段`);
    } else if (
      hasFixedAmount &&
      parseFiniteDecimal(term.fixedAmount) === null
    ) {
      errors.push(`${label}固定金额格式不正确`);
    }

    if (term.coefficient !== undefined) {
      const coefficient = parseFiniteDecimal(term.coefficient);
      if (coefficient === null) {
        errors.push(`${label}系数格式不正确`);
      } else if (coefficient.abs().greaterThan(MAX_COEFFICIENT)) {
        errors.push(`${label}系数超出允许范围`);
      }
    }
  });

  if (
    candidate.roundingScale !== undefined &&
    (!Number.isInteger(candidate.roundingScale) ||
      candidate.roundingScale < 0 ||
      candidate.roundingScale > 4)
  ) {
    errors.push('金额保留小数位必须是 0 到 4 的整数');
  }

  return errors;
}

export function assertProfitRuleDefinition(
  definition: unknown,
): asserts definition is ProfitRuleDefinition {
  const errors = validateProfitRuleDefinition(definition);
  if (errors.length > 0) {
    throw new Error(errors.join('；'));
  }
}

function getFieldAmount(
  input: ProfitCalculationInput,
  field: ProfitRuleField,
): MoneyInput {
  switch (field) {
    case 'CUSTOMER_RECEIVED_AMOUNT':
      return input.customerReceivedAmount;
    case 'ORDER_AMOUNT':
      return input.orderAmount ?? 0;
    case 'SUBMITTER_SETTLEMENT_AMOUNT':
      return input.submitterSettlementAmount;
    case 'PAYMENT_DISCOUNT_AMOUNT':
      return input.paymentDiscountAmount;
    case 'PLATFORM_REBATE_AMOUNT':
      return input.platformRebateAmount;
  }
}

export function calculateProfitByRule(
  input: ProfitCalculationInput,
  definition: ProfitRuleDefinition = DEFAULT_PROFIT_RULE_DEFINITION,
): Prisma.Decimal {
  assertProfitRuleDefinition(definition);

  const result = definition.terms.reduce((total, term) => {
    const sourceAmount =
      term.field === undefined
        ? new Prisma.Decimal(term.fixedAmount ?? 0)
        : new Prisma.Decimal(getFieldAmount(input, term.field));
    const amount = sourceAmount.times(term.coefficient ?? 1);

    return term.operation === 'ADD' ? total.plus(amount) : total.minus(amount);
  }, new Prisma.Decimal(0));

  return result
    .plus(input.profitAdjustment ?? 0)
    .toDecimalPlaces(definition.roundingScale ?? 2);
}

export function calculateSettledProfit(
  input: ProfitCalculationInput,
  options: SettledProfitOptions = {},
): Prisma.Decimal {
  const requiresFullCustomerPayment =
    options.requiresFullCustomerPayment ?? true;

  if (
    requiresFullCustomerPayment &&
    input.receivableStatus !== SettlementStatus.PAID
  ) {
    return new Prisma.Decimal(0);
  }

  return calculateProfitByRule(
    input,
    options.definition ?? DEFAULT_PROFIT_RULE_DEFINITION,
  );
}
