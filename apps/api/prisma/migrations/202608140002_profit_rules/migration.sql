-- CreateEnum
CREATE TYPE "ProfitRuleScope" AS ENUM ('GLOBAL', 'CATEGORY', 'SCHEME', 'FUNDING_TYPE');

-- CreateEnum
CREATE TYPE "ProfitRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "profit_rules" (
    "id" UUID NOT NULL,
    "scope" "ProfitRuleScope" NOT NULL,
    "scope_key" VARCHAR(100) NOT NULL,
    "active_scope_key" VARCHAR(100),
    "category_id" UUID,
    "scheme_id" UUID,
    "funding_type" "FundingType",
    "name" VARCHAR(150) NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "requires_full_customer_payment" BOOLEAN NOT NULL DEFAULT true,
    "status" "ProfitRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "profit_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profit_rules_version_positive" CHECK ("version" > 0),
    CONSTRAINT "profit_rules_active_scope_key" CHECK (
        ("status" = 'ACTIVE' AND "active_scope_key" = "scope_key")
        OR ("status" <> 'ACTIVE' AND "active_scope_key" IS NULL)
    ),
    CONSTRAINT "profit_rules_scope_target" CHECK (
        ("scope" = 'GLOBAL' AND "category_id" IS NULL AND "scheme_id" IS NULL AND "funding_type" IS NULL)
        OR ("scope" = 'CATEGORY' AND "category_id" IS NOT NULL AND "scheme_id" IS NULL AND "funding_type" IS NULL)
        OR ("scope" = 'SCHEME' AND "category_id" IS NULL AND "scheme_id" IS NOT NULL AND "funding_type" IS NULL)
        OR ("scope" = 'FUNDING_TYPE' AND "category_id" IS NULL AND "scheme_id" IS NULL AND "funding_type" IS NOT NULL)
    )
);

-- AlterTable
ALTER TABLE "orders"
ADD COLUMN "profit_rule_id" UUID,
ADD COLUMN "shipping_cost_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "service_fee_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "other_income_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "other_cost_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "profit_adjustment_reason" TEXT,
ADD COLUMN "profit_rule_version" INTEGER,
ADD COLUMN "profit_rule_snapshot" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "profit_rules_scope_key_version_key" ON "profit_rules"("scope_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "profit_rules_active_scope_key_key" ON "profit_rules"("active_scope_key");

-- CreateIndex
CREATE INDEX "profit_rules_scope_status_idx" ON "profit_rules"("scope", "status");

-- CreateIndex
CREATE INDEX "profit_rules_category_id_status_idx" ON "profit_rules"("category_id", "status");

-- CreateIndex
CREATE INDEX "profit_rules_scheme_id_status_idx" ON "profit_rules"("scheme_id", "status");

-- CreateIndex
CREATE INDEX "orders_profit_rule_id_idx" ON "orders"("profit_rule_id");

-- AddForeignKey
ALTER TABLE "profit_rules" ADD CONSTRAINT "profit_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_rules" ADD CONSTRAINT "profit_rules_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "order_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_rules" ADD CONSTRAINT "profit_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_profit_rule_id_fkey" FOREIGN KEY ("profit_rule_id") REFERENCES "profit_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the first active global rule. Later edits create a new version instead of overwriting this row.
INSERT INTO "profit_rules" (
    "id",
    "scope",
    "scope_key",
    "active_scope_key",
    "name",
    "version",
    "definition",
    "requires_full_customer_payment",
    "status",
    "created_at",
    "updated_at"
) VALUES (
    gen_random_uuid(),
    'GLOBAL',
    'GLOBAL',
    'GLOBAL',
    '默认利润规则',
    1,
    '{"schemaVersion":1,"roundingScale":2,"terms":[{"field":"CUSTOMER_RECEIVED_AMOUNT","operation":"ADD"},{"field":"SUBMITTER_SETTLEMENT_AMOUNT","operation":"SUBTRACT"},{"field":"PAYMENT_DISCOUNT_AMOUNT","operation":"ADD"},{"field":"PLATFORM_REBATE_AMOUNT","operation":"ADD"}]}'::jsonb,
    true,
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
