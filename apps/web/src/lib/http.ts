import axios from 'axios';

const DEVICE_ID_STORAGE_KEY = 'order-system-admin-device-id';
let memoryDeviceId = '';

const createDeviceId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
};

const getDeviceId = () => {
  if (memoryDeviceId) return memoryDeviceId;
  try {
    const stored = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)?.trim();
    memoryDeviceId = stored || createDeviceId();
    if (!stored) window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, memoryDeviceId);
  } catch {
    memoryDeviceId = createDeviceId();
  }
  return memoryDeviceId;
};

const getDeviceName = () => {
  const userAgent = navigator.userAgent;
  let operatingSystem = '未知系统';
  if (/iPhone/i.test(userAgent)) operatingSystem = 'iPhone';
  else if (/iPad/i.test(userAgent)) operatingSystem = 'iPad';
  else if (/Android/i.test(userAgent)) operatingSystem = 'Android';
  else if (/Windows NT/i.test(userAgent)) operatingSystem = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(userAgent)) operatingSystem = 'macOS';
  else if (/Linux/i.test(userAgent)) operatingSystem = 'Linux';

  let browser = '浏览器';
  if (/MicroMessenger/i.test(userAgent)) browser = '微信';
  else if (/EdgA?\//i.test(userAgent)) browser = 'Microsoft Edge';
  else if (/OPR\//i.test(userAgent)) browser = 'Opera';
  else if (/Firefox\/|FxiOS\//i.test(userAgent)) browser = 'Mozilla Firefox';
  else if (/Chrome\/|CriOS\//i.test(userAgent)) browser = 'Google Chrome';
  else if (/Safari\//i.test(userAgent)) browser = 'Safari';

  return `${operatingSystem} · ${browser}`;
};

const getDeviceFingerprint = () => {
  const navigatorInfo = window.navigator;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  return [
    'v1',
    navigatorInfo.userAgent,
    navigatorInfo.platform,
    navigatorInfo.language,
    timezone,
    navigatorInfo.hardwareConcurrency || 0,
    navigatorInfo.maxTouchPoints || 0,
    'deviceMemory' in navigatorInfo
      ? String((navigatorInfo as Navigator & { deviceMemory?: number }).deviceMemory || 0)
      : '0',
  ].join('|');
};

export const http = axios.create({
  baseURL: '/api',
  timeout: 15_000,
  withCredentials: true,
});

http.interceptors.request.use((config) => {
  config.headers.set('X-Device-Id', getDeviceId());
  config.headers.set('X-Device-Fingerprint', getDeviceFingerprint());
  config.headers.set('X-Device-Name', encodeURIComponent(getDeviceName()));
  return config;
});
