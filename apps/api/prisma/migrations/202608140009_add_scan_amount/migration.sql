ALTER TABLE "orders"
ADD COLUMN "scan_amount" DECIMAL(18, 2) NOT NULL DEFAULT 0;

UPDATE "orders"
SET "scan_amount" = ROUND("platform_rebate_amount" / 0.9, 2)
WHERE "platform_rebate_amount" > 0;
