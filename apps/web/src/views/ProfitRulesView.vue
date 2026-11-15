<script setup lang="ts">
import { CircleCheck, Delete, EditPen, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

type RuleScope = 'GLOBAL' | 'SCHEME' | 'CATEGORY' | 'FUNDING_TYPE';
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
    categories: Array<{ id: string; name: string }>;
    fundingMethods: Array<{ code: string; name: string; enabled: boolean }>;
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
  scope: 'FUNDING_TYPE' as RuleScope,
  schemeId: '',
  categoryId: '',
  fundingType: '',
  roundingScale: 2,
});
const loading = ref(false);
const saving = ref(false);
const currentVersion = ref(1);
const editorCardRef = ref<HTMLElement | null>(null);
const history = ref<ProfitRuleVersion[]>([]);
const schemeOptions = ref<Array<{ id: string; name: string }>>([]);
const categoryOptions = ref<Array<{ id: string; name: string }>>([]);
const fundingMethodOptions = ref<Array<{ code: string; name: string; enabled: boolean }>>([]);

const scopeOptions: Array<{ label: string; value: RuleScope; hint: string }> = [
  {
    label: '按支付方式',
    value: 'FUNDING_TYPE',
    hint: '自己付、代付、其他…各自一套计算项',
  },
  {
    label: '按品类',
    value: 'CATEGORY',
    hint: '按下单品类覆盖计算项',
  },
  {
    label: '按下单方案',
    value: 'SCHEME',
    hint: '按具体商品方案覆盖计算项',
  },
  {
    label: '全局默认',
    value: 'GLOBAL',
    hint: '所有订单的兜底计算规则',
  },
];

const currentScopeHint = computed(
  () => scopeOptions.find((option) => option.value === rule.scope)?.hint ?? '',
);

const fundingMethodName = (code?: string | null) =>
  fundingMethodOptions.value.find((item) => item.code === code)?.name ?? (code ? code : '-');

const firstEnabledFundingMethod = () =>
  fundingMethodOptions.value.find((item) => item.enabled)?.code ?? '';

/** 规则名跟着适用范围走，用户不用自己想名字。 */
const suggestRuleName = () => {
  if (rule.scope === 'FUNDING_TYPE') {
    rule.name = `支付方式 · ${fundingMethodName(rule.fundingType)}`;
    return;
  }
  if (rule.scope === 'CATEGORY') {
    const category = categoryOptions.value.find((item) => item.id === rule.categoryId);
    rule.name = `品类 · ${category?.name ?? '-'}`;
    return;
  }
  if (rule.scope === 'SCHEME') {
    const scheme = schemeOptions.value.find((item) => item.id === rule.schemeId);
    rule.name = `方案 · ${scheme?.name ?? '-'}`;
    return;
  }
  rule.name = '全局默认';
};

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

