<script setup lang="ts">
import { Check, Delete, DocumentCopy } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { getApiErrorMessage } from '../lib/api-error';
import { formatBusinessDate } from '../lib/business-date';
import { http } from '../lib/http';

type FundingType = 'SELF_PAID' | 'SUBMITTER_ADVANCED' | 'OTHER';
type ShipmentStatus = 'NOT_SHIPPED' | 'SHIPPED' | 'DELIVERED' | 'EXCEPTION';
type SettlementStatus = 'UNPAID' | 'PAID' | 'EXCEPTION';
type StoredSettlementStatus = SettlementStatus | 'PARTIAL';

interface PlatformOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface EditableOrder {
  id: string;
  serialNo: number;
  orderedAt: string;
  platform: PlatformOption;
  submitter: { id: string; name: string };
  category: CategoryOption | null;
  productNameSnapshot: string;
  platformOrderNo: string | null;
  inboundTrackingNo: string | null;
  purchaseAddress: string | null;
  fundingType: FundingType;
  customData: unknown;
  orderAmount: string | number;
  paymentDiscountAmount: string | number;
  submitterSettlementAmount: string | number;
  scanAmount: string | number;
  platformRebateAmount: string | number;
  rebateScanned: boolean | null;
  saleAmount: string | number;
  shipmentStatus: ShipmentStatus;
  shipmentLink: { shipment: { trackingNo: string } } | null;
  receivableStatus: StoredSettlementStatus;
  submitterSettlementStatus: StoredSettlementStatus;
  notes: string | null;
}

const props = withDefaults(
  defineProps<{
    embedded?: boolean;
    mode?: 'create' | 'edit';
    order?: EditableOrder | null;
  }>(),
  {
    embedded: false,
    mode: 'create',
    order: null,
  },
);
const emit = defineEmits<{
  saved: [serialNo: number];
  deleted: [serialNo: number];
  historyCleared: [];
  cancel: [];
}>();

interface OrderDraft {
  orderedAt: string;
  platformId: string;
  accountName: string;
  categoryId: string;
  productName: string;
  platformOrderNo: string;
  inboundTrackingNo: string;
  purchaseAddress: string;
  fundingType: FundingType;
  fundingTypeOther: string;
  orderAmount: number | undefined;
  paymentDiscountAmount: number | undefined;
  submitterSettlementAmount: number | undefined;
  rebateScanned: boolean;
  scanAmount: number | undefined;
  saleAmount: number | undefined;
  shipmentStatus: ShipmentStatus;
  shipmentTrackingNo: string;
  receivableStatus: SettlementStatus;
  submitterSettlementStatus: SettlementStatus;
  editReason: string;
  notes: string;
}

const draftStorageKey = 'order-system:manual-order-draft-v5';
const previousStorageKey = 'order-system:last-order-defaults-v5';
const scanAmountMultiplier = 0.9;
const fundingTypeOptions = [
  { value: 'SELF_PAID' as const, label: '自己付', hint: '我直接支付' },
  { value: 'SUBMITTER_ADVANCED' as const, label: '代付', hint: '后续结算' },
  { value: 'OTHER' as const, label: '其他', hint: '填写说明' },
];
const shipmentStatusOptions: Array<{ value: ShipmentStatus; label: string }> = [
  { value: 'NOT_SHIPPED', label: '未寄出' },
  { value: 'SHIPPED', label: '已寄出' },
  { value: 'DELIVERED', label: '已签收' },
  { value: 'EXCEPTION', label: '异常' },
];
const settlementStatusOptions: Array<{ value: SettlementStatus; label: string }> = [
  { value: 'UNPAID', label: '未回款' },
  { value: 'PAID', label: '已回款' },
  { value: 'EXCEPTION', label: '异常' },
];
const submitterStatusOptions: Array<{ value: SettlementStatus; label: string }> = [
  { value: 'UNPAID', label: '未结算' },
  { value: 'PAID', label: '已结算' },
  { value: 'EXCEPTION', label: '异常' },
];
const loadingOptions = ref(false);
const saving = ref(false);
const deleting = ref(false);
const clearingEditReasons = ref(false);
const platforms = ref<PlatformOption[]>([]);
const categories = ref<CategoryOption[]>([]);

const isEditMode = computed(() => props.mode === 'edit' && Boolean(props.order));

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateByOffset = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
};

