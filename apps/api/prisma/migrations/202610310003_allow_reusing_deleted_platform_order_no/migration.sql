DROP INDEX "orders_platform_id_platform_order_no_key";

CREATE UNIQUE INDEX "orders_platform_id_platform_order_no_active_key"
ON "orders" ("platform_id", "platform_order_no")
WHERE
  "deleted_at" IS NULL
  AND "platform_order_no" IS NOT NULL;
