<script setup lang="ts">
import { Link, Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import QRCode from 'qrcode';
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

type FieldKey =
  | 'wechatNickname'
  | 'platformId'
  | 'categoryId'
  | 'productName'
  | 'orderedAt'
  | 'platformOrderNo'
  | 'inboundTrackingNo'
  | 'purchaseAddress'
  | 'fundingType'
  | 'orderAmount'
  | 'paymentDiscountAmount'
  | 'rebateScanned'
  | 'submitterSettlementAmount'
  | 'notes';

interface FieldConfig {
  schemaVersion: 1;
  fields: Record<FieldKey, { visible: boolean; editable: boolean; required: boolean }>;
  settlementAmount: {
    mode: 'FREE' | 'PRESET' | 'FIXED' | 'ADMIN_ONLY';
    fixedAmount?: number;
    options: number[];
  };
}

interface Scheme {
  id: string;
  code: string;
  name: string;
  productName: string;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
  _count: { orders: number; profitRules: number };
  shareForm: {
    id: string;
    publicToken: string;
    status: string;
    title: string;
    description: string | null;
    fieldConfig: FieldConfig;
    allowEditBeforeApproval: boolean;
    allowDeleteBeforeApproval: boolean;
    startsAt: string | null;
    expiresAt: string | null;
    submissionLimit: number | null;
    _count: { orders: number };
  } | null;
  pendingOrderCount?: number;
  approvedOrderCount?: number;
}

const fieldLabels: Record<FieldKey, string> = {
  wechatNickname: '下单人',
  platformId: '平台',
  categoryId: '品类',
  productName: '商品/方案*数量',
  orderedAt: '下单日期',
  platformOrderNo: '平台订单号',
  inboundTrackingNo: '平台运单号',
  purchaseAddress: '下单地址',
  fundingType: '支付方式',
  orderAmount: '下单金额',
  paymentDiscountAmount: '支付优惠',
  rebateScanned: '扫码返利',
  submitterSettlementAmount: '结算金额',
  notes: '备注',
};

const fieldDescriptions: Record<FieldKey, string> = {
  wechatNickname: '公开页填写微信昵称，对应订单列表“下单人”',
  platformId: '选择本次订单所属平台',
  categoryId: '下单人选择本次实际报单的品类，未填写可由管理员补充',
  productName: '下单人填写本次实际商品、方案和数量，支持多行',
  orderedAt: '订单实际下单日期',
  platformOrderNo: '平台生成的订单编号',
  inboundTrackingNo: '平台发货后的物流单号',
  purchaseAddress: '下单时填写的收货地址',
  fundingType: '自己付、代付或其他',
  orderAmount: '订单实际支付金额',
  paymentDiscountAmount: '支付优惠金额',
  rebateScanned: '公开页选择是否扫码，金额由后台核对',
  submitterSettlementAmount: '给下单人的结算金额',
  notes: '下单人补充说明',
};

type FieldMode = 'HIDDEN' | 'READ_ONLY' | 'EDITABLE';
const fieldModes: Array<{ value: FieldMode; label: string }> = [
  { value: 'HIDDEN', label: '隐藏' },
  { value: 'READ_ONLY', label: '只读' },
  { value: 'EDITABLE', label: '可填写' },
];
const fixedRequiredFields = new Set<FieldKey>(['wechatNickname', 'platformId']);

const fieldMode = (key: FieldKey): FieldMode => {
  const rule = shareForm.fieldConfig.fields[key];
  if (!rule.visible) return 'HIDDEN';
  return rule.editable ? 'EDITABLE' : 'READ_ONLY';
};

const fieldModeText = (key: FieldKey) => {
  if (fixedRequiredFields.has(key)) return '系统必填';
  const mode = fieldMode(key);
  if (mode === 'HIDDEN') return '公开页隐藏';
  if (mode === 'READ_ONLY') return '仅供查看';
  return shareForm.fieldConfig.fields[key].required ? '下单人必填' : '下单人选填';
};

const setFieldMode = (key: FieldKey, mode: FieldMode) => {
  if (fixedRequiredFields.has(key)) return;
  const rule = shareForm.fieldConfig.fields[key];
  if (mode === 'HIDDEN') {
    Object.assign(rule, { visible: false, editable: false, required: false });
  } else if (mode === 'READ_ONLY') {
    Object.assign(rule, { visible: true, editable: false, required: false });
  } else {
    Object.assign(rule, { visible: true, editable: true });
  }
};

const toggleFieldRequired = (key: FieldKey) => {
  if (fixedRequiredFields.has(key)) return;
  const rule = shareForm.fieldConfig.fields[key];
  if (!rule.visible || !rule.editable) return;
  rule.required = !rule.required;
};

const defaultFieldConfig: FieldConfig = {
  schemaVersion: 1,
  fields: {
    wechatNickname: { visible: true, editable: true, required: true },
    platformId: { visible: true, editable: true, required: true },
    categoryId: { visible: true, editable: true, required: false },
    productName: { visible: true, editable: true, required: false },
    orderedAt: { visible: true, editable: true, required: true },
    platformOrderNo: { visible: true, editable: true, required: true },
    inboundTrackingNo: { visible: true, editable: true, required: false },
    purchaseAddress: { visible: true, editable: true, required: false },
    fundingType: { visible: false, editable: false, required: false },
    orderAmount: { visible: true, editable: true, required: true },
    paymentDiscountAmount: { visible: false, editable: false, required: false },
    rebateScanned: { visible: true, editable: true, required: false },
    submitterSettlementAmount: { visible: true, editable: true, required: false },
    notes: { visible: true, editable: true, required: false },
  },
  settlementAmount: { mode: 'FREE', options: [] },
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const normalizeFieldConfig = (value: FieldConfig | null | undefined): FieldConfig => {
  const normalized = clone(defaultFieldConfig);
  const source = value as Partial<FieldConfig> | null | undefined;
  (Object.keys(normalized.fields) as FieldKey[]).forEach((key) => {
    const rule = source?.fields?.[key];
    if (rule && typeof rule.visible === 'boolean' && typeof rule.required === 'boolean') {
      normalized.fields[key] = {
        visible: rule.visible,
        editable: typeof rule.editable === 'boolean' ? rule.editable : rule.visible,
        required: rule.required,
      };
    }
  });
  if (source?.settlementAmount) {
    normalized.settlementAmount = {
      ...normalized.settlementAmount,
      ...source.settlementAmount,
      options: Array.isArray(source.settlementAmount.options)
        ? [...source.settlementAmount.options]
        : [],
    };
  }
  return normalized;
};
const loading = ref(false);
const saving = ref(false);
const items = ref<Scheme[]>([]);
const schemeDialog = ref(false);
const shareDialog = ref(false);
const qrDialog = ref(false);
const qrDataUrl = ref('');
const qrLink = ref('');
const editingSchemeId = ref<string | null>(null);
const activeSchemeId = ref('');
const amountOptionsText = ref('');
const descriptionEditor = ref<HTMLElement | null>(null);
const descriptionEditorKey = ref(0);
const descriptionEditorHtml = ref('');
const richTextColor = ref('#d92d20');
const richTextFontSize = ref('3');
const DEFAULT_SHARE_TITLE = '在线报单系统';
const richTextSizeOptions = [
  { label: '小字', value: '2' },
  { label: '正文', value: '3' },
  { label: '大字', value: '5' },
  { label: '特大', value: '6' },
] as const;
let savedRichTextRange: Range | null = null;
const router = useRouter();

const schemeForm = reactive({
  code: '',
  name: '',
  productName: '',
  description: '',
  enabled: true,
  sortOrder: 0,
  shareFormStatus: 'ACTIVE',
  shareTitle: DEFAULT_SHARE_TITLE,
});

const shareForm = reactive<{
  status: string;
  title: string;
  description: string;
  allowEditBeforeApproval: boolean;
  allowDeleteBeforeApproval: boolean;
  startsAt: string;
  expiresAt: string;
  submissionLimit: number | undefined;
  fieldConfig: FieldConfig;
}>({
  status: 'DRAFT',
  title: DEFAULT_SHARE_TITLE,
  description: '',
  allowEditBeforeApproval: true,
  allowDeleteBeforeApproval: false,
  startsAt: '',
  expiresAt: '',
  submissionLimit: undefined,
  fieldConfig: clone(defaultFieldConfig),
});

const statusLabels: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '开放登记',
  PAUSED: '暂停',
  EXPIRED: '已过期',
};
const statusTypes: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
  DRAFT: 'info',
  ACTIVE: 'success',
  PAUSED: 'warning',
  EXPIRED: 'danger',
};

