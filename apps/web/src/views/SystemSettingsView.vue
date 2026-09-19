<script setup lang="ts">
import {
  Connection,
  Cpu,
  Download,
  Delete,
  Document,
  Edit,
  FolderOpened,
  Lock,
  Monitor,
  Plus,
  Refresh,
  RefreshRight,
  Search,
  Setting,
  SwitchButton,
  Timer,
  Upload,
  Van,
  User,
  Warning,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';
import { useSystemStore } from '../stores/system';

interface AdminSessionItem {
  id: string;
  sessionIds: string[];
  sessionCount: number;
  ipAddress: string | null;
  ipAddresses: string[];
  userAgent: string | null;
  deviceName: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
  adminUser: {
    displayName: string;
    username: string;
  };
}

interface SystemSettingsResponse {
  settings: {
    systemName: string;
    brandMarkText: string;
    externalAccessEnabled: boolean;
    allowedHosts: string[];
    adminEntryPath: string | null;
    rootAccessMode: 'NOT_FOUND' | 'REDIRECT';
    rootRedirectUrl: string | null;
    updatedAt: string;
  };
  runtime: {
    api: {
      status: string;
      service: string;
      startedAt: string;
      uptimeSeconds: number;
      nodeVersion: string;
      environment: string;
    };
    database: {
      status: string;
      responseTimeMs: number | null;
      error: string;
      accessEnabled: boolean;
      accessUpdatedAt: string | null;
    };
    control: {
      apiRestartSupported: boolean;
      apiRestartMode: string;
      webRestartSupported: boolean;
      webRestartMode: string;
    };
    process: {
      pid: number;
      platform: string;
      arch: string;
      hostname: string;
      cpuCount: number;
      memoryRssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
    };
    webOrigins: string[];
    serverTime: string;
  };
  security: {
    currentIp: string;
    localRequest: boolean;
    requestHost: string;
    hostAllowed: boolean;
    accessReason: string;
    adminEntryGranted: boolean;
    adminEntryTtlDays: number;
    allowedHosts: string[];
    activeSessionCount: number;
    failedLoginAttempts24h: number;
    lastFailedLoginAt: string | null;
    lastFailedLoginIp: string | null;
    lastSuccessfulLoginAt: string | null;
    sessionTtlDays: number;
    cookieSecure: boolean;
    apiRateLimit: number;
    loginRateLimit: number;
    rateLimitWindowSeconds: number;
    allowedOrigins: string[];
    sessions: AdminSessionItem[];
  };
}

interface SystemAuditLogItem {
  id: string;
  source: string;
  action: string;
  entityType: string;
  entityId: string;
  changedFields: string[];
  ipAddress: string | null;
  deviceName: string;
  createdAt: string;
  actor: {
    id: string;
    displayName: string;
    username: string;
  } | null;
}

interface SystemAuditLogResponse {
  items: SystemAuditLogItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    allTotal: number;
    totalPages: number;
  };
  filters: {
    entityTypes: string[];
    actions: string[];
  };
}

interface BackupInspectResponse {
  valid: boolean;
  version: number;
  createdAt: string;
  bytes: number;
  scope: 'FULL' | 'SELECTIVE';
  categories: BackupCategory[];
  categoryLabels: string[];
  primaryRecordCount: number;
  dependencyRecordCount: number;
  requiresRelogin: boolean;
  totalRecords: number;
  tables: Array<{ model: string; table: string; count: number; dependency: boolean }>;
}

type BackupCategory =
  | 'orders'
  | 'submitters'
  | 'catalog'
  | 'integrationConfig'
  | 'affiliateHistory'
  | 'system'
  | 'auditLogs';
type BackupSelection = 'all' | BackupCategory;

interface BackupOption {
  id: BackupSelection;
  label: string;
  description: string;
  modelCount: number;
  dependencyNote: string | null;
}

interface BackupOptionsResponse {
  defaultSelection: BackupSelection[];
  options: BackupOption[];
}

interface LogisticsSettingsResponse {
  id: string;
  provider: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  endpoint: string;
  updatedAt: string;
}

interface LogisticsResult {
  success: boolean;
  trackingNo: string;
  carrierCode: string | null;
  carrierName: string | null;
  stateText: string;
  reason: string | null;
  traces: Array<{ time: string; station: string; remark: string; action: string }>;
}

const system = useSystemStore();
const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const revoking = ref(false);
const sessionRevokingId = ref('');
const sessionRenamingId = ref('');
const restartingApi = ref(false);
const restartingWeb = ref(false);
const databaseSwitching = ref(false);
const hostInput = ref('');
const data = ref<SystemSettingsResponse | null>(null);
const apiResponseTimeMs = ref<number | null>(null);
const runtimeCheckedAt = ref<Date | null>(null);
const auditLoading = ref(false);
const auditClearing = ref(false);
const backupExporting = ref(false);
const backupInspecting = ref(false);
const backupRestoring = ref(false);
const backupOptionsLoading = ref(false);
const backupPayload = ref('');
const backupInspect = ref<BackupInspectResponse | null>(null);
const backupFileInput = ref<HTMLInputElement | null>(null);
const backupOptions = ref<BackupOption[]>([]);
const backupSelection = ref<BackupSelection[]>(['all']);
const logisticsLoading = ref(false);
const logisticsSaving = ref(false);
const logisticsTesting = ref(false);
const logisticsResult = ref<LogisticsResult | null>(null);
const logisticsTestTrackingNo = ref('');
const logisticsTestPhoneSuffix = ref('');
const logisticsForm = reactive({
  enabled: false,
  apiKey: '',
  apiKeyConfigured: false,
  clearApiKey: false,
  endpoint: 'https://v1.apizero.cn/api/express-pro',
});
const auditLogs = ref<SystemAuditLogItem[]>([]);
const auditPagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
  allTotal: 0,
  totalPages: 1,
});
const auditFilterOptions = reactive({
  entityTypes: [] as string[],
  actions: [] as string[],
});
const auditFilters = reactive({
  keyword: '',
  entityType: '',
  action: '',
});
const currentOrigin = window.location.origin;

type SystemSection = 'panel' | 'runtime' | 'maintenance' | 'security' | 'logs' | 'extensions';

const systemSections: SystemSection[] = [
  'panel',
  'runtime',
  'maintenance',
  'security',
  'logs',
  'extensions',
];

const activeSystemSection = computed<SystemSection>(() => {
  const querySection = Array.isArray(route.query.section)
    ? route.query.section[0]
    : route.query.section;
  return systemSections.includes(querySection as SystemSection)
    ? (querySection as SystemSection)
    : 'panel';
});

const changeSystemSection = (value: string | number) => {
  const section = String(value) as SystemSection;
  if (!systemSections.includes(section)) return;
  if (section === 'logs') void loadAuditLogs();
  void router.replace({
    query: {
      ...route.query,
      section: section === 'panel' ? undefined : section,
    },
  });
};
const form = reactive({
  systemName: system.systemName,
  brandMarkText: system.brandMarkText || '浪姐',
  externalAccessEnabled: system.externalAccessEnabled,
  allowedHosts: [] as string[],
  adminEntryPath: '',
  rootAccessMode: system.rootAccessMode as 'NOT_FOUND' | 'REDIRECT',
  rootRedirectUrl: system.rootRedirectUrl,
});

const sameHosts = (left: string[], right: string[]) =>
  left.length === right.length && left.every((host, index) => host === right[index]);

const changed = computed(() => {
  const current = data.value?.settings;
  if (!current) return false;
  const currentBrandMarkText = current.brandMarkText?.trim() || '浪姐';
  return (
    form.systemName.trim() !== current.systemName ||
    (form.brandMarkText || '').trim() !== currentBrandMarkText ||
    form.externalAccessEnabled !== current.externalAccessEnabled ||
    !sameHosts(form.allowedHosts, current.allowedHosts) ||
    form.adminEntryPath.trim().replace(/^\/+|\/+$/g, '') !== (current.adminEntryPath || '') ||
    form.rootAccessMode !== current.rootAccessMode ||
    form.rootRedirectUrl.trim() !== (current.rootRedirectUrl || '')
  );
});

const adminEntryUrl = computed(() => {
  const path = form.adminEntryPath.trim().replace(/^\/+|\/+$/g, '');
  return path ? `${window.location.origin}/${path}` : '';
});

const apiBaseUrl = computed(() => {
  const baseUrl = http.defaults.baseURL || '/api';
  return new URL(baseUrl, window.location.origin).toString().replace(/\/$/, '');
});
const apiDirectoryUrl = computed(() => router.resolve('/admin/api-directory').href);

const auditEntityLabels: Record<string, string> = {
  AdminSession: '管理员会话',
  AdminUser: '管理员账号',
  AffiliateLinkConversion: '返利转换记录',
  AffiliatePlatform: '返利平台',
  AuditLog: '操作日志',
  Category: '下单品类',
  ExternalIdentity: '用户识别码',
  Order: '订单',
  OrderScheme: '在线报单方案',
  PayoutMethod: '回款方式',
  PayoutRegistrationForm: '回款登记配置',
  Platform: '下单平台',
  ProfitRule: '利润规则',
  RuntimeControl: '服务控制',
  ShareForm: '报单链接',
  Submitter: '下单人',
  SystemSetting: '面板设置',
};

const auditActionLabels: Record<string, string> = {
  ADMIN_SESSION_RENAMED: '修改设备名称',
  ADMIN_SESSION_REVOKED: '注销登录会话',
  API_RESTART_REQUESTED: '重启 API 服务',
  AUDIT_LOGS_CLEARED: '清空操作日志',
  BACKUP_RESTORED: '恢复数据备份',
  CLEAR: '清空记录',
  DATABASE_ACCESS_DISABLED: '暂停数据库业务访问',
  DATABASE_ACCESS_ENABLED: '开启数据库业务访问',
  DEVICE_IDENTITY_CREATED: '创建用户识别码',
  LOGIN_FAILED: '管理员登录失败',
  LOGIN_SUCCESS: '管理员登录成功',
  LOGISTICS_QUERY: '查询物流轨迹',
  LOGISTICS_SETTINGS_UPDATED: '修改 ApiZero 快递配置',
  LOGOUT: '管理员退出登录',
  ORDER_APPROVED: '确认订单入库',
  ORDER_CREATED: '后台新建订单',
  ORDER_DELETED: '删除订单',
  ORDER_DELETED_BEFORE_APPROVAL: '撤回未确认报单',
  ORDER_EDIT_REASONS_CLEARED: '清空订单修改说明',
  ORDER_PROGRESS_UPDATED: '更新订单状态',
  ORDER_REJECTED: '驳回订单',
  ORDER_SUBMITTED: '提交在线报单',
  ORDER_SUBMITTER_AUTO_CREATED: '自动创建下单人',
  ORDER_UPDATED: '修改订单',
  ORDER_UPDATED_BEFORE_APPROVAL: '修改未确认报单',
  OTHER_ADMIN_SESSIONS_REVOKED: '退出其他设备',
  PASSWORD_CHANGED: '修改管理员密码',
  PAYOUT_LOOKUP_DISABLED: '关闭订单查询链接',
  PAYOUT_LOOKUP_ENABLED: '开启订单查询链接',
  PAYOUT_LOOKUP_SETTINGS_UPDATED: '修改订单查询配置',
  PAYOUT_METHOD_DELETED_BEFORE_APPROVAL: '删除待确认回款方式',
  PAYOUT_METHOD_SUBMITTED: '提交回款方式',
  PAYOUT_REGISTRATION_FORM_DISABLED: '关闭回款登记链接',
  PAYOUT_REGISTRATION_FORM_ENABLED: '开启回款登记链接',
  PAYOUT_REGISTRATION_SUBMITTED: '提交回款登记',
  PROFIT_RULE_VERSION_ACTIVATED: '启用利润规则版本',
  PROFIT_RULE_VERSION_CREATED: '新建利润规则版本',
  SUBMITTER_CODE_LINKED: '关联下单人识别码',
  SYSTEM_SETTINGS_UPDATED: '修改面板配置',
  WEB_RESTART_REQUESTED: '重启面板服务',
};

