ALTER TABLE "submitters"
ALTER COLUMN "code" DROP NOT NULL;

UPDATE "submitters" AS "s"
SET "code" = NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM "external_identities" AS "ei"
  WHERE "ei"."submitter_id" = "s"."id"
);
