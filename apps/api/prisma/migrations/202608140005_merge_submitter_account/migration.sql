-- 下单账号与下单人统一为一个“下单人名称”，通常填写微信昵称。
-- 平台只属于订单，不再作为下单人档案的一部分。

ALTER TYPE "PayoutMethodType" ADD VALUE IF NOT EXISTS 'QR_CODE';

UPDATE "submitters" AS "s"
SET "name" = "pa"."account_name"
FROM "platform_accounts" AS "pa"
WHERE "pa"."submitter_id" = "s"."id"
  AND "pa"."account_name" <> '';

ALTER TABLE "orders"
DROP CONSTRAINT "orders_platform_account_id_fkey";

ALTER TABLE "orders"
DROP COLUMN "platform_account_id";

DROP TABLE "platform_accounts";
