<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getApiErrorMessage } from '../lib/api-error';
import { formatBusinessDate } from '../lib/business-date';
import { http } from '../lib/http';
import { useSystemStore } from '../stores/system';

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

const system = useSystemStore();

interface FieldConfig {
  fields: Record<FieldKey, { visible: boolean; editable: boolean; required: boolean }>;
  settlementAmount: {
    mode: 'FREE' | 'PRESET' | 'FIXED' | 'ADMIN_ONLY';
    fixedAmount?: number;
    options: number[];
  };
}

interface BootstrapData {
  identity: {
    displayCode: string;
    submitter: {
      id: string;
      name: string;
      nickname: string | null;
      payoutMethods: Array<{
        id: string;
        type: string;
        label: string;
        accountName: string | null;
        accountMasked: string | null;
        bankName: string | null;
        isDefault: boolean;
        status: string;
      }>;
    } | null;
  };
  form: {
    id: string;
    title: string;
    description: string | null;
    fieldConfig: FieldConfig;
    allowEditBeforeApproval: boolean;
    allowDeleteBeforeApproval: boolean;
    scheme: {
      name: string;
      productName: string;
      description: string | null;
      defaultValues: Record<string, unknown> | null;
    };
  };
  options: {
    platforms: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string }>;
  };
}

interface MyOrder {
  id: string;
  serialNo: number;
  reviewStatus: string;
  orderedAt: string;
  productName: string;
  category: { id: string; name: string } | null;
  wechatNickname: string | null;
  platform: { id: string; name: string };
  submitter: { id: string; name: string; nickname: string | null };
  platformOrderNo: string | null;
  inboundTrackingNo: string | null;
  purchaseAddress: string | null;
  fundingType: 'SELF_PAID' | 'SUBMITTER_ADVANCED' | 'OTHER';
  orderAmount: string | number;
  paymentDiscountAmount: string | number;
  rebateScanned: boolean | null;
  submitterSettlementAmount: string | number;
  submitterSettlementStatus: string;
  notes: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

const route = useRoute();
const token = computed(() => String(route.params.token));
const loading = ref(true);
const submitting = ref(false);
const loadError = ref('');
const data = ref<BootstrapData | null>(null);
const myOrders = ref<MyOrder[]>([]);
const editingId = ref<string | null>(null);
const identityDialog = ref(false);
const identityLinking = ref(false);
const identityCodeInput = ref('');
const payoutDialog = ref(false);
const payoutSaving = ref(false);
const payoutForm = reactive({
  type: 'WECHAT',
  label: '常用收款方式',
  accountName: '',
  accountValue: '',
  bankName: '',
  isDefault: true,
});

const formatLocalDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const form = reactive({
  wechatNickname: '',
  platformId: '',
  categoryId: '',
  productName: '',
  orderedAt: formatLocalDate(),
  platformOrderNo: '',
  inboundTrackingNo: '',
  purchaseAddress: '',
  fundingType: 'SUBMITTER_ADVANCED' as 'SELF_PAID' | 'SUBMITTER_ADVANCED' | 'OTHER',
  orderAmount: undefined as number | undefined,
  paymentDiscountAmount: 0 as number | undefined,
  rebateScanned: undefined as boolean | undefined,
  submitterSettlementAmount: undefined as number | undefined,
  notes: '',
});

const fieldConfig = computed(() => data.value?.form.fieldConfig);
const hasConfirmedPayoutMethod = computed(
  () =>
    data.value?.identity.submitter?.payoutMethods.some((method) => method.status === 'ACTIVE') ??
    false,
);
const field = (key: FieldKey) =>
  fieldConfig.value?.fields[key] ?? { visible: false, editable: false, required: false };
const canEditField = (key: FieldKey) => field(key).editable;
const fundingTypeOptions = [
  { value: 'SELF_PAID' as const, label: '自己付', hint: '我直接支付' },
  { value: 'SUBMITTER_ADVANCED' as const, label: '代付', hint: '后续统一结算' },
  { value: 'OTHER' as const, label: '其他', hint: '由管理员补充说明' },
];
const selectFundingType = (value: (typeof fundingTypeOptions)[number]['value']) => {
  if (!canEditField('fundingType')) return;
  form.fundingType = value;
};
const selectRebateScanned = (value: boolean) => {
  if (!canEditField('rebateScanned')) return;
  form.rebateScanned = value;
};
const statusLabels: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '待确认',
  APPROVED: '管理员已确认',
  REJECTED: '已驳回',
};
const statusTypes: Record<string, 'warning' | 'success' | 'danger' | 'info'> = {
  DRAFT: 'info',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};
const payoutLabels: Record<string, string> = {
  UNPAID: '未结算',
  PARTIAL: '未结算',
  PAID: '已结算',
  EXCEPTION: '结算异常',
};
const payoutTypeLabels: Record<string, string> = {
  WECHAT: '微信',
  ALIPAY: '支付宝',
  BANK_CARD: '银行卡',
  DIGITAL_CNY: '数字人民币',
  CASH: '现金',
  OTHER: '其他',
};