const publicLink = (token: string) => `${window.location.origin}/form/${token}`;

const richTextTagPattern = /<\/?(?:p|div|br|strong|b|em|i|u|span|font)\b/i;
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
const editorHtml = (value: string) =>
  richTextTagPattern.test(value) ? value : escapeHtml(value).replace(/\r?\n/g, '<br>');

const syncDescription = () => {
  const editor = descriptionEditor.value;
  if (!editor) return;
  shareForm.description = editor.innerText.trim() ? editor.innerHTML.trim() : '';
};

const renderDescriptionEditor = async () => {
  await nextTick();
  const editor = descriptionEditor.value;
  if (editor && editor.innerHTML !== descriptionEditorHtml.value) {
    editor.innerHTML = descriptionEditorHtml.value;
  }
  savedRichTextRange = null;
};

const rememberRichTextSelection = () => {
  const editor = descriptionEditor.value;
  const selection = window.getSelection();
  if (!editor || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (editor.contains(range.commonAncestorContainer)) {
    savedRichTextRange = range.cloneRange();
  }
};

const restoreRichTextSelection = () => {
  if (!savedRichTextRange) return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(savedRichTextRange);
};

const execRichTextCommand = (command: string, value?: string) => {
  descriptionEditor.value?.focus();
  restoreRichTextSelection();
  document.execCommand(command, false, value);
  syncDescription();
  rememberRichTextSelection();
};

const applyRichTextColor = () => execRichTextCommand('foreColor', richTextColor.value);
const applyRichTextFontSize = (value: string) => {
  richTextFontSize.value = value;
  execRichTextCommand('fontSize', value);
};
const handleRichTextPaste = (event: ClipboardEvent) => {
  event.preventDefault();
  restoreRichTextSelection();
  document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
  syncDescription();
  rememberRichTextSelection();
};

const load = async (showLoading = true) => {
  if (showLoading) loading.value = true;
  try {
    const schemeResponse = await http.get<{ items: Scheme[] }>('/admin/schemes');
    items.value = schemeResponse.data.items;
  } catch (error) {
    if (showLoading) ElMessage.error(getApiErrorMessage(error, '方案列表加载失败'));
  } finally {
    if (showLoading) loading.value = false;
  }
};

let autoRefreshTimer: number | undefined;
let silentRefreshPending = false;
const refreshSilently = async () => {
  if (
    document.hidden ||
    loading.value ||
    silentRefreshPending ||
    schemeDialog.value ||
    shareDialog.value ||
    qrDialog.value
  ) {
    return;
  }
  silentRefreshPending = true;
  try {
    await load(false);
  } finally {
    silentRefreshPending = false;
  }
};
const refreshWhenVisible = () => {
  if (!document.hidden) void refreshSilently();
};

const openScheme = (item?: Scheme) => {
  editingSchemeId.value = item?.id ?? null;
  Object.assign(schemeForm, {
    code: item?.code ?? '',
    name: item?.name ?? '',
    productName: item?.productName ?? '',
    description: item?.description ?? '',
    enabled: item?.enabled ?? true,
    sortOrder: item?.sortOrder ?? 0,
    shareFormStatus: 'ACTIVE',
    shareTitle: item ? '' : DEFAULT_SHARE_TITLE,
  });
  schemeDialog.value = true;
};

const saveScheme = async () => {
  if (!schemeForm.name.trim() || !schemeForm.productName.trim()) {
    ElMessage.warning('请填写方案名称和方案内容');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      ...schemeForm,
      code: schemeForm.code || undefined,
    };
    if (editingSchemeId.value) {
      const { shareFormStatus: _status, shareTitle: _title, ...updatePayload } = payload;
      await http.patch(`/admin/schemes/${editingSchemeId.value}`, {
        ...updatePayload,
      });
    } else {
      await http.post('/admin/schemes', payload);
    }
    schemeDialog.value = false;
    ElMessage.success(editingSchemeId.value ? '方案已更新' : '方案和固定分享链接已创建');
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '方案保存失败'));
  } finally {
    saving.value = false;
  }
};

