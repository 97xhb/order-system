-- 订单变动监控通知：
-- 1) notification_channels 记录外部推送渠道（钉钉 / 企业微信 / PushPlus / 自定义 Webhook）
-- 2) notification_rules 记录每个事件的开关、标题与正文模板以及推送到哪些渠道
-- 3) notification_messages 记录站内通知中心的消息
CREATE TYPE "NotificationEvent" AS ENUM (
    'ORDER_SUBMITTED',
    'ORDER_BATCH_SUBMITTED',
    'ORDER_UPDATED_BY_SUBMITTER',
    'ORDER_DELETED_BY_SUBMITTER'
);

CREATE TYPE "NotificationChannelType" AS ENUM (
    'DINGTALK',
    'WECOM',
    'PUSHPLUS',
    'CUSTOM'
);

CREATE TABLE "notification_channels" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "type" "NotificationChannelType" NOT NULL,
    "endpoint" VARCHAR(512) NOT NULL,
    "secret" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_rules" (
    "id" UUID NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "title_template" VARCHAR(200) NOT NULL,
    "body_template" TEXT NOT NULL,
    "channel_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_messages" (
    "id" UUID NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "payload" JSONB,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_rules_event_key" ON "notification_rules"("event");
CREATE INDEX "notification_messages_read_at_created_at_idx" ON "notification_messages"("read_at", "created_at");
CREATE INDEX "notification_messages_event_created_at_idx" ON "notification_messages"("event", "created_at");
