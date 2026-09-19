<script setup lang="ts">
import { CopyDocument, Delete, Link, Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

type SupportedPayoutType = 'WECHAT' | 'ALIPAY' | 'BANK_CARD';

interface PayoutMethod {
  id: string;
  type: string;
  label: string;
  accountName: string | null;
  accountMasked: string | null;
  bankName: string | null;
  isDefault: boolean;
  status: string;
  _count: { payouts: number };
}

interface SubmitterItem {
  id: string;
  code: string | null;
  name: string;
  nickname: string | null;
  status: string;
  notes: string | null;
  payoutMethods: PayoutMethod[];
  _count: { orders: number; payouts: number; externalIdentities: number };
}

interface PayoutRegistrationForm {
  id: string;
  publicToken: string;
  path: string;
  enabled: boolean;
  updatedAt: string;
}

const loading = ref(false);
const saving = ref(false);
const keyword = ref('');
const items = ref<SubmitterItem[]>([]);
const registrationForm = ref<PayoutRegistrationForm | null>(null);
const registrationLoading = ref(false);
const registrationSaving = ref(false);
const registrationError = ref('');
const confirmingPayoutId = ref('');

const profileDialog = ref(false);
const payoutDialog = ref(false);
const editingProfileId = ref<string | null>(null);
const editingPayoutId = ref<string | null>(null);
const originalPayoutType = ref<string | null>(null);
const activeProfileId = ref('');
const activeProfileHasDefault = ref(false);
const selectedPayoutTypes = ref<SupportedPayoutType[]>(['WECHAT']);

const profileForm = reactive({
  nickname: '',
  enabled: true,
  notes: '',
});

const payoutForm = reactive({
  type: 'WECHAT' as SupportedPayoutType,
  accountName: '',
  accountValue: '',
  bankName: '',
  isDefault: true,
  enabled: true,
});

const bulkPayoutForms = reactive({
  alipayAccount: '',
  bankAccountName: '',
  bankName: '',
  bankCardNumber: '',
});

const payoutTypeOptions: Array<{
  value: SupportedPayoutType;
  label: string;
  short: string;
  description: string;
}> = [
  {
    value: 'WECHAT',
    label: '微信转账',
    short: '微',
    description: '按微信昵称直接转账',
  },
  {
    value: 'ALIPAY',
    label: '支付宝',
    short: '支',
    description: '保存支付宝账号',
  },
  {
    value: 'BANK_CARD',
    label: '银行卡转账',
    short: '卡',
    description: '保存姓名、银行和卡号',
  },
];

const payoutTypeLabels: Record<string, string> = {
  WECHAT: '微信转账',
  ALIPAY: '支付宝',
  BANK_CARD: '银行卡转账',
  QR_CODE: '扫码收款',
  DIGITAL_CNY: '数字人民币',
  CASH: '现金',
  OTHER: '其他方式',
};

const profileNickname = (item: SubmitterItem) => item.nickname?.trim() || item.name;
const isSupportedPayoutType = (value: string): value is SupportedPayoutType =>
  ['WECHAT', 'ALIPAY', 'BANK_CARD'].includes(value);

const filteredItems = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) return items.value;
  return items.value.filter((item) =>
    [
      item.code,
      item.name,
      item.nickname,
      item.notes,
      ...item.payoutMethods.flatMap((method) => [
        method.label,
        method.accountName,
        method.accountMasked,
        method.bankName,
      ]),
    ].some((field) => field?.toLowerCase().includes(value)),
  );
});

const activeProfileCount = computed(
  () => items.value.filter((item) => item.status === 'ACTIVE').length,
);
const payoutMethodCount = computed(() =>
  items.value.reduce((total, item) => total + item.payoutMethods.length, 0),
);
const pendingPayoutCount = computed(() =>
  items.value.reduce(
    (total, item) =>
      total + item.payoutMethods.filter((method) => method.status === 'PENDING').length,
    0,
  ),
);
const registrationUrl = computed(() =>
  registrationForm.value
    ? new URL(registrationForm.value.path, window.location.origin).toString()
    : '',
);

const load = async () => {
  loading.value = true;
  try {
    const response = await http.get<{ items: SubmitterItem[] }>('/admin/submitters', {
      params: { includeDisabled: true },
    });
    items.value = response.data.items;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '回款登记加载失败'));
  } finally {
    loading.value = false;
  }
};

const loadRegistrationForm = async () => {
  registrationLoading.value = true;
  registrationError.value = '';
  try {
    const response = await http.get<PayoutRegistrationForm>('/admin/payout-registration');
    registrationForm.value = response.data;
  } catch (error) {
    registrationError.value = getApiErrorMessage(error, '分享填写权限加载失败');
  } finally {
    registrationLoading.value = false;
  }
};

const updateRegistrationEnabled = async (value: string | number | boolean) => {
  if (!registrationForm.value) return;
  registrationSaving.value = true;
  try {
    const response = await http.patch<PayoutRegistrationForm>('/admin/payout-registration', {
      enabled: Boolean(value),
    });
    registrationForm.value = response.data;
    ElMessage.success(response.data.enabled ? '已允许下单人填写回款资料' : '已暂停外部填写');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '填写权限修改失败'));
  } finally {
    registrationSaving.value = false;
  }
};

const writeClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const copyRegistrationUrl = async () => {
  if (!registrationUrl.value) return;
  try {
    await writeClipboard(registrationUrl.value);
    ElMessage.success('回款登记填写链接已复制');
  } catch {
    ElMessage.error('链接复制失败，请手动选择复制');
  }
};

