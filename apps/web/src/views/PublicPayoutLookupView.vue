<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getApiErrorMessage } from '../lib/api-error';
import { formatBusinessDate } from '../lib/business-date';
import { http } from '../lib/http';
import { useSystemStore } from '../stores/system';

type PayoutType = 'WECHAT' | 'ALIPAY' | 'BANK_CARD';
type PayoutStatus = 'PENDING' | 'ACTIVE' | 'DISABLED';
type SettlementStatus = 'UNPAID' | 'PAID' | 'EXCEPTION';
type PayoutQueryFieldKey = string;

const system = useSystemStore();

interface PayoutQueryFieldOption {
  key: PayoutQueryFieldKey;
  orderColumnKey: string;
  label: string;
  description: string;
  width?: number;
  minWidth?: number;
  defaultVisible: boolean;
  publicAllowed: boolean;
  sensitive?: boolean;
  customFieldId?: string;
  customFieldType?: string;
}

const fallbackQueryFieldOptions: PayoutQueryFieldOption[] = [
  {
    key: 'orderedAt',
    orderColumnKey: 'orderedAt',
    label: '下单日期',
    description: '订单实际下单日期和时间',
    width: 106,
    defaultVisible: true,
    publicAllowed: true,
  },
  {
    key: 'schemeName',
    orderColumnKey: 'product',
    label: '商品/方案*数量',
    description: '商品或方案名称及数量',
    minWidth: 150,
    defaultVisible: true,
    publicAllowed: true,
  },
  {
    key: 'platformTrackingNo',
    orderColumnKey: 'inboundTrackingNo',
    label: '平台运单号',
    description: '平台发货产生的运单号',
    minWidth: 130,
    defaultVisible: true,
    publicAllowed: true,
  },
  {
    key: 'shipmentTrackingNo',
    orderColumnKey: 'shipmentTrackingNo',
    label: '寄件运单号',
    description: '寄给下单人的寄件运单号',
    minWidth: 130,
    defaultVisible: true,
    publicAllowed: true,
  },
  {
    key: 'orderAmount',
    orderColumnKey: 'orderAmount',
    label: '下单金额',
    description: '订单下单金额',
    width: 100,
    defaultVisible: true,
    publicAllowed: true,
  },
  {
    key: 'settlementAmount',
    orderColumnKey: 'submitterSettlementAmount',
    label: '结算金额',
    description: '给下单人的结算金额',
    width: 100,
    defaultVisible: true,
    publicAllowed: true,
  },
  {
    key: 'settlementStatus',
    orderColumnKey: 'submitterSettlementStatus',
    label: '结算状态',
    description: '未结算、已结算或异常',
    width: 92,
    defaultVisible: true,
    publicAllowed: true,
  },
];

interface RegistrationData {
  enabled: boolean;
  linked: boolean;
  identityCode: string;
  nickname: string;
  visibleFields: PayoutQueryFieldKey[];
  fieldOptions: PayoutQueryFieldOption[];
}

interface PayoutMethod {
  id: string;
  type: PayoutType;
  label: string;
  accountName: string | null;
  accountMasked: string | null;
  bankName: string | null;
  isDefault: boolean;
  status: PayoutStatus;
  updatedAt: string;
}

interface HistoryOrder {
  [key: string]: unknown;
  orderedAt?: string;
  settlementStatus?: SettlementStatus;
}

