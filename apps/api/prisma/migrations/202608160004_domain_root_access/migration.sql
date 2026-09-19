CREATE TYPE "RootAccessMode" AS ENUM ('NOT_FOUND', 'REDIRECT');

ALTER TABLE "system_settings"
ADD COLUMN "root_access_mode" "RootAccessMode" NOT NULL DEFAULT 'NOT_FOUND',
ADD COLUMN "root_redirect_url" VARCHAR(2048);
