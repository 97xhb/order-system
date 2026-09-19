ALTER TABLE "payout_registration_forms"
ADD COLUMN "lookup_public_token" VARCHAR(128),
ADD COLUMN "lookup_enabled" BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE "payout_registration_forms"
SET "lookup_public_token" =
  md5(random()::text || clock_timestamp()::text || "id"::text) ||
  md5(random()::text || clock_timestamp()::text || "id"::text)
WHERE "lookup_public_token" IS NULL;

ALTER TABLE "payout_registration_forms"
ALTER COLUMN "lookup_public_token" SET NOT NULL;

CREATE UNIQUE INDEX "payout_registration_forms_lookup_public_token_key"
ON "payout_registration_forms"("lookup_public_token");
