-- AlterTable
ALTER TABLE "orders"
ADD COLUMN "submitter_wechat_nickname" VARCHAR(100),
ADD COLUMN "rebate_scanned" BOOLEAN;

-- CreateIndex
CREATE INDEX "orders_rebate_scanned_deleted_at_idx" ON "orders"("rebate_scanned", "deleted_at");
