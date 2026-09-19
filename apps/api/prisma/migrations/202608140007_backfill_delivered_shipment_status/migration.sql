UPDATE "orders"
SET "shipment_status" = 'DELIVERED'
WHERE "receivable_status" = 'PAID'
  AND "shipment_status" <> 'DELIVERED';