const openRegistrationUrl = () => {
  if (registrationUrl.value) window.open(registrationUrl.value, '_blank', 'noopener,noreferrer');
};

const resetPayoutForm = (method?: PayoutMethod, hasExistingMethods = false) => {
  const supportedType =
    method && isSupportedPayoutType(method.type) ? method.type : ('WECHAT' as const);
  originalPayoutType.value = method?.type ?? null;
  Object.assign(payoutForm, {
    type: supportedType,
    accountName: method?.accountName ?? '',
    accountValue: '',
    bankName: method?.bankName ?? '',
    isDefault: method?.isDefault ?? !hasExistingMethods,
    enabled: method ? method.status !== 'DISABLED' : true,
  });
};

const resetBulkPayoutForms = () => {
  selectedPayoutTypes.value = ['WECHAT'];
  Object.assign(bulkPayoutForms, {
    alipayAccount: '',
    bankAccountName: '',
    bankName: '',
    bankCardNumber: '',
  });
};

const openProfile = (item?: SubmitterItem) => {
  editingProfileId.value = item?.id ?? null;
  Object.assign(profileForm, {
    nickname: item ? profileNickname(item) : '',
    enabled: item ? item.status === 'ACTIVE' : true,
    notes: item?.notes ?? '',
  });
  if (!item) resetBulkPayoutForms();
  profileDialog.value = true;
};

const togglePayoutType = (type: SupportedPayoutType) => {
  const selected = selectedPayoutTypes.value.includes(type);
  selectedPayoutTypes.value = selected
    ? selectedPayoutTypes.value.filter((item) => item !== type)
    : [...selectedPayoutTypes.value, type];
};

const selectPayoutType = (type: SupportedPayoutType) => {
  payoutForm.type = type;
  payoutForm.accountValue = '';
  if (type !== 'BANK_CARD') {
    payoutForm.accountName = '';
    payoutForm.bankName = '';
  }
};

const validatePayoutForm = () => {
  const needsNewAccount = !editingPayoutId.value || originalPayoutType.value !== payoutForm.type;

  if (payoutForm.type === 'ALIPAY' && needsNewAccount && !payoutForm.accountValue.trim()) {
    ElMessage.warning('请填写支付宝账号');
    return false;
  }
  if (payoutForm.type === 'BANK_CARD') {
    if (!payoutForm.accountName.trim()) {
      ElMessage.warning('请填写银行卡真实姓名');
      return false;
    }
    if (!payoutForm.bankName.trim()) {
      ElMessage.warning('请填写开户银行');
      return false;
    }
    if (needsNewAccount && !payoutForm.accountValue.trim()) {
      ElMessage.warning('请填写银行卡号');
      return false;
    }
  }
  return true;
};

const payoutPayload = () => ({
  type: payoutForm.type,
  accountName: payoutForm.type === 'BANK_CARD' ? payoutForm.accountName.trim() : undefined,
  accountValue:
    payoutForm.type === 'WECHAT' || !payoutForm.accountValue.trim()
      ? undefined
      : payoutForm.accountValue.trim(),
  bankName: payoutForm.type === 'BANK_CARD' ? payoutForm.bankName.trim() : undefined,
  isDefault: payoutForm.isDefault,
  status: payoutForm.enabled ? 'ACTIVE' : 'DISABLED',
});

const validateBulkPayoutForms = () => {
  if (!selectedPayoutTypes.value.length) {
    ElMessage.warning('请至少选择一种回款方式');
    return false;
  }
  if (selectedPayoutTypes.value.includes('ALIPAY') && !bulkPayoutForms.alipayAccount.trim()) {
    ElMessage.warning('请填写支付宝账号');
    return false;
  }
  if (selectedPayoutTypes.value.includes('BANK_CARD')) {
    if (!bulkPayoutForms.bankAccountName.trim()) {
      ElMessage.warning('请填写银行卡真实姓名');
      return false;
    }
    if (!bulkPayoutForms.bankName.trim()) {
      ElMessage.warning('请填写开户银行');
      return false;
    }
    if (!bulkPayoutForms.bankCardNumber.trim()) {
      ElMessage.warning('请填写银行卡号');
      return false;
    }
  }
  return true;
};

const bulkPayoutPayloads = (hasExistingDefault: boolean) =>
  selectedPayoutTypes.value.map((type, index) => ({
    type,
    accountName: type === 'BANK_CARD' ? bulkPayoutForms.bankAccountName.trim() : undefined,
    accountValue:
      type === 'ALIPAY'
        ? bulkPayoutForms.alipayAccount.trim()
        : type === 'BANK_CARD'
          ? bulkPayoutForms.bankCardNumber.trim()
          : undefined,
    bankName: type === 'BANK_CARD' ? bulkPayoutForms.bankName.trim() : undefined,
    isDefault: !hasExistingDefault && index === 0,
    status: 'ACTIVE',
  }));

