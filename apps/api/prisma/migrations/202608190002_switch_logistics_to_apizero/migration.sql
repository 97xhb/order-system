ALTER TABLE "logistics_settings"
ALTER COLUMN "provider" SET DEFAULT 'APIZERO',
ALTER COLUMN "endpoint" SET DEFAULT 'https://v1.apizero.cn/api/express',
ALTER COLUMN "request_type" SET DEFAULT 'GET',
ALTER COLUMN "auto_detect_type" SET DEFAULT 'AUTO';

UPDATE "logistics_settings"
SET
  "provider" = 'APIZERO',
  "enabled" = false,
  "business_id" = NULL,
  "app_key_encrypted" = NULL,
  "endpoint" = 'https://v1.apizero.cn/api/express',
  "request_type" = 'GET',
  "auto_detect_type" = 'AUTO',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "provider" <> 'APIZERO';
