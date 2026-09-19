import { Prisma } from '@prisma/client';

export const SCAN_REBATE_RATE = new Prisma.Decimal('0.9');

export const calculateScanRebateAmount = (scanAmount: Prisma.Decimal.Value) =>
  new Prisma.Decimal(scanAmount).mul(SCAN_REBATE_RATE).toDecimalPlaces(2);

export const inferScanAmountFromRebate = (rebateAmount: Prisma.Decimal.Value) =>
  new Prisma.Decimal(rebateAmount).div(SCAN_REBATE_RATE).toDecimalPlaces(2);