const createEmptyDraft = (): OrderDraft => ({
  orderedAt: dateByOffset(0),
  platformId: '',
  accountName: '',
  categoryId: '',
  productName: '',
  platformOrderNo: '',
  inboundTrackingNo: '',
  purchaseAddress: '',
  fundingType: 'SELF_PAID',
  fundingTypeOther: '',
  orderAmount: undefined,
  paymentDiscountAmount: 0,
  submitterSettlementAmount: undefined,
  rebateScanned: false,
  scanAmount: 0,
  saleAmount: undefined,
  shipmentStatus: 'NOT_SHIPPED',
  shipmentTrackingNo: '',
  receivableStatus: 'UNPAID',
  submitterSettlementStatus: 'UNPAID',
  editReason: '',
  notes: '',
});

const form = reactive<OrderDraft>(createEmptyDraft());
const isScanned = computed(() => form.rebateScanned);
const scanRebateAmount = computed(() => {
  if (!form.rebateScanned) return 0;
  return (
    Math.round((Number(form.scanAmount ?? 0) * scanAmountMultiplier + Number.EPSILON) * 100) / 100
  );
});

const numberValue = (value: string | number | null | undefined) => Number(value ?? 0);

const fundingTypeOtherFromOrder = (order: EditableOrder) => {
  if (
    !order.customData ||
    typeof order.customData !== 'object' ||
    Array.isArray(order.customData)
  ) {
    return '';
  }
  const value = (order.customData as Record<string, unknown>).fundingTypeOther;
  return typeof value === 'string' ? value : '';
};

const scanAmountFromOrder = (order: EditableOrder) => {
  const savedScanAmount = numberValue(order.scanAmount);
  if (savedScanAmount > 0) return savedScanAmount;
  const rebateAmount = numberValue(order.platformRebateAmount);
  return rebateAmount > 0
    ? Math.round((rebateAmount / scanAmountMultiplier + Number.EPSILON) * 100) / 100
    : 0;
};

const editableSettlementStatus = (status: StoredSettlementStatus): SettlementStatus =>
  status === 'PARTIAL' ? 'UNPAID' : status;

const applyOrder = (order: EditableOrder | null | undefined) => {
  if (!order) return;
  Object.assign(form, createEmptyDraft(), {
    orderedAt: formatBusinessDate(order.orderedAt),
    platformId: order.platform.id,
    accountName: order.submitter.name,
    categoryId: order.category?.id ?? '',
    productName: order.productNameSnapshot,
    platformOrderNo: order.platformOrderNo ?? '',
    inboundTrackingNo: order.inboundTrackingNo ?? '',
    purchaseAddress: order.purchaseAddress ?? '',
    fundingType: order.fundingType,
    fundingTypeOther: fundingTypeOtherFromOrder(order),
    orderAmount: numberValue(order.orderAmount),
    paymentDiscountAmount: numberValue(order.paymentDiscountAmount),
    submitterSettlementAmount: numberValue(order.submitterSettlementAmount),
    rebateScanned: order.rebateScanned ?? numberValue(order.platformRebateAmount) > 0,
    scanAmount: scanAmountFromOrder(order),
    saleAmount: numberValue(order.saleAmount),
    shipmentStatus: order.shipmentStatus,
    shipmentTrackingNo: order.shipmentLink?.shipment.trackingNo ?? '',
    receivableStatus: editableSettlementStatus(order.receivableStatus),
    submitterSettlementStatus: editableSettlementStatus(order.submitterSettlementStatus),
    editReason: '',
    notes: order.notes ?? '',
  });
};

const readPrevious = (): Partial<OrderDraft> | null => {
  const value = localStorage.getItem(previousStorageKey);
  if (!value) return null;
  try {
    return JSON.parse(value) as Partial<OrderDraft>;
  } catch {
    return null;
  }
};

const setDate = (offset: number) => {
  form.orderedAt = dateByOffset(offset);
};

const usePreviousDate = () => {
  const previous = readPrevious();
  if (!previous?.orderedAt) {
    ElMessage.warning('还没有上一单日期');
    return;
  }
  form.orderedAt = previous.orderedAt;
};

const reusePreviousBasics = () => {
  const previous = readPrevious();
  if (!previous) {
    ElMessage.warning('还没有可沿用的上一单');
    return;
  }
  const reusable: Array<keyof OrderDraft> = [
    'platformId',
    'accountName',
    'categoryId',
    'productName',
    'purchaseAddress',
    'fundingType',
    'fundingTypeOther',
  ];
  reusable.forEach((key) => {
    if (previous[key] !== undefined) Object.assign(form, { [key]: previous[key] });
  });
  ElMessage.success('已沿用上一单基本信息，订单号、运单号和金额未复制');
};

