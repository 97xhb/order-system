<script setup lang="ts">
import { CircleCheck, Delete, Plus, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

type RuleScope = 'GLOBAL' | 'SCHEME';
type RuleOperation = 'ADD' | 'SUBTRACT';
type SourceType = 'FIELD' | 'FIXED';
type RuleField =
  | 'PAYMENT_DISCOUNT_AMOUNT'
  | 'ORDER_AMOUNT'
  | 'SUBMITTER_SETTLEMENT_AMOUNT'
  | 'PLATFORM_REBATE_AMOUNT'
  | 'CUSTOMER_RECEIVED_AMOUNT';

interface RuleTerm {
  id: number;
  operation: RuleOperation;
  sourceType: SourceType;
  field: RuleField;
  fixedAmount: string;
  coefficient: string;
}

interface StoredRuleTerm {
  operation: RuleOperation;
  field?: RuleField;
  fixedAmount?: string | number;
  coefficient?: string | number;
}

interface StoredRuleDefinition {
  schemaVersion: 1;
  terms: StoredRuleTerm[];
  roundingScale?: number;
}

interface ProfitRuleVersion {
  id: string;
  name: string;
  scope: 'GLOBAL' | 'SCHEME' | 'CATEGORY' | 'FUNDING_TYPE';
  version: number;
  definition: StoredRuleDefinition;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  scheme: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  fundingType: string | null;
  createdBy: { id: string; displayName: string } | null;
}

interface ProfitRuleListResponse {
  items: ProfitRuleVersion[];
  options: {
    schemes: Array<{ id: string; name: string }>;
    amountFields: Array<{ value: RuleField; label: string }>;
  };
}

const fallbackFieldOptions: Array<{ value: RuleField; label: string }> = [
  { value: 'PAYMENT_DISCOUNT_AMOUNT', label: '支付优惠' },
  { value: 'ORDER_AMOUNT', label: '下单金额' },
  { value: 'SUBMITTER_SETTLEMENT_AMOUNT', label: '结算金额' },
  { value: 'PLATFORM_REBATE_AMOUNT', label: '扫码返利' },
  { value: 'CUSTOMER_RECEIVED_AMOUNT', label: '回款金额' },
];
const fieldOptions = ref<Array<{ value: RuleField; label: string }>>([...fallbackFieldOptions]);
const sampleFieldOptions = computed(() => fieldOptions.value);

const rule = reactive({
  name: '默认利润规则',
  scope: 'GLOBAL' as RuleScope,
  schemeId: '',
  roundingScale: 2,
});
const loading = ref(false);
const saving = ref(false);
const currentVersion = ref(1);
const history = ref<ProfitRuleVersion[]>([]);
const schemeOptions = ref<Array<{ id: string; name: string }>>([]);

let nextTermId = 5;
const terms = ref<RuleTerm[]>([
  {
    id: 1,
    operation: 'ADD',
    sourceType: 'FIELD',
    field: 'CUSTOMER_RECEIVED_AMOUNT',
    fixedAmount: '0',
    coefficient: '1',
  },
  {
    id: 2,
    operation: 'SUBTRACT',
    sourceType: 'FIELD',
    field: 'SUBMITTER_SETTLEMENT_AMOUNT',
    fixedAmount: '0',
    coefficient: '1',
  },
  {
    id: 3,
    operation: 'ADD',
    sourceType: 'FIELD',
    field: 'PAYMENT_DISCOUNT_AMOUNT',
    fixedAmount: '0',
    coefficient: '1',
  },
  {
    id: 4,
    operation: 'ADD',
    sourceType: 'FIELD',
    field: 'PLATFORM_REBATE_AMOUNT',
    fixedAmount: '0',
    coefficient: '1',
  },
]);

const sampleAmounts = reactive<Record<RuleField, string>>({
  PAYMENT_DISCOUNT_AMOUNT: '20',
  ORDER_AMOUNT: '800',
  SUBMITTER_SETTLEMENT_AMOUNT: '800',
  PLATFORM_REBATE_AMOUNT: '30',
  CUSTOMER_RECEIVED_AMOUNT: '1000',
});

const parseScaledInteger = (value: string, scale: number) => {
  const normalized = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(normalized);
  if (!match) return 0n;

  const fraction = (match[3] ?? '').slice(0, scale).padEnd(scale, '0');
  const absolute = BigInt(match[2]) * 10n ** BigInt(scale) + BigInt(fraction || '0');
  return match[1] === '-' ? -absolute : absolute;
};

const multiplyCents = (amountCents: bigint, coefficient: string) => {
  const coefficientScale = 10_000n;
  const scaledCoefficient = parseScaledInteger(coefficient || '1', 4);
  return (amountCents * scaledCoefficient) / coefficientScale;
};

const previewCents = computed(() =>
  terms.value.reduce((total, term) => {
    const source = term.sourceType === 'FIELD' ? sampleAmounts[term.field] : term.fixedAmount;
    const amount = multiplyCents(parseScaledInteger(source || '0', 2), term.coefficient);
    return term.operation === 'ADD' ? total + amount : total - amount;
  }, 0n),
);

const formatCents = (value: bigint) => {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}¥${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};

const previewFormula = computed(() =>
  terms.value
    .map((term, index) => {
      const operation =
        index === 0 && term.operation === 'ADD' ? '' : term.operation === 'ADD' ? '+' : '-';
      const source =
        term.sourceType === 'FIELD'
          ? fieldOptions.value.find((field) => field.value === term.field)?.label
          : `固定金额 ${term.fixedAmount || '0'}`;
      const coefficient =
        term.coefficient && term.coefficient !== '1' ? ` × ${term.coefficient}` : '';
      return `${operation} ${source ?? ''}${coefficient}`.trim();
    })
    .join(' '),
);

const addTerm = () => {
  terms.value.push({
    id: nextTermId++,
    operation: 'SUBTRACT',
    sourceType: 'FIELD',
    field: 'SUBMITTER_SETTLEMENT_AMOUNT',
    fixedAmount: '0',
    coefficient: '1',
  });
};

const removeTerm = (id: number) => {
  if (terms.value.length === 1) return;
  terms.value = terms.value.filter((term) => term.id !== id);
};

const loadRuleIntoEditor = (item: ProfitRuleVersion) => {
  if (item.scope !== 'GLOBAL' && item.scope !== 'SCHEME') {
    ElMessage.warning('当前页面先支持编辑全局和方案规则');
    return;
  }

  rule.name = item.name;
  rule.scope = item.scope;
  rule.schemeId = item.scheme?.id ?? '';
  rule.roundingScale = item.definition.roundingScale ?? 2;
  currentVersion.value = item.version;
  terms.value = item.definition.terms.map((term) => ({
    id: nextTermId++,
    operation: term.operation,
    sourceType: term.field ? 'FIELD' : 'FIXED',
    field: term.field ?? 'SUBMITTER_SETTLEMENT_AMOUNT',
    fixedAmount: String(term.fixedAmount ?? 0),
    coefficient: String(term.coefficient ?? 1),
  }));
};

const loadRules = async (preferredId?: string) => {
  loading.value = true;
  try {
    const response = await http.get<ProfitRuleListResponse>('/admin/profit-rules');
    history.value = response.data.items;
    schemeOptions.value = response.data.options.schemes;
    fieldOptions.value = response.data.options.amountFields?.length
      ? response.data.options.amountFields
      : [...fallbackFieldOptions];

    const preferred = preferredId
      ? history.value.find((item) => item.id === preferredId)
      : history.value.find(
          (item) =>
            item.status === 'ACTIVE' &&
            item.scope === rule.scope &&
            (item.scope !== 'SCHEME' || item.scheme?.id === rule.schemeId),
        );
    const activeGlobal = history.value.find(
      (item) => item.scope === 'GLOBAL' && item.status === 'ACTIVE',
    );
    if (preferred ?? activeGlobal) loadRuleIntoEditor(preferred ?? activeGlobal!);
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '利润规则加载失败'));
  } finally {
    loading.value = false;
  }
};

