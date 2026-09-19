ALTER TABLE "system_settings"
ADD COLUMN "allowed_hosts" TEXT[] NOT NULL
DEFAULT ARRAY['www.877727.xyz', '877727.xyz']::TEXT[];

ALTER TABLE "admin_sessions"
ADD COLUMN "device_id_hash" VARCHAR(64),
ADD COLUMN "device_name" VARCHAR(100);

CREATE INDEX "admin_sessions_admin_user_id_device_id_hash_idx"
ON "admin_sessions"("admin_user_id", "device_id_hash");

WITH "ranked_sessions" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY
        "admin_user_id",
        COALESCE(
          "device_id_hash",
          'legacy:' || COALESCE("ip_address", '') || ':' || MD5(COALESCE("user_agent", ''))
        )
      ORDER BY "last_seen_at" DESC, "created_at" DESC, "id" DESC
    ) AS "row_number"
  FROM "admin_sessions"
  WHERE "revoked_at" IS NULL
    AND "expires_at" > CURRENT_TIMESTAMP
)
UPDATE "admin_sessions"
SET "revoked_at" = CURRENT_TIMESTAMP
WHERE "id" IN (
  SELECT "id"
  FROM "ranked_sessions"
  WHERE "row_number" > 1
);

CREATE UNIQUE INDEX "admin_sessions_active_device_key"
ON "admin_sessions"("admin_user_id", "device_id_hash")
WHERE "device_id_hash" IS NOT NULL AND "revoked_at" IS NULL;