const reusePreviousAmounts = () => {
  const previous = readPrevious();
  if (!previous) {
    ElMessage.warning('还没有可复制的上一单金额');
    return;
  }
  form.orderAmount = previous.orderAmount;
  form.paymentDiscountAmount = previous.paymentDiscountAmount ?? 0;
  form.submitterSettlementAmount = previous.submitterSettlementAmount;
  form.rebateScanned = previous.rebateScanned ?? false;
  form.scanAmount = previous.scanAmount ?? 0;
  form.saleAmount = previous.saleAmount;
  ElMessage.success('已复制上一单金额，请核对后再保存');
};

const reusePreviousAddress = () => {
  const previous = readPrevious();
  if (!previous?.purchaseAddress?.trim()) {
    ElMessage.warning('上一单没有可沿用的下单地址');
    return;
  }
  form.purchaseAddress = previous.purchaseAddress;
  ElMessage.success('已填入上一单地址');
};

const clearMoney = () => {
  form.orderAmount = undefined;
  form.paymentDiscountAmount = 0;
  form.submitterSettlementAmount = undefined;
  form.rebateScanned = false;
  form.scanAmount = 0;
  form.saleAmount = undefined;
  if (isEditMode.value) {
    form.receivableStatus = 'UNPAID';
    form.submitterSettlementStatus = 'UNPAID';
  }
};

const setScanStatus = (scanned: boolean) => {
  form.rebateScanned = scanned;
  if (!scanned) {
    form.scanAmount = 0;
  }
};

const setReceivableStatus = (status: SettlementStatus) => {
  form.receivableStatus = status;
  if (status === 'PAID') form.shipmentStatus = 'DELIVERED';
};

const setSubmitterSettlementStatus = (status: SettlementStatus) => {
  form.submitterSettlementStatus = status;
};

const saveLocalDraft = () => {
  localStorage.setItem(draftStorageKey, JSON.stringify(form));
  ElMessage.success('草稿已保存在当前浏览器');
};

const resetForm = () => {
  if (isEditMode.value) {
    applyOrder(props.order);
    return;
  }
  Object.assign(form, createEmptyDraft());
  localStorage.removeItem(draftStorageKey);
};

const submitOrder = async () => {
  if (form.fundingType === 'OTHER' && !form.fundingTypeOther.trim()) {
    ElMessage.warning('请填写其他支付方式');
    return;
  }
  if (!form.platformId || !form.accountName.trim() || !form.orderedAt || !form.productName.trim()) {
    ElMessage.warning('请完整填写日期、平台、下单账号和商品/方案*数量');
    return;
  }
  if (form.rebateScanned && Number(form.scanAmount ?? 0) <= 0) {
    ElMessage.warning('选择扫码后，请填写大于 0 的扫码金额');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      orderedAt: form.orderedAt,
      platformId: form.platformId,
      accountName: form.accountName.trim(),
      categoryId: form.categoryId || (isEditMode.value ? null : undefined),
      productName: form.productName.trim(),
      platformOrderNo: form.platformOrderNo,
      inboundTrackingNo: form.inboundTrackingNo,
      purchaseAddress: form.purchaseAddress,
      fundingType: form.fundingType,
      fundingTypeOther: form.fundingType === 'OTHER' ? form.fundingTypeOther.trim() : undefined,
      orderAmount: form.orderAmount,
      paymentDiscountAmount: form.paymentDiscountAmount,
      submitterSettlementAmount: form.submitterSettlementAmount,
      scanAmount: form.rebateScanned ? form.scanAmount : 0,
      platformRebateAmount: scanRebateAmount.value,
      rebateScanned: form.rebateScanned,
      saleAmount: form.saleAmount,
      notes: form.notes,
      ...(isEditMode.value
        ? {
            shipmentStatus: form.shipmentStatus,
            shipmentTrackingNo: form.shipmentTrackingNo,
            receivableStatus: form.receivableStatus,
            submitterSettlementStatus: form.submitterSettlementStatus,
            reason: form.editReason.trim() || undefined,
          }
        : {}),
    };
    const response = isEditMode.value
      ? await http.patch<{ serialNo: number }>(`/admin/orders/${props.order?.id}`, payload)
      : await http.post<{ serialNo: number }>('/admin/orders', payload);

    if (!isEditMode.value) {
      localStorage.setItem(previousStorageKey, JSON.stringify(form));
      localStorage.removeItem(draftStorageKey);
      Object.assign(form, createEmptyDraft());
    }
    ElMessage.success(
      isEditMode.value
        ? `订单 #${response.data.serialNo} 已保存修改并重算利润`
        : `订单 #${response.data.serialNo} 已保存`,
    );
    emit('saved', response.data.serialNo);
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, isEditMode.value ? '订单修改失败' : '订单保存失败'));
  } finally {
    saving.value = false;
  }
};