const saveRule = async () => {
  if (!rule.name.trim()) {
    ElMessage.warning('请填写规则名称');
    return;
  }
  if (rule.scope === 'SCHEME' && !rule.schemeId) {
    ElMessage.warning('请选择下单方案');
    return;
  }

  saving.value = true;
  try {
    const response = await http.post<{ id: string }>('/admin/profit-rules', {
      name: rule.name.trim(),
      scope: rule.scope,
      ...(rule.scope === 'SCHEME' ? { schemeId: rule.schemeId } : {}),
      definition: {
        schemaVersion: 1,
        roundingScale: rule.roundingScale,
        terms: terms.value.map((term) => ({
          operation: term.operation,
          ...(term.sourceType === 'FIELD'
            ? { field: term.field }
            : { fixedAmount: term.fixedAmount }),
          ...(term.coefficient && term.coefficient !== '1'
            ? { coefficient: term.coefficient }
            : {}),
        })),
      },
      activate: true,
    });
    ElMessage.success('新版本已保存并启用，历史订单规则快照不会改变');
    await loadRules(response.data.id);
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '利润规则保存失败'));
  } finally {
    saving.value = false;
  }
};

const activateVersion = async (item: ProfitRuleVersion) => {
  try {
    await http.post(`/admin/profit-rules/${item.id}/activate`);
    ElMessage.success(`v${item.version} 已重新启用`);
    await loadRules();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '版本启用失败'));
  }
};