const openShare = (item: Scheme) => {
  if (!item.shareForm) return;
  activeSchemeId.value = item.id;
  Object.assign(shareForm, {
    status: item.shareForm.status,
    title: item.shareForm.title || DEFAULT_SHARE_TITLE,
    description: item.shareForm.description ?? '',
    allowEditBeforeApproval: item.shareForm.allowEditBeforeApproval,
    allowDeleteBeforeApproval: item.shareForm.allowDeleteBeforeApproval,
    startsAt: item.shareForm.startsAt ?? '',
    expiresAt: item.shareForm.expiresAt ?? '',
    submissionLimit: item.shareForm.submissionLimit ?? undefined,
    fieldConfig: normalizeFieldConfig(item.shareForm.fieldConfig),
  });
  amountOptionsText.value = shareForm.fieldConfig.settlementAmount.options.join(', ');
  descriptionEditorHtml.value = editorHtml(shareForm.description);
  descriptionEditorKey.value += 1;
  shareDialog.value = true;
};

const saveShare = async () => {
  syncDescription();
  (Object.keys(shareForm.fieldConfig.fields) as FieldKey[]).forEach((key) => {
    const rule = shareForm.fieldConfig.fields[key];
    if (!rule.visible) {
      rule.editable = false;
      rule.required = false;
    } else if (!rule.editable) {
      rule.required = false;
    }
  });
  const mode = shareForm.fieldConfig.settlementAmount.mode;
  if (mode === 'PRESET') {
    shareForm.fieldConfig.settlementAmount.options = [
      ...new Set(
        amountOptionsText.value
          .split(/[，,\s]+/)
          .map(Number)
          .filter((value) => Number.isFinite(value) && value >= 0),
      ),
    ];
    if (!shareForm.fieldConfig.settlementAmount.options.length) {
      ElMessage.warning('预设金额模式至少填写一个金额');
      return;
    }
  } else {
    shareForm.fieldConfig.settlementAmount.options = [];
  }
  if (
    mode === 'FIXED' &&
    (shareForm.fieldConfig.settlementAmount.fixedAmount === undefined ||
      shareForm.fieldConfig.settlementAmount.fixedAmount < 0)
  ) {
    ElMessage.warning('请填写固定回款金额');
    return;
  }

  saving.value = true;
  try {
    await http.patch(`/admin/schemes/${activeSchemeId.value}/share-form`, {
      ...shareForm,
      startsAt: shareForm.startsAt || null,
      expiresAt: shareForm.expiresAt || null,
      submissionLimit: shareForm.submissionLimit || null,
    });
    shareDialog.value = false;
    ElMessage.success('分享页配置已保存');
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '分享页配置保存失败'));
  } finally {
    saving.value = false;
  }
};

const openPendingOrders = (item: Scheme) => {
  if (!item.pendingOrderCount) {
    ElMessage.info('这个方案暂时没有待确认报单');
    return;
  }
  void router.push({
    path: '/admin/orders',
    query: { view: 'pending', schemeId: item.id },
  });
};

const copyLink = async (item: Scheme) => {
  if (!item.shareForm) return;
  await navigator.clipboard.writeText(publicLink(item.shareForm.publicToken));
  ElMessage.success('分享链接已复制，可直接发到微信');
};

const showQr = async (item: Scheme) => {
  if (!item.shareForm) return;
  qrLink.value = publicLink(item.shareForm.publicToken);
  qrDataUrl.value = await QRCode.toDataURL(qrLink.value, {
    width: 320,
    margin: 2,
    color: { dark: '#101828', light: '#ffffff' },
  });
  qrDialog.value = true;
};

const copyQrLink = async () => {
  await navigator.clipboard.writeText(qrLink.value);
  ElMessage.success('链接已复制');
};

const regenerate = async (item: Scheme) => {
  try {
    await ElMessageBox.confirm('重新生成后，旧分享链接和旧二维码会立即失效。', '重新生成链接', {
      type: 'warning',
    });
    await http.post(`/admin/schemes/${item.id}/share-form/regenerate-token`);
    ElMessage.success('已生成新链接');
    await load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '重新生成失败'));
  }
};

const removeScheme = async (item: Scheme) => {
  try {
    await ElMessageBox.confirm(`确定删除方案“${item.name}”吗？`, '删除方案', {
      type: 'warning',
    });
    await http.delete(`/admin/schemes/${item.id}`);
    ElMessage.success('方案已删除');
    await load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '删除失败'));
  }
};

onMounted(() => {
  void load();
  window.addEventListener('focus', refreshWhenVisible);
  document.addEventListener('visibilitychange', refreshWhenVisible);
  autoRefreshTimer = window.setInterval(() => void refreshSilently(), 15_000);
});

onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshWhenVisible);
  document.removeEventListener('visibilitychange', refreshWhenVisible);
  if (autoRefreshTimer !== undefined) window.clearInterval(autoRefreshTimer);
});
</script>