const saveProfile = async () => {
  const nickname = profileForm.nickname.trim();
  if (!nickname) {
    ElMessage.warning('请填写下单人微信昵称');
    return;
  }
  if (!editingProfileId.value) {
    const duplicated = items.value.some(
      (item) => profileNickname(item).toLowerCase() === nickname.toLowerCase(),
    );
    if (duplicated) {
      ElMessage.warning('已有相同微信昵称，请直接在原登记中添加回款方式');
      return;
    }
    if (!validateBulkPayoutForms()) return;
  }

  saving.value = true;
  try {
    if (editingProfileId.value) {
      await http.patch(`/admin/submitters/${editingProfileId.value}`, {
        name: nickname,
        nickname,
        status: profileForm.enabled ? 'ACTIVE' : 'DISABLED',
        notes: profileForm.notes.trim() || undefined,
      });
      ElMessage.success('微信昵称资料已保存');
    } else {
      const response = await http.post<{ id: string }>('/admin/submitters', {
        name: nickname,
        nickname,
        status: 'ACTIVE',
        notes: profileForm.notes.trim() || undefined,
      });
      try {
        for (const payload of bulkPayoutPayloads(false)) {
          await http.post(`/admin/submitters/${response.data.id}/payout-methods`, payload);
        }
      } catch (error) {
        await http.delete(`/admin/submitters/${response.data.id}`).catch(() => undefined);
        throw error;
      }
      ElMessage.success('回款登记已保存');
    }
    profileDialog.value = false;
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '回款登记保存失败'));
  } finally {
    saving.value = false;
  }
};

const removeProfile = async (item: SubmitterItem) => {
  try {
    await ElMessageBox.confirm(`确定删除“${profileNickname(item)}”的回款登记吗？`, '删除回款登记', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    await http.delete(`/admin/submitters/${item.id}`);
    ElMessage.success('回款登记已删除');
    await load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '删除失败'));
  }
};

const openPayout = (item: SubmitterItem, method?: PayoutMethod) => {
  if (method && !isSupportedPayoutType(method.type)) {
    ElMessage.warning('该历史回款方式不在当前三种方式内，可删除后重新登记');
    return;
  }
  activeProfileId.value = item.id;
  editingPayoutId.value = method?.id ?? null;
  activeProfileHasDefault.value = item.payoutMethods.some((entry) => entry.isDefault);
  if (method) resetPayoutForm(method, item.payoutMethods.length > 0);
  else resetBulkPayoutForms();
  payoutDialog.value = true;
};

const savePayout = async () => {
  if (editingPayoutId.value) {
    if (!validatePayoutForm()) return;
  } else if (!validateBulkPayoutForms()) return;

  saving.value = true;
  try {
    if (editingPayoutId.value) {
      await http.patch(`/admin/payout-methods/${editingPayoutId.value}`, payoutPayload());
    } else {
      const createdMethodIds: string[] = [];
      try {
        for (const payload of bulkPayoutPayloads(activeProfileHasDefault.value)) {
          const response = await http.post<{ id: string }>(
            `/admin/submitters/${activeProfileId.value}/payout-methods`,
            payload,
          );
          createdMethodIds.push(response.data.id);
        }
      } catch (error) {
        await Promise.all(
          createdMethodIds.map((id) =>
            http.delete(`/admin/payout-methods/${id}`).catch(() => undefined),
          ),
        );
        throw error;
      }
    }
    payoutDialog.value = false;
    ElMessage.success(
      editingPayoutId.value
        ? '回款方式已更新'
        : `已添加 ${selectedPayoutTypes.value.length} 种回款方式`,
    );
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '回款方式保存失败'));
  } finally {
    saving.value = false;
  }
};

const removePayout = async (method: PayoutMethod) => {
  try {
    await ElMessageBox.confirm(
      `确定删除“${payoutTypeLabels[method.type] ?? method.label}”吗？`,
      '删除回款方式',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
    await http.delete(`/admin/payout-methods/${method.id}`);
    ElMessage.success('回款方式已删除');
    await load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '删除失败'));
  }
};

const copyAccountValue = async (method: PayoutMethod) => {
  try {
    const response = await http.get<{ accountValue: string | null }>(
      `/admin/payout-methods/${method.id}/account-value`,
    );
    const value = response.data.accountValue;
    if (!value) {
      ElMessage.info('微信转账直接使用下单人的微信昵称');
      return;
    }
    await writeClipboard(value);
    ElMessage.success(method.type === 'BANK_CARD' ? '银行卡号已复制' : '支付宝账号已复制');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '账号复制失败'));
  }
};

const confirmPayoutMethod = async (method: PayoutMethod) => {
  confirmingPayoutId.value = method.id;
  try {
    await http.patch(`/admin/payout-methods/${method.id}`, { status: 'ACTIVE' });
    ElMessage.success('回款方式已确认启用');
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '确认失败'));
  } finally {
    confirmingPayoutId.value = '';
  }
};

const payoutDetail = (item: SubmitterItem, method: PayoutMethod) => {
  if (method.type === 'WECHAT') return `按微信昵称“${profileNickname(item)}”转账`;
  if (method.type === 'ALIPAY') return `支付宝账号：${method.accountMasked || '未填写'}`;
  if (method.type === 'BANK_CARD') {
    return [method.bankName, method.accountName, method.accountMasked].filter(Boolean).join(' · ');
  }
  return method.accountMasked || method.label;
};

onMounted(() => void Promise.all([load(), loadRegistrationForm()]));
</script>

