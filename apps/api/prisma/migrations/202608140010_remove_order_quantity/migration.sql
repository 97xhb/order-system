ALTER TABLE "orders" DROP COLUMN IF EXISTS "quantity";

UPDATE "share_forms"
SET "field_config" = jsonb_set(
  jsonb_set(
    "field_config",
    '{fields}',
    COALESCE("field_config" -> 'fields', '{}'::jsonb) - 'quantity',
    true
  ),
  '{fields,platformAccount}',
  COALESCE(
    "field_config" #> '{fields,platformAccount}',
    '{"visible":true,"required":true}'::jsonb
  ),
  true
);
