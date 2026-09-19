import { SettlementStatus } from '@prisma/client';
import {
  calculateProfitByRule,
  calculateSettledProfit,
  validateProfitRuleDefinition,
  type ProfitRuleDefinition,
} from './profit-calculator';

describe('profit calculator', () => {
  const baseInput = {
    customerReceivedAmount: 1_000,
    submitterSettlementAmount: 800,
    paymentDiscountAmount: 20,
    platformRebateAmount: 30,
  };

  it.each([
    SettlementStatus.UNPAID,
    SettlementStatus.PARTIAL,
    SettlementStatus.EXCEPTION,
  ])('returns zero when receivable status is %s', (receivableStatus) => {
    const result = calculateSettledProfit({ ...baseInput, receivableStatus });

    expect(result.toFixed(2)).toBe('0.00');
  });

  it('uses the default rule after the customer has fully paid', () => {
    const result = calculateSettledProfit({
      ...baseInput,
      receivableStatus: SettlementStatus.PAID,
    });

    expect(result.toFixed(2)).toBe('250.00');
  });

  it('supports field coefficients, fixed amounts and order adjustment', () => {
    const definition: ProfitRuleDefinition = {
      schemaVersion: 1,
      roundingScale: 2,
      terms: [
        {
          field: 'CUSTOMER_RECEIVED_AMOUNT',
          operation: 'ADD',
          coefficient: '1.1',
        },
        { field: 'ORDER_AMOUNT', operation: 'SUBTRACT' },
        { fixedAmount: '12.34', operation: 'SUBTRACT' },
      ],
    };

    const result = calculateProfitByRule(
      {
        ...baseInput,
        receivableStatus: SettlementStatus.PAID,
        orderAmount: '900.00',
        profitAdjustment: '-5.66',
      },
      definition,
    );

    expect(result.toFixed(2)).toBe('182.00');
  });

  it('can calculate before full payment when the configured gate is disabled', () => {
    const result = calculateSettledProfit(
      {
        ...baseInput,
        customerReceivedAmount: 400,
        receivableStatus: SettlementStatus.PARTIAL,
      },
      { requiresFullCustomerPayment: false },
    );

    expect(result.toFixed(2)).toBe('-350.00');
  });

  it('rejects unsupported or ambiguous terms', () => {
    expect(
      validateProfitRuleDefinition({
        schemaVersion: 1,
        terms: [
          {
            field: 'UNKNOWN_AMOUNT',
            fixedAmount: '10',
            operation: 'MULTIPLY',
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        '第 1 项运算只能是加或减',
        '第 1 项必须且只能选择一个金额字段或固定金额',
      ]),
    );
  });

  it('rejects amount fields that no longer exist in the order list', () => {
    expect(
      validateProfitRuleDefinition({
        schemaVersion: 1,
        terms: [{ field: 'SHIPPING_COST_AMOUNT', operation: 'SUBTRACT' }],
      }),
    ).toContain('第 1 项引用了不支持的金额字段');
  });
});
