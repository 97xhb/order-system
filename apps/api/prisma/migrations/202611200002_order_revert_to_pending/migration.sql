-- 管理员误点「通过」后可以把订单退回待确认，让下单人重新修改。
-- reverted_at 记录最近一次退回时间，作为「本次退回允许下单人修改」的标记。
ALTER TABLE "orders" ADD COLUMN "reverted_at" TIMESTAMP(3);