<template>
  <div class="page-shell submitters-page">
    <div class="page-heading">
      <div>
        <span class="page-kicker">PAYOUT DIRECTORY</span>
        <h1>回款登记</h1>
        <p>按下单人的微信昵称保存支付宝、微信转账或银行卡转账资料。</p>
      </div>
      <el-button type="primary" :icon="Plus" round @click="openProfile()"> 新增回款登记 </el-button>
    </div>

    <section v-loading="registrationLoading" class="surface-card registration-share-card">
      <div class="registration-share-main">
        <div class="registration-share-icon" aria-hidden="true">
          <el-icon><Link /></el-icon>
        </div>
        <div class="registration-share-copy">
          <div>
            <strong>下单人自主填写链接</strong>
            <el-tag
              v-if="registrationForm"
              :type="registrationForm.enabled ? 'success' : 'info'"
              size="small"
              effect="light"
            >
              {{ registrationForm.enabled ? '允许填写' : '已暂停' }}
            </el-tag>
          </div>
          <p>把固定链接发到微信，下单人可填写微信昵称并多选回款方式。</p>
        </div>
      </div>

      <template v-if="registrationForm">
        <div class="registration-permission">
          <div>
            <b>允许下单人填写</b>
            <span>{{
              registrationForm.enabled ? '链接当前可以提交资料' : '链接保留，但不能提交资料'
            }}</span>
          </div>
          <el-switch
            :model-value="registrationForm.enabled"
            :loading="registrationSaving"
            @change="updateRegistrationEnabled"
          />
        </div>
        <div class="registration-link-row">
          <span :title="registrationUrl">{{ registrationUrl }}</span>
          <el-button size="small" round :icon="CopyDocument" @click="copyRegistrationUrl">
            复制链接
          </el-button>
          <el-button size="small" round type="primary" plain @click="openRegistrationUrl">
            打开预览
          </el-button>
        </div>
      </template>
      <div v-else-if="registrationError" class="registration-error">
        <span>{{ registrationError }}</span>
        <el-button size="small" text type="primary" @click="loadRegistrationForm">重试</el-button>
      </div>
    </section>

    <section class="surface-card glass-toolbar profile-toolbar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        clearable
        placeholder="搜索微信昵称、支付宝账号、银行或姓名"
      />
      <div class="toolbar-summary">
        <span
          ><b>{{ activeProfileCount }}</b> 位下单人</span
        >
        <span
          ><b>{{ payoutMethodCount }}</b> 条回款方式</span
        >
        <span v-if="pendingPayoutCount" class="pending-summary"
          ><b>{{ pendingPayoutCount }}</b> 条待确认</span
        >
      </div>
      <el-button :icon="Refresh" circle :loading="loading" @click="load" />
    </section>

    <section v-loading="loading" class="profile-grid">
      <el-empty v-if="!filteredItems.length" description="还没有回款登记" />
      <article v-for="item in filteredItems" :key="item.id" class="surface-card profile-card">
        <header class="profile-head">
          <div class="profile-identity">
            <div class="profile-avatar">{{ profileNickname(item).slice(0, 1) }}</div>
            <div class="profile-name">
              <div>
                <strong>{{ profileNickname(item) }}</strong>
                <el-tag
                  :type="item.status === 'ACTIVE' ? 'success' : 'info'"
                  size="small"
                  effect="light"
                >
                  {{ item.status === 'ACTIVE' ? '启用' : '停用' }}
                </el-tag>
              </div>
              <p>
                微信昵称 <span>·</span> 识别码
                {{ item.code || '等待下单人提交后生成' }}
              </p>
            </div>
          </div>
          <div class="profile-actions">
            <el-button size="small" round @click="openProfile(item)">编辑昵称</el-button>
            <el-button size="small" round type="danger" plain @click="removeProfile(item)">
              删除
            </el-button>
          </div>
        </header>

        <div class="profile-stats">
          <div>
            <span>有效订单</span><b>{{ item._count.orders }}</b>
          </div>
          <div>
            <span>回款方式</span><b>{{ item.payoutMethods.length }}</b>
          </div>
          <div>
            <span>已登记回款</span><b>{{ item._count.payouts }}</b>
          </div>
        </div>

        <p v-if="item.notes" class="profile-notes">{{ item.notes }}</p>

        <section class="payout-section">
          <div class="section-title">
            <div>
              <strong>给下单人的回款方式</strong>
              <span>支付宝账号和银行卡号加密保存，页面默认脱敏</span>
            </div>
            <el-button
              class="payout-add-action"
              size="small"
              :icon="Plus"
              @click="openPayout(item)"
            >
              添加方式
            </el-button>
          </div>

          <el-empty
            v-if="!item.payoutMethods.length"
            :image-size="42"
            description="还没有登记回款方式"
          />
          <div v-for="method in item.payoutMethods" :key="method.id" class="payout-row">
            <div class="method-icon" :class="`type-${method.type.toLowerCase()}`">
              {{
                method.type === 'WECHAT'
                  ? '微'
                  : method.type === 'ALIPAY'
                    ? '支'
                    : method.type === 'BANK_CARD'
                      ? '卡'
                      : '款'
              }}
            </div>
            <div class="method-copy">
              <div>
                <strong>{{ payoutTypeLabels[method.type] ?? method.label }}</strong>
                <el-tag v-if="method.isDefault" size="small" type="warning" effect="light">
                  常用
                </el-tag>
                <el-tag
                  v-if="method.status !== 'ACTIVE'"
                  size="small"
                  :type="method.status === 'PENDING' ? 'warning' : 'info'"
                  effect="light"
                >
                  {{ method.status === 'PENDING' ? '待确认' : '停用' }}
                </el-tag>
              </div>
              <p>{{ payoutDetail(item, method) }}</p>
            </div>
            <div class="method-actions payout-method-actions">
              <el-button
                v-if="method.status === 'PENDING'"
                class="payout-method-action payout-method-action--confirm"
                size="small"
                :loading="confirmingPayoutId === method.id"
                @click="confirmPayoutMethod(method)"
              >
                确认启用
              </el-button>
              <el-button
                v-if="['ALIPAY', 'BANK_CARD'].includes(method.type)"
                class="payout-method-action payout-method-action--copy"
                size="small"
                :icon="CopyDocument"
                @click="copyAccountValue(method)"
              >
                复制
              </el-button>
              <el-button
                v-if="isSupportedPayoutType(method.type)"
                class="payout-method-action payout-method-action--edit"
                size="small"
                @click="openPayout(item, method)"
              >
                编辑
              </el-button>
              <el-button
                class="payout-method-action payout-method-action--delete"
                size="small"
                :icon="Delete"
                @click="removePayout(method)"
              >
                删除
              </el-button>
            </div>
          </div>
        </section>
      </article>
    </section>

    <el-dialog
      v-model="profileDialog"
      :title="editingProfileId ? '编辑下单人资料' : '新增回款登记'"
      width="min(680px, 94vw)"
      class="rounded-dialog"
    >
      <el-form :model="profileForm" label-position="top" class="profile-form">
        <section class="form-section">
          <div class="form-section-title">
            <b>下单人信息</b>
            <span>下单人名称统一使用微信昵称</span>
          </div>
          <el-form-item label="下单人微信昵称" required>
            <el-input v-model="profileForm.nickname" maxlength="100" placeholder="请输入微信昵称" />
          </el-form-item>
          <el-form-item v-if="editingProfileId" label="登记状态">
            <el-switch v-model="profileForm.enabled" active-text="启用" inactive-text="停用" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input
              v-model="profileForm.notes"
              type="textarea"
              :rows="2"
              placeholder="可记录需要注意的回款说明"
            />
          </el-form-item>
        </section>

        <section v-if="!editingProfileId" class="form-section payout-editor-section">
          <div class="form-section-title">
            <b>回款方式</b>
            <span>根据选择只填写对应资料</span>
          </div>
          <div class="method-options">
            <button
              v-for="option in payoutTypeOptions"
              :key="option.value"
              type="button"
              class="card-choice method-option"
              :class="{ 'is-selected': selectedPayoutTypes.includes(option.value) }"
              :aria-pressed="selectedPayoutTypes.includes(option.value)"
              @click="togglePayoutType(option.value)"
            >
              <span>{{ option.short }}</span>
              <div>
                <b>{{ option.label }}</b
                ><small>{{ option.description }}</small>
              </div>
            </button>
          </div>

          <div v-if="selectedPayoutTypes.includes('WECHAT')" class="wechat-tip">
            微信转账直接使用上方填写的微信昵称，不需要再填写其他账号。
          </div>
          <section v-if="selectedPayoutTypes.includes('ALIPAY')" class="selected-method-block">
            <div class="selected-method-title">支付宝资料</div>
            <el-form-item label="支付宝账号" required>
              <el-input
                v-model="bulkPayoutForms.alipayAccount"
                maxlength="500"
                placeholder="请输入手机号、邮箱或支付宝账号"
              />
            </el-form-item>
          </section>
          <section v-if="selectedPayoutTypes.includes('BANK_CARD')" class="selected-method-block">
            <div class="selected-method-title">银行卡资料</div>
            <div class="bank-fields">
              <el-form-item label="真实姓名" required>
                <el-input v-model="bulkPayoutForms.bankAccountName" maxlength="150" />
              </el-form-item>
              <el-form-item label="开户银行" required>
                <el-input
                  v-model="bulkPayoutForms.bankName"
                  maxlength="150"
                  placeholder="例如：中国工商银行"
                />
              </el-form-item>
              <el-form-item label="银行卡号" required class="span-two">
                <el-input
                  v-model="bulkPayoutForms.bankCardNumber"
                  maxlength="500"
                  inputmode="numeric"
                  placeholder="请输入银行卡号"
                />
              </el-form-item>
            </div>
          </section>
        </section>
      </el-form>
      <template #footer>
        <el-button round @click="profileDialog = false">取消</el-button>
        <el-button type="primary" round :loading="saving" @click="saveProfile">
          {{ editingProfileId ? '保存资料' : '保存回款登记' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="payoutDialog"
      :title="editingPayoutId ? '编辑回款方式' : '添加回款方式'"
      width="min(620px, 94vw)"
      class="rounded-dialog"
    >
      <el-form :model="payoutForm" label-position="top" class="payout-dialog-form">
        <template v-if="editingPayoutId">
          <div class="method-options">
            <button
              v-for="option in payoutTypeOptions"
              :key="option.value"
              type="button"
              class="card-choice method-option"
              :class="{ 'is-selected': payoutForm.type === option.value }"
              :aria-pressed="payoutForm.type === option.value"
              @click="selectPayoutType(option.value)"
            >
              <span>{{ option.short }}</span>
              <div>
                <b>{{ option.label }}</b
                ><small>{{ option.description }}</small>
              </div>
            </button>
          </div>

          <div v-if="payoutForm.type === 'WECHAT'" class="wechat-tip">
            微信转账直接使用该下单人的微信昵称，不需要填写其他账号。
          </div>
          <el-form-item v-else-if="payoutForm.type === 'ALIPAY'" label="支付宝账号" required>
            <el-input
              v-model="payoutForm.accountValue"
              maxlength="500"
              placeholder="留空表示保留原支付宝账号"
            />
          </el-form-item>
          <div v-else class="bank-fields">
            <el-form-item label="真实姓名" required>
              <el-input v-model="payoutForm.accountName" maxlength="150" />
            </el-form-item>
            <el-form-item label="开户银行" required>
              <el-input v-model="payoutForm.bankName" maxlength="150" />
            </el-form-item>
            <el-form-item label="银行卡号" required class="span-two">
              <el-input
                v-model="payoutForm.accountValue"
                maxlength="500"
                inputmode="numeric"
                placeholder="留空表示保留原银行卡号"
              />
            </el-form-item>
          </div>

          <div class="payout-switches">
            <div><span>设为常用方式</span><el-switch v-model="payoutForm.isDefault" /></div>
            <div><span>启用此方式</span><el-switch v-model="payoutForm.enabled" /></div>
          </div>
        </template>

        <template v-else>
          <div class="method-options">
            <button
              v-for="option in payoutTypeOptions"
              :key="option.value"
              type="button"
              class="card-choice method-option"
              :class="{ 'is-selected': selectedPayoutTypes.includes(option.value) }"
              :aria-pressed="selectedPayoutTypes.includes(option.value)"
              @click="togglePayoutType(option.value)"
            >
              <span>{{ option.short }}</span>
              <div>
                <b>{{ option.label }}</b
                ><small>{{ option.description }}</small>
              </div>
            </button>
          </div>

          <div v-if="selectedPayoutTypes.includes('WECHAT')" class="wechat-tip">
            微信转账直接使用该下单人的微信昵称，不需要填写其他账号。
          </div>
          <section v-if="selectedPayoutTypes.includes('ALIPAY')" class="selected-method-block">
            <div class="selected-method-title">支付宝资料</div>
            <el-form-item label="支付宝账号" required>
              <el-input
                v-model="bulkPayoutForms.alipayAccount"
                maxlength="500"
                placeholder="请输入支付宝账号"
              />
            </el-form-item>
          </section>
          <section v-if="selectedPayoutTypes.includes('BANK_CARD')" class="selected-method-block">
            <div class="selected-method-title">银行卡资料</div>
            <div class="bank-fields">
              <el-form-item label="真实姓名" required>
                <el-input v-model="bulkPayoutForms.bankAccountName" maxlength="150" />
              </el-form-item>
              <el-form-item label="开户银行" required>
                <el-input v-model="bulkPayoutForms.bankName" maxlength="150" />
              </el-form-item>
              <el-form-item label="银行卡号" required class="span-two">
                <el-input
                  v-model="bulkPayoutForms.bankCardNumber"
                  maxlength="500"
                  inputmode="numeric"
                  placeholder="请输入银行卡号"
                />
              </el-form-item>
            </div>
          </section>
        </template>
      </el-form>
      <template #footer>
        <el-button round @click="payoutDialog = false">取消</el-button>
        <el-button type="primary" round :loading="saving" @click="savePayout">
          保存回款方式
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.submitters-page {
  display: grid;
  gap: 14px;
}

.registration-share-main,
.registration-share-copy > div,
.registration-permission,
.registration-link-row,
.registration-error,
.profile-toolbar,
.toolbar-summary,
.profile-head,
.profile-identity,
.profile-actions,
.profile-name > div,
.section-title,
.payout-row,
.method-copy > div,
.method-actions,
.payout-switches,
.payout-switches > div {
  display: flex;
}

.registration-share-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  padding: 17px 18px;
  border-color: color-mix(in srgb, var(--app-primary) 18%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary-soft) 25%, var(--app-card));
  box-shadow:
    var(--app-shadow-sm),
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 66%, transparent);
  gap: 13px 22px;
}