<template>
  <div class="page-shell">
    <div class="page-heading">
      <div>
        <h1>在线报单</h1>
        <p>每个方案一个固定链接和二维码；提交后先进入待确认，管理员确认后才进入正式订单。</p>
      </div>
      <div class="heading-actions">
        <el-button :icon="Refresh" :loading="loading" @click="load()">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openScheme()">新建方案</el-button>
      </div>
    </div>

    <section class="surface-card scheme-intro">
      <el-icon class="scheme-intro-icon" size="26"><Link /></el-icon>
      <div>
        <strong>每方案独立分享</strong>
        <p>
          字段显示、下单人填写权限、必填、回款金额选项、确认前修改/删除、有效期和提交上限均可单独设置。
        </p>
      </div>
    </section>

    <section v-loading="loading" class="surface-card scheme-list">
      <div class="list-head">
        <strong>方案列表</strong><span>共 {{ items.length }} 个方案</span>
      </div>
      <el-empty v-if="!items.length" description="还没有创建下单方案" :image-size="86"
        ><el-button type="primary" :icon="Plus" @click="openScheme()"
          >创建第一个方案</el-button
        ></el-empty
      >
      <template v-else>
        <el-table class="scheme-table" :data="items" stripe>
          <el-table-column label="方案" min-width="250">
            <template #default="{ row }"
              ><div class="scheme-name">
                <strong>{{ row.name }}</strong
                ><span>{{ row.productName }} · {{ row.code }}</span>
              </div></template
            >
          </el-table-column>
          <el-table-column label="方案状态" width="100"
            ><template #default="{ row }"
              ><el-tag :type="row.enabled ? 'success' : 'info'">{{
                row.enabled ? '启用' : '停用'
              }}</el-tag></template
            ></el-table-column
          >
          <el-table-column label="分享状态" width="120"
            ><template #default="{ row }"
              ><el-tag v-if="row.shareForm" :type="statusTypes[row.shareForm.status]">{{
                statusLabels[row.shareForm.status]
              }}</el-tag></template
            ></el-table-column
          >
          <el-table-column label="待确认 / 已入库" width="132">
            <template #default="{ row }">
              <span class="count-cell">
                <strong>{{ row.pendingOrderCount ?? 0 }}</strong>
                <span>/ {{ row.approvedOrderCount ?? 0 }}</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="分享操作" min-width="260">
            <template #default="{ row }"
              ><el-button size="small" type="primary" plain @click="copyLink(row)"
                >复制链接</el-button
              ><el-button size="small" @click="showQr(row)">二维码</el-button
              ><el-button size="small" @click="openShare(row)">配置表单</el-button
              ><el-button
                v-if="row.pendingOrderCount"
                size="small"
                type="warning"
                plain
                @click="openPendingOrders(row)"
                >待确认 {{ row.pendingOrderCount }}</el-button
              ></template
            >
          </el-table-column>
          <el-table-column label="管理" width="210" align="center">
            <template #default="{ row }">
              <div class="scheme-manage-actions">
                <el-button
                  size="small"
                  text
                  class="scheme-manage-action scheme-manage-action--edit"
                  @click="openScheme(row)"
                >
                  <span class="scheme-manage-action-dot" />编辑
                </el-button>
                <el-button
                  size="small"
                  text
                  class="scheme-manage-action scheme-manage-action--link"
                  @click="regenerate(row)"
                >
                  <span class="scheme-manage-action-dot" />换链接
                </el-button>
                <el-button
                  size="small"
                  text
                  class="scheme-manage-action scheme-manage-action--delete"
                  @click="removeScheme(row)"
                >
                  <span class="scheme-manage-action-dot" />删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div class="scheme-mobile-list">
          <article v-for="row in items" :key="row.id" class="scheme-mobile-card">
            <header>
              <div class="scheme-name">
                <strong>{{ row.name }}</strong>
                <span>{{ row.productName }}</span>
                <small>{{ row.code }}</small>
              </div>
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
                {{ row.enabled ? '启用' : '停用' }}
              </el-tag>
            </header>

            <div class="scheme-mobile-stats">
              <div>
                <span>分享状态</span>
                <el-tag v-if="row.shareForm" :type="statusTypes[row.shareForm.status]" size="small">
                  {{ statusLabels[row.shareForm.status] }}
                </el-tag>
                <small v-else>未创建</small>
              </div>
              <button
                type="button"
                class="scheme-count-button"
                :disabled="!row.pendingOrderCount"
                @click="openPendingOrders(row)"
              >
                <span>待确认</span>
                <strong>{{ row.pendingOrderCount ?? 0 }}</strong>
              </button>
              <div>
                <span>已入库</span>
                <strong>{{ row.approvedOrderCount ?? 0 }}</strong>
              </div>
            </div>

            <div class="scheme-mobile-action-group">
              <strong>分享操作</strong>
              <div>
                <el-button
                  size="small"
                  type="primary"
                  plain
                  :disabled="!row.shareForm"
                  @click="copyLink(row)"
                >
                  复制链接
                </el-button>
                <el-button size="small" :disabled="!row.shareForm" @click="showQr(row)">
                  二维码
                </el-button>
                <el-button size="small" :disabled="!row.shareForm" @click="openShare(row)">
                  配置表单
                </el-button>
                <el-button
                  v-if="row.pendingOrderCount"
                  size="small"
                  type="warning"
                  plain
                  @click="openPendingOrders(row)"
                >
                  待确认 {{ row.pendingOrderCount }}
                </el-button>
              </div>
            </div>

            <footer class="scheme-mobile-management">
              <el-button
                size="small"
                text
                class="scheme-manage-action scheme-manage-action--edit"
                @click="openScheme(row)"
              >
                <span class="scheme-manage-action-dot" />编辑
              </el-button>
              <el-button
                size="small"
                text
                class="scheme-manage-action scheme-manage-action--link"
                :disabled="!row.shareForm"
                @click="regenerate(row)"
              >
                <span class="scheme-manage-action-dot" />换链接
              </el-button>
              <el-button
                size="small"
                text
                class="scheme-manage-action scheme-manage-action--delete"
                @click="removeScheme(row)"
              >
                <span class="scheme-manage-action-dot" />删除
              </el-button>
            </footer>
          </article>
        </div>
      </template>
    </section>

    <el-dialog
      v-model="schemeDialog"
      :title="editingSchemeId ? '编辑方案' : '新建下单方案'"
      width="min(650px, 95vw)"
    >
      <el-form :model="schemeForm" label-position="top" class="dialog-grid">
        <el-form-item label="方案名称" required
          ><el-input v-model="schemeForm.name" placeholder="例如：iPhone 16 方案 A"
        /></el-form-item>
        <el-form-item label="方案编码"
          ><el-input
            v-model="schemeForm.code"
            :disabled="Boolean(editingSchemeId)"
            placeholder="留空自动生成"
        /></el-form-item>
        <el-form-item label="方案内容" required class="span-two">
          <el-input
            v-model="schemeForm.productName"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="填写商品、数量及本方案内容，支持多行"
          />
        </el-form-item>
        <el-form-item label="排序"
          ><el-input-number v-model="schemeForm.sortOrder" :precision="0" :controls="false"
        /></el-form-item>
        <el-form-item label="方案启用"><el-switch v-model="schemeForm.enabled" /></el-form-item>
        <template v-if="!editingSchemeId"
          ><el-form-item label="分享链接初始状态"
            ><el-select v-model="schemeForm.shareFormStatus"
              ><el-option label="立即开放" value="ACTIVE" /><el-option
                label="先保存草稿"
                value="DRAFT" /></el-select></el-form-item
          ><el-form-item label="分享页标题"
            ><el-input
              v-model="schemeForm.shareTitle"
              placeholder="默认：在线报单系统" /></el-form-item
        ></template>
        <el-form-item label="方案说明" class="span-two"
          ><el-input v-model="schemeForm.description" type="textarea" :rows="3"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="schemeDialog = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveScheme">保存</el-button></template
      >
    </el-dialog>

    <el-dialog
      v-model="shareDialog"
      class="share-config-dialog"
      width="min(920px, 96vw)"
      top="4vh"
      @opened="renderDescriptionEditor"
    >
      <template #header>
        <div class="share-dialog-heading">
          <span class="share-dialog-mark">报</span>
          <div class="share-dialog-copy">
            <strong>配置在线报单</strong>
            <small>设置公开链接、填写说明和订单字段权限</small>
          </div>
          <el-tag :type="statusTypes[shareForm.status]" effect="light" round>
            {{ statusLabels[shareForm.status] }}
          </el-tag>
        </div>
      </template>
      <el-form :model="shareForm" label-position="top" class="share-config-form">
        <section class="share-config-card basic-config-card">
          <div class="share-section-heading">
            <span class="share-section-step">01</span>
            <div>
              <strong>链接基础配置</strong>
              <small>控制公开状态、显示标题、有效时间和审核前权限</small>
            </div>
          </div>
          <div class="dialog-grid">
            <el-form-item label="链接状态"
              ><el-select v-model="shareForm.status"
                ><el-option
                  v-for="(label, value) in statusLabels"
                  :key="value"
                  :label="label"
                  :value="value" /></el-select
            ></el-form-item>
            <el-form-item label="标题"
              ><el-input v-model="shareForm.title" placeholder="在线报单系统"
            /></el-form-item>
            <el-form-item label="开始时间"
              ><el-date-picker
                v-model="shareForm.startsAt"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ssZ"
                clearable
            /></el-form-item>
            <el-form-item label="结束时间"
              ><el-date-picker
                v-model="shareForm.expiresAt"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ssZ"
                clearable
            /></el-form-item>
            <el-form-item label="提交上限"
              ><el-input-number
                v-model="shareForm.submissionLimit"
                :min="1"
                :precision="0"
                :controls="false"
                placeholder="不限制"
            /></el-form-item>
            <el-form-item label="审核前权限" class="permission-form-item">
              <div class="switch-stack">
                <div class="permission-option">
                  <div>
                    <strong>允许修改</strong>
                    <small>管理员确认前可以调整已提交内容</small>
                  </div>
                  <el-switch v-model="shareForm.allowEditBeforeApproval" />
                </div>
                <div class="permission-option">
                  <div>
                    <strong>允许删除</strong>
                    <small>管理员确认前可以删除本人报单</small>
                  </div>
                  <el-switch v-model="shareForm.allowDeleteBeforeApproval" />
                </div>
              </div>
            </el-form-item>
          </div>
        </section>

        <section class="share-config-card description-config-card">
          <div class="share-section-heading">
            <span class="share-section-step is-description">02</span>
            <div>
              <strong>报单注释 / 填写说明</strong>
              <small>支持加粗、字号和文字颜色，公开报单页按保存格式显示</small>
            </div>
          </div>
          <el-form-item class="description-form-item">
            <div class="rich-text-field">
              <div class="rich-text-toolbar" @mousedown.capture="rememberRichTextSelection">
                <button
                  type="button"
                  class="rich-tool-button is-bold"
                  title="加粗"
                  @mousedown.prevent
                  @click="execRichTextCommand('bold')"
                >
                  B
                </button>
                <button
                  type="button"
                  class="rich-tool-button is-italic"
                  title="斜体"
                  @mousedown.prevent
                  @click="execRichTextCommand('italic')"
                >
                  I
                </button>
                <button
                  type="button"
                  class="rich-tool-button is-underline"
                  title="下划线"
                  @mousedown.prevent
                  @click="execRichTextCommand('underline')"
                >
                  U
                </button>
                <div class="rich-size-buttons" aria-label="字号">
                  <button
                    v-for="option in richTextSizeOptions"
                    :key="option.value"
                    type="button"
                    class="rich-tool-button rich-size-button"
                    :class="{ 'is-active': richTextFontSize === option.value }"
                    :title="`设置为${option.label}`"
                    @mousedown.prevent
                    @click="applyRichTextFontSize(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
                <label class="rich-color-control" title="文字颜色">
                  <span>颜色</span>
                  <input v-model="richTextColor" type="color" @input="applyRichTextColor" />
                </label>
                <button
                  type="button"
                  class="rich-tool-button rich-clear-button"
                  @mousedown.prevent
                  @click="execRichTextCommand('removeFormat')"
                >
                  清除格式
                </button>
              </div>
              <div
                :key="descriptionEditorKey"
                ref="descriptionEditor"
                class="rich-text-editor"
                contenteditable="true"
                data-placeholder="例如：请核对订单号、金额；提交后先等待管理员确认。"
                v-html="descriptionEditorHtml"
                @input="syncDescription"
                @keyup="rememberRichTextSelection"
                @mouseup="rememberRichTextSelection"
                @focus="rememberRichTextSelection"
                @paste="handleRichTextPaste"
              ></div>
            </div>
          </el-form-item>
        </section>

        <div class="config-title">
          <strong>订单列表分类与填写权限</strong
          ><span>分类标题与订单列表保持一致；每张卡片可设置隐藏、只读、可填写和是否必填。</span>
        </div>
        <div class="field-grid">
          <section
            v-for="(label, key) in fieldLabels"
            :key="key"
            class="card-choice field-permission-card"
            :class="{ 'is-selected': shareForm.fieldConfig.fields[key].visible }"
          >
            <div class="field-card-heading">
              <span class="field-card-copy">
                <strong>{{ label }}</strong>
                <small>{{ fieldDescriptions[key] }}</small>
              </span>
              <span class="field-mode-badge">{{ fieldModeText(key) }}</span>
            </div>
            <div class="field-mode-options" role="radiogroup" :aria-label="`${label}公开权限`">
              <button
                v-for="mode in fieldModes"
                :key="mode.value"
                type="button"
                class="field-mode-choice"
                :class="{ 'is-selected': fieldMode(key) === mode.value }"
                :disabled="fixedRequiredFields.has(key) && mode.value !== 'EDITABLE'"
                :aria-checked="fieldMode(key) === mode.value"
                role="radio"
                @click="setFieldMode(key, mode.value)"
              >
                {{ mode.label }}
              </button>
            </div>
            <button
              type="button"
              class="field-required-toggle"
              :class="{ 'is-selected': shareForm.fieldConfig.fields[key].required }"
              :disabled="
                fixedRequiredFields.has(key) ||
                !shareForm.fieldConfig.fields[key].visible ||
                !shareForm.fieldConfig.fields[key].editable
              "
              @click="toggleFieldRequired(key)"
            >
              {{ shareForm.fieldConfig.fields[key].required ? '必填' : '选填' }}
            </button>
          </section>
        </div>

        <div class="config-title">
          <strong>结算金额填写方式</strong><span>下单人填写后仍需管理员确认。</span>
        </div>
        <div class="amount-config">
          <el-radio-group v-model="shareForm.fieldConfig.settlementAmount.mode"
            ><el-radio-button value="FREE">自由填写</el-radio-button
            ><el-radio-button value="PRESET">预设选项</el-radio-button
            ><el-radio-button value="FIXED">固定金额</el-radio-button
            ><el-radio-button value="ADMIN_ONLY">仅后台填写</el-radio-button></el-radio-group
          >
          <el-input
            v-if="shareForm.fieldConfig.settlementAmount.mode === 'PRESET'"
            v-model="amountOptionsText"
            placeholder="例如：100, 120, 150"
          />
          <el-input-number
            v-if="shareForm.fieldConfig.settlementAmount.mode === 'FIXED'"
            v-model="shareForm.fieldConfig.settlementAmount.fixedAmount"
            :min="0"
            :precision="2"
            :controls="false"
          />
        </div>
      </el-form>
      <template #footer
        ><el-button @click="shareDialog = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveShare"
          >保存配置</el-button
        ></template
      >
    </el-dialog>

    <el-dialog v-model="qrDialog" title="微信扫码填写" width="min(420px, 94vw)" center>
      <div class="qr-content">
        <img :src="qrDataUrl" alt="方案分享二维码" />
        <p>微信扫一扫后填写订单</p>
        <small>{{ qrLink }}</small>
        <el-button type="primary" plain @click="copyQrLink">复制链接</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.heading-actions,
