const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const evaluateMoneyFormula = (input: string): number | null => {
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