const loadRuleIntoEditor = (item: ProfitRuleVersion, keepScope = false) => {
  if (!keepScope) {
    rule.name = item.name;
    rule.scope = item.scope;
    rule.schemeId = item.scheme?.id ?? '';
    rule.categoryId = item.category?.id ?? '';
    rule.fundingType = item.fundingType ?? '';
  }
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
    categoryOptions.value = response.data.options.categories ?? [];
    fundingMethodOptions.value = response.data.options.fundingMethods ?? [];
    fieldOptions.value = response.data.options.amountFields?.length
      ? response.data.options.amountFields
      : [...fallbackFieldOptions];

    const preferred = preferredId
      ? history.value.find((item) => item.id === preferredId)
      : history.value.find(
          (item) =>
            item.status === 'ACTIVE' &&
            item.scope === rule.scope &&
            (item.scope !== 'SCHEME' || item.scheme?.id === rule.schemeId) &&
            (item.scope !== 'CATEGORY' || item.category?.id === rule.categoryId) &&
            (item.scope !== 'FUNDING_TYPE' || item.fundingType === rule.fundingType),
        );
    const activeGlobal = history.value.find(
      (item) => item.scope === 'GLOBAL' && item.status === 'ACTIVE',
    );
    if (rule.scope === 'FUNDING_TYPE' && !rule.fundingType) {
      rule.fundingType = firstEnabledFundingMethod();
    }
    if (preferred) {
      loadRuleIntoEditor(preferred);
    } else if (activeGlobal) {
      // 没有对应范围的规则时，用全局规则当模板，但保留用户当前选择的范围
      loadRuleIntoEditor(activeGlobal, true);
      suggestRuleName();
    }
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
  if (rule.scope === 'CATEGORY' && !rule.categoryId) {
    ElMessage.warning('请选择下单品类');
    return;
  }
  if (rule.scope === 'FUNDING_TYPE' && !rule.fundingType) {
    ElMessage.warning('请选择支付方式');
    return;
  }

  saving.value = true;
  try {
    const response = await http.post<{ id: string }>('/admin/profit-rules', {
      name: rule.name.trim(),
      scope: rule.scope,
      ...(rule.scope === 'SCHEME' ? { schemeId: rule.schemeId } : {}),
      ...(rule.scope === 'CATEGORY' ? { categoryId: rule.categoryId } : {}),
      ...(rule.scope === 'FUNDING_TYPE' ? { fundingType: rule.fundingType } : {}),
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

/** 编辑：把该版本载入编辑器，改完保存为新版本即可生效。 */
const editVersion = async (item: ProfitRuleVersion) => {
  loadRuleIntoEditor(item);
  await nextTick();
  editorCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  ElMessage.success(`已载入 v${item.version}，修改后点“保存为新版本”生效`);
};

const deleteVersion = async (item: ProfitRuleVersion) => {
  try {
    await ElMessageBox.confirm(
      item.status === 'ACTIVE'
        ? `确定删除正在使用的「${item.name}」v${item.version} 吗？删除后该范围会回落到全局默认规则。`
        : `确定删除「${item.name}」v${item.version} 吗？此操作不可撤销。`,
      '删除利润规则版本',
      { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '再想想' },
    );
  } catch {
    return;
  }
  try {
    const response = await http.delete<{ wasActive: boolean }>(`/admin/profit-rules/${item.id}`);
    ElMessage.success(
      response.data?.wasActive ? '已删除，该范围已回落到全局默认规则' : '已删除该规则版本',
    );
    await loadRules();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '规则版本删除失败'));
  }
};

const scopeLabel = (item: ProfitRuleVersion) => {
  if (item.scope === 'GLOBAL') return '全局默认';
  if (item.scope === 'SCHEME') return `方案：${item.scheme?.name ?? '-'}`;
  if (item.scope === 'CATEGORY') return `品类：${item.category?.name ?? '-'}`;
  return `支付方式：${fundingMethodName(item.fundingType)}`;
};

const onScopeChange = () => {
  if (rule.scope === 'FUNDING_TYPE' && !rule.fundingType) {
    rule.fundingType = firstEnabledFundingMethod();
  }
  if (rule.scope === 'CATEGORY' && !rule.categoryId) {
    rule.categoryId = categoryOptions.value[0]?.id ?? '';
  }
  if (rule.scope === 'SCHEME' && !rule.schemeId) {
    rule.schemeId = schemeOptions.value[0]?.id ?? '';
  }
  suggestRuleName();
  void loadRules();
};

onMounted(loadRules);
</script>

<template>
  <div class="settings-section">
    <div class="section-toolbar">
      <p>通过字段加减配置公式。保存后生成新版本，历史订单继续使用原规则快照。</p>
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
        <section ref="editorCardRef" class="surface-card editor-card">
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
              <el-segmented
                v-model="rule.scope"
                class="scope-segmented"
                :options="
                  scopeOptions.map((option) => ({ label: option.label, value: option.value }))
                "
                @change="onScopeChange"
              />
              <small class="scope-hint">{{ currentScopeHint }}</small>
            </el-form-item>
            <el-form-item v-if="rule.scope === 'FUNDING_TYPE'" label="支付方式">
              <el-select
                v-model="rule.fundingType"
                filterable
                placeholder="选择需要单独配置计算项的支付方式"
                @change="suggestRuleName"
              >
                <el-option
                  v-for="method in fundingMethodOptions"
                  :key="method.code"
                  :label="method.enabled ? method.name : `${method.name}（已停用）`"
                  :value="method.code"
                  :disabled="!method.enabled"
                />
              </el-select>
              <small class="scope-hint">
                支付方式在「基础设置 · 支付方式」里维护，新增后立即可在这里单独配置。
              </small>
            </el-form-item>
            <el-form-item v-if="rule.scope === 'CATEGORY'" label="下单品类">
              <el-select
                v-model="rule.categoryId"
                filterable
                placeholder="选择需要覆盖默认规则的品类"
                @change="suggestRuleName"
              >
                <el-option
                  v-for="category in categoryOptions"
                  :key="category.id"
                  :label="category.name"
                  :value="category.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item v-if="rule.scope === 'SCHEME'" label="下单方案">
              <el-select
                v-model="rule.schemeId"
                filterable
                placeholder="选择需要覆盖默认规则的方案"
                @change="suggestRuleName"
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
                    class="app-action-button app-action-button--primary"
                    size="small"
                    :icon="EditPen"
                    @click="editVersion(row)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    v-if="row.status !== 'ACTIVE'"
                    class="app-action-button app-action-button--success"
                    size="small"
                    :icon="CircleCheck"
                    @click="activateVersion(row)"
                  >
                    启用
                  </el-button>
                  <el-button
                    class="app-action-button app-action-button--danger"
                    size="small"
                    :icon="Delete"
                    :disabled="row.scope === 'GLOBAL' && row.status === 'ACTIVE'"
                    :title="
                      row.scope === 'GLOBAL' && row.status === 'ACTIVE'
                        ? '全局默认规则是兜底计算方式，不能删除'
                        : '删除这个版本'
                    "
                    @click="deleteVersion(row)"
                  >
                    删除
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
.scope-segmented {
  width: 100%;
}

.scope-hint {
  display: block;
  margin-top: 6px;
  color: var(--app-text-subtle);
  font-size: var(--app-text-xs);
  line-height: 1.5;
}

.section-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.section-toolbar p {
  margin: 0;
  color: var(--app-muted);
  font-size: var(--app-text-base);
}

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
}

.rule-history-actions :deep(.el-button + .el-button) {
  margin-left: 0;
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
  font-size: var(--app-text-sm);
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
  border-radius: var(--app-radius-control);
  color: var(--app-text);
  background: var(--app-control);
  font-size: var(--app-text-sm);
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
  font-size: var(--app-text-sm);
}

.formula-preview,
.profit-preview {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-card);
  background: var(--app-control);
}

.formula-preview > span,
.profit-preview > span {
  color: var(--app-muted);
  font-size: var(--app-text-sm);
}

.formula-preview p {
  margin: 7px 0 0;
  color: var(--app-text);
  font-size: var(--app-text-base);
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
  font-size: var(--app-text-2xl);
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
