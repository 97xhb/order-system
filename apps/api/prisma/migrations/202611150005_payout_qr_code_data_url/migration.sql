-- 回款二维码改为直接保存图片数据（data URL），与方案富文本图片保持同一套存储方式：
-- 1) 原 qr_code_storage_key 字段从未启用，直接重命名并放宽为 TEXT
-- 2) 存量数据全部为空列，重命名不会丢数据
ALTER TABLE "payout_methods"
    RENAME COLUMN "qr_code_storage_key" TO "qr_code_data_url";

ALTER TABLE "payout_methods"
    ALTER COLUMN "qr_code_data_url" TYPE TEXT;
