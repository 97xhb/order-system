import type { Prisma } from '@prisma/client';

export const DEFAULT_AMOUNT_FORMULA_KEYS = [
  'orderAmount',
  'paymentDiscountAmount',
  'submitterSettlementAmount',
  'scanAmount',
  'saleAmount',
] as const;

export function normalizeAmountFormulas(
  value: Record<string, string> | undefined,
  allowedKeys: readonly string[] = DEFAULT_AMOUNT_FORMULA_KEYS,
) {
  if (!value) return undefined;
  const allowed = new Set(allowedKeys);
  const formulas: Record<string, string> = {};
  for (const [key, formula] of Object.entries(value)) {
    if (!allowed.has(key) || typeof formula !== 'string') continue;
    const normalized = formula.trim();
    if (!normalized) {
      formulas[key] = '';
      continue;
    }
    if (!normalized.startsWith('=') || normalized.length > 500) continue;
    formulas[key] = normalized;
  }
  return formulas;
}

export function amountFormulasFromCustomData(
  value: Prisma.JsonValue,
  allowedKeys: readonly string[] = DEFAULT_AMOUNT_FORMULA_KEYS,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const formulas = (value as Record<string, unknown>).amountFormulas;
  if (!formulas || typeof formulas !== 'object' || Array.isArray(formulas)) {
    return {};
  }
  return (
    normalizeAmountFormulas(formulas as Record<string, string>, allowedKeys) ??
    {}
  );
}
