const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type MoneyFormulaVariables = Record<string, number | string | null | undefined>;

export const MONEY_FORMULA_VARIABLE_LABELS: Record<string, string> = {
  下单金额: '下单金额',
  支付优惠: '支付优惠',
  结算金额: '结算金额',
  回款金额: '回款金额',
  扫码金额: '扫码金额',
  数量: '数量',
};

export const extractProductQuantity = (productName: string | null | undefined) => {
  const raw = productName?.trim() ?? '';
  if (!raw) return 1;
  const matches = [...raw.matchAll(/[×*＊xX✕]\s*(\d+(?:\.\d+)?)/g)];
  if (!matches.length) return 1;
  const lastMatch = matches.at(-1);
  return roundMoney(Number(lastMatch?.[1] ?? 1));
};

export const evaluateMoneyFormula = (
  input: string,
  variables: MoneyFormulaVariables = {},
): number | null => {
  let source = input
    .trim()
    .replace(/^=/, '')
    .replace(/[，,\s]/g, '')
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('（', '(')
    .replaceAll('）', ')');
  if (!source) return null;

  const tokens: Array<number | string> = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '{') {
      const end = source.indexOf('}', index + 1);
      if (end === -1) return null;
      const variableName = source.slice(index + 1, end).trim();
      const rawValue = variables[variableName];
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        return null;
      }
      const value = Number(rawValue);
      if (!Number.isFinite(value)) return null;
      tokens.push(value);
      index = end + 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[0-9.]/.test(source[end])) end += 1;
      const raw = source.slice(index, end);
      if ((raw.match(/\./g) ?? []).length > 1) return null;
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;
      tokens.push(value);
      index = end;
      continue;
    }
    if ('+-*/()'.includes(char)) {
      tokens.push(char);
      index += 1;
      continue;
    }
    return null;
  }

  let cursor = 0;
  const parseExpression = (): number | null => {
    let value = parseTerm();
    if (value === null) return null;
    while (tokens[cursor] === '+' || tokens[cursor] === '-') {
      const operator = tokens[cursor++];
      const right = parseTerm();
      if (right === null) return null;
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  const parseTerm = (): number | null => {
    let value = parseFactor();
    if (value === null) return null;
    while (tokens[cursor] === '*' || tokens[cursor] === '/') {
      const operator = tokens[cursor++];
      const right = parseFactor();
      if (right === null || (operator === '/' && right === 0)) return null;
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const parseFactor = (): number | null => {
    const token = tokens[cursor++];
    if (typeof token === 'number') return token;
    if (token === '+' || token === '-') {
      const value = parseFactor();
      if (value === null) return null;
      return token === '-' ? -value : value;
    }
    if (token === '(') {
      const value = parseExpression();
      if (value === null || tokens[cursor] !== ')') return null;
      cursor += 1;
      return value;
    }
    return null;
  };

  const result = parseExpression();
  if (result === null || cursor !== tokens.length || !Number.isFinite(result)) return null;
  return roundMoney(result);
};

export const parseMoneyInput = (
  input: string,
  variables: MoneyFormulaVariables = {},
): number | null => {
  const value = input.trim();
  if (!value) return null;
  if (value.startsWith('=')) return evaluateMoneyFormula(value, variables);
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return roundMoney(number);
};
