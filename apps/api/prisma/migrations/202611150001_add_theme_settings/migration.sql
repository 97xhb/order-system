-- 系统主题可配置：主色、圆角刻度、卡片质感
CREATE TYPE "ThemeRadius" AS ENUM ('COMPACT', 'MEDIUM', 'SOFT');
CREATE TYPE "ThemeSurface" AS ENUM ('SOLID', 'GLASS');

ALTER TABLE "system_settings"
    ADD COLUMN "theme_primary" VARCHAR(16) NOT NULL DEFAULT '#4f7ef0',
    ADD COLUMN "theme_radius" "ThemeRadius" NOT NULL DEFAULT 'MEDIUM',
    ADD COLUMN "theme_surface" "ThemeSurface" NOT NULL DEFAULT 'GLASS';
