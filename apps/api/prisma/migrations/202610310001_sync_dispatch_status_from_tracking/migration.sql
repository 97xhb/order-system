UPDATE "orders"
SET
  "dispatch_status" = 'SHIPPED',
  "updated_at" = NOW()
WHERE
  "dispatch_status" = 'NOT_SHIPPED'
  AND "inbound_tracking_no" IS NOT NULL
  AND BTRIM("inbound_tracking_no") <> '';