const auditFieldLabels: Record<string, string> = {
  systemName: '系统名称',
  brandMarkText: '品牌图标文字',
  externalAccessEnabled: '外网访问开关',
  allowedHosts: '域名白名单',
  adminEntryPath: '后台安全入口',
  rootAccessMode: '首页访问规则',
  rootRedirectUrl: '首页跳转地址',
  databaseAccessEnabled: '数据库访问开关',
  deletedCount: '清理数量',
  clearedAt: '清理时间',
  deviceName: '设备名称',
  status: '状态',
  enabled: '启用状态',
  name: '名称',
  code: '编码',
  notes: '备注',
  reason: '修改说明',
  reviewStatus: '审核状态',
  shipmentStatus: '寄件状态',
  receivableStatus: '回款状态',
  submitterSettlementStatus: '结算状态',
};

const auditEntityText = (entityType: string) => auditEntityLabels[entityType] || entityType;
const auditActionText = (action: string, entityType: string) => {
  if (auditActionLabels[action]) return auditActionLabels[action];
  const entity = auditEntityText(entityType);
  if (action === 'CREATE') return `新增${entity}`;
  if (action === 'UPDATE') return `修改${entity}`;
  if (action === 'DELETE') return `删除${entity}`;
  return action.replaceAll('_', ' ');
};
const auditSourceText = (source: string) => {
  if (source === 'ADMIN_WEB') return '后台操作';
  if (source === 'PUBLIC_FORM') return '公开链接';
  if (source === 'SYSTEM') return '系统任务';
  return source;
};
const auditChangedFieldsText = (fields: string[]) =>
  fields.length ? fields.map((field) => auditFieldLabels[field] || field).join('、') : '状态操作';
const compactEntityId = (value: string) =>
  value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
const auditTone = (action: string) => {
  if (/FAILED|DELETE|REVOKED|DISABLED/.test(action)) return 'danger';
  if (/RESTART|CLEAR/.test(action)) return 'warning';
  if (/CREATE|CREATED|SUCCESS|SUBMITTED|LINKED|ACTIVATED/.test(action)) return 'success';
  return 'primary';
};

const backupBytesText = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const backupSelectionText = computed(() => {
  if (backupSelection.value.includes('all')) return '全部数据';
  const selected = new Set(backupSelection.value);
  return backupOptions.value
    .filter((option) => option.id !== 'all' && selected.has(option.id))
    .map((option) => option.label)
    .join('、');
});

const toggleBackupSelection = (id: BackupSelection) => {
  if (id === 'all') {
    backupSelection.value = ['all'];
    return;
  }
  const selected = backupSelection.value.filter((item) => item !== 'all');
  backupSelection.value = selected.includes(id)
    ? selected.filter((item) => item !== id)
    : [...selected, id];
  if (!backupSelection.value.length) backupSelection.value = ['all'];
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
};

const formatDuration = (seconds = 0) => {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days) return `${days} 天 ${hours} 小时`;
  if (hours) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
};

const addAllowedHost = () => {
  const value = hostInput.value.trim().toLowerCase();
  if (!value) return;
  if (form.allowedHosts.includes(value)) {
    ElMessage.info('该域名已经在白名单中');
    return;
  }
  form.allowedHosts.push(value);
  hostInput.value = '';
};

const removeAllowedHost = (host: string) => {
  form.allowedHosts = form.allowedHosts.filter((item) => item !== host);
};

const copyAdminEntryUrl = async () => {
  if (!adminEntryUrl.value) return;
  try {
    await navigator.clipboard.writeText(adminEntryUrl.value);
    ElMessage.success('后台安全入口已复制');
  } catch {
    ElMessage.error('复制失败，请手动复制入口地址');
  }
};

const load = async () => {
  loading.value = true;
  const startedAt = performance.now();
  try {
    const response = await http.get<SystemSettingsResponse>('/admin/system/settings');
    apiResponseTimeMs.value = Math.max(1, Math.round(performance.now() - startedAt));
    runtimeCheckedAt.value = new Date();
    const brandMarkText = response.data.settings.brandMarkText?.trim() || '浪姐';
    data.value = response.data;
    data.value.settings.brandMarkText = brandMarkText;
    form.systemName = response.data.settings.systemName;
    form.brandMarkText = brandMarkText;
    form.externalAccessEnabled = response.data.settings.externalAccessEnabled;
    form.allowedHosts = [...response.data.settings.allowedHosts];
    form.adminEntryPath = response.data.settings.adminEntryPath || '';
    form.rootAccessMode = response.data.settings.rootAccessMode;
    form.rootRedirectUrl = response.data.settings.rootRedirectUrl || '';
    system.applySettings({
      systemName: response.data.settings.systemName,
      brandMarkText,
      externalAccessEnabled: response.data.settings.externalAccessEnabled,
      rootAccessMode: response.data.settings.rootAccessMode,
      rootRedirectUrl: response.data.settings.rootRedirectUrl,
    });
    void loadLogisticsSettings();
  } catch (error) {
    apiResponseTimeMs.value = null;
    runtimeCheckedAt.value = new Date();
    ElMessage.error(getApiErrorMessage(error, '系统设置加载失败'));
  } finally {
    loading.value = false;
  }
};

const loadAuditLogs = async () => {
  auditLoading.value = true;
  try {
    const response = await http.get<SystemAuditLogResponse>('/admin/system/audit-logs', {
      params: {
        page: auditPagination.page,
        pageSize: auditPagination.pageSize,
        keyword: auditFilters.keyword.trim() || undefined,
        entityType: auditFilters.entityType || undefined,
        action: auditFilters.action || undefined,
      },
    });
    auditLogs.value = response.data.items;
    Object.assign(auditPagination, response.data.pagination);
    auditFilterOptions.entityTypes = response.data.filters.entityTypes;
    auditFilterOptions.actions = response.data.filters.actions;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '操作日志加载失败'));
  } finally {
    auditLoading.value = false;
  }
};

const loadLogisticsSettings = async () => {
  logisticsLoading.value = true;
  try {
    const response = await http.get<LogisticsSettingsResponse>('/admin/logistics/settings');
    logisticsForm.enabled = response.data.enabled;
    logisticsForm.apiKey = '';
    logisticsForm.apiKeyConfigured = response.data.apiKeyConfigured;
    logisticsForm.clearApiKey = false;
    logisticsForm.endpoint = response.data.endpoint;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '物流配置加载失败'));
  } finally {
    logisticsLoading.value = false;
  }
};

const loadBackupOptions = async () => {
  backupOptionsLoading.value = true;
  try {
    const response = await http.get<BackupOptionsResponse>('/admin/system/backups/options');
    backupOptions.value = response.data.options;
    if (!backupSelection.value.length) {
      backupSelection.value = response.data.defaultSelection;
    }
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '备份分类加载失败'));
  } finally {
    backupOptionsLoading.value = false;
  }
};

const exportBackup = async () => {
  if (backupExporting.value) return;
  if (!backupSelection.value.length) {
    ElMessage.warning('请至少选择一个备份分类');
    return;
  }
  backupExporting.value = true;
  try {
    const response = await http.post<Blob>(
      '/admin/system/backups/export',
      { categories: backupSelection.value },
      { responseType: 'blob', timeout: 120_000 },
    );
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    const categoryCount = backupOptions.value.filter((option) => option.id !== 'all').length;
    const scope =
      backupSelection.value.includes('all') || backupSelection.value.length === categoryCount
        ? 'full'
        : 'selective';
    anchor.download = `order-system-backup-${scope}-${new Date()
      .toISOString()
      .replace(/[.:]/g, '-')}.osbackup`;
    anchor.click();
    URL.revokeObjectURL(url);
    ElMessage.success(`${backupSelectionText.value}加密备份已导出`);
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '备份导出失败'));
  } finally {
    backupExporting.value = false;
  }
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.replace(/^data:.*?;base64,/, ''));
    };
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });

const inspectBackupFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.osbackup')) {
    ElMessage.warning('请选择 .osbackup 备份文件');
    return;
  }
  backupInspecting.value = true;
  try {
    backupPayload.value = await fileToBase64(file);
    const response = await http.post<BackupInspectResponse>('/admin/system/backups/inspect', {
      backup: backupPayload.value,
    });
    backupInspect.value = response.data;
    ElMessage.success(`备份校验通过，共 ${response.data.totalRecords} 条数据`);
  } catch (error) {
    backupPayload.value = '';
    backupInspect.value = null;
    ElMessage.error(getApiErrorMessage(error, '备份校验失败'));
  } finally {
    backupInspecting.value = false;
  }
};

const restoreBackup = async () => {
  if (!backupPayload.value || !backupInspect.value || backupRestoring.value) {
    ElMessage.info('请先选择并校验备份文件');
    return;
  }
  try {
    const fullRestore = backupInspect.value.scope === 'FULL';
    const restoreDescription = fullRestore
      ? `恢复将完整替换当前数据库（${backupInspect.value.totalRecords} 条），并使所有登录会话失效。`
      : `恢复将合并“${backupInspect.value.categoryLabels.join('、')}”中的 ${
          backupInspect.value.primaryRecordCount
        } 条主数据，不会清空未选择的模块。`;
    await ElMessageBox.confirm(
      `${restoreDescription}确认继续？`,
      fullRestore ? '恢复完整数据备份' : '恢复选择性数据备份',
      { type: 'warning', confirmButtonText: '继续恢复', cancelButtonText: '取消' },
    );
    const password = await ElMessageBox.prompt('请输入当前管理员密码', '二次验证', {
      inputType: 'password',
      confirmButtonText: '下一步',
      cancelButtonText: '取消',
      inputValidator: (value) => Boolean(value.trim()) || '请输入管理员密码',
    });
    const confirmation = await ElMessageBox.prompt('请输入确认词 RESTORE', '最终确认', {
      confirmButtonText: '确认恢复',
      cancelButtonText: '取消',
      inputValidator: (value) => value.trim().toUpperCase() === 'RESTORE' || '确认词不正确',
    });
    backupRestoring.value = true;
    const response = await http.post<{ requiresRelogin: boolean }>(
      '/admin/system/backups/restore',
      {
        backup: backupPayload.value,
        password: password.value,
        confirmation: confirmation.value,
      },
      { timeout: 120_000 },
    );
    ElMessage.success(
      response.data.requiresRelogin
        ? '数据已恢复，页面将返回登录页'
        : '所选数据已合并恢复，页面即将刷新',
    );
    window.setTimeout(() => window.location.reload(), 1_000);
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '数据恢复失败'));
  } finally {
    backupRestoring.value = false;
  }
};

