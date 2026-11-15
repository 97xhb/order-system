-- 圆角改为分刻度可配：标签 / 控件按钮 / 卡片 / 弹窗 各自独立
ALTER TABLE "system_settings"
    ADD COLUMN "theme_radius_chip" SMALLINT NOT NULL DEFAULT 5,
    ADD COLUMN "theme_radius_control" SMALLINT NOT NULL DEFAULT 7,
    ADD COLUMN "theme_radius_card" SMALLINT NOT NULL DEFAULT 10,
    ADD COLUMN "theme_radius_dialog" SMALLINT NOT NULL DEFAULT 12;

ALTER TABLE "system_settings" DROP COLUMN "theme_radius";

DROP TYPE IF EXISTS "ThemeRadius";
