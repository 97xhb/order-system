-- 快递查询接口从免费版切换到 PRO 版（支持自动识别与韵达/京东/EMS 等 2000+ 公司）。
-- PRO 接口没有匿名额度，必须配置 API Key，因此已有配置不做自动启用，只替换接口地址。

ALTER TABLE "logistics_settings"
ALTER COLUMN "endpoint" SET DEFAULT 'https://v1.apizero.cn/api/express-pro';

UPDATE "logistics_settings"
SET
  "endpoint" = 'https://v1.apizero.cn/api/express-pro',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "endpoint" = 'https://v1.apizero.cn/api/express';