.scheme-intro,
.switch-stack,
.amount-config,
.qr-content {
  display: flex;
}
.heading-actions {
  gap: 8px;
}
.scheme-intro {
  align-items: center;
  padding: 18px;
  gap: 14px;
}
.scheme-intro-icon {
  color: var(--app-primary);
}
.scheme-intro strong,
.list-head strong {
  color: var(--app-heading);
}
.scheme-intro p {
  margin: 4px 0 0;
  color: var(--app-muted);
  font-size: 14px;
}
.scheme-list {
  min-height: 430px;
  padding: 18px;
}
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--app-border);
}
.list-head span,
.scheme-name span,
.config-title span {
  color: var(--app-muted);
  font-size: 13px;
}
.scheme-name {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.scheme-name strong {
  color: var(--app-heading);
}
.scheme-name span {
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.scheme-table :deep(.el-table__inner-wrapper::before) {
  background: var(--app-border);
}
.scheme-mobile-list {
  display: none;
}
.scheme-manage-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--app-border) 76%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--app-control) 68%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 64%, transparent),
    var(--app-shadow-sm);
  gap: 2px;
}
.scheme-manage-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.scheme-manage-action {
  --scheme-action-accent: var(--app-muted);
  height: 28px;
  margin: 0 !important;
  padding: 0 8px;
  border: 0 !important;
  border-radius: 8px;
  color: color-mix(in srgb, var(--scheme-action-accent) 78%, var(--app-text)) !important;
  background: transparent !important;
  font-size: 13px;
  font-weight: 600;
  box-shadow: none !important;
  transition:
    color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}
