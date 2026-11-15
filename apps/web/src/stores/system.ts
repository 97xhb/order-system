import { defineStore } from 'pinia';
import { ref } from 'vue';
import { http } from '../lib/http';

export interface PublicSystemSettings {
  systemName: string;
  brandMarkText: string;
  themePrimary: string;
  themeRadiusChip: number;
  themeRadiusControl: number;
  themeRadiusCard: number;
  themeRadiusDialog: number;
  themeSurface: 'SOLID' | 'GLASS';
  externalAccessEnabled: boolean;
  accessAllowed: boolean;
  publicAccessAllowed: boolean;
  publicAccessReason: string;
  rootAccessMode: 'NOT_FOUND' | 'REDIRECT';
  rootRedirectUrl: string | null;
  adminEntryGranted: boolean;
  clientIp: string;
  localRequest: boolean;
  requestHost: string;
  hostAllowed: boolean;
  accessReason: string;
  updatedAt: string;
}

const DEFAULT_SYSTEM_NAME = '下单登记系统';
const DEFAULT_BRAND_MARK_TEXT = '浪姐';
const DEFAULT_THEME_PRIMARY = '#4f7ef0';

// 圆角刻度：四个层级分别可配，0–24px
export interface ThemeRadius {
  chip: number;
  control: number;
  card: number;
  dialog: number;
}

export const DEFAULT_RADIUS: ThemeRadius = {
  chip: 5,
  control: 7,
  card: 10,
  dialog: 12,
};

// 快捷预设：设置页一键填充四个刻度
export const RADIUS_PRESETS: Record<string, ThemeRadius> = {
  COMPACT: { chip: 4, control: 6, card: 8, dialog: 10 },
  MEDIUM: { chip: 5, control: 7, card: 10, dialog: 12 },
  SOFT: { chip: 7, control: 10, card: 14, dialog: 16 },
};

const clampRadius = (value: unknown, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(24, Math.max(0, Math.round(num)));
};

// 主色派生：主按钮渐变、聚焦光晕、信息色底都要跟着主色走
const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return { r: 79, g: 126, b: 240 };
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
};

const mixWithWhite = (hex: string, ratio: number) => {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel: number) =>
    Math.round(channel + (255 - channel) * ratio)
      .toString(16)
      .padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
};

const mixWithBlack = (hex: string, ratio: number) => {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel: number) =>
    Math.round(channel * (1 - ratio))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
};

export const applyThemeVariables = (
  primary: string,
  radius: ThemeRadius,
  surface: 'SOLID' | 'GLASS',
) => {
  const root = document.documentElement;
  const safePrimary = /^#[0-9a-fA-F]{6}$/.test(primary ?? '') ? primary : DEFAULT_THEME_PRIMARY;
  const scale = {
    chip: clampRadius(radius?.chip, DEFAULT_RADIUS.chip),
    control: clampRadius(radius?.control, DEFAULT_RADIUS.control),
    card: clampRadius(radius?.card, DEFAULT_RADIUS.card),
    dialog: clampRadius(radius?.dialog, DEFAULT_RADIUS.dialog),
  };
  const safeSurface: 'SOLID' | 'GLASS' = surface === 'SOLID' ? 'SOLID' : 'GLASS';
  root.style.setProperty('--app-primary', safePrimary);
  root.style.setProperty('--app-primary-soft', `${safePrimary}1f`);
  root.style.setProperty('--app-info', safePrimary);
  root.style.setProperty('--app-info-soft', mixWithWhite(safePrimary, 0.9));
  root.style.setProperty('--app-info-border', mixWithWhite(safePrimary, 0.72));
  root.style.setProperty('--app-accent-deep', mixWithBlack(safePrimary, 0.18));
  root.style.setProperty('--app-radius-chip', `${scale.chip}px`);
  root.style.setProperty('--app-radius-control', `${scale.control}px`);
  root.style.setProperty('--app-radius-card', `${scale.card}px`);
  root.style.setProperty('--app-radius-dialog', `${scale.dialog}px`);
  // Element Plus 自带圆角刻度同步跟随，round 按钮/标签才会跟着变
  root.style.setProperty('--el-border-radius-base', `${scale.control}px`);
  root.style.setProperty('--el-border-radius-small', `${scale.chip}px`);
  root.style.setProperty('--el-border-radius-round', `${scale.control}px`);
  // 玻璃质感开关：SOLID 时卡片改为纯白不透明
  const glass = safeSurface === 'GLASS';
  root.style.setProperty('--app-card', glass ? 'rgba(255, 255, 255, 0.78)' : '#ffffff');
  root.style.setProperty('--app-sidebar', glass ? 'rgba(255, 255, 255, 0.62)' : '#ffffff');
  root.style.setProperty('--app-topbar', glass ? 'rgba(255, 255, 255, 0.62)' : '#ffffff');
  root.dataset.surface = safeSurface.toLowerCase();
};

export const DEFAULT_THEME = {
  primary: DEFAULT_THEME_PRIMARY,
  radius: DEFAULT_RADIUS,
  surface: 'GLASS' as const,
};

