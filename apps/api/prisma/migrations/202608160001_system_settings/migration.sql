CREATE TABLE "system_settings" (
  "id" VARCHAR(32) NOT NULL,
  "system_name" VARCHAR(80) NOT NULL DEFAULT '下单登记系统',
  "external_access_enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "system_settings" (
  "id",
  "system_name",
  "external_access_enabled",
  "updated_at"
)
VALUES ('default', '下单登记系统', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