.registration-share-main {
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.registration-share-icon {
  display: grid;
  width: 42px;
  flex: 0 0 42px;
  height: 42px;
  place-items: center;
  border-radius: 14px;
  color: #2563eb;
  background: rgba(59, 130, 246, 0.12);
  font-size: 19px;
}

.registration-share-icon svg {
  width: 18px;
  height: 18px;
}

.registration-share-copy {
  min-width: 0;
}

.registration-share-copy > div {
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.registration-share-copy strong {
  color: var(--app-heading);
  font-size: 16px;
}

.registration-share-copy p {
  margin: 4px 0 0;
  color: var(--app-muted);
  font-size: 12px;
}

.registration-permission {
  align-items: center;
  padding: 9px 12px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-card-solid) 86%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 62%, transparent);
  gap: 14px;
}

.registration-permission > div {
  display: flex;
  flex-direction: column;
}

.registration-permission b {
  color: var(--app-heading);
  font-size: 13px;
}

.registration-permission span {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 10px;
}

.registration-link-row {
  grid-column: 1 / -1;
  min-width: 0;
  align-items: center;
  padding: 8px 9px 8px 12px;
  border: 1px solid var(--app-border);
  border-radius: 13px;
  background: color-mix(in srgb, var(--app-card-solid) 90%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 62%, transparent);
  gap: 8px;
}

