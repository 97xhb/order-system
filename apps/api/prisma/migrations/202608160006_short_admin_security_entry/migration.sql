UPDATE "system_settings"
SET "admin_entry_path" = UPPER(
  SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8)
) || 'A1'
WHERE "admin_entry_path" !~ '^[A-Za-z0-9]{5,12}$'
   OR "admin_entry_path" !~ '[A-Za-z]'
   OR "admin_entry_path" !~ '[0-9]';

ALTER TABLE "system_settings"
ALTER COLUMN "admin_entry_path" TYPE VARCHAR(12);
