CREATE TABLE "order_archive_groups" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "color" VARCHAR(7),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "order_archive_groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "orders" ADD COLUMN "archive_group_id" UUID;

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_archive_group_id_fkey"
    FOREIGN KEY ("archive_group_id") REFERENCES "order_archive_groups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "order_archive_groups_sort_order_created_at_idx"
ON "order_archive_groups"("sort_order", "created_at");

CREATE INDEX "orders_archive_group_id_ordered_at_idx"
ON "orders"("archive_group_id", "ordered_at");
