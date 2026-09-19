import { SettlementStatus } from '@prisma/client';

export const ORDER_SETTLEMENT_STATUSES: SettlementStatus[] = [
  SettlementStatus.UNPAID,
  SettlementStatus.PAID,
  SettlementStatus.EXCEPTION,
];

export const normalizeOrderSettlementStatus = (
  status: SettlementStatus | undefined,
) => (status === SettlementStatus.PARTIAL ? SettlementStatus.UNPAID : status);