.registration-link-row > span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--app-muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.registration-error {
  grid-column: 1 / -1;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 12px;
  color: var(--app-danger);
  background: rgba(239, 68, 68, 0.08);
  font-size: 13px;
}

.profile-toolbar {
  align-items: center;
  padding: 12px;
  border-color: color-mix(in srgb, var(--app-primary) 10%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary-soft) 14%, var(--app-card));
  gap: 12px;
}

.profile-toolbar :deep(.el-input) {
  max-width: 520px;
}

.profile-toolbar :deep(.el-input__wrapper) {
  min-height: 36px;
  border-radius: 12px !important;
  background: color-mix(in srgb, var(--app-card-solid) 90%, transparent);
}

.toolbar-summary {
  align-items: center;
  margin-left: auto;
  color: var(--app-muted);
  font-size: 13px;
  gap: 8px;
}

.toolbar-summary span {
  padding: 7px 11px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-card-solid) 86%, transparent);
}

.toolbar-summary b {
  margin-right: 3px;
  color: var(--app-heading);
}

.toolbar-summary .pending-summary,
.toolbar-summary .pending-summary b {
  color: #d97706;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 16px;
}

.profile-grid > .el-empty {
  grid-column: 1 / -1;
}

.profile-card {
  overflow: hidden;
  padding: 18px;
  border-color: color-mix(in srgb, var(--app-primary) 9%, var(--app-border));
  background: color-mix(in srgb, var(--app-card-solid) 91%, var(--app-card));
  box-shadow:
    var(--app-shadow-sm),
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 64%, transparent);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.profile-card:hover {
  border-color: color-mix(in srgb, var(--app-primary) 20%, var(--app-border));
  box-shadow: var(--app-shadow);
}

