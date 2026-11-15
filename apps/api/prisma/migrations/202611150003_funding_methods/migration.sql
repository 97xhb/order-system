-- 支付方式从固定枚举升级为可维护目录：
-- 1) 新建 funding_methods 表，预置 自己付 / 代付 / 朋友付款 / 其他付款
-- 2) orders.funding_type 与 profit_rules.funding_type 由枚举改为 code 字符串
CREATE TABLE IF NOT EXISTS "funding_methods" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funding_methods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "funding_methods_code_key"
    ON "funding_methods" ("code");

CREATE UNIQUE INDEX IF NOT EXISTS "funding_methods_name_key"
    ON "funding_methods" ("name");

INSERT INTO "funding_methods" ("id", "code", "name", "enabled", "sort_order")
VALUES
    (gen_random_uuid(), 'SELF_PAID', '自己付', true, 10),
    (gen_random_uuid(), 'SUBMITTER_ADVANCED', '代付', true, 20),
    (gen_random_uuid(), 'FRIEND_PAID', '朋友付款', true, 30),
    (gen_random_uuid(), 'OTHER', '其他付款', true, 40)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "orders"
    ALTER COLUMN "funding_type" TYPE VARCHAR(64) USING "funding_type"::text;

ALTER TABLE "profit_rules"
    ALTER COLUMN "funding_type" TYPE VARCHAR(64) USING "funding_type"::text;

DROP TYPE IF EXISTS "FundingType";
