/**
 * 剪贴板表格解析工具。
 * 后台批量录入与在线报单批量粘贴共用同一套解析规则，保证两边行为一致。
 */

export const normalizeHeaderLabel = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/[＊*]/g, '').replace(/\s+/g, '');

export const parseClipboardTable = (value: string) => {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const finishCell = () => {
    row.push(cell);
    cell = '';
  };
  const finishRow = () => {
    finishCell();
    if (row.some((item) => item.trim())) result.push(row);
    row = [];
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (quoted || !cell) {
        quoted = !quoted;
      } else {
        cell += character;
      }
      continue;
    }
    if (!quoted && character === '\t') {
      finishCell();
      continue;
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && value[index + 1] === '\n') index += 1;
      finishRow();
      continue;
    }
    cell += character;
  }
  if (cell || row.length) finishRow();
  return result;
};

export const normalizeNumberText = (value: string) => {
  const text = value.trim();
  if (!text) return '';
  // 完全没有数字时保留原文，交由校验提示「不是数字」，避免静默清空用户输入。
  if (!/\d/.test(text)) return text;
  const negative = /^\(.*\)$/.test(text);
  const numeric = text.replace(/[^\d.\-]/g, '');
  if (!numeric || numeric === '-' || numeric === '.') return '';
  const parsed = Number(numeric);
  if (!Number.isFinite(parsed)) return '';
  return String(negative ? -parsed : parsed);
};

export const normalizeDateText = (value: string) => {
  const text = value.trim();
  if (!text) return '';
  const matched = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (matched) {
    const [, year, month, day] = matched;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return '';
};