.profile-head {
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.profile-identity {
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.profile-avatar {
  display: grid;
  flex: 0 0 44px;
  height: 44px;
  place-items: center;
  border-radius: 15px;
  color: #fff;
  background: linear-gradient(145deg, #60a5fa, #2563eb);
  box-shadow: 0 9px 20px rgba(37, 99, 235, 0.18);
  font-size: 17px;
  font-weight: 700;
}

.profile-name > div {
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.profile-name strong {
  color: var(--app-heading);
  font-size: 18px;
}

.profile-name p {
  margin: 5px 0 0;
  color: var(--app-muted);
  font-size: 12px;
}

.profile-name p span {
  margin: 0 4px;
}

.profile-actions,
.method-actions {
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.profile-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 15px;
  background: color-mix(in srgb, var(--app-primary-soft) 14%, var(--app-control));
}

.profile-stats > div {
  padding: 10px 13px;
  border-right: 1px solid var(--app-border);
}

.profile-stats > div:last-child {
  border-right: 0;
}

.profile-stats span,
.profile-stats b {
  display: block;
}

.profile-stats span {
  color: var(--app-muted);
  font-size: 12px;
}

.profile-stats b {
  margin-top: 2px;
  color: var(--app-heading);
  font-size: 19px;
}

.profile-notes {
  margin: 12px 0 0;
  padding: 9px 11px;
  border-radius: 11px;
  color: var(--app-text);
  background: var(--app-hover);
  font-size: 13px;
  line-height: 1.6;
}

.payout-section {
  margin-top: 14px;
  padding: 13px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-card-solid) 88%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 64%, transparent);
}

.payout-section :deep(.el-empty) {
  padding: 18px 0 2px;
}

.section-title {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-title > div {
  display: flex;
  flex-direction: column;
}

.section-title strong {
  color: var(--app-heading);
  font-size: 14px;
}

.section-title span {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 11px;
}

.payout-add-action {
  height: 28px;
  margin: 0 !important;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--app-primary) 22%, var(--app-border)) !important;
  border-radius: 9px;
  color: color-mix(in srgb, var(--app-primary) 84%, var(--app-text)) !important;
  background: color-mix(in srgb, var(--app-primary-soft) 62%, var(--app-card-solid)) !important;
  font-size: 12px;
  font-weight: 650;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 54%, transparent),
    0 1px 3px color-mix(in srgb, var(--app-primary) 8%, transparent) !important;
  transition:
    color 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.payout-add-action :deep(.el-icon) {
  margin-right: 3px;
  font-size: 13px;
}

.payout-add-action:hover,
.payout-add-action:focus-visible {
  border-color: color-mix(in srgb, var(--app-primary) 42%, var(--app-border)) !important;
  color: var(--app-primary) !important;
  background: color-mix(in srgb, var(--app-primary-soft) 82%, var(--app-card-solid)) !important;
  box-shadow: 0 3px 8px color-mix(in srgb, var(--app-primary) 14%, transparent) !important;
}

.payout-row {
  align-items: center;
  min-height: 64px;
  margin-top: 8px;
  padding: 9px 10px;
  border: 1px solid var(--app-border);
  border-radius: 13px;
  background: color-mix(in srgb, var(--app-control) 72%, transparent);
  gap: 10px;
  transition:
    border-color 0.18s ease,
    background 0.18s ease;
}

.payout-row:first-of-type {
  margin-top: 10px;
}

.payout-row:hover {
  border-color: color-mix(in srgb, var(--app-primary) 20%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary-soft) 18%, var(--app-card-solid));
}

.method-icon {
  display: grid;
  flex: 0 0 34px;
  height: 34px;
  place-items: center;
  border-radius: 11px;
  color: #64748b;
  background: rgba(148, 163, 184, 0.13);
  font-size: 13px;
  font-weight: 700;
}

.method-icon.type-wechat {
  color: #16a34a;
  background: rgba(34, 197, 94, 0.12);
}

.method-icon.type-alipay {
  color: #2563eb;
  background: rgba(59, 130, 246, 0.12);
}

.method-icon.type-bank_card {
  color: #7c3aed;
  background: rgba(139, 92, 246, 0.12);
}

.method-copy {
  min-width: 0;
  flex: 1;
}

