import { createHash } from 'node:crypto';

export const normalizeDeviceName = (value?: string | null) => {
  const normalized = value
    ?.replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return normalized || null;
};

export const hashDeviceIdentifier = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized) return null;
  return createHash('sha256').update(normalized).digest('hex');
};

export const describeUserAgent = (value?: string | null) => {
  if (!value) return '未知设备';

  let operatingSystem = '未知系统';
  if (/iPhone/i.test(value)) operatingSystem = 'iPhone';
  else if (/iPad/i.test(value)) operatingSystem = 'iPad';
  else if (/Android/i.test(value)) operatingSystem = 'Android';
  else if (/Windows NT/i.test(value)) operatingSystem = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(value)) operatingSystem = 'macOS';
  else if (/Linux/i.test(value)) operatingSystem = 'Linux';

  let browser = '浏览器';
  if (/MicroMessenger/i.test(value)) browser = '微信';
  else if (/EdgA?\//i.test(value)) browser = 'Microsoft Edge';
  else if (/OPR\//i.test(value)) browser = 'Opera';
  else if (/Firefox\/|FxiOS\//i.test(value)) browser = 'Mozilla Firefox';
  else if (/Chrome\/|CriOS\//i.test(value)) browser = 'Google Chrome';
  else if (/Safari\//i.test(value)) browser = 'Safari';

  return `${operatingSystem} · ${browser}`;
};
