-- 全新安装先允许管理员直接登录，待管理员在系统设置中手动填写安全入口后再启用。
-- 已经存在管理员账号的系统保留当前入口，避免升级后意外关闭既有保护。
ALTER TABLE "system_settings"
ALTER COLUMN "admin_entry_path" DROP NOT NULL;

UPDATE "system_settings"
SET "admin_entry_path" = NULL
WHERE NOT EXISTS (SELECT 1 FROM "admin_users");
