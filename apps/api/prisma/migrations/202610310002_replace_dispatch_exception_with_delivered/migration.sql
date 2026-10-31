ALTER TABLE "orders"
ALTER COLUMN "dispatch_status" DROP DEFAULT;

ALTER TYPE "DispatchStatus" RENAME TO "DispatchStatus_old";

CREATE TYPE "DispatchStatus" AS ENUM (
  'NOT_SHIPPED',
  'SHIPPED',
  'PARTIALLY_SHIPPED',
  'DELIVERED',
  'CANCELLED'
);

ALTER TABLE "orders"
ALTER COLUMN "dispatch_status" TYPE "DispatchStatus"
USING (
  CASE "dispatch_status"::text
    WHEN 'EXCEPTION' THEN 'NOT_SHIPPED'
    ELSE "dispatch_status"::text
  END
)::"DispatchStatus";

ALTER TABLE "orders"
ALTER COLUMN "dispatch_status" SET DEFAULT 'NOT_SHIPPED';

DROP TYPE "DispatchStatus_old";