const scopeLabel = (item: ProfitRuleVersion) => {
  if (item.scope === 'GLOBAL') return '全局默认';
  if (item.scope === 'SCHEME') return `方案：${item.scheme?.name ?? '-'}`;
  if (item.scope === 'CATEGORY') return `品类：${item.category?.name ?? '-'}`;
  return `资金方式：${item.fundingType ?? '-'}`;
};

onMounted(loadRules);
</script>

<template>
  <div class="page-shell">
    <div class="page-heading">
      <div>
        <h1>利润规则配置</h1>
        <p>通过字段加减配置公式。保存后生成新版本，历史订单继续使用原规则快照。</p>
      </div>
      <el-button type="primary" :loading="saving" @click="saveRule">保存为新版本</el-button>
    </div>

    <el-alert
      title="默认规则仍是：回款金额 - 结算金额 + 支付优惠 + 扫码返利；单笔利润调整始终在公式结果后追加。"
      type="info"
      :closable="false"
      show-icon
    />

    <div class="rule-layout">
      <div class="rule-main-column">
        <section class="surface-card editor-card">
          <div class="section-title">
            <div>
              <strong>规则设置</strong>
              <span>当前载入版本 v{{ currentVersion }}</span>
            </div>
            <el-tag type="success">结构化公式</el-tag>
          </div>

          <el-form label-position="top" class="rule-meta">
            <el-form-item label="规则名称">
              <el-input v-model="rule.name" />
            </el-form-item>
            <el-form-item label="适用范围">
              <el-select v-model="rule.scope">
                <el-option label="全局默认" value="GLOBAL" />
                <el-option label="指定下单方案" value="SCHEME" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="rule.scope === 'SCHEME'" label="下单方案">
              <el-select
                v-model="rule.schemeId"
                filterable
                placeholder="选择需要覆盖默认规则的方案"
              >
                <el-option
                  v-for="scheme in schemeOptions"
                  :key="scheme.id"
                  :label="scheme.name"
                  :value="scheme.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="金额小数位">
              <el-select v-model="rule.roundingScale">
                <el-option label="保留 2 位" :value="2" />
                <el-option label="保留 0 位" :value="0" />
                <el-option label="保留 4 位" :value="4" />
              </el-select>
            </el-form-item>
          </el-form>

          <div class="term-heading">
            <div>
              <strong>计算项</strong>
              <span>每项只能选择白名单金额字段或固定金额。</span>
            </div>
            <el-button :icon="Plus" plain @click="addTerm">添加计算项</el-button>
          </div>

          <div class="term-list">
            <div v-for="(term, index) in terms" :key="term.id" class="term-row">
              <span class="term-index">{{ index + 1 }}</span>
              <el-select v-model="term.operation" class="operation-select">
                <el-option label="加（收入）" value="ADD" />
                <el-option label="减（成本）" value="SUBTRACT" />
              </el-select>
              <el-select v-model="term.sourceType" class="source-select">
                <el-option label="金额字段" value="FIELD" />
                <el-option label="固定金额" value="FIXED" />
              </el-select>
              <el-select
                v-if="term.sourceType === 'FIELD'"
                v-model="term.field"
                filterable
                class="field-select"
              >
                <el-option
                  v-for="field in fieldOptions"
                  :key="field.value"
                  :label="field.label"
                  :value="field.value"
                />
              </el-select>
              <el-input
                v-else
                v-model="term.fixedAmount"
                class="field-select"
                inputmode="decimal"
                placeholder="固定金额"
              >
                <template #prepend>¥</template>
              </el-input>
              <el-input v-model="term.coefficient" class="coefficient-input" inputmode="decimal">
                <template #prepend>系数</template>
              </el-input>
              <el-button
                text
                type="danger"
                :icon="Delete"
                :disabled="terms.length === 1"
                @click="removeTerm(term.id)"
              />
            </div>
          </div>
        </section>

        <section class="surface-card history-card">
          <div class="section-title history-heading">
            <div>
              <strong>规则版本记录</strong>
              <span>启用历史版本不会修改已有订单保存的规则快照。</span>
            </div>
            <el-button :loading="loading" @click="() => loadRules()">刷新</el-button>
          </div>
          <el-table v-loading="loading" :data="history" border stripe class="history-table">
            <el-table-column prop="name" label="规则名称" min-width="160" />
            <el-table-column label="范围" min-width="180">
              <template #default="{ row }">{{ scopeLabel(row) }}</template>
            </el-table-column>
            <el-table-column label="版本" width="82">
              <template #default="{ row }">v{{ row.version }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag
                  :type="
                    row.status === 'ACTIVE'
                      ? 'success'
                      : row.status === 'DRAFT'
                        ? 'warning'
                        : 'info'
                  "
                >
                  {{
                    row.status === 'ACTIVE' ? '使用中' : row.status === 'DRAFT' ? '草稿' : '历史'
                  }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdBy.displayName" label="创建人" width="110" />
            <el-table-column label="操作" width="180" fixed="right">
              <template #default="{ row }">
                <div class="rule-history-actions">
                  <el-button
                    class="rule-history-action rule-history-action--view"
                    size="small"
                    :icon="View"
                    @click="loadRuleIntoEditor(row)"
                  >
                    载入查看
                  </el-button>
                  <el-button
                    v-if="row.status !== 'ACTIVE'"
                    class="rule-history-action rule-history-action--activate"
                    size="small"
                    :icon="CircleCheck"
                    @click="activateVersion(row)"
                  >
                    启用
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </div>

      <aside class="surface-card preview-card">
        <div class="section-title">
          <div>
            <strong>样例试算</strong>
            <span>保存前先核对计算结果。</span>
          </div>
        </div>

        <div class="sample-grid">
          <label v-for="field in sampleFieldOptions" :key="field.value">
            <span>{{ field.label }}</span>
            <el-input v-model="sampleAmounts[field.value]" inputmode="decimal">
              <template #prepend>¥</template>
            </el-input>
          </label>
        </div>

        <div class="formula-preview">
          <span>当前公式</span>
          <p>{{ previewFormula }}</p>
        </div>

        <div class="profit-preview">
          <span>样例利润</span>
          <strong :class="{ negative: previewCents < 0n }">{{ formatCents(previewCents) }}</strong>
          <small>收货佬未全部回款时，主表仍显示 ¥0.00</small>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.rule-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  align-items: stretch;
  gap: 18px;
}