const saveLogistics = async () => {
  logisticsSaving.value = true;
  try {
    const response = await http.patch<LogisticsSettingsResponse>('/admin/logistics/settings', {
      enabled: logisticsForm.enabled,
      apiKey: logisticsForm.apiKey.trim() || undefined,
      clearApiKey: logisticsForm.clearApiKey && !logisticsForm.apiKey.trim(),
      endpoint: logisticsForm.endpoint.trim() || undefined,
    });
    logisticsForm.apiKey = '';
    logisticsForm.apiKeyConfigured = response.data.apiKeyConfigured;
    logisticsForm.clearApiKey = false;
    logisticsForm.endpoint = response.data.endpoint;
    ElMessage.success('ApiZero 快递配置已保存');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, 'ApiZero 快递配置保存失败'));
  } finally {
    logisticsSaving.value = false;
  }
};

const testLogistics = async () => {
  if (!logisticsTestTrackingNo.value.trim()) {
    ElMessage.warning('请先填写测试运单号');
    return;
  }
  logisticsTesting.value = true;
  try {
    const response = await http.post<LogisticsResult>('/admin/logistics/test', {
      trackingNo: logisticsTestTrackingNo.value.trim(),
      phoneSuffix: logisticsTestPhoneSuffix.value.trim() || undefined,
    });
    logisticsResult.value = response.data;
    ElMessage.success(response.data.success ? 'ApiZero 查询成功' : '接口已返回，但暂无有效轨迹');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, 'ApiZero 查询失败'));
  } finally {
    logisticsTesting.value = false;
  }
};

const queryAuditLogs = () => {
  auditPagination.page = 1;
  void loadAuditLogs();
};

const resetAuditFilters = () => {
  auditFilters.keyword = '';
  auditFilters.entityType = '';
  auditFilters.action = '';
  auditPagination.page = 1;
  void loadAuditLogs();
};

const clearAuditLogs = async () => {
  if (!auditPagination.allTotal || auditClearing.value) return;
  try {
    await ElMessageBox.confirm(
      `确定清空全部 ${auditPagination.allTotal} 条操作日志吗？清空后仅保留本次清空记录。`,
      '清空操作日志',
      {
        type: 'warning',
        confirmButtonText: '全部清空',
        cancelButtonText: '取消',
      },
    );
    auditClearing.value = true;
    const response = await http.delete<{ success: boolean; deletedCount: number }>(
      '/admin/system/audit-logs',
    );
    auditFilters.keyword = '';
    auditFilters.entityType = '';
    auditFilters.action = '';
    auditPagination.page = 1;
    await loadAuditLogs();
    ElMessage.success(`已清空 ${response.data.deletedCount} 条历史日志`);
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '清空操作日志失败'));
  } finally {
    auditClearing.value = false;
  }
};

const changeAuditPage = (page: number) => {
  auditPagination.page = page;
  void loadAuditLogs();
};

const changeAuditPageSize = (pageSize: number) => {
  auditPagination.page = 1;
  auditPagination.pageSize = pageSize;
  void loadAuditLogs();
};

const save = async () => {
  const systemName = form.systemName.trim();
  if (systemName.length < 2) {
    ElMessage.warning('系统名称至少需要 2 个字符');
    return;
  }

  const brandMarkText = (form.brandMarkText || '').trim();
  if (!brandMarkText || brandMarkText.length > 4) {
    ElMessage.warning('品牌图标文字需要 1 至 4 个字符');
    return;
  }

  const normalizedAdminEntryPath = form.adminEntryPath.trim().replace(/^\/+|\/+$/g, '');
  if (
    normalizedAdminEntryPath &&
    !/^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{5,12}$/.test(normalizedAdminEntryPath)
  ) {
    ElMessage.warning('后台安全入口需为 5 至 12 位字母和数字，并同时包含字母与数字');
    return;
  }
  const adminEntryPath = normalizedAdminEntryPath || null;
  form.adminEntryPath = normalizedAdminEntryPath;

  if (data.value?.settings.adminEntryPath && !adminEntryPath) {
    try {
      await ElMessageBox.confirm(
        '清空并保存后，外部管理员可以直接访问登录页，不再要求先经过安全入口。',
        '确认关闭后台安全入口？',
        { confirmButtonText: '确认关闭', cancelButtonText: '取消', type: 'warning' },
      );
    } catch {
      form.adminEntryPath = data.value.settings.adminEntryPath;
      return;
    }
  }

  if (form.rootAccessMode === 'REDIRECT') {
    try {
      const redirectUrl = new URL(form.rootRedirectUrl.trim());
      if (!['http:', 'https:'].includes(redirectUrl.protocol)) throw new Error();
    } catch {
      ElMessage.warning('请填写完整的 http 或 https 跳转地址');
      return;
    }
  }

  if (data.value?.settings.externalAccessEnabled && !form.externalAccessEnabled) {
    try {
      await ElMessageBox.confirm(
        '关闭后，管理员后台只能在本机访问；已开放的报单、回款登记和订单查询链接仍可正常使用。',
        '确认关闭后台外网访问？',
        { confirmButtonText: '确认关闭', cancelButtonText: '取消', type: 'warning' },
      );
    } catch {
      form.externalAccessEnabled = true;
      return;
    }
  }

  saving.value = true;
  try {
    const response = await http.patch<{
      systemName: string;
      brandMarkText: string;
      externalAccessEnabled: boolean;
      allowedHosts: string[];
      adminEntryPath: string | null;
      rootAccessMode: 'NOT_FOUND' | 'REDIRECT';
      rootRedirectUrl: string | null;
      updatedAt: string;
    }>('/admin/system/settings', {
      systemName,
      brandMarkText,
      externalAccessEnabled: form.externalAccessEnabled,
      allowedHosts: form.allowedHosts,
      adminEntryPath,
      rootAccessMode: form.rootAccessMode,
      rootRedirectUrl: form.rootAccessMode === 'REDIRECT' ? form.rootRedirectUrl.trim() : null,
    });
    system.applySettings({
      systemName: response.data.systemName,
      brandMarkText: response.data.brandMarkText,
      externalAccessEnabled: response.data.externalAccessEnabled,
      rootAccessMode: response.data.rootAccessMode,
      rootRedirectUrl: response.data.rootRedirectUrl,
    });
    form.allowedHosts = [...response.data.allowedHosts];
    form.brandMarkText = response.data.brandMarkText;
    form.adminEntryPath = response.data.adminEntryPath || '';
    form.rootAccessMode = response.data.rootAccessMode;
    form.rootRedirectUrl = response.data.rootRedirectUrl || '';
    ElMessage.success('系统设置已保存');
    await system.loadPublicSettings(true);
    if (system.accessAllowed) await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '系统设置保存失败'));
  } finally {
    saving.value = false;
  }
};

const renameSession = async (session: AdminSessionItem) => {
  sessionRenamingId.value = session.id;
  try {
    const result = await ElMessageBox.prompt('输入便于识别的设备名称', '修改设备名称', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: session.deviceName,
      inputValidator: (value) => {
        const length = value.trim().length;
        return (length >= 1 && length <= 100) || '设备名称需要 1 至 100 个字符';
      },
    });
    await http.patch(`/admin/system/sessions/${session.id}/name`, {
      deviceName: result.value.trim(),
    });
    ElMessage.success('设备名称已更新');
    await load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '设备名称更新失败'));
  } finally {
    sessionRenamingId.value = '';
  }
};

const revokeSession = async (session: AdminSessionItem) => {
  try {
    await ElMessageBox.confirm(
      `确认注销 ${session.ipAddress || '未知地址'} 的登录会话？`,
      '注销登录会话',
      { confirmButtonText: '注销', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }

  sessionRevokingId.value = session.id;
  try {
    await http.delete(`/admin/system/sessions/${session.id}`);
    ElMessage.success('该登录会话已注销');
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '会话注销失败'));
  } finally {
    sessionRevokingId.value = '';
  }
};