const applyDefaults = () => {
  const defaults = data.value?.form.scheme.defaultValues ?? {};
  form.platformId = String(defaults.platformId ?? data.value?.options.platforms[0]?.id ?? '');
  form.categoryId = '';
  form.productName = '';
  form.fundingType =
    (defaults.fundingType as typeof form.fundingType | undefined) ?? 'SUBMITTER_ADVANCED';
  form.orderAmount = defaults.orderAmount === undefined ? undefined : Number(defaults.orderAmount);
  form.paymentDiscountAmount = Number(defaults.paymentDiscountAmount ?? 0);
  form.wechatNickname = data.value?.identity.submitter?.nickname ?? '';
  const settlement = data.value?.form.fieldConfig.settlementAmount;
  form.submitterSettlementAmount =
    settlement?.mode === 'FIXED'
      ? settlement.fixedAmount
      : settlement?.mode === 'PRESET' && settlement.options.length === 1
        ? settlement.options[0]
        : undefined;
};

const clearForNext = () => {
  editingId.value = null;
  form.orderedAt = formatLocalDate();
  form.platformOrderNo = '';
  form.inboundTrackingNo = '';
  form.purchaseAddress = '';
  form.rebateScanned = undefined;
  form.notes = '';
  applyDefaults();
};

const loadMine = async () => {
  const response = await http.get<{ items: MyOrder[] }>(`/public/forms/${token.value}/orders/mine`);
  myOrders.value = response.data.items;
};

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const response = await http.get<BootstrapData>(`/public/forms/${token.value}`);
    data.value = response.data;
    applyDefaults();
    await loadMine();
  } catch (error) {
    loadError.value = getApiErrorMessage(error, '分享链接加载失败');
  } finally {
    loading.value = false;
  }
};

const normalizeIdentityCode = (value: string) => value.trim().toUpperCase();

const openIdentityDialog = () => {
  identityCodeInput.value = data.value?.identity.displayCode ?? '';
  identityDialog.value = true;
};

const linkIdentity = async () => {
  const identityCode = normalizeIdentityCode(identityCodeInput.value);
  if (!identityCode) {
    ElMessage.warning('请输入下单人识别码');
    return;
  }

  identityLinking.value = true;
  try {
    const response = await http.post<BootstrapData>(`/public/forms/${token.value}/identity/link`, {
      identityCode,
    });
    data.value = response.data;
    identityCodeInput.value = response.data.identity.displayCode;
    identityDialog.value = false;
    clearForNext();
    await loadMine();
    ElMessage.success('识别码已重新关联，本设备会继续记住该下单人');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '识别码关联失败，请检查后重试'));
  } finally {
    identityLinking.value = false;
  }
};

const submit = async () => {
  if (!form.platformId) {
    ElMessage.warning('请选择下单平台');
    return;
  }
  if (!form.wechatNickname.trim()) {
    ElMessage.warning('请填写下单人微信昵称');
    return;
  }
  if (field('categoryId').required && !form.categoryId) {
    ElMessage.warning('请选择品类');
    return;
  }
  if (field('productName').required && !form.productName.trim()) {
    ElMessage.warning('请填写商品/方案*数量');
    return;
  }
  submitting.value = true;
  try {
    if (editingId.value) {
      await http.patch(`/public/forms/${token.value}/orders/${editingId.value}`, form);
      ElMessage.success('登记已修改，仍等待管理员确认');
    } else {
      const response = await http.post<{ serialNo: number }>(
        `/public/forms/${token.value}/orders`,
        form,
      );
      ElMessage.success(`提交成功，登记序号 ${response.data.serialNo}`);
    }
    clearForNext();
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '提交失败'));
  } finally {
    submitting.value = false;
  }
};

const openPayout = () => {
  Object.assign(payoutForm, {
    type: 'WECHAT',
    label: '常用收款方式',
    accountName: '',
    accountValue: '',
    bankName: '',
    isDefault: true,
  });
  payoutDialog.value = true;
};

const savePayout = async () => {
  if (!payoutForm.label.trim()) {
    ElMessage.warning('请填写收款方式名称');
    return;
  }
  payoutSaving.value = true;
  try {
    await http.post(`/public/forms/${token.value}/payout-methods`, payoutForm);
    payoutDialog.value = false;
    ElMessage.success('收款方式已加密提交，等待管理员确认');
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '收款方式提交失败'));
  } finally {
    payoutSaving.value = false;
  }
};

const deletePayout = async (method: { id: string; label: string }) => {
  try {
    await ElMessageBox.confirm(`确定删除“${method.label}”吗？`, '删除收款方式', {
      type: 'warning',
    });
    await http.delete(`/public/forms/${token.value}/payout-methods/${method.id}`);
    await load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '删除失败'));
  }
};

