import { defineStore } from 'pinia';
import { ref } from 'vue';
import { http } from '../lib/http';

export interface PublicSystemSettings {
  systemName: string;
  brandMarkText: string;
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

export const useSystemStore = defineStore('system', () => {
  const systemName = ref(DEFAULT_SYSTEM_NAME);
  const brandMarkText = ref(DEFAULT_BRAND_MARK_TEXT);
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