.scheme-manage-action:hover,
.scheme-manage-action:focus {
  color: var(--app-heading) !important;
  background: color-mix(in srgb, var(--scheme-action-accent) 12%, var(--app-card-solid)) !important;
  box-shadow: 0 2px 7px color-mix(in srgb, var(--scheme-action-accent) 14%, transparent) !important;
}
.scheme-manage-action--edit {
  --scheme-action-accent: #94a3b8;
}
.scheme-manage-action--link {
  --scheme-action-accent: var(--app-primary);
}
.scheme-manage-action--delete {
  --scheme-action-accent: var(--app-danger);
}
.scheme-manage-action-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 5px;
  border-radius: 50%;
  background: var(--scheme-action-accent);
  vertical-align: 1px;
}
.dialog-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}
.dialog-grid :deep(.el-select),
.dialog-grid :deep(.el-date-editor),
.dialog-grid :deep(.el-input-number) {
  width: 100%;
}
.span-two {
  grid-column: 1 / -1;
}
.share-config-form {
  display: grid;
  gap: 14px;
}
.share-config-card {
  padding: 16px;
  border: 1px solid var(--app-border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-control) 52%, var(--app-card-solid));
  box-shadow: var(--app-shadow-sm);
}
.share-section-heading {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
  gap: 10px;
}
.share-section-step {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 11px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
  font-size: 12px;
  font-weight: 800;
}
.share-section-step.is-description {
  color: var(--app-purple);
  background: color-mix(in srgb, var(--app-purple) 13%, transparent);
}
.share-section-heading > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.share-section-heading strong {
  color: var(--app-heading);
  font-size: 15px;
}
.share-section-heading small {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 11.5px;
}
.share-config-card :deep(.el-form-item) {
  margin-bottom: 14px;
}
.share-config-card :deep(.el-form-item__label) {
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 600;
}
.share-config-card :deep(.el-input__wrapper),
.share-config-card :deep(.el-select__wrapper) {
  min-height: 38px;
  border-radius: 11px;
  background: var(--app-card-solid);
  box-shadow: 0 0 0 1px var(--app-border) inset;
}
.share-config-card :deep(.el-input__wrapper.is-focus),
.share-config-card :deep(.el-select__wrapper.is-focused) {
  box-shadow:
    0 0 0 1px var(--app-primary) inset,
    0 0 0 3px var(--app-primary-soft);
}
.description-form-item {
  margin-bottom: 0 !important;
}
.rich-text-field {
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 15px;
  background: var(--app-card-solid);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--app-heading) 5%, transparent);
}
.rich-text-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-height: 42px;
  padding: 5px 7px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-hover);
  gap: 5px;
}
.rich-tool-button {
  min-width: 30px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  color: var(--app-text);
  background: var(--app-card-solid);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.rich-tool-button:hover {
  border-color: color-mix(in srgb, var(--app-primary) 42%, var(--app-border));
  color: var(--app-primary);
}
.rich-tool-button.is-bold {
  font-weight: 800;
}
.rich-tool-button.is-italic {
  font-style: italic;
}
.rich-tool-button.is-underline {
  text-decoration: underline;
}
.rich-clear-button {
  min-width: 74px;
}
.rich-size-buttons {
  display: inline-flex;
  gap: 4px;
}
.rich-size-button {
  min-width: 38px;
  padding: 0 6px;
}
.rich-size-button.is-active {
  border-color: color-mix(in srgb, var(--app-primary) 52%, var(--app-border));
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary) 10%, var(--app-card-solid));
}
.rich-color-control {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 7px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  color: var(--app-muted);
  background: var(--app-card-solid);
  cursor: pointer;
  font-size: 11px;
  gap: 5px;
}
.rich-color-control input {
  width: 19px;
  height: 19px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.rich-text-editor {
  min-height: 82px;
  max-height: 180px;
  overflow-y: auto;
  padding: 10px 12px;
  color: var(--app-text);
  outline: none;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
}
.rich-text-editor:empty::before {
  color: var(--app-muted);
  content: attr(data-placeholder);
  pointer-events: none;
}
.switch-stack {
  width: 100%;
  flex-direction: column;
  gap: 7px;
}
.permission-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 7px 10px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-card-solid);
  gap: 12px;
}
.permission-option > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.permission-option strong {
  color: var(--app-heading);
  font-size: 12.5px;
}
.permission-option small {
  margin-top: 1px;
  color: var(--app-muted);
  font-size: 10.5px;
}
.config-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 12px 0 10px;
  padding-top: 12px;
  border-top: 1px solid var(--app-border);
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.field-permission-card {
  display: block;
  min-height: 112px;
  padding: 10px;
  cursor: default;
}
.field-card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.field-card-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.field-card-copy strong {
  color: var(--app-heading);
  font-size: 13.5px;
}
.field-card-copy small {
  display: -webkit-box;
  margin-top: 2px;
  overflow: hidden;
  color: var(--app-muted);
  font-size: 10.5px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.field-mode-badge {
  flex: 0 0 auto;
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
  font-size: 10px;
  white-space: nowrap;
}
.field-mode-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 9px;
  padding: 3px;
  border: 1px solid var(--app-border);
  border-radius: 11px;
  background: var(--app-hover);
  gap: 3px;
}
.field-mode-choice,
.field-required-toggle {
  appearance: none;
  border: 1px solid transparent;
  color: var(--app-muted);
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.field-mode-choice {
  min-height: 28px;
  border-radius: 8px;
  font-size: 11px;
}
.field-mode-choice.is-selected {
  border-color: color-mix(in srgb, var(--app-primary) 36%, var(--app-border));
  color: var(--app-primary);
  background: var(--app-card-solid);
  box-shadow: var(--app-shadow-sm);
}
.field-mode-choice:disabled,
.field-required-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}
.field-required-toggle {
  margin-top: 7px;
  padding: 3px 9px;
  border-color: var(--app-border);
  border-radius: 999px;
  font-size: 10.5px;
}
.field-required-toggle.is-selected {
  border-color: color-mix(in srgb, var(--app-danger) 38%, var(--app-border));
  color: var(--app-danger);
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
}
.count-cell {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  white-space: nowrap;
}
.count-cell strong {
  color: var(--app-warning);
}
.count-cell span {
  color: var(--app-muted);
}
.amount-config {
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.amount-config :deep(.el-input) {
  max-width: 320px;
}
.qr-content {
  align-items: center;
  flex-direction: column;
  gap: 10px;
  text-align: center;
}
.qr-content img {
  width: min(320px, 80vw);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-card-solid);
}
.qr-content p {
  margin: 0;
  color: var(--app-heading);
  font-weight: 600;
}
.qr-content small {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--app-muted);
}
:global(.share-config-dialog.el-dialog) {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-card-solid) 94%, transparent);
  box-shadow: 0 28px 80px color-mix(in srgb, var(--app-heading) 18%, transparent);
  backdrop-filter: blur(22px);
}
:global(.share-config-dialog .el-dialog__header) {
  padding: 17px 20px 15px;
  border-bottom: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-primary-soft) 28%, var(--app-card-solid));
}
:global(.share-config-dialog .el-dialog__headerbtn) {
  top: 16px;
  right: 17px;
  width: 34px;
  height: 34px;
  border-radius: 11px;
}
:global(.share-config-dialog .el-dialog__headerbtn:hover) {
  background: var(--app-hover);
}
:global(.share-config-dialog .el-dialog__body) {
  max-height: calc(92vh - 148px);
  overflow-y: auto;
  padding: 16px 18px 20px;
}
:global(.share-config-dialog .el-dialog__footer) {
  padding: 12px 18px 16px;
  border-top: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-control) 55%, var(--app-card-solid));
}
:global(.share-config-dialog .el-dialog__footer .el-button) {
  min-width: 92px;
  min-height: 38px;
  border-radius: 11px;
}
:global(.share-config-dialog .el-dialog__footer .el-button--primary) {
  border: 0;
  background: linear-gradient(135deg, #60a5fa, #2563eb);
  box-shadow: 0 9px 22px rgba(37, 99, 235, 0.2);
}
.share-dialog-heading {
  display: flex;
  align-items: center;
  padding-right: 42px;
  gap: 11px;
}
.share-dialog-mark {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  border-radius: 13px;
  color: #fff;
  background: linear-gradient(145deg, #60a5fa, #2563eb);
  box-shadow: 0 9px 20px rgba(37, 99, 235, 0.2);
  font-size: 14px;
  font-weight: 800;
}
.share-dialog-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.share-dialog-copy strong {
  color: var(--app-heading);
  font-size: 17px;
}
.share-dialog-copy small {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 11.5px;
}
@media (max-width: 700px) {
  .heading-actions {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .heading-actions :deep(.el-button) {
    width: 100%;
    min-width: 0;
    margin-left: 0;
  }
  .scheme-intro {
    align-items: flex-start;
    padding: 14px;
  }
  .scheme-intro p {
    font-size: 12.5px;
    line-height: 1.55;
  }
  .scheme-list {
    min-height: 260px;
    padding: 12px;
  }
  .scheme-table {
    display: none;
  }
  .scheme-mobile-list {
    display: flex;
    flex-direction: column;
    padding-top: 11px;
    gap: 10px;
  }
  .scheme-mobile-card {
    overflow: hidden;
    border: 1px solid var(--app-border);
    border-radius: 16px;
    background: color-mix(in srgb, var(--app-card-solid) 94%, transparent);
    box-shadow: var(--app-shadow-sm);
  }
  .scheme-mobile-card > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 12px;
    gap: 10px;
  }
  .scheme-mobile-card .scheme-name {
    min-width: 0;
  }
  .scheme-mobile-card .scheme-name strong {
    font-size: 14px;
  }
  .scheme-mobile-card .scheme-name span {
    margin-top: 2px;
    color: var(--app-text);
    font-size: 12.5px;
    line-height: 1.5;
  }
  .scheme-mobile-card .scheme-name small {
    color: var(--app-muted);
    font-size: 10.5px;
    overflow-wrap: anywhere;
  }
  .scheme-mobile-stats {
    display: grid;
    padding: 9px 12px;
    border-top: 1px solid var(--app-border);
    border-bottom: 1px solid var(--app-border);
    background: color-mix(in srgb, var(--app-control) 52%, transparent);
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }
  .scheme-mobile-stats > div,
  .scheme-count-button {
    display: flex;
    min-width: 0;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    border: 0;
    border-radius: 10px;
    color: var(--app-text);
    background: transparent;
    font: inherit;
    gap: 3px;
  }
  .scheme-mobile-stats span {
    color: var(--app-muted);
    font-size: 10px;
  }
  .scheme-mobile-stats strong {
    color: var(--app-heading);
    font-size: 14px;
  }
  .scheme-mobile-stats small {
    color: var(--app-muted);
    font-size: 11px;
  }
  .scheme-count-button:not(:disabled) {
    color: var(--app-warning);
    background: color-mix(in srgb, var(--app-warning) 8%, transparent);
    cursor: pointer;
  }
  .scheme-count-button:not(:disabled) strong {
    color: var(--app-warning);
  }
  .scheme-count-button:disabled {
    opacity: 0.8;
  }
  .scheme-mobile-action-group {
    padding: 11px 12px;
  }
  .scheme-mobile-action-group > strong {
    display: block;
    margin-bottom: 7px;
    color: var(--app-muted);
    font-size: 10.5px;
  }
  .scheme-mobile-action-group > div {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }
  .scheme-mobile-action-group :deep(.el-button) {
    width: 100%;
    min-width: 0;
    margin-left: 0;
    border-radius: 10px;
  }
  .scheme-mobile-management {
    display: grid;
    padding: 7px 9px;
    border-top: 1px solid var(--app-border);
    background: color-mix(in srgb, var(--app-control) 45%, transparent);
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }
  .scheme-mobile-management :deep(.el-button) {
    width: 100%;
    min-width: 0;
    margin-left: 0 !important;
  }
  .dialog-grid,
  .field-grid {
    grid-template-columns: 1fr;
  }
  .span-two {
    grid-column: 1;
  }
  .share-config-card {
    padding: 13px;
    border-radius: 16px;
  }
  .share-dialog-copy small,
  .share-dialog-heading :deep(.el-tag) {
    display: none;
  }
  :global(.share-config-dialog .el-dialog__body) {
    padding: 12px;
  }
}

@media (max-width: 360px) {
  .scheme-intro {
    gap: 10px;
  }
  .scheme-mobile-action-group,
  .scheme-mobile-card > header,
  .scheme-mobile-stats {
    padding-inline: 10px;
  }
}
</style>
