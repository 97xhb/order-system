/**
 * 支付方式目录的共享约定。
 *
 * 订单与利润规则都用 code 记录支付方式，名称由目录决定，
 * 这样管理员可以在基础设置里自行增删（自己付 / 代付 / 朋友付款 / 其他付款…）。
 */
export const DEFAULT_FUNDING_METHOD_CODE = 'SELF_PAID';

/** 兜底的“其他付款”，目录里被删掉时仍能正常写入订单。 */
export const FALLBACK_FUNDING_METHOD_CODE = 'OTHER';

export const FUNDING_METHOD_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const normalizeFundingMethodCode = (value: string) =>
  value.trim().toUpperCase();

export const isValidFundingMethodCode = (value: string) =>
  FUNDING_METHOD_CODE_PATTERN.test(value.trim());

/**
 * 目录全量（含停用），用于名称解析。
 * 停用的支付方式不能新建订单/规则，但历史数据仍然要显示中文名而不是编码。
 */
export const FUNDING_METHOD_OPTION_SELECT = {
  code: true,
  name: true,
  enabled: true,
} as const;