const editOrder = (order: MyOrder) => {
  editingId.value = order.id;
  Object.assign(form, {
    wechatNickname: order.wechatNickname ?? '',
    platformId: order.platform.id,
    categoryId: order.category?.id ?? '',
    productName: order.productName,
    orderedAt: formatBusinessDate(order.orderedAt),
    platformOrderNo: order.platformOrderNo ?? '',
    inboundTrackingNo: order.inboundTrackingNo ?? '',
    purchaseAddress: order.purchaseAddress ?? '',
    fundingType: order.fundingType,
    orderAmount: Number(order.orderAmount),
    paymentDiscountAmount: Number(order.paymentDiscountAmount),
    rebateScanned: order.rebateScanned ?? undefined,
    submitterSettlementAmount: Number(order.submitterSettlementAmount),
    notes: order.notes ?? '',
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const deleteOrder = async (order: MyOrder) => {
  try {
    await ElMessageBox.confirm(`确定删除登记 #${order.serialNo} 吗？`, '删除登记', {
      type: 'warning',
    });
    await http.delete(`/public/forms/${token.value}/orders/${order.id}`);
    ElMessage.success('登记已删除');
    if (editingId.value === order.id) clearForNext();
    await loadMine();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '删除失败'));
  }
};

onMounted(() => void load());
</script>

<template>
  <div class="public-page">
    <header class="public-header">
      <div class="public-brand" :class="{ 'is-long': (system.brandMarkText || '浪姐').length > 2 }">
        {{ system.brandMarkText || '浪姐' }}
      </div>
      <div class="public-header-copy">
        <strong>{{ data?.form.title || '在线报单' }}</strong
        ><span>提交后由管理员确认入库</span>
      </div>
      <span class="public-header-pill">在线报单</span>
    </header>

    <main v-loading="loading" class="form-card">
      <el-result v-if="loadError" icon="error" title="暂时不能填写" :sub-title="loadError"
        ><template #extra
          ><el-button type="primary" @click="load">重新加载</el-button></template
        ></el-result
      >
      <template v-else-if="data">
        <section class="submission-guide">
          <span class="submission-guide-mark">提</span>
          <div class="submission-guide-copy">
            <strong>提交后进入待确认</strong>
            <span>管理员确认前按设置可以修改，确认后订单自动锁定。</span>
            <small>灰色字段由管理员补写或仅供查看，未开放的字段可以留空。</small>
          </div>
          <span class="submission-guide-pill">待管理员确认</span>
        </section>
        <section class="identity-query-panel" :class="{ 'is-recognized': data.identity.submitter }">
          <div class="identity-query-heading">
            <div class="identity-query-copy">
              <span
                class="identity-step-mark"
                :class="{ 'is-recognized': data.identity.submitter }"
              >
                {{ data.identity.submitter ? '✓' : '码' }}
              </span>
              <div>
                <strong v-if="data.identity.submitter">
                  已识别当前下单人：{{
                    data.identity.submitter.nickname || data.identity.submitter.name
                  }}
                </strong>
                <strong v-else>当前下单人识别码</strong>
                <small>
                  {{
                    data.identity.submitter
                      ? '本设备已记住身份，下次打开报单链接会继续使用'
                      : '同一微信设备会继续使用此身份；更换设备时可重新输入原识别码'
                  }}
                </small>
              </div>
            </div>
            <div class="identity-query-actions">
              <span class="identity-code-pill">{{ data.identity.displayCode }}</span>
              <el-button class="identity-change-button" text @click="openIdentityDialog">
                重新输入识别码
              </el-button>
            </div>
          </div>
        </section>
        <section class="scheme-summary-card">
          <div class="scheme-summary-heading">
            <span class="scheme-summary-mark">案</span>
            <div>
              <strong>{{ data.form.scheme.name || '在线报单方案' }}</strong>
              <small>本次报单方案</small>
            </div>
          </div>
          <div v-if="data.form.scheme.productName" class="scheme-summary-product">
            <span>方案内容</span>
            <div>{{ data.form.scheme.productName }}</div>
          </div>
          <div v-if="data.form.scheme.description" class="scheme-summary-description">
            <span>方案说明</span>
            <div class="scheme-summary-description-content" v-html="data.form.scheme.description" />
          </div>
        </section>
        <section v-if="data.form.description" class="form-description-card">
          <div class="form-description-heading">
            <span class="form-description-mark">注</span>
            <div>
              <strong>填写说明</strong>
              <small>提交前请先核对以下要求</small>
            </div>
          </div>
          <div class="form-description-content">
            <div class="form-description" v-html="data.form.description" />
          </div>
        </section>

        <el-form :model="form" label-position="top" class="public-form" @submit.prevent="submit">
          <section class="form-section">
            <div class="form-section-heading">
              <span class="form-section-step">01</span>
              <div>
                <strong>订单资料</strong>
                <small>填写本次实际下单的信息，没有的内容可以留空</small>
              </div>
            </div>
            <div class="form-section-grid">
              <el-form-item
                v-if="field('wechatNickname').visible"
                label="下单人（微信昵称）"
                :required="field('wechatNickname').required"
                ><el-input
                  v-model="form.wechatNickname"
                  :disabled="!canEditField('wechatNickname')"
                  clearable
                  placeholder="填写当前微信昵称"
              /></el-form-item>
              <el-form-item
                v-if="field('platformId').visible"
                label="平台"
                :required="field('platformId').required"
              >
                <el-select
                  v-model="form.platformId"
                  :disabled="!canEditField('platformId')"
                  placeholder="请选择平台"
                  ><el-option
                    v-for="platform in data.options.platforms"
                    :key="platform.id"
                    :label="platform.name"
                    :value="platform.id" /></el-select
              ></el-form-item>
              <el-form-item
                v-if="field('categoryId').visible"
                label="品类"
                :required="field('categoryId').required"
              >
                <el-select
                  v-model="form.categoryId"
                  :disabled="!canEditField('categoryId')"
                  clearable
                  placeholder="可留空，由管理员补充"
                >
                  <el-option
                    v-for="category in data.options.categories"
                    :key="category.id"
                    :label="category.name"
                    :value="category.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item
                v-if="field('productName').visible"
                label="商品/方案*数量"
                :required="field('productName').required"
                class="span-two"
              >
                <el-input
                  v-model="form.productName"
                  :disabled="!canEditField('productName')"
                  type="textarea"
                  :rows="3"
                  maxlength="200"
                  show-word-limit
                  placeholder="填写本次实际报单内容，支持多行；未填写可由管理员补充"
                />
              </el-form-item>
              <el-form-item
                v-if="field('orderedAt').visible"
                label="下单日期"
                :required="field('orderedAt').required"
                ><el-date-picker
                  v-model="form.orderedAt"
                  :disabled="!canEditField('orderedAt')"
                  type="date"
                  value-format="YYYY-MM-DD"
              /></el-form-item>
              <el-form-item
                v-if="field('platformOrderNo').visible"
                label="平台订单号"
                :required="field('platformOrderNo').required"
                ><el-input
                  v-model="form.platformOrderNo"
                  :disabled="!canEditField('platformOrderNo')"
                  placeholder="请输入平台订单号"
              /></el-form-item>
              <el-form-item
                v-if="field('inboundTrackingNo').visible"
                label="平台运单号"
                :required="field('inboundTrackingNo').required"
                ><el-input
                  v-model="form.inboundTrackingNo"
                  :disabled="!canEditField('inboundTrackingNo')"
                  placeholder="未发货可留空"
              /></el-form-item>
              <el-form-item
                v-if="field('purchaseAddress').visible"
                label="下单地址"
                :required="field('purchaseAddress').required"
                class="span-two"
                ><el-input
                  v-model="form.purchaseAddress"
                  :disabled="!canEditField('purchaseAddress')"
                  type="textarea"
                  :rows="2"
              /></el-form-item>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-heading">
              <span class="form-section-step is-money">02</span>
              <div>
                <strong>支付与结算</strong>
                <small>选择支付方式，填写订单金额并登记扫码返利</small>
              </div>
            </div>
            <div class="form-section-grid">
              <el-form-item
                v-if="field('fundingType').visible"
                label="支付方式"
                :required="field('fundingType').required"
                class="span-two funding-item"
              >
                <div class="funding-options" role="radiogroup" aria-label="支付方式">
                  <button
                    v-for="option in fundingTypeOptions"
                    :key="option.value"
                    type="button"
                    role="radio"
                    class="card-choice funding-option"
                    :class="{ 'is-selected': form.fundingType === option.value }"
                    :disabled="!canEditField('fundingType')"
                    :aria-checked="form.fundingType === option.value"
                    @click="selectFundingType(option.value)"
                  >
                    <span>
                      <strong>{{ option.label }}</strong>
                      <small>{{ option.hint }}</small>
                    </span>
                  </button>
                </div>
              </el-form-item>
              <el-form-item
                v-if="field('orderAmount').visible"
                label="下单金额"
                :required="field('orderAmount').required"
                ><el-input-number
                  v-model="form.orderAmount"
                  :disabled="!canEditField('orderAmount')"
                  :min="0"
                  :precision="2"
                  :step="0.01"
                  :controls="false"
              /></el-form-item>
              <el-form-item
                v-if="field('paymentDiscountAmount').visible"
                label="支付优惠"
                :required="field('paymentDiscountAmount').required"
                ><el-input-number
                  v-model="form.paymentDiscountAmount"
                  :disabled="!canEditField('paymentDiscountAmount')"
                  :min="0"
                  :precision="2"
                  :controls="false"
                />
                <div class="field-help">未使用支付优惠可留空或填 0。</div></el-form-item
              >
              <el-form-item
                v-if="field('rebateScanned').visible"
                label="扫码返利"
                :required="field('rebateScanned').required"
                class="span-two"
              >
                <div
                  class="funding-options scan-choice-options"
                  role="radiogroup"
                  aria-label="扫码返利"
                >
                  <button
                    type="button"
                    role="radio"
                    class="card-choice funding-option"
                    :class="{ 'is-selected': form.rebateScanned === false }"
                    :disabled="!canEditField('rebateScanned')"
                    :aria-checked="form.rebateScanned === false"
                    @click="selectRebateScanned(false)"
                  >
                    <span><strong>未扫码</strong><small>返利金额为 0</small></span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    class="card-choice funding-option"
                    :class="{ 'is-selected': form.rebateScanned === true }"
                    :disabled="!canEditField('rebateScanned')"
                    :aria-checked="form.rebateScanned === true"
                    @click="selectRebateScanned(true)"
                  >
                    <span><strong>已扫码</strong><small>金额由管理员核对</small></span>
                  </button>
                </div>
              </el-form-item>
              <el-form-item
                v-if="field('submitterSettlementAmount').visible"
                label="结算金额"
                :required="field('submitterSettlementAmount').required"
              >
                <el-input-number
                  v-if="fieldConfig?.settlementAmount.mode === 'FREE'"
                  v-model="form.submitterSettlementAmount"
                  :disabled="!canEditField('submitterSettlementAmount')"
                  :min="0"
                  :precision="2"
                  :step="0.01"
                  :controls="false"
                />
                <el-radio-group
                  v-else-if="fieldConfig?.settlementAmount.mode === 'PRESET'"
                  v-model="form.submitterSettlementAmount"
                  :disabled="!canEditField('submitterSettlementAmount')"
                  class="amount-options"
                  ><el-radio-button
                    v-for="amount in fieldConfig.settlementAmount.options"
                    :key="amount"
                    :value="amount"
                    >¥{{ amount.toFixed(2) }}</el-radio-button
                  ></el-radio-group
                >
                <el-input-number
                  v-else
                  v-model="form.submitterSettlementAmount"
                  :precision="2"
                  :controls="false"
                  :disabled="true"
                />
              </el-form-item>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-heading">
              <span class="form-section-step is-submit">03</span>
              <div>
                <strong>补充与提交</strong>
                <small>补充备注后提交，管理员确认前仍可按权限修改</small>
              </div>
            </div>
            <div class="form-section-grid">
              <el-form-item
                v-if="field('notes').visible"
                label="备注"
                :required="field('notes').required"
                class="span-two"
                ><el-input
                  v-model="form.notes"
                  :disabled="!canEditField('notes')"
                  type="textarea"
                  :rows="3"
              /></el-form-item>
              <div class="submit-area span-two">
                <el-button v-if="editingId" size="large" @click="clearForNext">取消修改</el-button
                ><el-button
                  native-type="submit"
                  type="primary"
                  size="large"
                  :loading="submitting"
                  >{{ editingId ? '保存修改' : '提交登记' }}</el-button
                >
              </div>
            </div>
          </section>
        </el-form>
      </template>
    </main>

    <section v-if="data" class="history-card payout-card">
      <div class="history-title">
        <div class="history-title-copy">
          <span class="history-title-mark is-payout">款</span>
          <div>
            <strong>我的收款方式</strong>
            <span>登记一次后，管理员以后给你回款时可以直接选用。</span>
          </div>
        </div>
        <el-tag v-if="hasConfirmedPayoutMethod" type="success" size="small">
          已确认，如需变更请联系管理员
        </el-tag>
        <el-button v-else type="primary" plain size="small" @click="openPayout">
          添加收款方式
        </el-button>
      </div>
      <el-empty
        v-if="!data.identity.submitter?.payoutMethods.length"
        :image-size="52"
        description="还没有登记收款方式"
      />
      <div
        v-for="method in data.identity.submitter?.payoutMethods ?? []"
        :key="method.id"
        class="payout-row"
      >
        <div>
          <el-tag size="small" type="success">{{ payoutTypeLabels[method.type] }}</el-tag>
          <strong>{{ method.label }}</strong>
          <span
            >{{ method.bankName ? `${method.bankName} · ` : ''
            }}{{ method.accountMasked || '无账号文本' }}</span
          >
        </div>
        <div>
          <el-tag v-if="method.isDefault" size="small" type="warning">默认</el-tag>
          <el-tag :type="method.status === 'ACTIVE' ? 'success' : 'info'" size="small">
            {{ method.status === 'ACTIVE' ? '管理员已确认' : '等待管理员确认' }}
          </el-tag>
          <el-button
            v-if="method.status === 'PENDING'"
            size="small"
            text
            type="danger"
            @click="deletePayout(method)"
            >删除</el-button
          >
        </div>
      </div>
    </section>

    <section v-if="data && myOrders.length" class="history-card">
      <div class="history-title">
        <div class="history-title-copy">
          <span class="history-title-mark is-order">单</span>
          <div>
            <strong>我的登记</strong>
            <span>只显示当前微信设备通过本报单链接提交的记录</span>
          </div>
        </div>
      </div>
      <article v-for="order in myOrders" :key="order.id" class="order-item">
        <div class="order-main">
          <div>
            <strong>#{{ order.serialNo }} · {{ order.platform.name }}</strong
            ><span
              >{{ order.platformOrderNo || '未填订单号' }} ·
              {{ formatBusinessDate(order.orderedAt) }}</span
            >
          </div>
          <el-tag :type="statusTypes[order.reviewStatus]">{{
            statusLabels[order.reviewStatus]
          }}</el-tag>
        </div>
        <div class="order-info">
          <span v-if="order.productName" class="order-product">
            {{ order.category?.name ? `${order.category.name} · ` : '' }}{{ order.productName }}
          </span>
          <span
            >下单人：{{
              order.wechatNickname || order.submitter.nickname || order.submitter.name
            }}</span
          ><span>结算金额：¥{{ Number(order.submitterSettlementAmount).toFixed(2) }}</span
          ><span :class="`settlement-${order.submitterSettlementStatus.toLowerCase()}`">{{
            payoutLabels[order.submitterSettlementStatus]
          }}</span>
        </div>
        <div v-if="order.canEdit || order.canDelete" class="order-actions">
          <el-button v-if="order.canEdit" size="small" @click="editOrder(order)">修改</el-button
          ><el-button
            v-if="order.canDelete"
            size="small"
            type="danger"
            plain
            @click="deleteOrder(order)"
            >删除</el-button
          >
        </div>
      </article>
    </section>

    <el-dialog
      v-model="identityDialog"
      class="public-dialog"
      title="重新输入下单人识别码"
      width="min(460px, 94vw)"
    >
      <div class="identity-link-form">
        <el-alert
          title="输入原识别码后，当前设备会重新关联对应的微信昵称和回款资料。"
          type="info"
          :closable="false"
          show-icon
        />
        <el-input
          v-model="identityCodeInput"
          size="large"
          clearable
          maxlength="50"
          autocomplete="off"
          placeholder="例如：WX-8F2K7M9P4Q"
          @input="identityCodeInput = normalizeIdentityCode(identityCodeInput)"
          @keyup.enter="linkIdentity"
        />
      </div>
      <template #footer>
        <el-button @click="identityDialog = false">取消</el-button>
        <el-button type="primary" :loading="identityLinking" @click="linkIdentity">
          确认关联
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="payoutDialog"
      class="public-dialog"
      title="登记给你的回款方式"
      width="min(520px, 94vw)"
    >
      <el-alert
        title="账号会加密保存，普通页面只显示脱敏结果；提交后由管理员确认。"
        type="info"
        :closable="false"
      />
      <el-form :model="payoutForm" label-position="top" class="payout-form">
        <el-form-item label="类型" required>
          <el-select v-model="payoutForm.type">
            <el-option
              v-for="(label, value) in payoutTypeLabels"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="payoutForm.label" placeholder="例如：常用微信、工商银行卡" />
        </el-form-item>
        <el-form-item label="收款人姓名">
          <el-input v-model="payoutForm.accountName" />
        </el-form-item>
        <el-form-item label="开户行">
          <el-input v-model="payoutForm.bankName" />
        </el-form-item>
        <el-form-item label="账号/卡号" class="span-two">
          <el-input v-model="payoutForm.accountValue" placeholder="微信号、支付宝账号或银行卡号" />
        </el-form-item>
        <el-form-item label="设为默认" class="span-two">
          <el-switch v-model="payoutForm.isDefault" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payoutDialog = false">取消</el-button>
        <el-button type="primary" :loading="payoutSaving" @click="savePayout">加密提交</el-button>
      </template>
    </el-dialog>

    <footer>下单登记与资金结算系统</footer>
  </div>
</template>

<style scoped>
.public-page {
  --el-font-size-extra-large: 23px;
  --el-font-size-large: 21px;
  --el-font-size-medium: 19px;
  --el-font-size-base: 17px;
  --el-font-size-small: 16px;
  --el-font-size-extra-small: 15px;
  min-height: 100vh;
  padding: 18px 14px 32px;
  color: #334155;
  font-size: 19px;
  background:
    radial-gradient(circle at 12% 0, rgba(96, 165, 250, 0.2), transparent 32%),
    radial-gradient(circle at 88% 24%, rgba(167, 139, 250, 0.1), transparent 28%),
    linear-gradient(180deg, #eef6ff 0, #f6f8fb 360px);
}
.public-header,
.form-card,
.history-card,
footer {
  width: min(820px, 100%);
  margin-right: auto;
  margin-left: auto;
}
.public-header {
  display: flex;
  align-items: center;
  padding: 3px 2px 16px;
  gap: 11px;
}
.public-brand {
  display: grid;
  width: 50px;
  height: 50px;
  flex: 0 0 50px;
  place-items: center;
  border-radius: 14px;
  font-size: 16px;
  letter-spacing: 0.04em;
  color: #fff;
  font-weight: 800;
  background: linear-gradient(145deg, #60a5fa, #2563eb);
  box-shadow: 0 9px 22px rgba(37, 99, 235, 0.22);
}

.public-brand.is-long {
  font-size: 11px;
  letter-spacing: 0;
}
.public-header-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.public-header strong {
  color: #0f172a;
  font-size: 20px;
}
.public-header span {
  margin-top: 2px;
  color: #64748b;
  font-size: 14px;
}
.public-header-pill {
  flex: 0 0 auto;
  margin-top: 0 !important;
  padding: 6px 11px;
  border: 1px solid rgba(59, 130, 246, 0.18);
  border-radius: 999px;
  color: #2563eb !important;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.08);
  backdrop-filter: blur(12px);
  font-size: 13px !important;
  font-weight: 700;
}
.form-card,
.history-card {
  padding: 20px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.09);
  backdrop-filter: blur(20px);
}
.submission-guide {
  display: flex;
  align-items: center;
  padding: 15px 16px;
  border: 1px solid rgba(59, 130, 246, 0.18);
  border-radius: 18px;
  background: rgba(239, 246, 255, 0.84);
  gap: 12px;
}
.submission-guide-mark,
.form-description-mark,
.form-section-step,
.history-title-mark {
  display: grid;
  place-items: center;
  font-weight: 800;
}
.submission-guide-mark {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 11px;
  color: #2563eb;
  background: #dbeafe;
  font-size: 14px;
}
.submission-guide-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.submission-guide-copy strong {
  color: #0f172a;
  font-size: 17px;
}
.submission-guide-copy span,
.submission-guide-copy small {
  margin-top: 2px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.55;
}
.submission-guide-copy small {
  color: #94a3b8;
}
.submission-guide-pill {
  flex: 0 0 auto;
  padding: 6px 10px;
  border-radius: 999px;
  color: #2563eb;
  background: #fff;
  font-size: 13px;
  font-weight: 700;
}
.identity-query-panel {
  margin-top: 12px;
  padding: 18px 20px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 46px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(16px);
}
.identity-query-panel.is-recognized {
  border-color: rgba(34, 197, 94, 0.22);
  background: rgba(248, 255, 251, 0.92);
}
.identity-query-heading,
.identity-query-copy,
.identity-query-actions {
  display: flex;
  align-items: center;
}
.identity-query-heading {
  justify-content: space-between;
  gap: 18px;
}
.identity-query-copy {
  min-width: 0;
  gap: 11px;
}
.identity-step-mark {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 11px;
  color: #2563eb;
  background: #eaf2ff;
  font-size: 14px;
  font-weight: 800;
}
.identity-step-mark.is-recognized {
  color: #15803d;
  background: #dcfce7;
}
.identity-query-copy > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.identity-query-copy strong {
  color: #0f172a;
  font-size: 18px;
}
.identity-query-copy small {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 13px;
}
.identity-query-actions {
  flex: 0 0 auto;
  gap: 5px;
}
.identity-code-pill {
  padding: 6px 10px;
  border-radius: 999px;
  color: #2563eb;
  background: #eef5ff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.identity-change-button {
  padding-right: 7px;
  padding-left: 7px;
  color: #64748b;
  font-size: 14px;
}
.identity-link-form {
  display: grid;
  gap: 14px;
}
.scheme-summary-card {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--app-primary) 18%, var(--app-border));
  border-radius: 20px;
  background: color-mix(in srgb, var(--app-primary-soft) 24%, var(--app-card));
  box-shadow: var(--app-shadow-sm);
}
.scheme-summary-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}
.scheme-summary-heading > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.scheme-summary-heading strong {
  color: var(--app-heading);
  font-size: 17px;
}
.scheme-summary-heading small {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 13px;
}
.scheme-summary-mark {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border-radius: 10px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
  font-size: 13px;
  font-weight: 800;
}
.scheme-summary-product,
.scheme-summary-description {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-card-solid) 62%, transparent);
}
.scheme-summary-product > span,
.scheme-summary-description > span {
  display: block;
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 700;
}
.scheme-summary-product > div,
.scheme-summary-description-content {
  margin-top: 5px;
  color: var(--app-text);
  font-size: 15px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.scheme-summary-description-content :deep(p),
.scheme-summary-description-content :deep(div) {
  margin: 0 0 5px;
}
.scheme-summary-description-content :deep(p:last-child),
.scheme-summary-description-content :deep(div:last-child) {
  margin-bottom: 0;
}
.form-description-card {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 20px;
  background: rgba(255, 251, 235, 0.86);
  box-shadow: 0 12px 28px rgba(180, 83, 9, 0.06);
}
.form-description-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}
.form-description-heading > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.form-description-heading strong {
  color: #92400e;
  font-size: 16px;
}
.form-description-heading small {
  margin-top: 2px;
  color: #b7791f;
  font-size: 13px;
}
.form-description-mark {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 10px;
  color: #b45309;
  background: #fef3c7;
  font-size: 13px;
}
.form-description-content {
  margin-top: 11px;
  padding: 12px 14px;
  border: 1px solid rgba(245, 158, 11, 0.16);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
}
.form-description {
  min-width: 0;
  color: #78590d;
  font-size: 16px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.form-description :deep(p),
.form-description :deep(div) {
  margin: 0 0 6px;
}
.form-description :deep(p:last-child),
.form-description :deep(div:last-child) {
  margin-bottom: 0;
}
.public-form {
  display: grid;
  margin-top: 14px;
  gap: 14px;
}
.form-section {
  padding: 18px 18px 2px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
}
.form-section-heading {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  gap: 10px;
}
.form-section-step {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 11px;
  color: #2563eb;
  background: #eaf2ff;
  font-size: 12px;
}
.form-section-step.is-money {
  color: #7c3aed;
  background: #ede9fe;
}
.form-section-step.is-submit {
  color: #15803d;
  background: #dcfce7;
}
.form-section-heading > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.form-section-heading strong {
  color: #0f172a;
  font-size: 17px;
}
.form-section-heading small {
  margin-top: 2px;
  color: #94a3b8;
  font-size: 13px;
}
.form-section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}
.public-form :deep(.el-form-item) {
  margin-bottom: 16px;
}
.public-form :deep(.el-form-item__label) {
  color: #475569;
  font-size: 15px;
  font-weight: 650;
}
.public-form :deep(.el-input__wrapper),
.public-form :deep(.el-select__wrapper),
.public-form :deep(.el-textarea__inner) {
  border-radius: 13px;
  background: rgba(248, 250, 252, 0.92);
  box-shadow: 0 0 0 1px #dbe3ee inset;
  transition: 0.18s ease;
}
.public-form :deep(.el-input__wrapper),
.public-form :deep(.el-select__wrapper) {
  min-height: 44px;
}
.public-form :deep(.el-textarea__inner) {
  padding: 11px 12px;
  line-height: 1.65;
}
.public-form :deep(.el-input__wrapper:hover),
.public-form :deep(.el-select__wrapper:hover),
.public-form :deep(.el-textarea__inner:hover) {
  box-shadow: 0 0 0 1px #9fc3fa inset;
}
.public-form :deep(.el-input__wrapper.is-focus),
.public-form :deep(.el-select__wrapper.is-focused),
.public-form :deep(.el-textarea__inner:focus) {
  box-shadow:
    0 0 0 1px #60a5fa inset,
    0 0 0 3px rgba(59, 130, 246, 0.1);
}
.public-form :deep(.is-disabled .el-input__wrapper),
.public-form :deep(.is-disabled.el-select__wrapper),
.public-form :deep(.el-textarea.is-disabled .el-textarea__inner) {
  background: #f1f5f9;
}
.public-form :deep(.el-select),
.public-form :deep(.el-date-editor),
.public-form :deep(.el-input-number) {
  width: 100%;
}
.funding-options {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 5px;
  border: 1px solid #dbe3ee;
  border-radius: 16px;
  background: rgba(241, 245, 249, 0.86);
  gap: 5px;
}
.scan-choice-options {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.funding-option {
  min-height: 58px;
  align-items: center;
  padding: 8px 10px;
  border-color: transparent;
  border-radius: 12px;
  background: transparent;
  transition: 0.18s ease;
}
.funding-option:hover:not(:disabled) {
  border-color: #9fc3fa;
  background: rgba(255, 255, 255, 0.88);
  transform: translateY(-1px);
}
.funding-option.is-selected {
  border-color: #7db0f7;
  color: #2563eb;
  background: #fff;
  box-shadow: 0 7px 18px rgba(59, 130, 246, 0.12);
}
.funding-option > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.funding-option strong {
  color: #0f172a;
  font-size: 16px;
}
.funding-option small {
  margin-top: 3px;
  overflow: hidden;
  color: #98a2b3;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.span-two {
  grid-column: 1 / -1;
}
.amount-options {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.amount-options :deep(.el-radio-button__inner) {
  border: 1px solid #dbe3ee !important;
  border-radius: 11px !important;
  box-shadow: none !important;
}
.amount-options :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  border-color: #7db0f7 !important;
  color: #2563eb;
  background: #eef5ff;
}
.field-help {
  margin-top: 5px;
  color: #98a2b3;
  font-size: 14px;
}
.submit-area {
  display: flex;
  justify-content: flex-end;
  padding-top: 2px;
  padding-bottom: 16px;
  gap: 9px;
}
.submit-area :deep(.el-button) {
  min-height: 44px;
  border-radius: 13px;
  padding-right: 22px;
  padding-left: 22px;
}
.submit-area :deep(.el-button:last-child) {
  min-width: 160px;
  border: 0;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.22);
}
.history-card {
  margin-top: 16px;
}
.history-card :deep(.el-empty) {
  padding: 22px 0 16px;
}
.history-card :deep(.el-empty__image) {
  width: 48px;
}
.history-card :deep(.el-empty__description) {
  margin-top: 8px;
}
.payout-card {
  box-shadow: 0 18px 46px rgba(15, 23, 42, 0.07);
}
.history-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 14px;
}
.history-title-copy {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.history-title-copy > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.history-title-mark {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 11px;
  font-size: 14px;
}
.history-title-mark.is-payout {
  color: #7c3aed;
  background: #ede9fe;
}
.history-title-mark.is-order {
  color: #2563eb;
  background: #eaf2ff;
}
.history-title strong {
  color: #0f172a;
  font-size: 18px;
}
.history-title :deep(.el-button) {
  border-radius: 11px;
}
.payout-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 62px;
  margin-top: 9px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 15px;
  background: rgba(248, 250, 252, 0.82);
  gap: 10px;
}
.payout-row > div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}
.payout-row span {
  width: 100%;
  color: #667085;
  font-size: 15px;
}
.payout-form {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  margin-top: 14px;
  gap: 0 12px;
}
.payout-form :deep(.el-select) {
  width: 100%;
}
.history-title span {
  color: #98a2b3;
  font-size: 14px;
}
.order-item {
  margin-top: 10px;
  padding: 15px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.84);
  transition: 0.18s ease;
}
.order-item:hover {
  border-color: #bfdbfe;
  background: #fff;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.06);
}
.order-main,
.order-info,
.order-actions {
  display: flex;
}
.order-main {
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.order-main > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.order-main span,
.order-info {
  color: #667085;
  font-size: 15px;
}
.order-info {
  flex-wrap: wrap;
  margin-top: 10px;
  gap: 7px 14px;
}
.order-actions {
  justify-content: flex-end;
  margin-top: 10px;
  gap: 7px;
}
.order-actions :deep(.el-button) {
  border-radius: 10px;
}
.settlement-paid {
  color: #16a34a;
  font-weight: 600;
}
.settlement-partial,
.settlement-unpaid,
.settlement-exception {
  color: #dc2626;
  font-weight: 600;
}
footer {
  padding-top: 18px;
  color: #98a2b3;
  font-size: 14px;
  text-align: center;
}
:global(.public-dialog.el-dialog) {
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 26px 70px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(18px);
}
:global(.public-dialog .el-dialog__header) {
  padding: 18px 20px 14px;
  border-bottom: 1px solid #eef2f7;
}
:global(.public-dialog .el-dialog__title) {
  color: #0f172a;
  font-weight: 700;
}
:global(.public-dialog .el-dialog__body) {
  padding: 18px 20px;
}
:global(.public-dialog .el-dialog__footer) {
  padding: 13px 20px 18px;
  border-top: 1px solid #eef2f7;
}
:global(.public-dialog .el-button) {
  border-radius: 11px;
}
@media (max-width: 560px) {
  .public-page {
    padding: 13px 10px 26px;
  }
  .public-header {
    align-items: flex-start;
  }
  .public-header-pill {
    display: none;
  }
  .form-section-grid {
    grid-template-columns: 1fr;
  }
  .span-two {
    grid-column: 1;
  }
  .form-card,
  .history-card {
    padding: 13px;
    border-radius: 20px;
  }
  .submission-guide {
    align-items: flex-start;
    padding: 13px;
  }
  .submission-guide-pill {
    display: none;
  }
  .identity-query-panel {
    padding: 15px;
    border-radius: 18px;
  }
  .identity-query-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .identity-query-actions {
    width: 100%;
    justify-content: space-between;
    padding-left: 47px;
  }
  .form-description-card {
    padding: 12px;
    border-radius: 18px;
  }
  .form-description-content {
    padding: 11px 12px;
    border-radius: 13px;
  }
  .form-section {
    padding: 14px 14px 1px;
    border-radius: 18px;
  }
  .form-section-heading {
    align-items: flex-start;
  }
  .funding-options {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 3px;
  }
  .scan-choice-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .funding-option {
    min-height: 50px;
    padding: 7px 4px;
  }
  .funding-option strong {
    font-size: 15px;
  }
  .funding-option small {
    font-size: 12px;
    line-height: 1.25;
    white-space: normal;
  }
  .history-title {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .history-title > :deep(.el-button),
  .history-title > :deep(.el-tag) {
    margin-left: 46px;
  }
  .payout-row {
    align-items: flex-start;
    flex-direction: column;
    padding: 12px;
  }
  .payout-form {
    grid-template-columns: 1fr;
  }
  .submit-area :deep(.el-button) {
    flex: 1;
    min-width: 0;
    padding-right: 8px;
    padding-left: 8px;
  }
}
</style>
