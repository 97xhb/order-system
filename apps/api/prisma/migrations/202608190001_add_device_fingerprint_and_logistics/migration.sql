ALTER TABLE "admin_sessions"
ADD COLUMN "device_fingerprint_hash" VARCHAR(64);

CREATE INDEX "admin_sessions_admin_user_id_device_fingerprint_hash_idx"
ON "admin_sessions"("admin_user_id", "device_fingerprint_hash");

CREATE TABLE "logistics_settings" (
  "id" VARCHAR(32) NOT NULL DEFAULT 'default',
  "provider" VARCHAR(32) NOT NULL DEFAULT 'KDNIAO',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "business_id" VARCHAR(100),
  "app_key_encrypted" TEXT,
  "endpoint" VARCHAR(2048) NOT NULL DEFAULT 'https://api.kdniao.com/Ebusiness/EbusinessOrderHandle.aspx',
  "request_type" VARCHAR(16) NOT NULL DEFAULT '1002',
  "auto_detect_type" VARCHAR(16) NOT NULL DEFAULT '2002',
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "logistics_settings_pkey" PRIMARY KEY ("id")
);
