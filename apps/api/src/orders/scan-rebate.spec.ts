import {
  calculateScanRebateAmount,
  inferScanAmountFromRebate,
} from './scan-rebate';

describe('scan rebate calculation', () => {
  it('calculates the actual rebate from the entered scan amount', () => {
    expect(calculateScanRebateAmount(100).toString()).toBe('90');
    expect(calculateScanRebateAmount(12.34).toString()).toBe('11.11');
  });

  it('infers the legacy scan amount from a saved rebate', () => {
    expect(inferScanAmountFromRebate(90).toString()).toBe('100');
    expect(inferScanAmountFromRebate(6).toString()).toBe('6.67');
  });
});
