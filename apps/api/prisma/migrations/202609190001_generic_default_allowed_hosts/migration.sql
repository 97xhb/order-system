-- 域名白名单不再内置个人域名默认值。
-- 已部署系统只移除历史默认域名，保留管理员自己配置的域名，避免升级后域名访问失效。
ALTER TABLE "system_settings"
ALTER COLUMN "allowed_hosts" SET DEFAULT ARRAY['localhost']::TEXT[];

UPDATE "system_settings"
SET "allowed_hosts" = array_remove(
  array_remove("allowed_hosts", 'www.877727.xyz'),
  '877727.xyz'
)
WHERE "allowed_hosts" && ARRAY['www.877727.xyz', '877727.xyz']::TEXT[];
