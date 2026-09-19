-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SubmitterStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('ADMIN', 'SHARE', 'BOT', 'IMPORT');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('NOT_SHIPPED', 'SHIPPED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "FundingType" AS ENUM ('SELF_PAID', 'SUBMITTER_ADVANCED', 'OTHER');

-- CreateEnum
CREATE TYPE "ShareFormStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PayoutMethodType" AS ENUM ('WECHAT', 'ALIPAY', 'BANK_CARD', 'DIGITAL_CNY', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "PayoutMethodStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "MoneyMethod" AS ENUM ('WECHAT', 'ALIPAY', 'BANK_CARD', 'DIGITAL_CNY', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomFieldScope" AS ENUM ('ORDER', 'SHARE_FORM', 'SUBMITTER');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'INTEGER', 'QUANTITY', 'MONEY', 'DATE', 'DATETIME', 'SINGLE_SELECT', 'MULTI_SELECT', 'BOOLEAN', 'LINK', 'IMAGE', 'FILE');

-- CreateEnum
CREATE TYPE "AffiliateCommissionStatus" AS ENUM ('ESTIMATED', 'PENDING', 'CONFIRMED', 'SETTLED', 'INVALID');

-- CreateEnum
CREATE TYPE "ExternalIdentityProvider" AS ENUM ('DEVICE_COOKIE', 'WECHAT_OAUTH', 'PHONE', 'PERSONAL_CODE');

-- CreateEnum
CREATE TYPE "ExternalIdentityStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platforms" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submitters" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "nickname" VARCHAR(100),
    "phone" VARCHAR(32),
    "wechat_id" VARCHAR(100),
    "status" "SubmitterStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "submitters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_accounts" (
    "id" UUID NOT NULL,
    "platform_id" UUID NOT NULL,
    "submitter_id" UUID NOT NULL,
    "account_name" VARCHAR(100) NOT NULL,
    "account_identifier" VARCHAR(150),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_schemes" (
    "id" UUID NOT NULL,
    "category_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "product_name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "default_values" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_forms" (
    "id" UUID NOT NULL,
    "scheme_id" UUID NOT NULL,
    "public_token" VARCHAR(128) NOT NULL,
    "status" "ShareFormStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "field_config" JSONB NOT NULL,
    "allow_edit_before_approval" BOOLEAN NOT NULL DEFAULT true,
    "allow_delete_before_approval" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "submission_limit" INTEGER,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "share_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nickname" VARCHAR(120),
    "phone" VARCHAR(32),
    "address" TEXT,
    "notes" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "serial_no" SERIAL NOT NULL,
    "source" "OrderSource" NOT NULL DEFAULT 'ADMIN',
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "status" "OrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "shipment_status" "ShipmentStatus" NOT NULL DEFAULT 'NOT_SHIPPED',
    "receivable_status" "SettlementStatus" NOT NULL DEFAULT 'UNPAID',
    "submitter_settlement_status" "SettlementStatus" NOT NULL DEFAULT 'UNPAID',
    "share_form_id" UUID,
    "external_identity_id" UUID,
    "external_edit_token" VARCHAR(128),
    "submitter_id" UUID NOT NULL,
    "platform_id" UUID NOT NULL,
    "platform_account_id" UUID NOT NULL,
    "category_id" UUID,
    "scheme_id" UUID,
    "customer_id" UUID,
    "ordered_at" TIMESTAMPTZ(3) NOT NULL,
    "product_name_snapshot" VARCHAR(200) NOT NULL,
    "scheme_name_snapshot" VARCHAR(150),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "platform_order_no" VARCHAR(150),
    "inbound_tracking_no" VARCHAR(150),
    "purchase_address" TEXT,
    "funding_type" "FundingType" NOT NULL,
    "order_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "payment_discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "submitter_settlement_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "platform_rebate_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sale_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "customer_received_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "submitter_paid_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expected_profit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "settled_profit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "profit_adjustment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "custom_data" JSONB,
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "tracking_no" VARCHAR(150) NOT NULL,
    "carrier" VARCHAR(100),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'SHIPPED',
    "shipped_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_orders" (
    "shipment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_orders_pkey" PRIMARY KEY ("shipment_id","order_id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "MoneyMethod" NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "reference_no" VARCHAR(150),
    "proof_storage_key" VARCHAR(500),
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_allocations" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_methods" (
    "id" UUID NOT NULL,
    "submitter_id" UUID NOT NULL,
    "type" "PayoutMethodType" NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "account_name" VARCHAR(150),
    "account_value_encrypted" TEXT,
    "bank_name" VARCHAR(150),
    "qr_code_storage_key" VARCHAR(500),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "PayoutMethodStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "payout_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "submitter_id" UUID NOT NULL,
    "payout_method_id" UUID,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "MoneyMethod" NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "method_snapshot" JSONB NOT NULL,
    "reference_no" VARCHAR(150),
    "proof_storage_key" VARCHAR(500),
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_allocations" (
    "id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" UUID NOT NULL,
    "scope" "CustomFieldScope" NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "label" VARCHAR(150) NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "show_in_table" BOOLEAN NOT NULL DEFAULT false,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "externally_visible" BOOLEAN NOT NULL DEFAULT false,
    "externally_editable" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_custom_field_values" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "order_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_platforms" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_accounts" (
    "id" UUID NOT NULL,
    "affiliate_platform_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "credentials_encrypted" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "token_expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_promotion_channels" (
    "id" UUID NOT NULL,
    "affiliate_account_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(150) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_promotion_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_link_conversions" (
    "id" UUID NOT NULL,
    "affiliate_platform_id" UUID NOT NULL,
    "promotion_channel_id" UUID,
    "original_url" TEXT NOT NULL,
    "normalized_url" TEXT,
    "product_external_id" VARCHAR(150),
    "promotion_url" TEXT,
    "short_url" TEXT,
    "promotion_text" TEXT,
    "source" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "error_message" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_link_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_orders" (
    "id" UUID NOT NULL,
    "affiliate_platform_id" UUID NOT NULL,
    "promotion_channel_id" UUID,
    "order_id" UUID,
    "external_order_no" VARCHAR(150) NOT NULL,
    "product_external_id" VARCHAR(150),
    "paid_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimated_commission" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "confirmed_commission" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "settled_commission" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "commission_status" "AffiliateCommissionStatus" NOT NULL DEFAULT 'ESTIMATED',
    "ordered_at" TIMESTAMPTZ(3),
    "settled_at" TIMESTAMPTZ(3),
    "raw_data" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identities" (
    "id" UUID NOT NULL,
    "submitter_id" UUID,
    "provider" "ExternalIdentityProvider" NOT NULL,
    "provider_key_hash" VARCHAR(128),
    "provider_key_encrypted" TEXT,
    "display_code" VARCHAR(32) NOT NULL,
    "status" "ExternalIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identity_sessions" (
    "id" UUID NOT NULL,
    "external_identity_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identity_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_admin_id" UUID,
    "source" VARCHAR(50) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "platforms_code_key" ON "platforms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "submitters_code_key" ON "submitters"("code");

-- CreateIndex
CREATE INDEX "submitters_name_idx" ON "submitters"("name");

-- CreateIndex
CREATE INDEX "submitters_phone_idx" ON "submitters"("phone");

-- CreateIndex
CREATE INDEX "platform_accounts_submitter_id_enabled_idx" ON "platform_accounts"("submitter_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "platform_accounts_platform_id_account_identifier_key" ON "platform_accounts"("platform_id", "account_identifier");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "order_schemes_code_key" ON "order_schemes"("code");

-- CreateIndex
CREATE INDEX "order_schemes_enabled_sort_order_idx" ON "order_schemes"("enabled", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "share_forms_scheme_id_key" ON "share_forms"("scheme_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_forms_public_token_key" ON "share_forms"("public_token");

-- CreateIndex
CREATE INDEX "share_forms_status_expires_at_idx" ON "share_forms"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "orders_serial_no_key" ON "orders"("serial_no");

-- CreateIndex
CREATE UNIQUE INDEX "orders_external_edit_token_key" ON "orders"("external_edit_token");

-- CreateIndex
CREATE INDEX "orders_ordered_at_idx" ON "orders"("ordered_at");

-- CreateIndex
CREATE INDEX "orders_review_status_deleted_at_idx" ON "orders"("review_status", "deleted_at");

-- CreateIndex
CREATE INDEX "orders_shipment_status_deleted_at_idx" ON "orders"("shipment_status", "deleted_at");

-- CreateIndex
CREATE INDEX "orders_receivable_status_deleted_at_idx" ON "orders"("receivable_status", "deleted_at");

-- CreateIndex
CREATE INDEX "orders_submitter_settlement_status_deleted_at_idx" ON "orders"("submitter_settlement_status", "deleted_at");

-- CreateIndex
CREATE INDEX "orders_submitter_id_ordered_at_idx" ON "orders"("submitter_id", "ordered_at");

-- CreateIndex
CREATE INDEX "orders_external_identity_id_review_status_idx" ON "orders"("external_identity_id", "review_status");

-- CreateIndex
CREATE INDEX "orders_customer_id_ordered_at_idx" ON "orders"("customer_id", "ordered_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_platform_id_platform_order_no_key" ON "orders"("platform_id", "platform_order_no");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_tracking_no_key" ON "shipments"("tracking_no");

-- CreateIndex
CREATE INDEX "shipments_customer_id_shipped_at_idx" ON "shipments"("customer_id", "shipped_at");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_orders_order_id_key" ON "shipment_orders"("order_id");

-- CreateIndex
CREATE INDEX "receipts_customer_id_received_at_idx" ON "receipts"("customer_id", "received_at");

-- CreateIndex
CREATE INDEX "receipt_allocations_order_id_idx" ON "receipt_allocations"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_allocations_receipt_id_order_id_key" ON "receipt_allocations"("receipt_id", "order_id");

-- CreateIndex
CREATE INDEX "payout_methods_submitter_id_is_default_status_idx" ON "payout_methods"("submitter_id", "is_default", "status");

-- CreateIndex
CREATE INDEX "payouts_submitter_id_paid_at_idx" ON "payouts"("submitter_id", "paid_at");

-- CreateIndex
CREATE INDEX "payout_allocations_order_id_idx" ON "payout_allocations"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_allocations_payout_id_order_id_key" ON "payout_allocations"("payout_id", "order_id");

-- CreateIndex
CREATE INDEX "custom_field_definitions_scope_enabled_sort_order_idx" ON "custom_field_definitions"("scope", "enabled", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_scope_key_key" ON "custom_field_definitions"("scope", "key");

-- CreateIndex
CREATE INDEX "order_custom_field_values_definition_id_idx" ON "order_custom_field_values"("definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_custom_field_values_order_id_definition_id_key" ON "order_custom_field_values"("order_id", "definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_platforms_code_key" ON "affiliate_platforms"("code");

-- CreateIndex
CREATE INDEX "affiliate_accounts_affiliate_platform_id_enabled_idx" ON "affiliate_accounts"("affiliate_platform_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_promotion_channels_affiliate_account_id_external__key" ON "affiliate_promotion_channels"("affiliate_account_id", "external_code");

-- CreateIndex
CREATE INDEX "affiliate_link_conversions_affiliate_platform_id_created_at_idx" ON "affiliate_link_conversions"("affiliate_platform_id", "created_at");

-- CreateIndex
CREATE INDEX "affiliate_link_conversions_product_external_id_idx" ON "affiliate_link_conversions"("product_external_id");

-- CreateIndex
CREATE INDEX "affiliate_orders_order_id_idx" ON "affiliate_orders"("order_id");

-- CreateIndex
CREATE INDEX "affiliate_orders_commission_status_settled_at_idx" ON "affiliate_orders"("commission_status", "settled_at");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_orders_affiliate_platform_id_external_order_no_key" ON "affiliate_orders"("affiliate_platform_id", "external_order_no");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_display_code_key" ON "external_identities"("display_code");

-- CreateIndex
CREATE INDEX "external_identities_submitter_id_status_idx" ON "external_identities"("submitter_id", "status");

-- CreateIndex
CREATE INDEX "external_identities_last_seen_at_idx" ON "external_identities"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_provider_provider_key_hash_key" ON "external_identities"("provider", "provider_key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "external_identity_sessions_token_hash_key" ON "external_identity_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "external_identity_sessions_external_identity_id_expires_at_idx" ON "external_identity_sessions"("external_identity_id", "expires_at");

-- CreateIndex
CREATE INDEX "external_identity_sessions_expires_at_revoked_at_idx" ON "external_identity_sessions"("expires_at", "revoked_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_admin_id_created_at_idx" ON "audit_logs"("actor_admin_id", "created_at");

-- AddForeignKey
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "submitters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_schemes" ADD CONSTRAINT "order_schemes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_forms" ADD CONSTRAINT "share_forms_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "order_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_forms" ADD CONSTRAINT "share_forms_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_share_form_id_fkey" FOREIGN KEY ("share_form_id") REFERENCES "share_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_external_identity_id_fkey" FOREIGN KEY ("external_identity_id") REFERENCES "external_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "submitters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "order_schemes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_methods" ADD CONSTRAINT "payout_methods_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "submitters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "submitters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payout_method_id_fkey" FOREIGN KEY ("payout_method_id") REFERENCES "payout_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_allocations" ADD CONSTRAINT "payout_allocations_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_allocations" ADD CONSTRAINT "payout_allocations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_custom_field_values" ADD CONSTRAINT "order_custom_field_values_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_custom_field_values" ADD CONSTRAINT "order_custom_field_values_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "custom_field_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_accounts" ADD CONSTRAINT "affiliate_accounts_affiliate_platform_id_fkey" FOREIGN KEY ("affiliate_platform_id") REFERENCES "affiliate_platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_promotion_channels" ADD CONSTRAINT "affiliate_promotion_channels_affiliate_account_id_fkey" FOREIGN KEY ("affiliate_account_id") REFERENCES "affiliate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_link_conversions" ADD CONSTRAINT "affiliate_link_conversions_affiliate_platform_id_fkey" FOREIGN KEY ("affiliate_platform_id") REFERENCES "affiliate_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_link_conversions" ADD CONSTRAINT "affiliate_link_conversions_promotion_channel_id_fkey" FOREIGN KEY ("promotion_channel_id") REFERENCES "affiliate_promotion_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_orders" ADD CONSTRAINT "affiliate_orders_affiliate_platform_id_fkey" FOREIGN KEY ("affiliate_platform_id") REFERENCES "affiliate_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_orders" ADD CONSTRAINT "affiliate_orders_promotion_channel_id_fkey" FOREIGN KEY ("promotion_channel_id") REFERENCES "affiliate_promotion_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_orders" ADD CONSTRAINT "affiliate_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "submitters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identity_sessions" ADD CONSTRAINT "external_identity_sessions_external_identity_id_fkey" FOREIGN KEY ("external_identity_id") REFERENCES "external_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