export const useSystemStore = defineStore('system', () => {
  const systemName = ref(DEFAULT_SYSTEM_NAME);
  const brandMarkText = ref(DEFAULT_BRAND_MARK_TEXT);
  const themePrimary = ref(DEFAULT_THEME.primary);
  const themeRadiusChip = ref(DEFAULT_RADIUS.chip);
  const themeRadiusControl = ref(DEFAULT_RADIUS.control);
  const themeRadiusCard = ref(DEFAULT_RADIUS.card);
  const themeRadiusDialog = ref(DEFAULT_RADIUS.dialog);
  const themeSurface = ref<'SOLID' | 'GLASS'>(DEFAULT_THEME.surface);
  const externalAccessEnabled = ref(true);
  const accessAllowed = ref(true);
  const publicAccessAllowed = ref(true);
  const publicAccessReason = ref('LOCAL_REQUEST');
  const rootAccessMode = ref<'NOT_FOUND' | 'REDIRECT'>('NOT_FOUND');
  const rootRedirectUrl = ref('');
  const adminEntryGranted = ref(true);
  const clientIp = ref('');
  const localRequest = ref(true);
  const requestHost = ref(window.location.hostname);
  const hostAllowed = ref(true);
  const accessReason = ref('LOCAL_REQUEST');
  const initialized = ref(false);
  const loading = ref(false);

  const applySettings = (settings: Partial<PublicSystemSettings>) => {
    if (settings.systemName?.trim()) systemName.value = settings.systemName.trim();
    if (settings.brandMarkText?.trim()) brandMarkText.value = settings.brandMarkText.trim();
    if (settings.themePrimary?.trim()) themePrimary.value = settings.themePrimary.trim();
    themeRadiusChip.value = clampRadius(settings.themeRadiusChip, themeRadiusChip.value);
    themeRadiusControl.value = clampRadius(settings.themeRadiusControl, themeRadiusControl.value);
    themeRadiusCard.value = clampRadius(settings.themeRadiusCard, themeRadiusCard.value);
    themeRadiusDialog.value = clampRadius(settings.themeRadiusDialog, themeRadiusDialog.value);
    if (settings.themeSurface === 'SOLID' || settings.themeSurface === 'GLASS') {
      themeSurface.value = settings.themeSurface;
    }
    applyThemeVariables(
      themePrimary.value,
      {
        chip: themeRadiusChip.value,
        control: themeRadiusControl.value,
        card: themeRadiusCard.value,
        dialog: themeRadiusDialog.value,
      },
      themeSurface.value,
    );
    if (typeof settings.externalAccessEnabled === 'boolean') {
      externalAccessEnabled.value = settings.externalAccessEnabled;
    }
    if (typeof settings.accessAllowed === 'boolean') accessAllowed.value = settings.accessAllowed;
    if (typeof settings.publicAccessAllowed === 'boolean') {
      publicAccessAllowed.value = settings.publicAccessAllowed;
    }
    if (typeof settings.publicAccessReason === 'string') {
      publicAccessReason.value = settings.publicAccessReason;
    }
    if (settings.rootAccessMode === 'NOT_FOUND' || settings.rootAccessMode === 'REDIRECT') {
      rootAccessMode.value = settings.rootAccessMode;
    }
    if (typeof settings.rootRedirectUrl === 'string' || settings.rootRedirectUrl === null) {
      rootRedirectUrl.value = settings.rootRedirectUrl || '';
    }
    if (typeof settings.adminEntryGranted === 'boolean') {
      adminEntryGranted.value = settings.adminEntryGranted;
    }
    if (typeof settings.clientIp === 'string') clientIp.value = settings.clientIp;
    if (typeof settings.localRequest === 'boolean') localRequest.value = settings.localRequest;
    if (typeof settings.requestHost === 'string') requestHost.value = settings.requestHost;
    if (typeof settings.hostAllowed === 'boolean') hostAllowed.value = settings.hostAllowed;
    if (typeof settings.accessReason === 'string') accessReason.value = settings.accessReason;
    document.title = document.title.replace(/ - .*$/, ` - ${systemName.value}`);
  };

  const loadPublicSettings = async (force = false) => {
    if (initialized.value && !force) return;
    loading.value = true;
    try {
      const response = await http.get<PublicSystemSettings>('/system/public-settings', {
        timeout: 5_000,
        params: { t: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      });
      applySettings(response.data);
    } catch {
      accessAllowed.value = false;
      publicAccessAllowed.value = false;
      publicAccessReason.value = 'SYSTEM_SETTINGS_UNAVAILABLE';
      accessReason.value = 'SYSTEM_SETTINGS_UNAVAILABLE';
    } finally {
      initialized.value = true;
      loading.value = false;
    }
  };

  return {
    systemName,
    brandMarkText,
    themePrimary,
    themeRadiusChip,
    themeRadiusControl,
    themeRadiusCard,
    themeRadiusDialog,
    themeSurface,
    externalAccessEnabled,
    accessAllowed,
    publicAccessAllowed,
    publicAccessReason,
    rootAccessMode,
    rootRedirectUrl,
    adminEntryGranted,
    clientIp,
    localRequest,
    requestHost,
    hostAllowed,
    accessReason,
    initialized,
    loading,
    applySettings,
    loadPublicSettings,
  };
});