interface LookupResult {
  identityCode: string;
  nickname: string;
  visibleFields: PayoutQueryFieldKey[];
  fieldOptions: PayoutQueryFieldOption[];
  payoutMethods: PayoutMethod[];
  orders: {
    items: HistoryOrder[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

const route = useRoute();
const token = computed(() => String(route.params.token));
const loading = ref(true);
const querying = ref(false);
const loadError = ref('');
const lookupError = ref('');
const registration = ref<RegistrationData | null>(null);
const lookupCode = ref('');
const result = ref<LookupResult | null>(null);
const manualEntry = ref(false);
const autoRecognitionFailed = ref(false);

const visibleOrderFields = computed(() => {
  const keys = result.value?.visibleFields ?? registration.value?.visibleFields ?? [];
  const fields = result.value?.fieldOptions ?? registration.value?.fieldOptions ?? [];
  return fields.filter((field) => keys.includes(field.key));
});

const orderGridColumns = computed(
  () =>
    visibleOrderFields.value
      .map((field) =>
        field.width ? `${field.width}px` : `minmax(${field.minWidth ?? 120}px, 1fr)`,
      )
      .join(' ') || 'minmax(0, 1fr)',
);

const orderGridStyle = computed(
  () => ({ '--query-grid-columns': orderGridColumns.value }) as Record<string, string>,
);

const moneyFieldKeys = new Set([
  'orderAmount',
  'settlementAmount',
  'paymentDiscountAmount',
  'platformRebateAmount',
  'saleAmount',
  'profit',
]);

const shipmentStatusLabels: Record<string, string> = {
  NOT_SHIPPED: '未寄出',
  SHIPPED: '已寄出',
  DELIVERED: '已签收',
  EXCEPTION: '异常',
};

const fundingTypeLabels: Record<string, string> = {
  SELF_PAID: '自己付',
  SUBMITTER_ADVANCED: '代付',
  OTHER: '其他',
};

const isMoneyField = (key: string) => moneyFieldKeys.has(key);
const fieldValue = (order: HistoryOrder, key: string) => order[key];
const fieldText = (order: HistoryOrder, field: PayoutQueryFieldOption) => {
  const value = fieldValue(order, field.key);
  if (value === null || value === undefined || value === '') return '-';
  if (field.key === 'orderedAt') return formatBusinessDate(String(value));
  if (field.key === 'shipmentStatus') return shipmentStatusLabels[String(value)] ?? String(value);
  if (field.key === 'fundingType') return fundingTypeLabels[String(value)] ?? String(value);
  if (field.key === 'settlementStatus')
    return settlementLabels[String(value) as SettlementStatus] ?? String(value);
  if (field.key === 'editReasonHistory' && Array.isArray(value)) {
    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return String(entry);
        const record = entry as { createdAt?: string; reason?: string };
        const timestamp = record.createdAt ? formatBusinessDate(record.createdAt) : '';
        return [timestamp, record.reason].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join('；');
  }
  if (isMoneyField(field.key) || field.customFieldType === 'MONEY') {
    return `¥${money(value as string | number)}`;
  }
  if (field.customFieldType === 'BOOLEAN') {
    if (value === true || value === 'true' || value === 1) return '是';
    if (value === false || value === 'false' || value === 0) return '否';
  }
  if (field.customFieldType === 'DATE') return String(value).slice(0, 10);
  if (field.customFieldType === 'DATETIME') return String(value).replace('T', ' ').slice(0, 16);
  if (Array.isArray(value)) return value.join('、');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const fieldClass = (field: PayoutQueryFieldOption) => ({
  'scheme-cell': field.key === 'schemeName',
  'tracking-cell': field.key === 'platformTrackingNo' || field.key === 'shipmentTrackingNo',
  'money-cell': isMoneyField(field.key) || field.customFieldType === 'MONEY',
  'settlement-money': field.key === 'settlementAmount',
});
const settlementTagType = (order: HistoryOrder) =>
  settlementTypes[String(fieldValue(order, 'settlementStatus')) as SettlementStatus] ?? 'info';

const payoutTypeLabels: Record<PayoutType, string> = {
  WECHAT: '微信转账',
  ALIPAY: '支付宝',
  BANK_CARD: '银行卡转账',
};

const payoutStatusLabels: Record<PayoutStatus, string> = {
  PENDING: '待管理员确认',
  ACTIVE: '已启用',
  DISABLED: '已停用',
};

const payoutStatusTypes: Record<PayoutStatus, 'warning' | 'success' | 'info'> = {
  PENDING: 'warning',
  ACTIVE: 'success',
  DISABLED: 'info',
};

const settlementLabels: Record<SettlementStatus, string> = {
  UNPAID: '未结算',
  PAID: '已结算',
  EXCEPTION: '异常',
};

const settlementTypes: Record<SettlementStatus, 'danger' | 'success' | 'warning'> = {
  UNPAID: 'danger',
  PAID: 'success',
  EXCEPTION: 'warning',
};

const normalizeCode = (value: string) => value.trim().toUpperCase();
const money = (value: string | number | undefined) => Number(value || 0).toFixed(2);

const payoutDescription = (method: PayoutMethod) => {
  if (method.type === 'WECHAT') return `按微信昵称“${result.value?.nickname ?? ''}”转账`;
  if (method.type === 'ALIPAY') return `支付宝账号：${method.accountMasked || '未填写'}`;
  return [method.accountName, method.bankName, method.accountMasked].filter(Boolean).join(' · ');
};

const queryHistory = async (page = 1, options: { silent?: boolean; automatic?: boolean } = {}) => {
  const silent = options.silent === true;
  const automatic = options.automatic === true;
  const identityCode = normalizeCode(lookupCode.value);
  if (!identityCode) {
    if (!silent) ElMessage.warning('请输入下单人识别码');
    return;
  }

  querying.value = true;
  lookupError.value = '';
  try {
    const response = await http.post<LookupResult>(`/public/payout-query/${token.value}/lookup`, {
      identityCode,
      page,
      pageSize: 20,
    });
    result.value = response.data;
    lookupCode.value = response.data.identityCode;
    registration.value = {
      enabled: registration.value?.enabled ?? true,
      linked: true,
      identityCode: response.data.identityCode,
      nickname: response.data.nickname,
      visibleFields: response.data.visibleFields,
      fieldOptions:
        response.data.fieldOptions ?? registration.value?.fieldOptions ?? fallbackQueryFieldOptions,
    };
    manualEntry.value = false;
    autoRecognitionFailed.value = false;
    if (!silent) ElMessage.success('查询成功');
  } catch (error) {
    const message = getApiErrorMessage(error, '查询失败，请检查识别码后重试');
    lookupError.value = message;
    if (automatic) {
      result.value = null;
      lookupCode.value = '';
      manualEntry.value = true;
      autoRecognitionFailed.value = true;
      if (registration.value) {
        registration.value = {
          ...registration.value,
          linked: false,
          identityCode: '',
          nickname: '',
        };
      }
    } else if (manualEntry.value) {
      result.value = null;
    }
    if (!silent) ElMessage.error(lookupError.value);
  } finally {
    querying.value = false;
  }
};

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const response = await http.get<RegistrationData>(`/public/payout-query/${token.value}`);
    registration.value = response.data;
    registration.value.fieldOptions = response.data.fieldOptions?.length
      ? response.data.fieldOptions
      : fallbackQueryFieldOptions;
    if (!response.data.enabled) {
      manualEntry.value = false;
      result.value = null;
      return;
    }
    if (response.data.linked) {
      manualEntry.value = false;
      lookupCode.value = response.data.identityCode;
      await queryHistory(1, { silent: true, automatic: true });
    } else {
      manualEntry.value = true;
      autoRecognitionFailed.value = false;
    }
  } catch (error) {
    registration.value = null;
    loadError.value = getApiErrorMessage(error, '查询页面加载失败');
  } finally {
    loading.value = false;
  }
};

const beginManualEntry = () => {
  manualEntry.value = true;
  autoRecognitionFailed.value = false;
  lookupError.value = '';
  lookupCode.value = '';
  result.value = null;
};

onMounted(() => void load());
</script>

<template>
  <div class="lookup-page">
    <header class="lookup-header">
      <div class="brand-mark" :class="{ 'is-long': (system.brandMarkText || '浪姐').length > 2 }">
        {{ system.brandMarkText || '浪姐' }}
      </div>
      <div class="brand-copy">
        <strong>我的回款与订单</strong>
        <span>通过下单人唯一识别码，只读查询本人记录</span>
      </div>
    </header>

    <main v-loading="loading" class="lookup-shell">
      <el-result v-if="loadError" icon="error" title="查询链接暂时不可用" :sub-title="loadError">
        <template #extra>
          <el-button type="primary" round @click="load">重新加载</el-button>
        </template>
      </el-result>

      <el-result
        v-else-if="registration && !registration.enabled"
        icon="warning"
        title="订单查询已关闭"
        sub-title="管理员当前关闭了订单查询功能，请稍后再试。"
      />

      <template v-else>
        <section v-if="manualEntry" class="query-panel">
          <div class="query-heading">
            <div>
              <span class="step-mark">查</span>
              <div>
                <strong>
                  {{
                    autoRecognitionFailed ? '自动识别失败，请重新输入识别码' : '输入下单人识别码'
                  }}
                </strong>
                <small>
                  {{
                    autoRecognitionFailed
                      ? '当前设备没有识别到有效资料，验证成功后会重新记住本设备'
                      : '首次查询或更换手机后，输入此前保存的下单人识别码即可查询'
                  }}
                </small>
              </div>
            </div>
            <span class="privacy-pill">仅本人持码查询</span>
          </div>

          <div class="query-row">
            <el-input
              v-model="lookupCode"
              size="large"
              clearable
              maxlength="50"
              autocomplete="off"
              placeholder="例如：WX-8F2K7M9P4Q"
              @input="lookupCode = normalizeCode(lookupCode)"
              @keyup.enter="queryHistory(1)"
            />
            <el-button
              type="primary"
              size="large"
              round
              :loading="querying"
              @click="queryHistory(1)"
            >
              查询我的记录
            </el-button>
          </div>

          <p v-if="lookupError" class="lookup-error">{{ lookupError }}</p>
          <p v-else class="query-tip">
            识别码由系统在你首次公开提交后生成。后台手工建立的资料在本人提交前不会生成识别码。
          </p>
        </section>

        <section v-else-if="result" class="query-panel recognized-panel">
          <div class="query-heading">
            <div>
              <span class="step-mark recognized-mark">✓</span>
              <div>
                <strong>已识别当前下单人：{{ result.nickname }}</strong>
                <small>本设备已记住身份，下次打开此查询链接会直接进入，无需再次输入</small>
              </div>
            </div>
            <div class="recognized-actions">
              <span class="recognized-pill">已自动进入</span>
              <el-button class="change-code-button" text @click="beginManualEntry">
                重新输入识别码
              </el-button>
            </div>
          </div>
        </section>

        <template v-if="result">
          <section class="profile-summary">
            <div>
              <small>微信昵称</small>
              <strong>{{ result.nickname }}</strong>
            </div>
            <div>
              <small>下单人识别码</small>
              <strong class="identity-code">{{ result.identityCode }}</strong>
            </div>
            <div>
              <small>历史订单</small>
              <strong>{{ result.orders.total }} 笔</strong>
            </div>
            <span class="readonly-badge">只读查看</span>
          </section>

          <section class="content-card payout-card">
            <div class="section-title">
              <div>
                <strong>已登记回款信息</strong>
                <span>账号及银行卡号仅显示脱敏内容</span>
              </div>
              <span>{{ result.payoutMethods.length }} 种</span>
            </div>

            <div v-if="result.payoutMethods.length" class="payout-list">
              <article v-for="method in result.payoutMethods" :key="method.id" class="payout-item">
                <span class="method-icon">{{ payoutTypeLabels[method.type].slice(0, 1) }}</span>
                <div class="method-copy">
                  <div>
                    <strong>{{ payoutTypeLabels[method.type] }}</strong>
                    <el-tag v-if="method.isDefault" size="small" type="primary" effect="light">
                      常用
                    </el-tag>
                  </div>
                  <p>{{ payoutDescription(method) }}</p>
                </div>
                <el-tag :type="payoutStatusTypes[method.status]" size="small" effect="light">
                  {{ payoutStatusLabels[method.status] }}
                </el-tag>
              </article>
            </div>
            <el-empty v-else description="暂未登记回款方式" :image-size="72" />
          </section>

          <section class="content-card orders-card">
            <div class="section-title">
              <div>
                <strong>历史订单</strong>
                <span>仅展示管理员开放的下单及结算信息，不支持修改</span>
              </div>
              <span>共 {{ result.orders.total }} 笔</span>
            </div>

            <div
              v-if="result.orders.items.length && visibleOrderFields.length"
              class="orders-table"
            >
              <div class="order-grid order-header" :style="orderGridStyle" aria-hidden="true">
                <span v-for="field in visibleOrderFields" :key="field.key">{{ field.label }}</span>
              </div>
              <article
                v-for="(order, index) in result.orders.items"
                :key="`${order.orderedAt ?? index}-${index}`"
                class="order-grid order-row"
                :style="orderGridStyle"
              >
                <span
                  v-for="field in visibleOrderFields"
                  :key="field.key"
                  :class="fieldClass(field)"
                  :data-label="field.label"
                >
                  <template v-if="field.key === 'settlementStatus'">
                    <el-tag :type="settlementTagType(order)" size="small" effect="light">
                      {{ fieldText(order, field) }}
                    </el-tag>
                  </template>
                  <template v-else-if="field.key === 'shipmentStatus'">
                    <el-tag size="small" effect="light">
                      {{ fieldText(order, field) }}
                    </el-tag>
                  </template>
                  <template v-else>{{ fieldText(order, field) }}</template>
                </span>
              </article>
            </div>
            <el-empty
              v-else-if="result.orders.items.length"
              description="管理员暂未开放历史订单分类"
              :image-size="82"
            />
            <el-empty v-else description="暂时没有历史订单" :image-size="82" />

            <el-pagination
              v-if="result.orders.totalPages > 1 && visibleOrderFields.length"
              class="history-pagination"
              background
              layout="prev, pager, next"
              :current-page="result.orders.page"
              :page-size="result.orders.pageSize"
              :total="result.orders.total"
              :disabled="querying"
              @current-change="queryHistory"
            />
          </section>
        </template>

        <section v-else-if="!querying && !manualEntry" class="empty-guide">
          <div class="shield-icon">码</div>
          <strong>正在自动识别</strong>
          <p>系统正在读取当前设备已经绑定的下单人资料。</p>
        </section>
      </template>
    </main>

    <footer>下单登记与资金结算系统</footer>
  </div>
</template>

<style scoped>
.lookup-page {
  /* 公开查询页在全局 +1px 基础上再放大 2px。 */
  --el-font-size-extra-large: 23px;
  --el-font-size-large: 21px;
  --el-font-size-medium: 19px;
  --el-font-size-base: 17px;
  --el-font-size-small: 16px;
  --el-font-size-extra-small: 15px;
  --el-result-title-font-size: 23px;
  min-height: 100vh;
  padding: 18px 14px 30px;
  color: #334155;
  background:
    radial-gradient(circle at 12% 0, rgba(96, 165, 250, 0.2), transparent 32%),
    linear-gradient(180deg, #eef6ff 0, #f6f8fb 320px);
}

.lookup-header,
.lookup-shell,
footer {
  width: min(1160px, 100%);
  margin-right: auto;
  margin-left: auto;
}

.lookup-header {
  display: flex;
  align-items: center;
  padding: 3px 2px 16px;
  gap: 11px;
}

.brand-mark {
  display: grid;
  width: 50px;
  height: 50px;
  flex: 0 0 50px;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(145deg, #60a5fa, #2563eb);
  box-shadow: 0 9px 22px rgba(37, 99, 235, 0.22);
  font-size: 16px;
  font-weight: 800;
}

.brand-mark.is-long {
  font-size: 11px;
  letter-spacing: 0;
}

.brand-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.brand-copy strong {
  color: #0f172a;
  font-size: 20px;
}

.brand-copy span {
  margin-top: 2px;
  color: #64748b;
  font-size: 14px;
}

.lookup-shell {
  min-height: 320px;
}

.query-panel,
.profile-summary,
.content-card,
.empty-guide {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 46px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(16px);
}

.query-panel {
  padding: 20px;
}

.recognized-panel {
  border-color: rgba(34, 197, 94, 0.22);
  background: rgba(248, 255, 251, 0.92);
}

.query-heading,
.query-heading > div,
.query-row,
.section-title,
.payout-item,
.method-copy > div,
.profile-summary {
  display: flex;
  align-items: center;
}

.query-heading {
  justify-content: space-between;
  gap: 18px;
}

.query-heading > div {
  min-width: 0;
  gap: 11px;
}

.step-mark,
.method-icon,
.shield-icon {
  display: grid;
  place-items: center;
  color: #2563eb;
  background: #eaf2ff;
  font-weight: 800;
}

.step-mark {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 11px;
  font-size: 14px;
}

.query-heading > div > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.query-heading strong,
.section-title strong {
  color: #0f172a;
  font-size: 18px;
}

.query-heading small,
.section-title div span {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 13px;
}

.privacy-pill,
.readonly-badge {
  flex: 0 0 auto;
  border-radius: 999px;
  color: #2563eb;
  background: #eef5ff;
  font-size: 13px;
}

.privacy-pill {
  padding: 6px 10px;
}

.recognized-mark {
  color: #15803d;
  background: #dcfce7;
}

.recognized-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
}

.recognized-pill {
  padding: 6px 10px;
  border-radius: 999px;
  color: #15803d;
  background: #dcfce7;
  font-size: 13px;
}

.change-code-button {
  padding-right: 7px;
  padding-left: 7px;
  color: #64748b;
  font-size: 14px;
}

.query-row {
  margin-top: 17px;
  gap: 10px;
}

.query-row :deep(.el-input__wrapper) {
  border-radius: 14px;
}

.query-row :deep(.el-input__inner) {
  color: #1e40af;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.query-row :deep(.el-button) {
  min-width: 160px;
}

.query-tip,
.lookup-error {
  margin: 10px 2px 0;
  font-size: 13px;
  line-height: 1.6;
}

.query-tip {
  color: #94a3b8;
}

.lookup-error {
  color: #dc2626;
}

.profile-summary {
  position: relative;
  margin-top: 14px;
  padding: 16px 20px;
  gap: 52px;
}

.profile-summary > div {
  display: flex;
  flex-direction: column;
}

.profile-summary small {
  color: #94a3b8;
  font-size: 13px;
}

.profile-summary strong {
  margin-top: 3px;
  color: #0f172a;
  font-size: 17px;
}

.profile-summary .identity-code {
  color: #2563eb;
  letter-spacing: 0.04em;
}

.readonly-badge {
  margin-left: auto;
  padding: 6px 10px;
}

.content-card {
  margin-top: 14px;
  padding: 20px;
}

.section-title {
  justify-content: space-between;
  margin-bottom: 15px;
  gap: 16px;
}

.section-title > div {
  display: flex;
  flex-direction: column;
}

.section-title > span {
  color: #64748b;
  font-size: 14px;
}

.payout-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.payout-item {
  min-width: 0;
  padding: 13px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fbfdff;
  gap: 10px;
}

.method-icon {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 11px;
  font-size: 14px;
}

.method-copy {
  min-width: 0;
  flex: 1;
}

.method-copy > div {
  gap: 6px;
}

.method-copy strong {
  color: #0f172a;
  font-size: 15px;
}

.method-copy p {
  margin: 4px 0 0;
  overflow: hidden;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.orders-table {
  overflow: hidden;
  border: 1px solid #e5eaf1;
  border-radius: 16px;
}

.order-grid {
  display: grid;
  grid-template-columns: var(--query-grid-columns);
  align-items: center;
  gap: 10px;
}

.order-header {
  min-height: 42px;
  padding: 0 14px;
  color: #64748b;
  background: #f5f8fc;
  font-size: 13px;
}

.order-row {
  min-height: 58px;
  padding: 9px 14px;
  color: #334155;
  background: #fff;
  font-size: 14px;
}

.order-row:nth-child(odd) {
  background: #fbfdff;
}

.order-row + .order-row {
  border-top: 1px solid #edf1f6;
}

.scheme-cell,
.tracking-cell {
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.scheme-cell {
  color: #0f172a;
  font-weight: 600;
}

.tracking-cell {
  color: #475569;
}

.money-cell {
  color: #475569;
  font-variant-numeric: tabular-nums;
}

.settlement-money {
  color: #dc2626;
  font-weight: 700;
}

.history-pagination {
  justify-content: center;
  margin-top: 16px;
}

.empty-guide {
  display: flex;
  align-items: center;
  margin-top: 14px;
  padding: 34px 20px;
  flex-direction: column;
  text-align: center;
}

.shield-icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  font-size: 17px;
}

.empty-guide strong {
  margin-top: 12px;
  color: #0f172a;
  font-size: 17px;
}

.empty-guide p {
  max-width: 480px;
  margin: 6px 0 0;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.7;
}

footer {
  padding-top: 18px;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
}

@media (max-width: 860px) {
  .payout-list {
    grid-template-columns: 1fr;
  }

  .order-header {
    display: none;
  }

  .orders-table {
    overflow: visible;
    border: 0;
  }

  .order-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .order-row,
  .order-row:nth-child(odd) {
    min-height: 0;
    padding: 14px;
    border: 1px solid #e5eaf1;
    border-radius: 16px;
    background: #fff;
    gap: 12px 18px;
  }

  .order-row + .order-row {
    margin-top: 10px;
    border-top: 1px solid #e5eaf1;
  }

  .order-row > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  .order-row > span::before {
    color: #94a3b8;
    content: attr(data-label);
    font-size: 12px;
    font-weight: 400;
  }

  .scheme-cell {
    grid-column: 1 / -1;
  }
}

@media (max-width: 560px) {
  .lookup-page {
    padding: 13px 10px 24px;
  }

  .lookup-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .query-panel,
  .profile-summary,
  .content-card,
  .empty-guide {
    border-radius: 18px;
  }

  .query-panel,
  .content-card {
    padding: 15px;
  }

  .query-heading {
    align-items: flex-start;
  }

  .recognized-panel .query-heading {
    flex-direction: column;
  }

  .recognized-actions {
    width: 100%;
    justify-content: space-between;
    padding-left: 47px;
  }

  .privacy-pill {
    display: none;
  }

  .query-row {
    align-items: stretch;
    flex-direction: column;
  }

  .query-row :deep(.el-button) {
    width: 100%;
    min-width: 0;
  }

  .profile-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 15px;
    gap: 15px;
  }

  .profile-summary > div:nth-child(2) {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .readonly-badge {
    position: absolute;
    top: 14px;
    right: 14px;
  }

  .order-grid {
    grid-template-columns: 1fr !important;
  }

  .scheme-cell {
    grid-column: 1;
  }

  .payout-item {
    align-items: flex-start;
  }
}
</style>
