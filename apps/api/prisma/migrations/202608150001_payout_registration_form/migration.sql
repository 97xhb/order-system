CREATE TABLE "payout_registration_forms" (
  "id" UUID NOT NULL,
  "public_token" VARCHAR(128) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "payout_registration_forms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payout_registration_forms_public_token_key"
ON "payout_registration_forms"("public_token");