const deleteOrder = async () => {
  if (!isEditMode.value || !props.order) return;
  try {
    await ElMessageBox.confirm(
      `确定删除订单 #${props.order.serialNo} 吗？删除后将从订单列表隐藏。`,
      '删除此订单',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      },
    );
    deleting.value = true;
    await http.delete(`/admin/orders/${props.order.id}`);
    ElMessage.success(`订单 #${props.order.serialNo} 已删除`);
    emit('deleted', props.order.serialNo);
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '订单删除失败'));
  } finally {
    deleting.value = false;
  }
};

const clearAllEditReasons = async () => {
  if (!isEditMode.value || !props.order) return;
  try {
    await ElMessageBox.confirm(
      `确定清空订单 #${props.order.serialNo} 的全部修改说明吗？订单其他资料不会改变。`,
      '清空全部修改说明',
      {
        type: 'warning',
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
      },
    );
    clearingEditReasons.value = true;
    const response = await http.delete<{ clearedCount: number }>(
      `/admin/orders/${props.order.id}/edit-reasons`,
    );
    form.editReason = '';
    ElMessage.success(
      response.data.clearedCount
        ? `已清空 ${response.data.clearedCount} 条修改说明`
        : '当前订单没有需要清空的修改说明',
    );
    emit('historyCleared');
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '修改说明清空失败'));
  } finally {
    clearingEditReasons.value = false;
  }
};

const loadOptions = async () => {
  loadingOptions.value = true;
  try {
    const [platformResult, categoryResult] = await Promise.allSettled([
      http.get<{ items: PlatformOption[] }>('/admin/platforms'),
      http.get<{ items: CategoryOption[] }>('/admin/categories'),
    ]);
    if (platformResult.status === 'fulfilled') {
      platforms.value = platformResult.value.data.items;
    }
    if (categoryResult.status === 'fulfilled') {
      categories.value = categoryResult.value.data.items;
    }
    if (platformResult.status === 'rejected') {
      ElMessage.error(getApiErrorMessage(platformResult.reason, '平台加载失败'));
    } else if (categoryResult.status === 'rejected') {
      ElMessage.error(getApiErrorMessage(categoryResult.reason, '品类加载失败'));
    }
  } finally {
    loadingOptions.value = false;
  }
};

watch(
  () => props.order,
  (order) => {
    if (props.mode === 'edit') applyOrder(order);
  },
);

onMounted(async () => {
  await loadOptions();
  if (isEditMode.value) {
    applyOrder(props.order);
    return;
  }
  const stored = localStorage.getItem(draftStorageKey);
  if (!stored) return;
  try {
    Object.assign(form, JSON.parse(stored) as Partial<OrderDraft>);
  } catch {
    localStorage.removeItem(draftStorageKey);
  }
});
</script>

