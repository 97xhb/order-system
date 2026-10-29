import sanitizeHtml from 'sanitize-html';

const COLOR_PATTERNS = [
  /^#[0-9a-f]{3,8}$/i,
  /^rgb\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*\)$/i,
  /^rgba\(\s*(?:\d{1,3}\s*,\s*){3}(?:0|1|0?\.\d+)\s*\)$/i,
];

export function sanitizeShareFormRichText(value: string | null | undefined) {
  const input = value?.trim();
  if (!input) return null;

  const sanitized = sanitizeHtml(input, {
    allowedTags: [
      'p',
      'div',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      'span',
      'font',
    ],
    allowedAttributes: {
      font: ['color', 'size'],
      span: ['style'],
      p: ['style'],
      div: ['style'],
    },
    allowedStyles: {
      '*': {
        color: COLOR_PATTERNS,
        'font-size': [/^(12|14|16|18|20|24|28)px$/],
        'font-weight': [/^(400|500|600|700|bold)$/],
        'text-decoration': [/^(none|underline)$/],
        'text-align': [/^(left|center|right)$/],
      },
    },
    disallowedTagsMode: 'discard',
  });

  return sanitized.trim() || null;
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code[0] !== '#') return HTML_ENTITY_MAP[code.toLowerCase()] ?? entity;
      const numeric =
        code[1]?.toLowerCase() === 'x'
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
    },
  );
}

export function richTextToPlainText(value: string | null | undefined) {
  const html = sanitizeShareFormRichText(value);
  if (!html) return '';
  const withLineBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div)>/gi, '\n');
  const text = sanitizeHtml(withLineBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return decodeHtmlEntities(text)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
