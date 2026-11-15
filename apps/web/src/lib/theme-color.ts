/**
 * 把 CSS 变量（或其他 CSS 颜色值）解析成二维码库能用的十六进制色值。
 * `qrcode` 只接受 #rgb / #rrggbb / #rrggbbaa，遇到 var(...) 会直接抛
 * "Invalid hex color"，所以画到 canvas 上之前必须先拿到真实色值。
 */

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;

const normalize = (value: string) => {
  const trimmed = value.trim();
  if (HEX_PATTERN.test(trimmed)) return trimmed.toLowerCase();
  return null;
};

/**
 * 读取当前主题里某个 CSS 变量的实际色值。
 * 通过临时元素取计算样式，浏览器会把 var() 引用和 color-mix() 全部求值完，
 * 返回 rgb(...) 形式，再转成十六进制。
 */
export const resolveThemeColor = (variableName: string, fallback = '#101828'): string => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }

  const root = document.documentElement;
  const raw = window.getComputedStyle(root).getPropertyValue(variableName).trim();
  const direct = normalize(raw);
  if (direct) return direct;

  const probe = document.createElement('span');
  probe.style.position = 'fixed';
  probe.style.left = '-9999px';
  probe.style.width = '1px';
  probe.style.height = '1px';
  probe.style.color = `var(${variableName})`;
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe).color;
  document.body.removeChild(probe);

  const match = computed.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (match) return rgbToHex(Number(match[1]), Number(match[2]), Number(match[3]));

  return fallback;
};
