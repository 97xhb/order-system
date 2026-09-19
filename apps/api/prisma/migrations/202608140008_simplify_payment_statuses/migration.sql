-- 订单界面只保留未完成、已完成和异常三个资金状态。
-- 旧的部分回款金额仍保留，仅把状态归入未完成，避免丢失历史金额。
UPDATE "orders"
SET "receivable_status" = 'UNPAID'
WHERE "receivable_status" = 'PARTIAL';

UPDATE "orders"
SET "submitter_settlement_status" = 'UNPAID'
WHERE "submitter_settlement_status" = 'PARTIAL';