.method-copy > div {
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.method-copy strong {
  color: var(--app-heading);
  font-size: 14px;
}

.method-copy p {
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--app-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.payout-method-actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--app-control) 72%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 62%, transparent),
    0 1px 3px color-mix(in srgb, var(--app-text) 6%, transparent);
  gap: 2px;
}

.payout-method-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.payout-method-action {
  --payout-action-accent: var(--app-muted);
  height: 28px;
  margin: 0 !important;
  padding: 0 8px;
  border: 0 !important;
  border-radius: 8px;
  color: color-mix(in srgb, var(--payout-action-accent) 80%, var(--app-text)) !important;
  background: transparent !important;
  font-size: 12px;
  font-weight: 600;
  box-shadow: none !important;
  transition:
    color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.payout-method-action :deep(.el-icon) {
  margin-right: 4px;
  font-size: 13px;
}

.payout-method-action:hover,
.payout-method-action:focus-visible {
  color: var(--app-heading) !important;
  background: color-mix(in srgb, var(--payout-action-accent) 12%, var(--app-card-solid)) !important;
  box-shadow: 0 2px 7px color-mix(in srgb, var(--payout-action-accent) 14%, transparent) !important;
}

.payout-method-action--confirm {
  --payout-action-accent: #16a34a;
}

.payout-method-action--copy {
  --payout-action-accent: var(--app-primary);
}

.payout-method-action--edit {
  --payout-action-accent: #94a3b8;
}

.payout-method-action--delete {
  --payout-action-accent: var(--app-danger);
}

.form-section + .form-section {
  margin-top: 14px;
  padding-top: 16px;
  border-top: 1px solid var(--app-border);
}

.form-section-title {
  display: flex;
  flex-direction: column;
  margin-bottom: 13px;
}

.form-section-title b {
  color: var(--app-heading);
  font-size: 15px;
}

.form-section-title span {
  margin-top: 3px;
  color: var(--app-muted);
  font-size: 12px;
}

.method-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 16px;
  gap: 9px;
}

.method-option {
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  color: var(--app-text);
  background: var(--app-control);
  cursor: pointer;
  text-align: left;
  transition: 0.18s ease;
  gap: 9px;
}

.method-option:hover {
  border-color: rgba(59, 130, 246, 0.38);
  transform: translateY(-1px);
}

.method-option:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.48);
  outline-offset: 2px;
}

.method-option.is-selected {
  border-color: rgba(59, 130, 246, 0.52);
  background: var(--app-primary-soft);
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.08);
}

.method-option > span {
  display: grid;
  flex: 0 0 31px;
  height: 31px;
  place-items: center;
  border-radius: 10px;
  color: var(--app-primary);
  background: rgba(59, 130, 246, 0.12);
  font-size: 13px;
  font-weight: 700;
}

.method-option div {
  min-width: 0;
}

.method-option b,
.method-option small {
  display: block;
}

.method-option b {
  color: var(--app-heading);
  font-size: 13px;
}

.method-option small {
  margin-top: 2px;
  overflow: hidden;
  color: var(--app-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wechat-tip {
  margin-bottom: 15px;
  padding: 11px 13px;
  border: 1px solid rgba(34, 197, 94, 0.18);
  border-radius: 12px;
  color: #15803d;
  background: rgba(34, 197, 94, 0.08);
  font-size: 13px;
  line-height: 1.6;
}

.selected-method-block {
  margin-top: 10px;
  padding: 13px 14px 2px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: var(--app-hover);
}

.selected-method-title {
  margin-bottom: 10px;
  color: var(--app-heading);
  font-size: 13px;
  font-weight: 700;
}

.bank-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}

.span-two {
  grid-column: 1 / -1;
}

.payout-switches {
  align-items: center;
  margin-top: 4px;
  padding: 12px 13px;
  border-radius: 12px;
  background: var(--app-hover);
  gap: 24px;
}

.payout-switches > div {
  align-items: center;
  gap: 8px;
}

.payout-switches span {
  color: var(--app-text);
  font-size: 13px;
}

.profile-form :deep(.el-form-item:last-child),
.payout-dialog-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

@media (max-width: 1100px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .registration-share-card {
    grid-template-columns: 1fr;
  }

  .registration-permission,
  .registration-link-row {
    grid-column: 1;
  }

  .registration-permission {
    justify-content: space-between;
  }

  .profile-toolbar,
  .profile-head {
    align-items: stretch;
    flex-direction: column;
  }

  .profile-toolbar :deep(.el-input) {
    max-width: none;
  }

  .toolbar-summary {
    margin-left: 0;
  }

  .profile-actions {
    align-self: flex-end;
  }

  .method-options,
  .bank-fields {
    grid-template-columns: 1fr;
  }

  .span-two {
    grid-column: 1;
  }
}

@media (max-width: 520px) {
  .registration-share-card {
    padding: 14px;
  }

  .registration-link-row {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .registration-link-row > span {
    width: 100%;
    flex-basis: 100%;
  }

  .registration-link-row :deep(.el-button) {
    flex: 1;
    margin-left: 0;
  }

  .profile-card {
    padding: 14px;
  }

  .payout-section {
    padding: 11px;
    border-radius: 14px;
  }

  .profile-stats {
    grid-template-columns: 1fr;
  }

  .profile-stats > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-right: 0;
    border-bottom: 1px solid var(--app-border);
  }

  .profile-stats > div:last-child {
    border-bottom: 0;
  }

  .payout-row {
    align-items: flex-start;
    flex-wrap: wrap;
    padding-block: 10px;
  }

  .method-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .payout-switches {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
