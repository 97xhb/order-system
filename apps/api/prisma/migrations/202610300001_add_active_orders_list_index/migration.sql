CREATE INDEX "orders_deleted_at_serial_no_idx"
ON "orders"("deleted_at", "serial_no");