const revokeOthers = async () => {
  try {
    await ElMessageBox.confirm('将保留当前设备，注销其余所有管理员登录会话。', '退出其他设备？', {
      confirmButtonText: '确认退出',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }

  revoking.value = true;
  try {
    const response = await http.post<{ revoked: number }>('/admin/system/sessions/revoke-others');
    ElMessage.success(
      response.data.revoked ? `已注销 ${response.data.revoked} 个会话` : '没有其他登录会话',
    );
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '其他设备退出失败'));
  } finally {
    revoking.value = false;
  }
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

interface PanelRuntimeResponse {
  service: string;
  instanceId: string;
  startedAt: string;
}

interface PendingWebRestart {
  previousInstanceId: string;
  requestedAt: number;
}

const webRestartPendingKey = 'order-system:web-restart-pending';

const readPanelRuntime = async () => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await window.fetch(`/__panel_runtime?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as PanelRuntimeResponse;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const waitForWebRestart = async (pending: PendingWebRestart) => {
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    try {
      const runtime = await readPanelRuntime();
      if (runtime.instanceId && runtime.instanceId !== pending.previousInstanceId) {
        sessionStorage.removeItem(webRestartPendingKey);
        ElMessage.success('面板服务已重启并恢复运行');
        await load();
        return true;
      }
    } catch {
      // 面板服务重启期间连接失败属于正常状态，继续等待恢复。
    }
    await delay(800);
  }

  sessionStorage.removeItem(webRestartPendingKey);
  ElMessage.warning('面板重启已触发，请稍后刷新页面确认');
  return false;
};

const restartWeb = async () => {
  try {
    await ElMessageBox.confirm(
      '管理面板会短暂断开并重新连接，当前页面恢复后会显示重启结果。',
      '确认重启面板服务？',
      {
        confirmButtonText: '立即重启',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  restartingWeb.value = true;
  try {
    const currentRuntime = await readPanelRuntime();
    const pending: PendingWebRestart = {
      previousInstanceId: currentRuntime.instanceId,
      requestedAt: Date.now(),
    };
    sessionStorage.setItem(webRestartPendingKey, JSON.stringify(pending));
    await http.post('/admin/system/runtime/web/restart');
    ElMessage.info('面板服务正在重启，请稍候');
    await delay(700);
    await waitForWebRestart(pending);
  } catch (error) {
    sessionStorage.removeItem(webRestartPendingKey);
    ElMessage.error(getApiErrorMessage(error, '面板服务重启失败'));
  } finally {
    restartingWeb.value = false;
  }
};

const resumePendingWebRestart = async () => {
  const raw = sessionStorage.getItem(webRestartPendingKey);
  if (!raw) return;

  try {
    const pending = JSON.parse(raw) as PendingWebRestart;
    if (
      !pending.previousInstanceId ||
      !Number.isFinite(pending.requestedAt) ||
      Date.now() - pending.requestedAt > 60_000
    ) {
      sessionStorage.removeItem(webRestartPendingKey);
      return;
    }
    restartingWeb.value = true;
    await waitForWebRestart(pending);
  } catch {
    sessionStorage.removeItem(webRestartPendingKey);
  } finally {
    restartingWeb.value = false;
  }
};

const restartApi = async () => {
  try {
    await ElMessageBox.confirm(
      'API 会短暂中断几秒，当前页面会自动等待服务恢复。',
      '确认重启 API？',
      {
        confirmButtonText: '立即重启',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  const previousPid = data.value?.runtime.process.pid;
  const previousStartedAt = data.value?.runtime.api.startedAt;
  restartingApi.value = true;
  try {
    await http.post('/admin/system/runtime/api/restart');
    ElMessage.info('API 正在重启，请稍候');
    await delay(1_000);

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const response = await http.get<SystemSettingsResponse>('/admin/system/settings', {
          timeout: 2_500,
        });
        const restarted =
          response.data.runtime.process.pid !== previousPid ||
          response.data.runtime.api.startedAt !== previousStartedAt;
        if (restarted) {
          data.value = response.data;
          ElMessage.success('API 已重启并恢复运行');
          await load();
          return;
        }
      } catch {
        // API 重启期间连接失败属于正常状态，继续等待恢复。
      }
      await delay(1_000);
    }
    ElMessage.warning('API 重启已触发，请稍后点击“刷新状态”确认');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, 'API 重启失败'));
  } finally {
    restartingApi.value = false;
  }
};

const updateDatabaseAccess = async (value: string | number | boolean) => {
  const enabled = Boolean(value);
  if (!enabled) {
    try {
      await ElMessageBox.confirm(
        '关闭后，订单、报单、回款、查询和返利等业务接口会立即停止读写；系统设置仍可打开并重新开启。',
        '确认暂停数据库访问？',
        {
          confirmButtonText: '确认暂停',
          cancelButtonText: '取消',
          type: 'warning',
        },
      );
    } catch {
      return;
    }
  }

  databaseSwitching.value = true;
  try {
    await http.patch('/admin/system/runtime/database', { enabled });
    ElMessage.success(enabled ? '数据库业务访问已开启' : '数据库业务访问已暂停');
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '数据库开关操作失败'));
  } finally {
    databaseSwitching.value = false;
  }
};

onMounted(async () => {
  await Promise.all([load(), loadBackupOptions()]);
  if (activeSystemSection.value === 'logs') await loadAuditLogs();
  void resumePendingWebRestart();
});
</script>

<template>
  <div class="page-shell system-settings-page" v-loading="loading">
    <div class="page-heading">
      <div>
        <span class="page-kicker">SYSTEM SETTINGS</span>
        <h1>系统设置</h1>
        <p>按功能分类管理面板显示、访问安全、运行状态和服务维护。</p>
      </div>
      <el-button round :icon="Refresh" :loading="loading" @click="load">刷新状态</el-button>
    </div>

    <section class="surface-card system-settings-navigation">
      <el-tabs :model-value="activeSystemSection" stretch @tab-change="changeSystemSection">
        <el-tab-pane label="面板配置" name="panel" />
        <el-tab-pane label="运行状态" name="runtime" />
        <el-tab-pane label="服务维护" name="maintenance" />
        <el-tab-pane label="安全管理" name="security" />
        <el-tab-pane label="操作日志" name="logs" />
        <el-tab-pane label="功能扩展" name="extensions" />
      </el-tabs>
    </section>

    <section v-show="activeSystemSection === 'panel'" class="surface-card panel-settings-card">
      <div class="section-title">
        <div class="section-title-copy">
          <span class="section-title-icon is-primary"
            ><el-icon><Setting /></el-icon
          ></span>
          <div>
            <h2>面板配置</h2>
            <p>统一设置界面标识、访问范围、域名、安全入口和首页访问规则。</p>
          </div>
        </div>
        <el-button type="primary" round :loading="saving" :disabled="!changed" @click="save">
          保存设置
        </el-button>
      </div>

      <div class="panel-settings-list">
        <section class="panel-setting-group">
          <div class="panel-setting-group-heading">
            <span class="panel-setting-group-icon is-primary"
              ><el-icon><Edit /></el-icon
            ></span>
            <div>
              <strong>界面显示</strong>
              <small>统一管理后台、登录页和公开分享页使用的名称与图标。</small>
            </div>
          </div>

          <div class="panel-setting-row">
            <div class="panel-setting-copy">
              <strong>系统名称</strong>
              <small>保存后同步到后台左侧、登录页和浏览器标题。</small>
            </div>
            <div class="panel-setting-control is-medium">
              <el-input
                v-model="form.systemName"
                maxlength="80"
                show-word-limit
                placeholder="请输入系统名称"
              />
            </div>
          </div>

          <div class="panel-setting-row">
            <div class="panel-setting-copy">
              <strong>品牌图标文字</strong>
              <small>用于后台左上角、登录页及公开分享页，支持 1–4 个字符。</small>
            </div>
            <div class="panel-setting-control is-medium">
              <div class="brand-mark-editor">
                <span
                  class="brand-mark-preview"
                  :class="{ 'is-long': (form.brandMarkText || '').trim().length > 2 }"
                >
                  {{ (form.brandMarkText || '').trim() || '图标' }}
                </span>
                <el-input
                  v-model="form.brandMarkText"
                  maxlength="4"
                  show-word-limit
                  placeholder="例如：浪姐"
                />
              </div>
            </div>
          </div>
        </section>

        <section class="panel-setting-group">
          <div class="panel-setting-group-heading">
            <span class="panel-setting-group-icon is-success"
              ><el-icon><SwitchButton /></el-icon
            ></span>
            <div>
              <strong>后台访问</strong>
              <small>控制后台开放范围、允许域名和外网安全入口。</small>
            </div>
          </div>

          <div class="panel-setting-row">
            <div class="panel-setting-copy">
              <strong>允许外网访问后台</strong>
              <small>
                {{
                  form.externalAccessEnabled
                    ? '局域网或公网设备可以访问管理员后台。'
                    : '只限制管理员后台和管理接口，不影响已开放的公开分享链接。'
                }}
              </small>
            </div>
            <div class="panel-setting-control is-switch">
              <span class="setting-state" :class="{ 'is-active': form.externalAccessEnabled }">
                {{ form.externalAccessEnabled ? '后台已开放' : '后台仅限本机' }}
              </span>
              <el-switch
                v-model="form.externalAccessEnabled"
                size="large"
                inline-prompt
                active-text="开"
                inactive-text="关"
              />
            </div>
          </div>

          <div class="panel-setting-row is-top-aligned">
            <div class="panel-setting-copy">
              <strong>域名白名单</strong>
              <small>
                域名访问后台和公开链接时都必须在此列表中；IP 地址可直接使用。支持
                <code>example.com</code> 和 <code>*.example.com</code>。
              </small>
            </div>
            <div class="panel-setting-control is-wide is-stacked">
              <div class="domain-input-row">
                <el-input
                  v-model="hostInput"
                  maxlength="253"
                  clearable
                  placeholder="输入域名，例如 www.example.com"
                  @keyup.enter="addAllowedHost"
                />
                <el-button type="primary" plain round :icon="Plus" @click="addAllowedHost">
                  添加域名
                </el-button>
              </div>
              <div v-if="form.allowedHosts.length" class="domain-tags">
                <el-tag
                  v-for="host in form.allowedHosts"
                  :key="host"
                  closable
                  round
                  effect="plain"
                  @close="removeAllowedHost(host)"
                >
                  {{ host }}
                </el-tag>
              </div>
              <p v-else class="empty-domain-note">
                当前未添加域名，开启外网后仍可通过 IP 地址访问。
              </p>
            </div>
          </div>

          <div class="panel-setting-row is-top-aligned">
            <div class="panel-setting-copy">
              <strong>后台安全入口</strong>
              <small>
                首次部署默认不启用，可直接登录后台。填写并保存后，外网必须先访问专属入口； 直接访问
                <code>/login</code>、<code>/admin</code> 或错误入口统一显示 404。 入口标识为 5–12
                位字母和数字，必须同时包含字母与数字；清空后保存可关闭。
              </small>
            </div>
            <div class="panel-setting-control is-wide is-stacked">
              <div class="admin-entry-input-row">
                <el-input
                  v-model="form.adminEntryPath"
                  maxlength="12"
                  clearable
                  placeholder="例如 Langjie727"
                >
                  <template #prepend>/</template>
                </el-input>
                <el-button
                  round
                  type="primary"
                  plain
                  :disabled="!adminEntryUrl"
                  @click="copyAdminEntryUrl"
                >
                  复制完整入口
                </el-button>
              </div>
              <div class="admin-entry-preview">
                <small>{{ adminEntryUrl ? '入口保护已启用' : '入口保护未启用' }}</small>
                <code>{{ adminEntryUrl || '当前可直接访问 /login 或 /admin' }}</code>
              </div>
              <small v-if="adminEntryUrl" class="entry-expiry-note">
                入口授权保留
                {{ data?.security.adminEntryTtlDays ?? 30 }}
                天；修改入口后，其他设备的旧入口授权立即失效。
              </small>
              <small v-else class="entry-expiry-note">
                建议完成首次登录和基础配置后，再手动填写并启用安全入口。
              </small>
            </div>
          </div>
        </section>

        <section class="panel-setting-group">
          <div class="panel-setting-group-heading">
            <span class="panel-setting-group-icon is-warning"
              ><el-icon><Connection /></el-icon
            ></span>
            <div>
              <strong>域名首页</strong>
              <small>只处理直接访问域名首页的情况，不影响带 Token 的公开业务链接。</small>
            </div>
          </div>

          <div class="panel-setting-row is-top-aligned">
            <div class="panel-setting-copy">
              <strong>首页访问处理</strong>
              <small>缺少 Token、错误路径和失效链接始终显示 404，不会跳转后台。</small>
            </div>
            <div class="panel-setting-control is-wide">
              <div class="root-mode-grid">
                <button
                  type="button"
                  :class="[
                    'card-choice',
                    'root-mode-card',
                    { 'is-selected': form.rootAccessMode === 'NOT_FOUND' },
                  ]"
                  @click="form.rootAccessMode = 'NOT_FOUND'"
                >
                  <span class="root-mode-icon is-warning"
                    ><el-icon><Warning /></el-icon
                  ></span>
                  <span>
                    <strong>禁止入口并显示 404</strong>
                    <small>外部用户只输入域名时看到普通 404 页面。</small>
                  </span>
                </button>
                <button
                  type="button"
                  :class="[
                    'card-choice',
                    'root-mode-card',
                    { 'is-selected': form.rootAccessMode === 'REDIRECT' },
                  ]"
                  @click="form.rootAccessMode = 'REDIRECT'"
                >
                  <span class="root-mode-icon is-primary"
                    ><el-icon><Connection /></el-icon
                  ></span>
                  <span>
                    <strong>跳转到指定地址</strong>
                    <small>仅域名首页跳转，错误链接不会跟随跳转。</small>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div v-if="form.rootAccessMode === 'REDIRECT'" class="panel-setting-row">
            <div class="panel-setting-copy">
              <strong>首页跳转地址</strong>
              <small>填写完整的 http 或 https 地址，仅用于域名首页跳转。</small>
            </div>
            <div class="panel-setting-control is-wide">
              <el-input
                v-model="form.rootRedirectUrl"
                maxlength="2048"
                clearable
                placeholder="例如：https://www.example.com/new-page"
              />
            </div>
          </div>
        </section>
      </div>
    </section>

    <section v-show="activeSystemSection === 'runtime'" class="surface-card runtime-card">
      <div class="section-title">
        <div class="section-title-copy">
          <span class="section-title-icon is-success"
            ><el-icon><Connection /></el-icon
          ></span>
          <div>
            <h2>运行状态</h2>
            <p>实时检测 Web、API、数据库和当前进程。</p>
          </div>
        </div>
        <span class="last-refresh">服务器时间 {{ formatDateTime(data?.runtime.serverTime) }}</span>
      </div>

      <div class="status-grid">
        <article class="status-item is-online">
          <span class="status-icon"
            ><el-icon><Monitor /></el-icon
          ></span>
          <span><small>Web 页面</small><strong>运行正常</strong></span>
          <i></i>
        </article>
        <article class="status-item is-online">
          <span class="status-icon"
            ><el-icon><Connection /></el-icon
          ></span>
          <span>
            <small>API 响应</small>
            <strong>{{ apiResponseTimeMs === null ? '检测中' : `${apiResponseTimeMs} ms` }}</strong>
          </span>
          <i></i>
        </article>
        <article
          :class="[
            'status-item',
            !data?.runtime.database.accessEnabled
              ? 'is-paused'
              : data?.runtime.database.status === 'online'
                ? 'is-online'
                : 'is-offline',
          ]"
        >
          <span class="status-icon"
            ><el-icon><Cpu /></el-icon
          ></span>
          <span>
            <small>本机数据库</small>
            <strong>
              {{
                !data?.runtime.database.accessEnabled
                  ? '业务访问已暂停'
                  : data?.runtime.database.status === 'online'
                    ? `${data.runtime.database.responseTimeMs ?? '—'} ms`
                    : '连接异常'
              }}
            </strong>
          </span>
          <i></i>
        </article>
        <article class="status-item is-primary">
          <span class="status-icon"
            ><el-icon><Timer /></el-icon
          ></span>
          <span
            ><small>连续运行</small
            ><strong>{{ formatDuration(data?.runtime.api.uptimeSeconds) }}</strong></span
          >
          <i></i>
        </article>
      </div>

      <div class="runtime-system-info-grid">
        <article class="runtime-system-info-item is-wide">
          <span class="runtime-system-info-icon"
            ><el-icon><Connection /></el-icon
          ></span>
          <span>
            <small>API 基础地址</small>
            <strong class="is-code">{{ apiBaseUrl }}</strong>
          </span>
        </article>
        <article class="runtime-system-info-item">
          <span class="runtime-system-info-icon is-success"
            ><el-icon><Timer /></el-icon
          ></span>
          <span>
            <small>API 服务时间</small>
            <strong>{{ formatDateTime(data?.runtime.serverTime) }}</strong>
          </span>
        </article>
        <article class="runtime-system-info-item">
          <span class="runtime-system-info-icon is-warning"
            ><el-icon><Refresh /></el-icon
          ></span>
          <span>
            <small>最近检测时间</small>
            <strong>{{ formatDateTime(runtimeCheckedAt?.toISOString()) }}</strong>
          </span>
        </article>
        <a
          class="runtime-system-info-item is-link"
          :href="apiDirectoryUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="runtime-system-info-icon is-purple"
            ><el-icon><Document /></el-icon
          ></span>
          <span>
            <small>接口文档</small>
            <strong>打开 API 接口目录</strong>
          </span>
        </a>
      </div>

      <div class="runtime-details">
        <div>
          <small>服务启动时间</small
          ><strong>{{ formatDateTime(data?.runtime.api.startedAt) }}</strong>
        </div>
        <div>
          <small>运行环境</small><strong>{{ data?.runtime.api.environment || '—' }}</strong>
        </div>
        <div>
          <small>Node.js</small><strong>{{ data?.runtime.api.nodeVersion || '—' }}</strong>
        </div>
        <div>
          <small>主机名称</small><strong>{{ data?.runtime.process.hostname || '—' }}</strong>
        </div>
        <div>
          <small>系统架构</small
          ><strong>{{ data?.runtime.process.platform }} / {{ data?.runtime.process.arch }}</strong>
        </div>
        <div>
          <small>进程 / CPU</small
          ><strong
            >PID {{ data?.runtime.process.pid ?? '—' }} ·
            {{ data?.runtime.process.cpuCount ?? '—' }} 核</strong
          >
        </div>
        <div>
          <small>进程内存</small><strong>{{ data?.runtime.process.memoryRssMb ?? '—' }} MB</strong>
        </div>
        <div>
          <small>堆内存</small
          ><strong
            >{{ data?.runtime.process.heapUsedMb ?? '—' }} /
            {{ data?.runtime.process.heapTotalMb ?? '—' }} MB</strong
          >
        </div>
      </div>

      <p v-if="data?.runtime.database.error" class="runtime-error">
        <el-icon><Warning /></el-icon>{{ data.runtime.database.error }}
      </p>
    </section>

    <section
      v-show="activeSystemSection === 'maintenance'"
      class="surface-card service-control-card"
    >
      <div class="section-title">
        <div class="section-title-copy">
          <span class="section-title-icon is-warning"
            ><el-icon><SwitchButton /></el-icon
          ></span>
          <div>
            <h2>重启与维护</h2>
            <p>控制 Web 面板、API 进程和业务数据库访问，操作会真实生效并记录审计。</p>
          </div>
        </div>
        <el-tag round effect="plain" type="warning">管理员操作</el-tag>
      </div>

      <div class="service-control-grid">
        <article class="service-control-item">
          <span class="service-control-icon is-web"
            ><el-icon><Monitor /></el-icon
          ></span>
          <div class="service-control-copy">
            <div>
              <strong>面板服务</strong>
              <el-tag
                round
                size="small"
                :type="data?.runtime.control.webRestartSupported ? 'success' : 'info'"
              >
                {{ data?.runtime.control.webRestartSupported ? '运行中' : '外部托管' }}
              </el-tag>
            </div>
            <p>重启 Web 管理面板服务，当前页面会短暂重连并自动恢复。</p>
            <small>访问地址：{{ data?.runtime.webOrigins[0] || currentOrigin }}</small>
          </div>
          <el-button
            round
            type="primary"
            plain
            :icon="RefreshRight"
            :loading="restartingWeb"
            :disabled="
              !data?.runtime.control.webRestartSupported || restartingApi || databaseSwitching
            "
            @click="restartWeb"
          >
            重启面板
          </el-button>
        </article>

        <article class="service-control-item">
          <span class="service-control-icon is-api"
            ><el-icon><RefreshRight /></el-icon
          ></span>
          <div class="service-control-copy">
            <div>
              <strong>API 服务</strong>
              <el-tag round size="small" type="success">运行中</el-tag>
            </div>
            <p>当前 PID {{ data?.runtime.process.pid ?? '—' }}，重启时页面会自动等待新进程恢复。</p>
            <small>最近启动：{{ formatDateTime(data?.runtime.api.startedAt) }}</small>
          </div>
          <el-button
            round
            type="primary"
            :icon="RefreshRight"
            :loading="restartingApi"
            :disabled="
              !data?.runtime.control.apiRestartSupported || databaseSwitching || restartingWeb
            "
            @click="restartApi"
          >
            重启 API
          </el-button>
        </article>

        <article
          :class="[
            'service-control-item',
            { 'is-database-paused': !data?.runtime.database.accessEnabled },
          ]"
        >
          <span class="service-control-icon is-database"
            ><el-icon><Cpu /></el-icon
          ></span>
          <div class="service-control-copy">
            <div>
              <strong>数据库开关</strong>
              <el-tag
                round
                size="small"
                :type="data?.runtime.database.accessEnabled ? 'success' : 'warning'"
              >
                {{ data?.runtime.database.accessEnabled ? '业务访问已开启' : '业务访问已暂停' }}
              </el-tag>
            </div>
            <p>关闭后立即阻断所有业务数据读写，保留系统设置作为恢复入口。</p>
            <small> 最近操作：{{ formatDateTime(data?.runtime.database.accessUpdatedAt) }} </small>
          </div>
          <el-switch
            :model-value="data?.runtime.database.accessEnabled ?? true"
            size="large"
            inline-prompt
            active-text="开"
            inactive-text="关"
            :loading="databaseSwitching"
            :disabled="restartingApi || restartingWeb"
            @change="updateDatabaseAccess"
          />
        </article>
      </div>

      <p
        v-if="
          !data?.runtime.control.apiRestartSupported || !data?.runtime.control.webRestartSupported
        "
        class="control-hint"
      >
        当前启动方式若未开启对应进程托管，重启按钮会自动停用；数据库开关不受影响。
      </p>
    </section>

    <section v-show="activeSystemSection === 'security'" class="surface-card security-card">
      <div class="section-title">
        <div class="section-title-copy">
          <span class="section-title-icon is-purple"
            ><el-icon><Lock /></el-icon
          ></span>
          <div>
            <h2>安全管理</h2>
            <p>查看当前访问来源、登录保护、限流策略和管理员会话。</p>
          </div>
        </div>
        <el-button
          round
          plain
          type="danger"
          :loading="revoking"
          :disabled="(data?.security.activeSessionCount ?? 0) <= 1"
          @click="revokeOthers"
        >
          退出其他设备
        </el-button>
      </div>

      <div class="security-summary-grid">
        <article>
          <small>当前访问来源</small>
          <strong>{{ data?.security.localRequest ? '本机访问' : '外网访问' }}</strong>
          <span
            >{{ data?.security.currentIp || '—' }} · {{ data?.security.requestHost || '—' }}</span
          >
        </article>
        <article>
          <small>有效登录会话</small>
          <strong>{{ data?.security.activeSessionCount ?? 0 }} 个</strong>
          <span>会话有效期 {{ data?.security.sessionTtlDays ?? '—' }} 天</span>
        </article>
        <article :class="{ 'has-warning': (data?.security.failedLoginAttempts24h ?? 0) > 0 }">
          <small>24 小时登录失败</small>
          <strong>{{ data?.security.failedLoginAttempts24h ?? 0 }} 次</strong>
          <span>最近 {{ formatDateTime(data?.security.lastFailedLoginAt) }}</span>
        </article>
        <article>
          <small>Cookie 传输保护</small>
          <strong>{{ data?.security.cookieSecure ? 'Secure 已启用' : '本机 HTTP 模式' }}</strong>
          <span>{{
            data?.security.cookieSecure ? '仅通过 HTTPS 发送' : '部署 HTTPS 后自动开启'
          }}</span>
        </article>
      </div>

      <div class="security-policy-grid">
        <div>
          <small>管理员登录限流</small>
          <strong
            >{{ data?.security.rateLimitWindowSeconds ?? 60 }} 秒内
            {{ data?.security.loginRateLimit ?? 5 }} 次</strong
          >
        </div>
        <div>
          <small>普通接口限流</small>
          <strong
            >{{ data?.security.rateLimitWindowSeconds ?? 60 }} 秒内
            {{ data?.security.apiRateLimit ?? 300 }} 次</strong
          >
        </div>
        <div>
          <small>最近成功登录</small>
          <strong>{{ formatDateTime(data?.security.lastSuccessfulLoginAt) }}</strong>
        </div>
        <div>
          <small>当前域名状态</small>
          <strong>{{ data?.security.hostAllowed ? '已允许' : '未加入白名单' }}</strong>
        </div>
      </div>

      <div class="session-heading">
        <div>
          <h3>管理员登录会话</h3>
          <p>发现不认识的设备时，可以在这里立即注销。</p>
        </div>
      </div>
      <div class="session-list">
        <article v-for="session in data?.security.sessions || []" :key="session.id">
          <span class="session-avatar"
            ><el-icon><User /></el-icon
          ></span>
          <div class="session-main">
            <div>
              <strong>{{ session.deviceName }}</strong>
              <el-tag v-if="session.current" round size="small" type="success">当前设备</el-tag>
            </div>
            <small
              >{{ session.ipAddresses?.join('、') || session.ipAddress || '未知地址' }}
              <span v-if="session.sessionCount > 1">
                · {{ session.sessionCount }} 个访问会话已归并</span
              >
              · 最近活动
              {{ formatDateTime(session.lastSeenAt) }}</small
            >
          </div>
          <div class="session-expiry">
            <small>到期时间</small>
            <strong>{{ formatDateTime(session.expiresAt) }}</strong>
          </div>
          <div class="session-actions">
            <el-button
              round
              plain
              size="small"
              :icon="Edit"
              :loading="sessionRenamingId === session.id"
              @click="renameSession(session)"
            >
              重命名
            </el-button>
            <el-button
              v-if="!session.current"
              round
              plain
              type="danger"
              size="small"
              :loading="sessionRevokingId === session.id"
              @click="revokeSession(session)"
            >
              注销
            </el-button>
          </div>
        </article>
      </div>
    </section>

    <section
      v-show="activeSystemSection === 'logs'"
      v-loading="auditLoading"
      class="surface-card audit-log-card"
    >
      <div class="section-title">
        <div class="section-title-copy">
          <span class="section-title-icon is-purple"
            ><el-icon><Document /></el-icon
          ></span>
          <div>
            <h2>系统操作日志</h2>
            <p>统一查看后台、公开链接和系统任务产生的真实审计记录。</p>
          </div>
        </div>
        <div class="audit-heading-actions">
          <el-tag round effect="plain" type="info">
            {{
              auditPagination.total === auditPagination.allTotal
                ? `共 ${auditPagination.allTotal} 条`
                : `显示 ${auditPagination.total} / 共 ${auditPagination.allTotal} 条`
            }}
          </el-tag>
          <el-button round plain :icon="Refresh" :loading="auditLoading" @click="loadAuditLogs">
            刷新日志
          </el-button>
          <el-button
            round
            plain
            type="danger"
            :icon="Delete"
            :loading="auditClearing"
            :disabled="!auditPagination.allTotal"
            @click="clearAuditLogs"
          >
            清空日志
          </el-button>
        </div>
      </div>

      <div class="audit-filter-bar">
        <el-input
          v-model="auditFilters.keyword"
          clearable
          :prefix-icon="Search"
          placeholder="搜索操作、对象、操作人或 IP"
          @keyup.enter="queryAuditLogs"
        />
        <el-select v-model="auditFilters.entityType" clearable placeholder="全部功能模块">
          <el-option
            v-for="entityType in auditFilterOptions.entityTypes"
            :key="entityType"
            :label="auditEntityText(entityType)"
            :value="entityType"
          />
        </el-select>
        <el-select v-model="auditFilters.action" clearable filterable placeholder="全部操作类型">
          <el-option
            v-for="action in auditFilterOptions.actions"
            :key="action"
            :label="auditActionText(action, '')"
            :value="action"
          />
        </el-select>
        <el-button round type="primary" :icon="Search" @click="queryAuditLogs">查询</el-button>
        <el-button round text type="danger" @click="resetAuditFilters">重置</el-button>
      </div>

      <el-empty
        v-if="!auditLoading && !auditLogs.length"
        description="暂无符合条件的操作日志"
        :image-size="72"
      />
      <div v-else class="audit-log-list">
        <article
          v-for="log in auditLogs"
          :key="log.id"
          :class="['audit-log-item', `is-${auditTone(log.action)}`]"
        >
          <span class="audit-log-marker"><i></i></span>
          <div class="audit-log-main">
            <div class="audit-log-title">
              <strong>{{ auditActionText(log.action, log.entityType) }}</strong>
              <el-tag round size="small" effect="plain">
                {{ auditEntityText(log.entityType) }}
              </el-tag>
              <el-tag round size="small" effect="plain" type="info">
                {{ auditSourceText(log.source) }}
              </el-tag>
            </div>
            <div class="audit-log-meta">
              <span>
                <small>操作人</small>
                <b>{{ log.actor?.displayName || '系统 / 外部用户' }}</b>
              </span>
              <span>
                <small>操作时间</small>
                <b>{{ formatDateTime(log.createdAt) }}</b>
              </span>
              <span>
                <small>对象标识</small>
                <code :title="log.entityId">{{ compactEntityId(log.entityId) }}</code>
              </span>
              <span>
                <small>来源地址</small>
                <b>{{ log.ipAddress || '—' }}</b>
              </span>
              <span>
                <small>设备</small>
                <b>{{ log.deviceName }}</b>
              </span>
            </div>
            <p class="audit-log-change">
              <span>涉及内容</span>{{ auditChangedFieldsText(log.changedFields) }}
            </p>
          </div>
        </article>
      </div>

      <div v-if="auditPagination.total" class="audit-pagination">
        <el-pagination
          background
          :current-page="auditPagination.page"
          :page-size="auditPagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="auditPagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="changeAuditPage"
          @size-change="changeAuditPageSize"
        />
      </div>
    </section>

    <section v-show="activeSystemSection === 'extensions'" class="extensions-grid">
      <article class="surface-card extension-card backup-extension-card">
        <div class="extension-card-heading">
          <div class="section-title-copy">
            <span class="section-title-icon is-green"
              ><el-icon><FolderOpened /></el-icon
            ></span>
            <div>
              <h2>数据备份与恢复</h2>
              <p>支持完整备份或按模块多选，备份文件使用当前数据密钥加密。</p>
            </div>
          </div>
          <el-tag round effect="plain" type="success">已接通</el-tag>
        </div>
        <div v-loading="backupOptionsLoading" class="backup-selection-block">
          <div class="backup-selection-heading">
            <strong>选择备份内容</strong>
            <span>可多选；选择“全部数据”时使用完整备份</span>
          </div>
          <div class="backup-option-grid">
            <button
              v-for="option in backupOptions"
              :key="option.id"
              type="button"
              :class="[
                'card-choice',
                'backup-option-card',
                { 'is-selected': backupSelection.includes(option.id) },
              ]"
              :aria-pressed="backupSelection.includes(option.id)"
              @click="toggleBackupSelection(option.id)"
            >
              <span>
                <strong>{{ option.label }}</strong>
                <small>{{ option.description }}</small>
              </span>
              <em>{{ option.modelCount }} 项数据表</em>
            </button>
          </div>
          <p
            v-for="option in backupOptions.filter(
              (item) => backupSelection.includes(item.id) && item.dependencyNote,
            )"
            :key="option.id + '-dependency'"
            class="backup-dependency-note"
          >
            {{ option.label }}：{{ option.dependencyNote }}
          </p>
        </div>
        <div class="extension-actions">
          <el-button
            round
            type="success"
            :icon="Download"
            :loading="backupExporting"
            :disabled="backupOptionsLoading || !backupOptions.length"
            @click="exportBackup"
          >
            导出所选备份
          </el-button>
          <input
            ref="backupFileInput"
            class="visually-hidden-file-input"
            type="file"
            accept=".osbackup,application/octet-stream"
            @change="inspectBackupFile"
          />
          <el-button
            round
            plain
            :icon="Upload"
            :loading="backupInspecting"
            @click="backupFileInput?.click()"
          >
            选择并校验备份
          </el-button>
          <el-button
            round
            type="danger"
            plain
            :disabled="!backupInspect"
            :loading="backupRestoring"
            @click="restoreBackup"
          >
            恢复数据
          </el-button>
        </div>
        <div v-if="backupInspect" class="backup-inspect-result">
          <span>
            校验通过 ·
            {{ backupInspect.scope === 'FULL' ? '完整备份' : '选择性备份' }} ·
            {{ formatDateTime(backupInspect.createdAt) }}
          </span>
          <strong
            >{{ backupInspect.categoryLabels.join('、') }} ·
            {{ backupInspect.primaryRecordCount }} 条主数据 ·
            {{ backupBytesText(backupInspect.bytes) }}</strong
          >
          <small v-if="backupInspect.dependencyRecordCount">
            另含 {{ backupInspect.dependencyRecordCount }}
            条必要引用数据；引用数据只补齐，不覆盖其他模块配置。
          </small>
          <small>
            恢复前会要求管理员密码和确认词 RESTORE；
            {{
              backupInspect.requiresRelogin ? '恢复后登录会话会失效。' : '未选择的模块不会被清空。'
            }}
          </small>
        </div>
      </article>

      <article
        v-loading="logisticsLoading"
        class="surface-card extension-card logistics-extension-card"
      >
        <div class="extension-card-heading">
          <div class="section-title-copy">
            <span class="section-title-icon is-blue"
              ><el-icon><Van /></el-icon
            ></span>
            <div>
              <h2>ApiZero 快递查询 PRO</h2>
              <p>
                支持自动识别 2000+
                快递公司，顺丰、中通需手机号后四位；订单没有运单号时不显示查询图标。
              </p>
            </div>
          </div>
          <el-switch v-model="logisticsForm.enabled" active-text="启用" inactive-text="停用" />
        </div>
        <div class="extension-form-grid">
          <el-form-item label="API Key" class="is-wide">
            <el-input
              v-model="logisticsForm.apiKey"
              type="password"
              show-password
              :placeholder="
                logisticsForm.apiKeyConfigured
                  ? '已加密保存，留空表示保持不变'
                  : 'PRO 接口必须填写，可在 apizero.cn/account/keys 获取'
              "
            />
          </el-form-item>
          <el-form-item label="接口地址" class="is-wide">
            <el-input
              v-model="logisticsForm.endpoint"
              placeholder="https://v1.apizero.cn/api/express-pro"
            />
          </el-form-item>
          <el-form-item label="计费与额度" class="is-wide">
            <div class="logistics-quota-copy">
              <span>PRO 接口按次计费，无匿名额度，必须填写 API Key</span>
              <span>会员 1,700 / 3,500 次每日，超出按点数扣减</span>
            </div>
          </el-form-item>
          <el-form-item v-if="logisticsForm.apiKeyConfigured" label="已保存密钥">
            <el-checkbox v-model="logisticsForm.clearApiKey">保存时清除 API Key</el-checkbox>
          </el-form-item>
        </div>
        <div class="extension-actions">
          <el-button round type="primary" :loading="logisticsSaving" @click="saveLogistics"
            >保存物流配置</el-button
          >
          <el-input
            v-model="logisticsTestTrackingNo"
            class="logistics-test-input"
            placeholder="测试运单号"
          />
          <el-input
            v-model="logisticsTestPhoneSuffix"
            class="logistics-test-input is-phone"
            maxlength="4"
            inputmode="numeric"
            placeholder="手机号后4位（可空）"
          />
          <el-button
            round
            plain
            :icon="Connection"
            :loading="logisticsTesting"
            @click="testLogistics"
            >连接测试</el-button
          >
        </div>
        <div v-if="logisticsResult" class="logistics-test-result">
          <strong>{{ logisticsResult.stateText }}</strong>
          <span
            >{{ logisticsResult.trackingNo }} ·
            {{ logisticsResult.carrierName || logisticsResult.carrierCode || '自动识别' }}</span
          >
          <small v-if="logisticsResult.reason">{{ logisticsResult.reason }}</small>
          <ul v-if="logisticsResult.traces.length">
            <li
              v-for="trace in logisticsResult.traces.slice(0, 3)"
              :key="`${trace.time}-${trace.station}`"
            >
              <time>{{ trace.time }}</time
              ><span>{{ trace.station || trace.remark }}</span>
            </li>
          </ul>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.system-settings-page {
  display: grid;
  min-width: 0;
  gap: 14px;
}

.system-settings-page > * {
  min-width: 0;
}

.extensions-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}

.extension-card {
  min-width: 0;
  padding: 18px;
}

.extension-card-heading,
.extension-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.extension-card-heading {
  justify-content: space-between;
  margin-bottom: 16px;
}

.extension-card-heading .section-title-copy {
  min-width: 0;
}

.extension-card-heading h2 {
  margin: 0;
  font-size: 17px;
}

.extension-card-heading p {
  margin: 4px 0 0;
  color: var(--app-muted);
  font-size: 13px;
}

.backup-selection-block {
  display: grid;
  margin-bottom: 15px;
  gap: 8px;
}

.backup-selection-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  color: var(--app-heading);
  gap: 10px;
}

.backup-selection-heading strong {
  font-size: 13px;
}

.backup-selection-heading span {
  color: var(--app-muted);
  font-size: 11px;
}

.backup-option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.backup-option-card {
  min-height: 72px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 11px;
  gap: 8px;
}

.backup-option-card > span {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.backup-option-card strong {
  color: var(--app-heading);
  font-size: 13px;
}

.backup-option-card small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--app-muted);
  font-size: 11px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.backup-option-card em {
  flex: 0 0 auto;
  color: var(--app-muted);
  font-size: 10px;
  font-style: normal;
  white-space: nowrap;
}

.backup-option-card.is-selected em {
  color: var(--app-primary);
}

.backup-dependency-note {
  margin: 0;
  padding: 6px 9px;
  border-radius: 9px;
  color: var(--app-muted);
  background: color-mix(in srgb, var(--app-primary-soft) 54%, transparent);
  font-size: 11px;
  line-height: 1.45;
}

.extension-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
  margin-bottom: 10px;
}

.extension-form-grid :deep(.el-form-item) {
  margin-bottom: 10px;
}

.extension-form-grid :deep(.el-form-item__label) {
  color: var(--app-muted);
  font-size: 12px;
}

.extension-form-grid .is-wide {
  grid-column: 1 / -1;
}

.logistics-quota-copy {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  flex-wrap: wrap;
}

.logistics-quota-copy span {
  padding: 5px 9px;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--app-control) 78%, transparent);
  color: var(--app-text);
  font-size: 12px;
}

.backup-inspect-result,
.logistics-test-result {
  display: grid;
  gap: 4px;
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--app-success) 30%, var(--app-border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-success) 8%, var(--app-card-solid));
  color: var(--app-muted);
  font-size: 12px;
}

.backup-inspect-result strong,
.logistics-test-result strong {
  color: var(--app-text);
  font-size: 14px;
}

.logistics-test-result ul {
  display: grid;
  gap: 5px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.logistics-test-result li {
  display: flex;
  gap: 8px;
}

.logistics-test-result time {
  flex: 0 0 142px;
  color: var(--app-muted);
}

.logistics-test-input {
  width: 190px;
}

.logistics-test-input.is-phone {
  width: 190px;
}

.visually-hidden-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.system-settings-navigation {
  min-width: 0;
  padding: 7px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-control) 72%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 58%, transparent);
}

.system-settings-navigation :deep(.el-tabs__header) {
  margin: 0;
}

.system-settings-navigation :deep(.el-tabs__nav-wrap::before),
.system-settings-navigation :deep(.el-tabs__nav-wrap::after),
.system-settings-navigation :deep(.el-tabs__active-bar) {
  display: none;
}

.system-settings-navigation :deep(.el-tabs__nav) {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}

.system-settings-navigation :deep(.el-tabs__item) {
  height: 42px;
  padding: 0 14px !important;
  border: 1px solid transparent;
  border-radius: 12px;
  color: var(--app-muted);
  line-height: 40px;
  font-size: 15px;
  font-weight: 600;
  transition:
    color 160ms ease,
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.system-settings-navigation :deep(.el-tabs__item:hover) {
  color: var(--app-heading);
  background: color-mix(in srgb, var(--app-hover) 70%, transparent);
}

.system-settings-navigation :deep(.el-tabs__item.is-active) {
  border-color: color-mix(in srgb, var(--app-primary) 22%, var(--app-border));
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary-soft) 68%, var(--app-card-solid));
  box-shadow:
    0 4px 12px color-mix(in srgb, var(--app-primary) 10%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 72%, transparent);
}

.system-settings-navigation :deep(.el-tabs__item:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 54%, transparent);
  outline-offset: 1px;
}

.system-settings-navigation :deep(.el-tabs__content) {
  display: none;
}

.panel-settings-card,
.runtime-card,
.service-control-card,
.security-card,
.audit-log-card {
  min-width: 0;
  padding: 17px;
}

.section-title,
.section-title-copy {
  display: flex;
  align-items: center;
}

.section-title {
  justify-content: space-between;
  gap: 12px;
}

.section-title-copy {
  min-width: 0;
  gap: 10px;
}

.section-title-copy > div {
  min-width: 0;
}

.section-title-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border-radius: 13px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
}

.section-title-icon.is-success {
  color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 12%, transparent);
}

.section-title-icon.is-purple {
  color: #8b5cf6;
  background: color-mix(in srgb, #8b5cf6 12%, transparent);
}

.section-title-icon.is-warning {
  color: var(--app-warning);
  background: color-mix(in srgb, var(--app-warning) 12%, transparent);
}

.section-title h2 {
  margin: 0;
  color: var(--app-heading);
  font-size: 18px;
}

.section-title p {
  margin: 4px 0 0;
  color: var(--app-muted);
  font-size: 13px;
}

.panel-settings-list {
  display: grid;
  width: 100%;
  margin-top: 15px;
  gap: 12px;
}

.panel-setting-group {
  min-width: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-border) 88%, transparent);
  border-radius: 17px;
  background: color-mix(in srgb, var(--app-control) 28%, transparent);
}

.panel-setting-group-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 11px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  background: color-mix(in srgb, var(--app-control) 48%, transparent);
  gap: 9px;
}

.panel-setting-group-heading > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.panel-setting-group-heading strong {
  color: var(--app-heading);
  font-size: 14px;
}

.panel-setting-group-heading small {
  color: var(--app-muted);
  font-size: 11px;
  line-height: 1.45;
}

.panel-setting-group-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border-radius: 11px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
}

.panel-setting-group-icon.is-success {
  color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 12%, transparent);
}

.panel-setting-group-icon.is-warning {
  color: var(--app-warning);
  background: color-mix(in srgb, var(--app-warning) 12%, transparent);
}

.panel-setting-row {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(210px, 260px) minmax(360px, 820px);
  align-items: center;
  justify-content: start;
  padding: 14px;
  gap: 18px;
}

.panel-setting-row + .panel-setting-row {
  border-top: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
}

.panel-setting-row.is-top-aligned {
  align-items: start;
}

.panel-setting-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.panel-setting-copy strong {
  color: var(--app-heading);
  font-size: 14px;
}

.panel-setting-copy small,
.panel-setting-control > small {
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.55;
}

.panel-setting-copy code {
  padding: 1px 5px;
  border-radius: 6px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.panel-setting-control {
  width: min(100%, 760px);
  min-width: 0;
  justify-self: start;
}

.panel-setting-control.is-medium {
  width: min(100%, 520px);
}

.panel-setting-control.is-wide {
  width: min(100%, 820px);
}

.panel-setting-control.is-stacked {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.panel-setting-control.is-switch {
  display: flex;
  width: auto;
  min-width: 220px;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}

.panel-setting-control :deep(.el-input__wrapper) {
  min-height: 42px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-card-solid) 64%, transparent);
  box-shadow: 0 0 0 1px var(--app-border) inset;
}

.setting-state {
  padding: 5px 9px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  color: var(--app-muted);
  background: color-mix(in srgb, var(--app-control) 68%, transparent);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.setting-state.is-active {
  border-color: color-mix(in srgb, var(--app-success) 26%, var(--app-border));
  color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 10%, transparent);
}

.brand-mark-editor {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
}

.brand-mark-preview {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(145deg, #60a5fa, #2563eb);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--app-primary) 22%, transparent);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.brand-mark-preview.is-long {
  font-size: 10px;
  letter-spacing: 0;
}

.admin-entry-input-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto auto;
  align-items: center;
  gap: 8px;
}

.admin-entry-input-row :deep(.el-button) {
  margin: 0;
}

.admin-entry-input-row :deep(.el-input-group__prepend) {
  border: 0;
  color: var(--app-muted);
  background: color-mix(in srgb, var(--app-card-solid) 76%, transparent);
  box-shadow: 0 0 0 1px var(--app-border) inset;
}

.admin-entry-preview {
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 9px 11px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-card-solid) 54%, transparent);
  gap: 10px;
}

.admin-entry-preview small {
  flex: 0 0 auto;
}

.admin-entry-preview code {
  overflow: hidden;
  color: var(--app-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-expiry-note {
  color: color-mix(in srgb, var(--app-warning) 72%, var(--app-muted)) !important;
}

.root-mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.root-mode-card {
  align-items: center;
  padding: 11px 12px;
  gap: 10px;
}

.root-mode-card > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.root-mode-card strong {
  color: var(--app-heading);
  font-size: 14px;
}

.root-mode-card small {
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.45;
}

.root-mode-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 11px;
}

.root-mode-icon.is-warning {
  color: var(--app-warning);
  background: color-mix(in srgb, var(--app-warning) 12%, transparent);
}

.root-mode-icon.is-primary {
  color: var(--app-primary);
  background: var(--app-primary-soft);
}

.domain-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 9px;
}

.domain-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.empty-domain-note {
  margin: 0;
  color: var(--app-muted);
  font-size: 12px;
}

.last-refresh {
  color: var(--app-muted);
  font-size: 12px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 15px;
  gap: 11px;
}

.status-item {
  --status-color: var(--app-primary);
  display: flex;
  min-width: 0;
  min-height: 78px;
  align-items: center;
  padding: 13px;
  border: 1px solid color-mix(in srgb, var(--status-color) 18%, var(--app-border));
  border-radius: 15px;
  background: color-mix(in srgb, var(--status-color) 6%, var(--app-card-solid));
  gap: 10px;
}

.status-item.is-online {
  --status-color: var(--app-success);
}

.status-item.is-offline {
  --status-color: var(--app-danger);
}

.status-item.is-paused {
  --status-color: var(--app-warning);
}

.status-icon {
  display: grid;
  width: 37px;
  height: 37px;
  flex: 0 0 37px;
  place-items: center;
  border-radius: 12px;
  color: var(--status-color);
  background: color-mix(in srgb, var(--status-color) 12%, transparent);
}

.status-item > span:nth-child(2) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.status-item small,
.runtime-details small,
.security-summary-grid small,
.security-policy-grid small,
.session-expiry small {
  color: var(--app-muted);
  font-size: 12px;
}

.status-item strong {
  overflow: hidden;
  color: var(--app-heading);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-item > i {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--status-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--status-color) 12%, transparent);
}

.runtime-system-info-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1.35fr) repeat(3, minmax(180px, 1fr));
  margin-top: 11px;
  gap: 10px;
}

.runtime-system-info-item {
  display: flex;
  min-width: 0;
  min-height: 72px;
  align-items: center;
  padding: 11px 13px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-control) 68%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 56%, transparent);
  gap: 10px;
}

.runtime-system-info-item > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.runtime-system-info-item small {
  color: var(--app-muted);
  font-size: 12px;
}

.runtime-system-info-item strong {
  overflow: hidden;
  color: var(--app-heading);
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-system-info-item strong.is-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.runtime-system-info-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 12px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
}

.runtime-system-info-icon.is-success {
  color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 12%, transparent);
}

.runtime-system-info-icon.is-warning {
  color: var(--app-warning);
  background: color-mix(in srgb, var(--app-warning) 12%, transparent);
}

.runtime-system-info-icon.is-purple {
  color: var(--app-purple);
  background: color-mix(in srgb, var(--app-purple) 12%, transparent);
}

.runtime-system-info-item.is-link {
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    transform 160ms ease;
}

.runtime-system-info-item.is-link:hover {
  border-color: color-mix(in srgb, var(--app-primary) 38%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary-soft) 55%, var(--app-card-solid));
  transform: translateY(-1px);
}

.runtime-details,
.security-policy-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 11px;
  gap: 10px;
}

.runtime-details > div,
.security-policy-grid > div {
  display: flex;
  min-width: 0;
  min-height: 66px;
  flex-direction: column;
  justify-content: center;
  padding: 11px 13px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-control) 62%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 54%, transparent);
  gap: 5px;
}

.runtime-details strong,
.security-policy-grid strong {
  overflow-wrap: anywhere;
  color: var(--app-heading);
  font-size: 13px;
  line-height: 1.45;
}

.runtime-error {
  display: flex;
  align-items: center;
  margin: 11px 0 0;
  padding: 9px 11px;
  border-radius: 11px;
  color: var(--app-danger);
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  font-size: 13px;
  gap: 7px;
}

.service-control-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 15px;
  gap: 12px;
}

.service-control-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 126px;
  align-items: center;
  padding: 15px;
  border: 1px solid var(--app-border);
  border-radius: 17px;
  background: color-mix(in srgb, var(--app-control) 62%, transparent);
  gap: 12px;
}

.service-control-item.is-database-paused {
  border-color: color-mix(in srgb, var(--app-warning) 34%, var(--app-border));
  background: color-mix(in srgb, var(--app-warning) 7%, var(--app-card));
}

.service-control-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 14px;
  font-size: 19px;
}

.service-control-icon.is-api {
  color: var(--app-primary);
  background: var(--app-primary-soft);
}

.service-control-icon.is-web {
  color: var(--app-purple);
  background: color-mix(in srgb, var(--app-purple) 12%, transparent);
}

.service-control-icon.is-database {
  color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 12%, transparent);
}

.service-control-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.service-control-copy > div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.service-control-copy strong {
  color: var(--app-heading);
  font-size: 15px;
}

.service-control-copy p,
.service-control-copy small,
.control-hint {
  margin: 0;
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.55;
}

.control-hint {
  margin-top: 10px;
  padding: 9px 11px;
  border-radius: 11px;
  color: var(--app-warning);
  background: color-mix(in srgb, var(--app-warning) 8%, transparent);
}

.security-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 15px;
  gap: 11px;
}

.security-summary-grid article {
  display: flex;
  min-width: 0;
  min-height: 105px;
  flex-direction: column;
  padding: 13px;
  border: 1px solid var(--app-border);
  border-radius: 15px;
  background: color-mix(in srgb, var(--app-control) 66%, transparent);
  gap: 7px;
}

.security-summary-grid article.has-warning {
  border-color: color-mix(in srgb, var(--app-warning) 30%, var(--app-border));
  background: color-mix(in srgb, var(--app-warning) 6%, var(--app-card));
}

.security-summary-grid strong {
  color: var(--app-heading);
  font-size: 17px;
}

.security-summary-grid span {
  overflow-wrap: anywhere;
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.45;
}

.session-heading {
  margin-top: 15px;
}

.session-heading h3 {
  margin: 0;
  color: var(--app-heading);
  font-size: 15px;
}

.session-heading p {
  margin: 4px 0 0;
  color: var(--app-muted);
  font-size: 12px;
}

.session-list {
  display: grid;
  margin-top: 10px;
  gap: 8px;
}

.session-list article {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(190px, auto) auto;
  align-items: center;
  padding: 11px 12px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-card-solid) 48%, transparent);
  gap: 11px;
}

.session-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}

.session-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.session-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 11px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
}

.session-main,
.session-expiry {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.session-main > div {
  display: flex;
  align-items: center;
  gap: 7px;
}

.session-main strong,
.session-expiry strong {
  overflow: hidden;
  color: var(--app-heading);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-main small {
  overflow: hidden;
  color: var(--app-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-heading-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.audit-filter-bar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 190px 210px auto auto;
  align-items: center;
  margin-top: 15px;
  padding: 11px;
  border: 1px solid var(--app-border);
  border-radius: 15px;
  background: color-mix(in srgb, var(--app-control) 62%, transparent);
  gap: 9px;
}

.audit-filter-bar :deep(.el-input__wrapper),
.audit-filter-bar :deep(.el-select__wrapper) {
  min-height: 40px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--app-card-solid) 68%, transparent);
  box-shadow: 0 0 0 1px var(--app-border) inset;
}

.audit-filter-bar :deep(.el-button + .el-button) {
  margin-left: 0;
}

.audit-log-list {
  display: grid;
  margin-top: 11px;
  gap: 8px;
}

.audit-log-item {
  --audit-color: var(--app-primary);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 12px 13px;
  border: 1px solid color-mix(in srgb, var(--audit-color) 16%, var(--app-border));
  border-radius: 15px;
  background: color-mix(in srgb, var(--audit-color) 4%, var(--app-card-solid));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 56%, transparent);
  gap: 11px;
}

.audit-log-item.is-success {
  --audit-color: var(--app-success);
}

.audit-log-item.is-warning {
  --audit-color: var(--app-warning);
}

.audit-log-item.is-danger {
  --audit-color: var(--app-danger);
}

.audit-log-marker {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 11px;
  color: var(--audit-color);
  background: color-mix(in srgb, var(--audit-color) 12%, transparent);
}

.audit-log-marker i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 12%, transparent);
}

.audit-log-main {
  min-width: 0;
}

.audit-log-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.audit-log-title strong {
  color: var(--app-heading);
  font-size: 14px;
}

.audit-log-meta {
  display: grid;
  grid-template-columns: 0.8fr 1.1fr 1fr 0.8fr 1.3fr;
  margin-top: 9px;
  gap: 10px;
}

.audit-log-meta > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.audit-log-meta small,
.audit-log-change span {
  color: var(--app-muted);
  font-size: 11px;
}

.audit-log-meta b,
.audit-log-meta code {
  overflow: hidden;
  color: var(--app-text);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-log-meta code {
  color: var(--app-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.audit-log-change {
  display: flex;
  flex-wrap: wrap;
  margin: 9px 0 0;
  padding-top: 8px;
  border-top: 1px dashed color-mix(in srgb, var(--app-border) 80%, transparent);
  color: var(--app-text);
  font-size: 12px;
  gap: 8px;
}

.audit-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 13px;
}

.future-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.future-card {
  --future-accent: var(--app-primary);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 104px;
  align-items: center;
  padding: 15px;
  border-color: color-mix(in srgb, var(--future-accent) 16%, var(--app-border));
  background: color-mix(in srgb, var(--future-accent) 5%, var(--app-card));
  gap: 12px;
}

.future-card--green {
  --future-accent: #10b981;
}
.future-card--orange {
  --future-accent: #f59e0b;
}
.future-card--teal {
  --future-accent: #0d9488;
}

.future-card-icon {
  display: grid;
  width: 39px;
  height: 39px;
  place-items: center;
  border-radius: 13px;
  color: var(--future-accent);
  background: color-mix(in srgb, var(--future-accent) 12%, transparent);
}

.future-card h2 {
  margin: 0;
  color: var(--app-heading);
  font-size: 15px;
}

.future-card p {
  margin: 5px 0 0;
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 1200px) {
  .extensions-grid {
    grid-template-columns: 1fr;
  }

  .extension-form-grid {
    grid-template-columns: 1fr;
  }

  .extension-form-grid .is-wide {
    grid-column: auto;
  }

  .logistics-test-input {
    width: min(100%, 220px);
  }

  .panel-setting-row {
    grid-template-columns: minmax(190px, 230px) minmax(280px, 760px);
    gap: 16px;
  }

  .runtime-system-info-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .audit-log-meta {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .status-grid,
  .security-summary-grid,
  .runtime-details,
  .security-policy-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .future-grid {
    grid-template-columns: 1fr;
  }

  .service-control-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .system-settings-navigation {
    padding-inline: 10px;
  }

  .system-settings-navigation :deep(.el-tabs__nav-scroll) {
    overflow-x: auto;
    scrollbar-width: none;
  }

  .system-settings-navigation :deep(.el-tabs__nav-scroll::-webkit-scrollbar) {
    display: none;
  }

  .system-settings-navigation :deep(.el-tabs__nav) {
    display: flex;
    width: max-content;
    min-width: 100%;
  }

  .system-settings-navigation :deep(.el-tabs__item) {
    min-width: 126px;
    flex: 0 0 auto;
    padding-inline: 9px;
    font-size: 14px;
  }

  .panel-setting-row,
  .runtime-system-info-grid,
  .status-grid,
  .runtime-details,
  .security-summary-grid,
  .security-policy-grid {
    grid-template-columns: 1fr;
  }

  .panel-setting-row {
    padding: 13px;
    gap: 10px;
  }

  .panel-setting-control,
  .panel-setting-control.is-medium,
  .panel-setting-control.is-wide,
  .panel-setting-control.is-switch {
    width: 100%;
    min-width: 0;
    justify-self: stretch;
  }

  .panel-setting-control.is-switch {
    justify-content: space-between;
  }

  .audit-filter-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .audit-filter-bar > :deep(.el-input) {
    grid-column: 1 / -1;
  }

  .audit-log-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .session-list article {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .session-expiry {
    display: none;
  }
}

@media (max-width: 560px) {
  .backup-option-grid {
    grid-template-columns: 1fr;
  }
  .backup-selection-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
  .backup-extension-card .extension-actions :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }
  .section-title {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .section-title > .el-button {
    width: 100%;
  }
  .audit-heading-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .audit-filter-bar,
  .audit-log-meta {
    grid-template-columns: 1fr;
  }
  .audit-filter-bar > :deep(.el-input) {
    grid-column: auto;
  }
  .audit-filter-bar :deep(.el-button) {
    width: 100%;
  }
  .audit-log-item {
    grid-template-columns: 1fr;
  }
  .audit-log-marker {
    width: 30px;
    height: 30px;
  }
  .audit-pagination {
    overflow-x: auto;
    justify-content: flex-start;
  }
  .session-list article {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .session-actions {
    grid-column: 1 / -1;
    justify-content: stretch;
  }
  .session-actions :deep(.el-button) {
    flex: 1;
  }
  .domain-input-row {
    grid-template-columns: 1fr;
  }
  .admin-entry-input-row {
    grid-template-columns: 1fr;
  }
  .admin-entry-input-row :deep(.el-button) {
    width: 100%;
  }
  .admin-entry-preview {
    align-items: flex-start;
    flex-direction: column;
  }
  .admin-entry-preview code {
    width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .root-mode-grid {
    grid-template-columns: 1fr;
  }
  .future-card {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .future-card > .el-tag {
    grid-column: 2;
    justify-self: start;
  }

  .service-control-item {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .service-control-item > .el-button,
  .service-control-item > .el-switch {
    grid-column: 1 / -1;
    justify-self: stretch;
  }

  .service-control-item > .el-button {
    width: 100%;
  }
}
</style>