<template>
  <div
    class="order-create"
    :class="{ 'is-embedded': props.embedded, 'is-edit-mode': isEditMode }"
    v-loading="loadingOptions"
  >
    <div v-if="!props.embedded" class="page-heading order-create-heading">
      <div>
        <span class="page-kicker">MANUAL ORDER</span>
        <h1>{{ isEditMode ? `编辑订单 #${props.order?.serialNo ?? ''}` : '新建订单' }}</h1>
        <p>
          {{
            isEditMode
              ? '订单资料、寄件状态和双向回款状态都可以在这里统一修改。'
              : '在订单列表内也可以弹窗录入；新账号输入后会自动加入账号库。'
          }}
        </p>
      </div>
    </div>

    <section v-if="!isEditMode" class="quick-bar">
      <div class="quick-group">
        <span>日期</span>
        <el-button size="small" round type="primary" plain @click="setDate(0)">今天</el-button>
        <el-button size="small" round @click="setDate(-1)">昨天</el-button>
        <el-button size="small" round @click="usePreviousDate">上一单日期</el-button>
      </div>
      <div class="quick-group">
        <span>常用平台</span>
        <el-button
          v-for="platform in platforms"
          :key="platform.id"
          size="small"
          round
          :type="form.platformId === platform.id ? 'primary' : 'default'"
          plain
          @click="form.platformId = platform.id"
        >
          {{ platform.name }}
        </el-button>
      </div>
      <div class="quick-group">
        <span>常用品类</span>
        <el-button
          v-for="category in categories"
          :key="category.id"
          size="small"
          round
          :type="form.categoryId === category.id ? 'primary' : 'default'"
          plain
          @click="form.categoryId = category.id"
        >
          {{ category.name }}
        </el-button>
      </div>
      <div class="quick-group quick-actions">
        <el-button size="small" round :icon="DocumentCopy" @click="reusePreviousBasics"
          >沿用上一单</el-button
        >
        <el-button size="small" round @click="reusePreviousAmounts">复制上一单金额</el-button>
      </div>
    </section>

    <el-form :model="form" label-position="top" class="order-form">
      <section class="form-panel">
        <div class="section-heading">
          <div>
            <strong>订单信息</strong
            ><span>
              {{
                isEditMode
                  ? '所有原始资料均已回填，修改后一次保存。'
                  : '下单人直接填写；已有名称自动关联，新名称自动加入账号库。'
              }}
            </span>
          </div>
        </div>
        <div class="form-grid basic-grid">
          <el-form-item label="下单日期" required class="field-third">
            <el-date-picker
              v-model="form.orderedAt"
              type="date"
              value-format="YYYY-MM-DD"
              format="YYYY-MM-DD"
              placeholder="选择下单日期"
            />
          </el-form-item>
          <el-form-item label="下单平台" required class="field-third">
            <el-select v-model="form.platformId" filterable placeholder="选择平台">
              <el-option
                v-for="platform in platforms"
                :key="platform.id"
                :label="platform.name"
                :value="platform.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="下单品类" class="field-third">
            <el-select v-model="form.categoryId" clearable filterable placeholder="可选">
              <el-option
                v-for="category in categories"
                :key="category.id"
                :label="category.name"
                :value="category.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="下单账号（下单人）" required class="field-half">
            <el-input
              v-model="form.accountName"
              clearable
              placeholder="直接填写下单账号（下单人）"
            />
            <div class="field-help">
              与已有名称一致时自动关联原记录；新名称保存订单后会自动加入账号库。
            </div>
          </el-form-item>
          <el-form-item
            label="商品/方案*数量"
            required
            class="field-half compact-textarea product-entry-field"
          >
            <el-input
              v-model="form.productName"
              type="textarea"
              :rows="3"
              clearable
              resize="vertical"
              placeholder="支持多行填写，可一行写一个商品、方案和数量"
            />
          </el-form-item>
          <el-form-item label="平台订单号" class="field-half">
            <el-input v-model="form.platformOrderNo" clearable placeholder="每单单独填写" />
          </el-form-item>
          <el-form-item label="平台运单号" class="field-half compact-textarea">
            <el-input
              v-model="form.inboundTrackingNo"
              type="textarea"
              :rows="2"
              clearable
              resize="vertical"
              placeholder="支持填写多行运单号，未发货可留空"
            />
          </el-form-item>
          <el-form-item label="下单地址" class="field-full compact-textarea">
            <el-input v-model="form.purchaseAddress" type="textarea" :rows="2" />
            <div class="address-quick-actions">
              <span>快捷添加</span>
              <el-button v-if="!isEditMode" size="small" round @click="reusePreviousAddress"
                >上一单地址</el-button
              >
              <el-button
                v-if="form.purchaseAddress"
                size="small"
                text
                @click="form.purchaseAddress = ''"
              >
                清空
              </el-button>
            </div>
          </el-form-item>
        </div>
      </section>

      <section class="form-panel money-panel">
        <div class="section-heading">
          <div>
            <strong>金额与利润参数</strong><span>收货佬未全额回款前，已结算利润保持 0。</span>
          </div>
          <el-button text :icon="Delete" @click="clearMoney">清空金额</el-button>
        </div>
        <div class="form-grid money-grid">
          <el-form-item label="支付方式" required class="field-full funding-item">
            <div class="funding-fields">
              <div class="funding-options" role="radiogroup" aria-label="支付方式">
                <button
                  v-for="option in fundingTypeOptions"
                  :key="option.value"
                  type="button"
                  role="radio"
                  class="card-choice funding-option"
                  :class="{ 'is-selected': form.fundingType === option.value }"
                  :aria-checked="form.fundingType === option.value"
                  @click="form.fundingType = option.value"
                >
                  <span>
                    <strong>{{ option.label }}</strong>
                    <small>{{ option.hint }}</small>
                  </span>
                </button>
              </div>
              <el-input
                v-if="form.fundingType === 'OTHER'"
                v-model="form.fundingTypeOther"
                class="funding-other-input"
                clearable
                maxlength="100"
                placeholder="填写具体支付方式"
              />
            </div>
          </el-form-item>
          <el-form-item label="下单金额" class="field-half">
            <el-input-number v-model="form.orderAmount" :min="0" :precision="2" :controls="false" />
          </el-form-item>
          <el-form-item label="支付优惠" class="field-half">
            <el-input-number
              v-model="form.paymentDiscountAmount"
              :min="0"
              :precision="2"
              :controls="false"
            />
          </el-form-item>
          <el-form-item label="结算金额" class="field-half">
            <el-input-number
              v-model="form.submitterSettlementAmount"
              :min="0"
              :precision="2"
              :controls="false"
            />
          </el-form-item>
          <el-form-item label="回款金额" class="field-half">
            <el-input-number v-model="form.saleAmount" :min="0" :precision="2" :controls="false" />
          </el-form-item>
          <el-form-item label="扫码返利" class="field-full scan-item">
            <div class="scan-rebate-editor">
              <div
                class="funding-options scan-status-options"
                role="radiogroup"
                aria-label="扫码状态"
              >
                <button
                  type="button"
                  role="radio"
                  class="card-choice funding-option"
                  :class="{ 'is-selected': !isScanned }"
                  :aria-checked="!isScanned"
                  @click="setScanStatus(false)"
                >
                  <span>
                    <strong>未扫码</strong>
                    <small>返利金额为 0</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  class="card-choice funding-option"
                  :class="{ 'is-selected': isScanned }"
                  :aria-checked="isScanned"
                  @click="setScanStatus(true)"
                >
                  <span>
                    <strong>扫码</strong>
                    <small>填写原始金额</small>
                  </span>
                </button>
              </div>
              <div class="scan-money-stack">
                <label class="scan-amount-field">
                  <span>原始扫码金额</span>
                  <el-input-number
                    v-model="form.scanAmount"
                    :min="0"
                    :precision="2"
                    :controls="false"
                    :disabled="!isScanned"
                    placeholder="填写原始扫码金额"
                  />
                </label>
                <div class="scan-rebate-result" :class="{ 'is-disabled': !isScanned }">
                  <span>实际扫码金额（返利到账）</span>
                  <strong>¥{{ scanRebateAmount.toFixed(2) }}</strong>
                  <small>原始扫码金额 × 0.9</small>
                </div>
              </div>
              <div class="field-help">
                蓝色为你填写的原始金额，绿色为系统计算后的实际到账返利；实际金额不能手动修改。
              </div>
            </div>
          </el-form-item>
          <el-form-item label="备注" class="field-full compact-textarea">
            <el-input v-model="form.notes" type="textarea" :rows="2" />
          </el-form-item>
        </div>
      </section>

      <section v-if="isEditMode" class="form-panel status-panel">
        <div class="section-heading">
          <div>
            <strong>寄件与回款状态</strong>
            <span>修改状态和实际金额后，保存时会同步重新计算利润。</span>
          </div>
        </div>
        <div class="status-grid">
          <div class="status-card">
            <div class="status-card-heading">
              <strong>货物寄件</strong><span>区分未寄出、已寄出和已签收</span>
            </div>
            <div class="status-options" role="radiogroup" aria-label="寄件状态">
              <button
                v-for="option in shipmentStatusOptions"
                :key="option.value"
                type="button"
                role="radio"
                class="card-choice status-choice"
                :class="[
                  `status-${option.value.toLowerCase()}`,
                  { 'is-selected': form.shipmentStatus === option.value },
                ]"
                :aria-checked="form.shipmentStatus === option.value"
                @click="form.shipmentStatus = option.value"
              >
                {{ option.label }}
              </button>
            </div>
            <el-form-item label="寄件运单号">
              <el-input
                v-model="form.shipmentTrackingNo"
                clearable
                placeholder="多个订单可填写相同运单号"
              />
            </el-form-item>
          </div>

          <div class="status-card">
            <div class="status-card-heading">
              <strong>收货佬给我回款</strong><span>回款金额对应上方回款金额</span>
            </div>
            <div
              class="status-options status-options--three"
              role="radiogroup"
              aria-label="收货佬回款状态"
            >
              <button
                v-for="option in settlementStatusOptions"
                :key="option.value"
                type="button"
                role="radio"
                class="card-choice status-choice"
                :class="[
                  `status-${option.value.toLowerCase()}`,
                  { 'is-selected': form.receivableStatus === option.value },
                ]"
                :aria-checked="form.receivableStatus === option.value"
                @click="setReceivableStatus(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
            <div class="status-card-note">已回款时按“回款金额”自动标记，无需重复填写。</div>
          </div>

          <div class="status-card">
            <div class="status-card-heading">
              <strong>我给下单人结算</strong><span>结算金额对应上方结算金额</span>
            </div>
            <div
              class="status-options status-options--three"
              role="radiogroup"
              aria-label="给下单人结算状态"
            >
              <button
                v-for="option in submitterStatusOptions"
                :key="option.value"
                type="button"
                role="radio"
                class="card-choice status-choice"
                :class="[
                  `status-${option.value.toLowerCase()}`,
                  { 'is-selected': form.submitterSettlementStatus === option.value },
                ]"
                :aria-checked="form.submitterSettlementStatus === option.value"
                @click="setSubmitterSettlementStatus(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
            <div class="status-card-note">已结算时按“结算金额”自动标记，无需重复填写。</div>
          </div>
        </div>
        <el-form-item class="edit-reason-field">
          <template #label>
            <div class="edit-reason-label">
              <span>本次修改说明</span>
              <el-button
                text
                type="danger"
                :icon="Delete"
                :loading="clearingEditReasons"
                @click="clearAllEditReasons"
              >
                清空全部修改说明
              </el-button>
            </div>
          </template>
          <el-input
            v-model="form.editReason"
            type="textarea"
            :rows="2"
            placeholder="可选，例如：补录寄件单号并核对回款状态"
          />
        </el-form-item>
      </section>
    </el-form>

    <div class="form-actions">
      <div>
        <template v-if="!isEditMode">
          <el-button round @click="saveLocalDraft">暂存草稿</el-button>
          <el-button round @click="resetForm">清空重填</el-button>
        </template>
        <template v-else>
          <el-button round :disabled="deleting" @click="resetForm">恢复原值</el-button>
          <el-button
            type="danger"
            plain
            round
            :icon="Delete"
            :loading="deleting"
            :disabled="saving"
            @click="deleteOrder"
          >
            删除此订单
          </el-button>
        </template>
      </div>
      <div>
        <el-button v-if="props.embedded" round @click="emit('cancel')">取消</el-button>
        <el-button
          type="primary"
          round
          :icon="Check"
          :loading="saving"
          :disabled="deleting"
          @click="submitOrder"
          >{{ isEditMode ? '保存修改' : '保存订单' }}</el-button
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.order-create {
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  flex-direction: column;
  gap: 14px;
}
.order-create:not(.is-embedded) {
  padding-bottom: 24px;
}
.quick-bar,
.quick-group,
.section-heading,
.section-heading > div,
.form-actions,
.form-actions > div,
.account-option {
  display: flex;
}
.quick-bar {
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  padding: 11px 13px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.72);
  gap: 10px 18px;
}
.quick-group {
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}
.quick-group > span {
  margin-right: 2px;
  color: var(--app-muted);
  font-size: 13px;
}
.quick-actions {
  margin-left: auto;
}
.order-form {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(430px, 0.82fr);
  align-items: start;
  gap: 16px;
}
.form-panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 18px;
  background: var(--app-card);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.035);
}
.status-panel {
  grid-column: 1 / -1;
}
.section-heading {
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--app-border);
  gap: 12px;
}
.section-heading > div {
  flex-direction: column;
}
.section-heading strong {
  color: var(--app-heading);
  font-size: 15px;
}
.section-heading span {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 12px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 0 12px;
}
.form-grid :deep(.el-form-item) {
  margin-bottom: 13px;
}
.form-grid :deep(.el-select),
.form-grid :deep(.el-date-editor),
.form-grid :deep(.el-input-number) {
  width: 100%;
}
.field-third {
  grid-column: span 4;
}
.field-half {
  grid-column: span 6;
}
.field-full {
  grid-column: 1 / -1;
}
.funding-fields {
  display: grid;
  width: 100%;
  gap: 10px;
}
.funding-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 4px;
  border: 1px solid var(--app-border);
  border-radius: 15px;
  background: var(--app-hover);
  gap: 4px;
}
.funding-option {
  appearance: none;
  display: flex;
  min-width: 0;
  min-height: 56px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 11px;
  color: var(--app-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
  gap: 8px;
  transition:
    color 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}
.funding-option:hover {
  border-color: rgba(59, 130, 246, 0.24);
  background: var(--app-control);
  transform: translateY(-1px);
}
.funding-option.is-selected {
  border-color: rgba(59, 130, 246, 0.42);
  color: var(--app-primary);
  background: var(--app-card-solid);
  box-shadow: 0 5px 14px rgba(59, 130, 246, 0.11);
}
.funding-option > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.funding-option strong {
  overflow: hidden;
  font-size: 14px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.funding-option small {
  margin-top: 3px;
  overflow: hidden;
  color: var(--app-muted);
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.funding-other-input {
  max-width: 430px;
}
.funding-fields :deep(.el-input) {
  width: 100%;
}
.status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.status-card {
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: var(--app-control);
}
.status-card-heading {
  display: flex;
  margin-bottom: 10px;
  flex-direction: column;
}
.status-card-heading strong {
  color: var(--app-heading);
  font-size: 14px;
}
.status-card-heading span {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 11px;
}
.status-card-note {
  min-height: 32px;
  padding: 8px 9px;
  border-radius: 9px;
  color: var(--app-muted);
  background: var(--app-card-solid);
  font-size: 11px;
  line-height: 1.5;
}
.status-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 11px;
  gap: 5px;
}
.status-options--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.status-choice {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 31px;
  padding: 0 5px;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  color: var(--app-muted);
  background: var(--app-card-solid);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}
.status-choice:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.06);
}
.status-choice.is-selected {
  color: var(--app-heading);
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.06);
}
.status-choice.status-not_shipped.is-selected,
.status-choice.status-unpaid.is-selected {
  border-color: rgba(100, 116, 139, 0.28);
  color: #475569;
  background: rgba(148, 163, 184, 0.14);
}
.status-choice.status-shipped.is-selected {
  border-color: rgba(37, 99, 235, 0.28);
  color: #2563eb;
  background: rgba(59, 130, 246, 0.12);
}
.status-choice.status-delivered.is-selected,
.status-choice.status-paid.is-selected {
  border-color: rgba(5, 150, 105, 0.28);
  color: #047857;
  background: rgba(16, 185, 129, 0.13);
}
.status-choice.status-exception.is-selected {
  border-color: rgba(220, 38, 38, 0.26);
  color: #dc2626;
  background: rgba(239, 68, 68, 0.11);
}
.status-card :deep(.el-form-item) {
  margin-bottom: 0;
}
.edit-reason-field {
  margin: 12px 0 0 !important;
}
.edit-reason-label {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.edit-reason-label :deep(.el-button) {
  height: auto;
  padding: 0;
}
.scan-rebate-editor {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}
.scan-item :deep(.el-form-item__content) {
  min-width: 0;
}
.scan-status-options {
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.scan-money-stack {
  display: grid;
  min-width: 0;
  gap: 7px;
}
.scan-amount-field,
.scan-rebate-result {
  display: grid;
  width: 100%;
  min-height: 60px;
  min-width: 0;
  box-sizing: border-box;
  grid-template-columns: minmax(0, 1fr) minmax(112px, 150px);
  align-items: center;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  gap: 3px 10px;
}
.scan-amount-field {
  border-color: rgba(37, 99, 235, 0.22);
  color: #2563eb;
  background: rgba(59, 130, 246, 0.08);
}
.scan-amount-field > span,
.scan-rebate-result > span {
  min-width: 0;
  font-size: 12px;
  font-weight: 750;
  overflow-wrap: anywhere;
}
.scan-amount-field :deep(.el-input-number) {
  width: 100%;
  min-width: 0;
  grid-row: 1 / span 2;
  grid-column: 2;
}
.scan-rebate-result {
  min-height: 48px;
  padding-block: 5px;
  border-color: rgba(5, 150, 105, 0.24);
  color: #047857;
  background: rgba(16, 185, 129, 0.09);
  line-height: 1.2;
}
.scan-rebate-result strong {
  min-width: 0;
  grid-row: 1 / span 2;
  grid-column: 2;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.scan-rebate-result small {
  color: #059669;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.scan-rebate-result.is-disabled {
  opacity: 0.62;
}
.scan-rebate-editor > .field-help {
  max-width: 100%;
  margin-top: 0;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.compact-textarea :deep(.el-textarea__inner) {
  min-height: 58px !important;
}
.address-quick-actions {
  display: flex;
  width: 100%;
  align-items: center;
  margin-top: 6px;
  gap: 7px;
}
.address-quick-actions > span {
  color: var(--app-muted);
  font-size: 12px;
}
.field-help {
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
}
.account-option {
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.account-option small {
  color: #94a3b8;
}
.form-actions {
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}
.order-create.is-embedded .form-actions {
  position: sticky;
  z-index: 5;
  bottom: -18px;
  margin: 0 -20px -18px;
  padding: 12px 20px 14px;
  background: var(--app-card-solid);
  box-shadow: 0 -10px 24px rgba(15, 23, 42, 0.05);
}
.form-actions > div {
  gap: 8px;
}
@media (max-width: 1180px) {
  .order-form {
    grid-template-columns: 1fr;
  }
  .status-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .field-third,
  .field-half,
  .field-full {
    grid-column: 1 / -1;
  }
  .scan-rebate-editor {
    grid-template-columns: 1fr;
  }
  .quick-actions {
    width: 100%;
    margin-left: 0;
  }
  .form-actions {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }
  .form-actions > div {
    width: 100%;
  }
  .form-actions :deep(.el-button) {
    min-width: 0;
    flex: 1;
  }
  .order-create.is-embedded .form-actions {
    bottom: -14px;
    margin: 0 -15px -14px;
    padding: 10px 15px 12px;
  }
  .section-heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .scan-amount-field,
  .scan-rebate-result {
    grid-template-columns: minmax(0, 1fr) minmax(96px, 120px);
  }
  .funding-options {
    grid-template-columns: 1fr;
  }
  .funding-option {
    min-height: 50px;
  }
}
</style>
