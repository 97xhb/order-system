WITH "ranked_legacy_sessions" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "admin_user_id", MD5(COALESCE("user_agent", ''))
      ORDER BY "last_seen_at" DESC, "created_at" DESC, "id" DESC
    ) AS "row_number"
  FROM "admin_sessions"
  WHERE "device_id_hash" IS NULL
    AND "revoked_at" IS NULL
    AND "expires_at" > CURRENT_TIMESTAMP
)
UPDATE "admin_sessions"
SET "revoked_at" = CURRENT_TIMESTAMP
WHERE "id" IN (
  SELECT "id"
  FROM "ranked_legacy_sessions"
  WHERE "row_number" > 1
);
