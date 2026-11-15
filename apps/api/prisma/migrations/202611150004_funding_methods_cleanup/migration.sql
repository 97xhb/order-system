-- 支付方式目录收敛为三类：自己付 / 代付 / 其他。
-- 1) 移除测试期间预置的“朋友付款”及其利润规则
-- 2) “其他付款”统一命名为“其他”
DELETE FROM "profit_rules" WHERE "funding_type" = 'FRIEND_PAID';

DELETE FROM "funding_methods" WHERE "code" = 'FRIEND_PAID';

UPDATE "funding_methods" SET "name" = '其他' WHERE "code" = 'OTHER';

UPDATE "orders"
SET "funding_type" = 'OTHER'
WHERE "funding_type" = 'FRIEND_PAID';