.rule-main-column {
  display: grid;
  min-width: 0;
  gap: 18px;
}

.editor-card,
.preview-card,
.history-card {
  padding: 18px;
}

.history-table {
  margin-top: 15px;
}

.rule-history-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--app-control) 72%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 62%, transparent),
    0 1px 3px rgba(15, 23, 42, 0.04);
}

.rule-history-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.rule-history-action {
  height: 28px;
  margin: 0;
  padding: 0 9px;
  border: 0;
  border-radius: 8px;
  color: var(--app-muted);
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  box-shadow: none;
  transition:
    color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.rule-history-action :deep(.el-icon) {
  margin-right: 4px;
  font-size: 13px;
}

.rule-history-action--view {
  color: color-mix(in srgb, var(--app-primary) 82%, var(--app-text));
}

.rule-history-action--view:hover,
.rule-history-action--view:focus {
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary-soft) 58%, var(--app-card-solid));
  box-shadow: 0 2px 7px color-mix(in srgb, var(--app-primary) 12%, transparent);
}

.rule-history-action--activate {
  color: color-mix(in srgb, var(--app-success) 82%, var(--app-text));
}

.rule-history-action--activate:hover,
.rule-history-action--activate:focus {
  color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 10%, var(--app-card-solid));
  box-shadow: 0 2px 7px color-mix(in srgb, var(--app-success) 12%, transparent);
}

