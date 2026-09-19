ALTER TABLE "system_settings"
ADD COLUMN "admin_entry_path" VARCHAR(64);

UPDATE "system_settings"
SET "admin_entry_path" = 'manage-' || SUBSTRING(
  MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT || "id"),
  1,
  24
)
WHERE "admin_entry_path" IS NULL;

ALTER TABLE "system_settings"
ALTER COLUMN "admin_entry_path" SET NOT NULL;
