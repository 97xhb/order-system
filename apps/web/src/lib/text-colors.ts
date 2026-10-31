export interface TextColorPreset {
  label: string;
  value: string;
}

export const TEXT_COLOR_PRESETS = [
  { label: '红色', value: '#DC2626' },
  { label: '玫红', value: '#E11D48' },
  { label: '橙色', value: '#EA580C' },
  { label: '琥珀', value: '#D97706' },
  { label: '黄色', value: '#CA8A04' },
  { label: '青柠', value: '#65A30D' },
  { label: '绿色', value: '#059669' },
  { label: '青绿', value: '#0D9488' },
  { label: '青色', value: '#0891B2' },
  { label: '天蓝', value: '#0284C7' },
  { label: '蓝色', value: '#2563EB' },
  { label: '靛蓝', value: '#4F46E5' },
  { label: '紫罗兰', value: '#7C3AED' },
  { label: '紫色', value: '#9333EA' },
  { label: '粉色', value: '#DB2777' },
  { label: '灰色', value: '#64748B' },
] as const satisfies readonly TextColorPreset[];
