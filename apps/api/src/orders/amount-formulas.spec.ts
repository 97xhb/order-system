import {
  amountFormulasFromCustomData,
  normalizeAmountFormulas,
} from './amount-formulas';

describe('amount formulas', () => {
  it('keeps only allowed formula fields with safe formula syntax', () => {
    expect(
      normalizeAmountFormulas(
        {
          orderAmount: '=100+5',
          saleAmount: '=200-10',
          notes: '=1+1',
          paymentDiscountAmount: '100',
          submitterSettlementAmount: '=0/2',
        },
        ['orderAmount', 'submitterSettlementAmount'],
      ),
    ).toEqual({
      orderAmount: '=100+5',
      submitterSettlementAmount: '=0/2',
    });
  });

  it('reads saved formulas from order custom data', () => {
    expect(
      amountFormulasFromCustomData(
        {
          amountFormulas: {
            orderAmount: '=99+1',
            paymentDiscountAmount: '=5+5',
          },
        },
        ['orderAmount'],
      ),
    ).toEqual({ orderAmount: '=99+1' });
  });
});
