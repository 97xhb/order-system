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