.preview-card {
  position: sticky;
  top: 92px;
  display: flex;
  height: 100%;
  box-sizing: border-box;
  flex-direction: column;
  align-self: stretch;
}

.section-title,
.section-title > div,
.term-heading,
.term-heading > div {
  display: flex;
}

.section-title,
.term-heading {
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.section-title > div,
.term-heading > div {
  flex-direction: column;
}

.section-title span,
.term-heading span {
  margin-top: 3px;
  color: var(--app-muted);
  font-size: 13px;
}

.rule-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 18px;
  gap: 0 14px;
}

.rule-meta :deep(.el-select) {
  width: 100%;
}

.term-heading {
  margin-top: 2px;
  padding-top: 14px;
  border-top: 1px solid var(--app-border);
}

.term-list {
  display: flex;
  flex-direction: column;
  margin-top: 13px;
  gap: 9px;
}

.term-row {
  display: grid;
  grid-template-columns: 28px 126px 118px minmax(180px, 1fr) 140px 36px;
  align-items: center;
  gap: 8px;
}

.term-index {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 8px;
  color: var(--app-text);
  background: var(--app-control);
  font-size: 13px;
}

.sample-grid {
  display: grid;
  margin-top: 16px;
  gap: 10px;
}

.sample-grid label {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) 150px;
  align-items: center;
  gap: 9px;
}

.sample-grid label > span {
  color: var(--app-text);
  font-size: 13px;
}

.formula-preview,
.profit-preview {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: 11px;
  background: var(--app-control);
}

.formula-preview > span,
.profit-preview > span {
  color: var(--app-muted);
  font-size: 13px;
}

.formula-preview p {
  margin: 7px 0 0;
  color: var(--app-text);
  font-size: 14px;
  line-height: 1.7;
}

.profit-preview {
  display: flex;
  margin-top: auto;
  flex-direction: column;
  border-color: color-mix(in srgb, var(--app-success) 30%, var(--app-border));
  background: color-mix(in srgb, var(--app-success) 12%, var(--app-card-solid));
}

.profit-preview strong {
  margin: 4px 0;
  color: var(--app-success);
  font-size: 29px;
  font-variant-numeric: tabular-nums;
}

.profit-preview strong.negative {
  color: var(--app-danger);
}

.profit-preview small {
  color: var(--app-muted);
  line-height: 1.5;
}

@media (max-width: 1180px) {
  .rule-layout {
    grid-template-columns: 1fr;
  }

  .preview-card {
    position: static;
    height: auto;
  }
}

@media (max-width: 820px) {
  .rule-meta {
    grid-template-columns: 1fr;
  }

  .term-row {
    grid-template-columns: 28px 1fr 1fr 36px;
  }

  .field-select,
  .coefficient-input {
    grid-column: 2 / 4;
  }
}

@media (max-width: 560px) {
  .term-row {
    grid-template-columns: 26px 1fr 32px;
  }

  .operation-select,
  .source-select,
  .field-select,
  .coefficient-input {
    grid-column: 2;
  }

  .term-row > :last-child {
    grid-column: 3;
    grid-row: 1;
  }

  .sample-grid label {
    grid-template-columns: 1fr;
  }
}
</style>
