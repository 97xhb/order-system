<script setup lang="ts">
import { Check, Delete, DocumentCopy, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

type FundingType = 'SELF_PAID' | 'SUBMITTER_ADVANCED' | 'OTHER';

interface OptionItem {
  id: string;
  name: string;
}

interface OrderTableFieldMeta {
  key: string;
  label: string;
  description?: string;
  width?: number;
  minWidth?: number;
  defaultVisible?: boolean;
}

type BatchColumnKey =
  | 'orderedAt'
  | 'platform'
  | 'submitter'
  | 'category'
  | 'product'
  | 'platformOrderNo'
  | 'inboundTrackingNo'
  | 'purchaseAddress'
  | 'fundingType'
  | 'paymentDiscountAmount'
  | 'orderAmount'
  | 'submitterSettlementAmount'
  | 'platformRebateAmount'
  | 'saleAmount'
  | 'notes';

interface BatchColumnDefinition extends OrderTableFieldMeta {
  key: BatchColumnKey;
  required: boolean;
  inputWidth: number;
}

interface BatchOrderRow {
  key: number;
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
  orderAmount: string;
  paymentDiscountAmount: string;
  submitterSettlementAmount: string;
  scanAmount: string;
  saleAmount: string;
  notes: string;
  importPlatformName: string;
  importCategoryName: string;
  error: string;
}

interface BatchCreateSuccess {
  index: number;
  success: true;
  id: string;
  serialNo: number;
}

interface BatchCreateFailure {
  index: number;
  success: false;
  message: string;
}

interface BatchCreateResponse {
  total: number;
  successCount: number;
  failureCount: number;
  results: Array<BatchCreateSuccess | BatchCreateFailure>;
}

const props = withDefaults(
  defineProps<{
    orderFields?: OrderTableFieldMeta[];
  }>(),
  {
    orderFields: () => [],
  },
);

const emit = defineEmits<{
  saved: [count: number, completed: boolean];
  cancel: [];
}>();

const maxRows = 100;
const fallbackBatchFields: Array<OrderTableFieldMeta & { key: BatchColumnKey }> = [
  { key: 'orderedAt', label: '下单日期', width: 104 },
  { key: 'platform', label: '平台', width: 82 },
  { key: 'submitter', label: '下单人', width: 125 },
  { key: 'category', label: '品类', width: 82 },
  { key: 'product', label: '商品/方案*数量', minWidth: 210 },
  { key: 'platformOrderNo', label: '平台订单号', width: 145 },
  { key: 'inboundTrackingNo', label: '平台运单号', width: 175 },
  { key: 'purchaseAddress', label: '下单地址', minWidth: 180 },
  { key: 'fundingType', label: '支付方式', width: 108 },
  { key: 'paymentDiscountAmount', label: '支付优惠', width: 105 },
  { key: 'orderAmount', label: '下单金额', width: 108 },
  { key: 'submitterSettlementAmount', label: '结算金额', width: 108 },
  { key: 'platformRebateAmount', label: '扫码返利', width: 132 },
  { key: 'saleAmount', label: '回款金额', width: 108 },
  { key: 'notes', label: '备注', minWidth: 190 },
];
const batchColumnKeys = new Set<BatchColumnKey>(fallbackBatchFields.map((field) => field.key));
const requiredBatchColumnKeys = new Set<BatchColumnKey>([
  'orderedAt',
  'platform',
  'submitter',
  'product',
]);
const batchColumnWidths: Record<BatchColumnKey, number> = {
  orderedAt: 152,
  platform: 130,
  submitter: 150,
  category: 125,
  product: 250,
  platformOrderNo: 160,
  inboundTrackingNo: 170,
  purchaseAddress: 190,
  fundingType: 190,
  paymentDiscountAmount: 118,
  orderAmount: 118,
  submitterSettlementAmount: 118,
  platformRebateAmount: 178,
  saleAmount: 118,
  notes: 190,
};
const isBatchColumnKey = (value: string): value is BatchColumnKey =>
  batchColumnKeys.has(value as BatchColumnKey);
const batchColumns = computed<BatchColumnDefinition[]>(() => {
  const source = props.orderFields.length ? props.orderFields : fallbackBatchFields;
  const resolved = source.filter((field): field is OrderTableFieldMeta & { key: BatchColumnKey } =>
    isBatchColumnKey(field.key),
  );
  const existingKeys = new Set(resolved.map((field) => field.key));
  for (const fallback of fallbackBatchFields) {
    if (!existingKeys.has(fallback.key)) resolved.push(fallback);
  }
  return resolved.map((field) => ({
    ...field,
    required: requiredBatchColumnKeys.has(field.key),
    inputWidth: batchColumnWidths[field.key],
  }));
});
const batchGridWidth = computed(
  () => 112 + batchColumns.value.reduce((total, column) => total + column.inputWidth, 0),
);
const batchGridStyle = computed(() => ({ width: `${batchGridWidth.value}px` }));
const batchColumnStyle = (column: BatchColumnDefinition) => ({
  width: `${column.inputWidth}px`,
  minWidth: `${column.inputWidth}px`,
});
const pasteHeaders = computed(() => batchColumns.value.map((column) => column.label));
const pasteTemplate = computed(() => pasteHeaders.value.join('\t'));
const moneyKeys: Array<
  keyof Pick<
    BatchOrderRow,
    | 'orderAmount'
    | 'paymentDiscountAmount'
    | 'submitterSettlementAmount'
    | 'scanAmount'
    | 'saleAmount'
  >
> = [
  'orderAmount',
  'paymentDiscountAmount',
  'submitterSettlementAmount',
  'scanAmount',
  'saleAmount',
];
const fundingTypeOptions: Array<{ value: FundingType; label: string }> = [
  { value: 'SELF_PAID', label: '自己付' },
  { value: 'SUBMITTER_ADVANCED', label: '代付' },
  { value: 'OTHER', label: '其他' },
];

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const today = formatLocalDate(new Date());
const platforms = ref<OptionItem[]>([]);
const categories = ref<OptionItem[]>([]);
const loadingOptions = ref(false);
const saving = ref(false);
const pasteDialog = ref(false);
const pasteText = ref('');
let nextRowKey = 1;

const defaults = reactive({
  orderedAt: today,
  platformId: '',
  categoryId: '',
  fundingType: 'SELF_PAID' as FundingType,
  purchaseAddress: '',
});

const createRow = (seed: Partial<BatchOrderRow> = {}): BatchOrderRow => {
  const key = nextRowKey++;
  return {
    orderedAt: defaults.orderedAt,
    platformId: defaults.platformId,
    accountName: '',
    categoryId: defaults.categoryId,
    productName: '',
    platformOrderNo: '',
    inboundTrackingNo: '',
    purchaseAddress: defaults.purchaseAddress,
    fundingType: defaults.fundingType,
    fundingTypeOther: '',
    orderAmount: '',
    paymentDiscountAmount: '0',
    submitterSettlementAmount: '',
    scanAmount: '0',
    saleAmount: '',
    notes: '',
    importPlatformName: '',
    importCategoryName: '',
    error: '',
    ...seed,
    key,
  };
};

const rows = ref<BatchOrderRow[]>([createRow(), createRow(), createRow()]);

const isMeaningfulRow = (row: BatchOrderRow) =>
  Boolean(
    row.accountName.trim() ||
    row.productName.trim() ||
    row.platformOrderNo.trim() ||
    row.inboundTrackingNo.trim() ||
    row.orderAmount.trim() ||
    row.submitterSettlementAmount.trim() ||
    row.saleAmount.trim() ||
    row.notes.trim(),
  );

const filledCount = computed(() => rows.value.filter(isMeaningfulRow).length);

const appendRow = () => {
  if (rows.value.length >= maxRows) {
    ElMessage.warning(`一次最多录入 ${maxRows} 笔订单`);
    return;
  }
  rows.value.push(createRow());
};

const duplicateRow = (row: BatchOrderRow) => {
  if (rows.value.length >= maxRows) {
    ElMessage.warning(`一次最多录入 ${maxRows} 笔订单`);
    return;
  }
  const index = rows.value.findIndex((item) => item.key === row.key);
  const duplicated = createRow({ ...row, error: '' });
  rows.value.splice(index + 1, 0, duplicated);
};

const duplicateLastRow = () => {
  const source = [...rows.value].reverse().find(isMeaningfulRow) ?? rows.value.at(-1);
  if (!source) {
    appendRow();
    return;
  }
  duplicateRow(source);
};

const removeRow = (row: BatchOrderRow) => {
  if (rows.value.length === 1) {
    rows.value = [createRow()];
    return;
  }
  rows.value = rows.value.filter((item) => item.key !== row.key);
};

const clearRows = async () => {
  if (filledCount.value) {
    try {
      await ElMessageBox.confirm('确定清空当前批量录入内容吗？', '清空批量订单', {
        type: 'warning',
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
      });
    } catch {
      return;
    }
  }
  rows.value = [createRow(), createRow(), createRow()];
};

const applyDefaults = () => {
  rows.value.forEach((row) => {
    row.orderedAt = defaults.orderedAt;
    row.platformId = defaults.platformId;
    row.categoryId = defaults.categoryId;
    row.fundingType = defaults.fundingType;
    row.purchaseAddress = defaults.purchaseAddress;
    row.importPlatformName = '';
    row.importCategoryName = '';
    row.error = '';
    if (row.fundingType !== 'OTHER') row.fundingTypeOther = '';
  });
  ElMessage.success('批量默认值已应用到全部行，仍可逐行修改');
};

const normalizeNumberText = (value: string) =>
  value
    .trim()
    .replace(/[￥¥,，\s]/g, '')
    .replace(/元$/, '');

const optionalNumber = (value: string) => {
  const normalized = normalizeNumberText(value);
  return normalized ? Number(normalized) : undefined;
};

const calculatedScanRebate = (value: string) => {
  const scanAmount = optionalNumber(value) ?? 0;
  return Math.round((scanAmount * 0.9 + Number.EPSILON) * 100) / 100;
};

const normalizeDate = (value: string) => {
  const raw = value.trim();
  if (!raw) return defaults.orderedAt;
  if (/^\d{5}(?:\.0+)?$/.test(raw)) {
    const serial = Number(raw);
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  const match = raw.match(/^(\d{4})[./年-](\d{1,2})[./月-](\d{1,2})日?$/);
  if (!match) return raw;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
};

const normalizeOptionName = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/^[【\[]+/, '')
    .replace(/[】\]]+$/, '')
    .trim();

const optionIdByName = (items: OptionItem[], value: string) => {
  const normalized = normalizeOptionName(value);
  if (!normalized) return '';
  return (
    items.find(
      (item) =>
        item.id.toLocaleLowerCase() === value.trim().toLocaleLowerCase() ||
        normalizeOptionName(item.name) === normalized,
    )?.id ?? ''
  );
};

const fundingTypeByText = (
  value: string,
): { fundingType: FundingType; fundingTypeOther: string } => {
  const raw = value.trim();
  const normalized = raw.toLocaleLowerCase();
  if (!normalized) return { fundingType: defaults.fundingType, fundingTypeOther: '' };
  if (normalized.includes('自己') || normalized === 'self_paid') {
    return { fundingType: 'SELF_PAID', fundingTypeOther: '' };
  }
  if (
    normalized.includes('代付') ||
    normalized.includes('垫付') ||
    normalized === 'submitter_advanced'
  ) {
    return { fundingType: 'SUBMITTER_ADVANCED', fundingTypeOther: '' };
  }
  const detail = raw.replace(/^(?:其他|other)\s*[:：/\-]?\s*/i, '').trim();
  return {
    fundingType: 'OTHER',
    fundingTypeOther: detail || (normalized === '其他' || normalized === 'other' ? '' : raw),
  };
};

const normalizeHeaderLabel = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/[＊*]/g, '').replace(/\s+/g, '');

const batchHeaderAliases: Record<BatchColumnKey, string[]> = {
  orderedAt: ['下单日期', '下单时间', '日期'],
  platform: ['平台', '下单平台'],
  submitter: ['下单人', '下单账号', '微信昵称'],
  category: ['品类', '分类', '下单品类'],
  product: ['商品/方案*数量', '商品/方案数量', '商品', '方案内容'],
  platformOrderNo: ['平台订单号', '订单号'],
  inboundTrackingNo: ['平台运单号', '平台发货运单号'],
  purchaseAddress: ['下单地址', '购买地址'],
  fundingType: ['支付方式', '资金承担方式'],
  paymentDiscountAmount: ['支付优惠', '支付优惠金额'],
  orderAmount: ['下单金额', '订单金额'],
  submitterSettlementAmount: ['结算金额', '给下单人结算金额'],
  platformRebateAmount: ['扫码返利', '原始扫码金额', '扫码金额', '平台返利'],
  saleAmount: ['回款金额', '收货佬回款金额'],
  notes: ['备注'],
};

const headerColumnKeyMap = computed(() => {
  const result = new Map<string, BatchColumnKey>();
  for (const column of batchColumns.value) {
    result.set(normalizeHeaderLabel(column.label), column.key);
  }
  for (const [key, aliases] of Object.entries(batchHeaderAliases) as Array<
    [BatchColumnKey, string[]]
  >) {
    aliases.forEach((alias) => result.set(normalizeHeaderLabel(alias), key));
  }
  return result;
});

const knownHeaderLabels = computed(() => {
  const labels = new Set<string>();
  props.orderFields.forEach((field) => labels.add(normalizeHeaderLabel(field.label)));
  pasteHeaders.value.forEach((label) => labels.add(normalizeHeaderLabel(label)));
  Object.values(batchHeaderAliases)
    .flat()
    .forEach((label) => labels.add(normalizeHeaderLabel(label)));
  ['数量', '下单数量', '实际扫码金额', '实际返利'].forEach((label) =>
    labels.add(normalizeHeaderLabel(label)),
  );
  return labels;
});

const looksLikeHeader = (cells: string[]) => {
  const recognized = cells.filter((cell) =>
    knownHeaderLabels.value.has(normalizeHeaderLabel(cell)),
  );
  return (
    recognized.length >= 2 || recognized.some((cell) => normalizeHeaderLabel(cell) === '下单日期')
  );
};

const parseClipboardTable = (value: string) => {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const finishCell = () => {
    row.push(cell);
    cell = '';
  };
  const finishRow = () => {
    finishCell();
    if (row.some((item) => item.trim())) result.push(row);
    row = [];
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (quoted || !cell) {
        quoted = !quoted;
      } else {
        cell += character;
      }
      continue;
    }
    if (!quoted && character === '\t') {
      finishCell();
      continue;
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && value[index + 1] === '\n') index += 1;
      finishRow();
      continue;
    }
    cell += character;
  }
  if (cell || row.length) finishRow();
  return result;
};

const scanAmountFromText = (value: string) => {
  const originalAmount = value.match(
    /(?:原始扫码(?:金额)?|原始)[^\d-]*([￥¥]?-?[\d,，]+(?:\.\d+)?)/i,
  )?.[1];
  return normalizeNumberText(originalAmount ?? value);
};

const importPastedRows = () => {
  const parsed = parseClipboardTable(pasteText.value);
  if (!parsed.length) {
    ElMessage.warning('请先粘贴 WPS 或 Excel 表格数据');
    return;
  }
  const firstRow = parsed[0] ?? [];
  const firstRowIsHeader = looksLikeHeader(firstRow);
  const dataRows = firstRowIsHeader ? parsed.slice(1) : parsed;
  if (!dataRows.length) {
    ElMessage.warning('没有识别到可导入的数据行');
    return;
  }

  const columnIndexes = new Map<BatchColumnKey, number>();
  let legacyQuantityIndex = -1;
  if (firstRowIsHeader) {
    firstRow.forEach((header, index) => {
      const normalized = normalizeHeaderLabel(header);
      if (['数量', '下单数量'].includes(normalized)) {
        legacyQuantityIndex = index;
        return;
      }
      const key = headerColumnKeyMap.value.get(normalized);
      if (!key) return;
      const previousIndex = columnIndexes.get(key);
      const isOriginalScanAmount = normalized.includes('原始扫码');
      if (previousIndex === undefined || isOriginalScanAmount) columnIndexes.set(key, index);
    });
  } else {
    batchColumns.value.forEach((column, index) => columnIndexes.set(column.key, index));
  }

  const cellValue = (cells: string[], key: BatchColumnKey) => {
    const index = columnIndexes.get(key);
    return index === undefined ? '' : (cells[index] ?? '').trim();
  };

  const imported = dataRows.slice(0, maxRows).map((cells) => {
    const platformName = cellValue(cells, 'platform');
    const categoryName = cellValue(cells, 'category');
    const productName = cellValue(cells, 'product');
    const legacyQuantity =
      legacyQuantityIndex >= 0 ? normalizeNumberText(cells[legacyQuantityIndex] ?? '') : '';
    const productNameWithQuantity = legacyQuantity
      ? `${productName}${productName ? ' * ' : ''}${legacyQuantity}`
      : productName;
    const funding = fundingTypeByText(cellValue(cells, 'fundingType'));
    return createRow({
      orderedAt: normalizeDate(cellValue(cells, 'orderedAt')),
      platformId: optionIdByName(platforms.value, platformName) || defaults.platformId,
      accountName: cellValue(cells, 'submitter'),
      categoryId: optionIdByName(categories.value, categoryName) || defaults.categoryId,
      productName: productNameWithQuantity,
      platformOrderNo: cellValue(cells, 'platformOrderNo'),
      inboundTrackingNo: cellValue(cells, 'inboundTrackingNo'),
      purchaseAddress: cellValue(cells, 'purchaseAddress') || defaults.purchaseAddress,
      fundingType: funding.fundingType,
      fundingTypeOther: funding.fundingTypeOther,
      orderAmount: normalizeNumberText(cellValue(cells, 'orderAmount')),
      paymentDiscountAmount: normalizeNumberText(cellValue(cells, 'paymentDiscountAmount')) || '0',
      submitterSettlementAmount: normalizeNumberText(cellValue(cells, 'submitterSettlementAmount')),
      scanAmount: scanAmountFromText(cellValue(cells, 'platformRebateAmount')) || '0',
      saleAmount: normalizeNumberText(cellValue(cells, 'saleAmount')),
      notes: cellValue(cells, 'notes'),
      importPlatformName: platformName,
      importCategoryName: categoryName,
    });
  });

  const currentHasData = rows.value.some(isMeaningfulRow);
  const available = currentHasData ? maxRows - rows.value.length : maxRows;
  if (available <= 0) {
    ElMessage.warning(`当前已经达到 ${maxRows} 行上限`);
    return;
  }
  const accepted = imported.slice(0, available);
  rows.value = currentHasData ? [...rows.value, ...accepted] : accepted;
  pasteDialog.value = false;
  pasteText.value = '';
  ElMessage.success(`已识别 ${accepted.length} 行，请检查平台、品类和金额后保存`);
  if (imported.length > accepted.length || dataRows.length > maxRows) {
    ElMessage.warning(`一次最多保留 ${maxRows} 行，超出的数据未加入`);
  }
};

const copyTemplate = async () => {
  try {
    await navigator.clipboard.writeText(pasteTemplate.value);
    ElMessage.success('表格列名模板已复制');
  } catch {
    ElMessage.error('复制失败，请在粘贴窗口手动复制列名');
  }
};

const validateRow = (row: BatchOrderRow, displayIndex: number) => {
  const issues: string[] = [];
  if (!row.orderedAt || !/^\d{4}-\d{2}-\d{2}$/.test(row.orderedAt)) {
    issues.push('下单日期格式不正确');
  }
  if (!row.platformId) {
    issues.push(
      row.importPlatformName ? `平台“${row.importPlatformName}”未匹配` : '请选择下单平台',
    );
  }
  if (row.importCategoryName && !row.categoryId) {
    issues.push(`品类“${row.importCategoryName}”未匹配`);
  }
  if (!row.accountName.trim()) issues.push('下单人不能为空');
  if (!row.productName.trim()) issues.push('商品/方案*数量不能为空');
  if (row.fundingType === 'OTHER' && !row.fundingTypeOther.trim()) {
    issues.push('其他支付方式需要填写说明');
  }
  moneyKeys.forEach((key) => {
    const value = normalizeNumberText(row[key]);
    if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      issues.push('金额必须是大于等于 0 的数字');
    }
  });
  row.error = issues.join('；');
  return issues.length ? `第 ${displayIndex + 1} 行：${row.error}` : '';
};

const rowPayload = (row: BatchOrderRow) => {
  const scanAmount = optionalNumber(row.scanAmount) ?? 0;
  const platformRebateAmount = calculatedScanRebate(row.scanAmount);
  return {
    orderedAt: row.orderedAt,
    platformId: row.platformId,
    accountName: row.accountName.trim(),
    categoryId: row.categoryId || undefined,
    productName: row.productName.trim(),
    platformOrderNo: row.platformOrderNo.trim(),
    inboundTrackingNo: row.inboundTrackingNo.trim(),
    purchaseAddress: row.purchaseAddress.trim(),
    fundingType: row.fundingType,
    fundingTypeOther: row.fundingType === 'OTHER' ? row.fundingTypeOther.trim() : undefined,
    orderAmount: optionalNumber(row.orderAmount),
    paymentDiscountAmount: optionalNumber(row.paymentDiscountAmount) ?? 0,
    submitterSettlementAmount: optionalNumber(row.submitterSettlementAmount),
    scanAmount,
    platformRebateAmount,
    rebateScanned: scanAmount > 0,
    saleAmount: optionalNumber(row.saleAmount),
    notes: row.notes.trim(),
  };
};

const saveBatch = async () => {
  const activeRows = rows.value.filter(isMeaningfulRow);
  if (!activeRows.length) {
    ElMessage.warning('请至少填写一笔订单');
    return;
  }
  const validationErrors = activeRows
    .map((row) => validateRow(row, rows.value.indexOf(row)))
    .filter(Boolean);
  if (validationErrors.length) {
    ElMessage.warning(validationErrors[0]);
    return;
  }

  const submittedRows = activeRows.map((row) => ({ ...row }));
  saving.value = true;
  try {
    const response = await http.post<BatchCreateResponse>('/admin/orders/batch', {
      orders: activeRows.map(rowPayload),
    });
    const { successCount, failureCount, results } = response.data;
    if (!failureCount) {
      ElMessage.success(`已批量保存 ${successCount} 笔订单`);
      emit('saved', successCount, true);
      return;
    }

    const failedRows = results
      .filter((result): result is BatchCreateFailure => !result.success)
      .map((result) => ({
        ...submittedRows[result.index],
        key: nextRowKey++,
        error: result.message,
      }));
    rows.value = failedRows.length ? failedRows : [createRow()];
    emit('saved', successCount, false);
    ElMessage.warning(
      successCount
        ? `已保存 ${successCount} 笔，${failureCount} 笔需要修改后重试`
        : `${failureCount} 笔订单均未保存，请按行检查`,
    );
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '批量保存订单失败'));
  } finally {
    saving.value = false;
  }
};

const loadOptions = async () => {
  loadingOptions.value = true;
  try {
    const [platformResult, categoryResult] = await Promise.all([
      http.get<{ items: OptionItem[] }>('/admin/platforms'),
      http.get<{ items: OptionItem[] }>('/admin/categories'),
    ]);
    platforms.value = platformResult.data.items;
    categories.value = categoryResult.data.items;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '平台和品类加载失败'));
  } finally {
    loadingOptions.value = false;
  }
};

onMounted(loadOptions);
</script>

<template>
  <div class="batch-create-shell">
    <section class="batch-intro">
      <div>
        <strong>一次录入多笔订单</strong>
        <p>最多 100 笔；可逐行填写，也可以直接粘贴 WPS / Excel 数据。</p>
      </div>
      <div class="batch-intro-actions">
        <el-button round @click="pasteDialog = true">粘贴表格</el-button>
        <el-button round :icon="DocumentCopy" @click="duplicateLastRow">复制上一行</el-button>
        <el-button round :icon="Plus" @click="appendRow">新增一行</el-button>
        <el-button round text @click="clearRows">清空</el-button>
      </div>
    </section>

    <section class="batch-default-panel">
      <div class="batch-section-title">
        <div>
          <strong>批量默认值</strong>
          <span>先设置常用内容，再一键应用到全部行</span>
        </div>
        <el-button type="primary" plain round @click="applyDefaults">应用到全部行</el-button>
      </div>
      <div class="batch-default-grid">
        <label>
          <span>下单日期</span>
          <el-date-picker
            v-model="defaults.orderedAt"
            type="date"
            value-format="YYYY-MM-DD"
            format="YYYY-MM-DD"
            :clearable="false"
          />
        </label>
        <label>
          <span>下单平台</span>
          <el-select v-model="defaults.platformId" clearable filterable placeholder="选择平台">
            <el-option
              v-for="item in platforms"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </label>
        <label>
          <span>品类</span>
          <el-select v-model="defaults.categoryId" clearable filterable placeholder="选择品类">
            <el-option
              v-for="item in categories"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </label>
        <label>
          <span>支付方式</span>
          <el-select v-model="defaults.fundingType">
            <el-option
              v-for="item in fundingTypeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </label>
        <label class="default-address">
          <span>下单地址</span>
          <el-input v-model="defaults.purchaseAddress" clearable placeholder="可统一填写常用地址" />
        </label>
      </div>
    </section>

    <div class="batch-grid-summary">
      <div>
        <strong>订单明细</strong>
        <span>已填写 {{ filledCount }} 笔 · 当前 {{ rows.length }} 行</span>
      </div>
      <span class="grid-scroll-hint">表格可左右滚动，带 * 为必填项</span>
    </div>

    <div v-loading="loadingOptions" class="batch-grid-scroll">
      <table class="batch-grid" :style="batchGridStyle">
        <thead>
          <tr>
            <th class="sticky-tools-column">行 / 操作</th>
            <th v-for="column in batchColumns" :key="column.key" :style="batchColumnStyle(column)">
              {{ column.label }}<span v-if="column.required"> *</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="row.key" :class="{ 'has-error': row.error }">
            <td class="sticky-tools-column row-tools-cell">
              <div class="row-number-line">
                <strong>{{ index + 1 }}</strong>
                <el-tooltip v-if="row.error" :content="row.error" placement="right">
                  <span class="row-error-badge">需检查</span>
                </el-tooltip>
              </div>
              <div class="row-tool-buttons">
                <el-tooltip content="复制此行">
                  <el-button text circle :icon="DocumentCopy" @click="duplicateRow(row)" />
                </el-tooltip>
                <el-tooltip content="删除此行">
                  <el-button text circle type="danger" :icon="Delete" @click="removeRow(row)" />
                </el-tooltip>
              </div>
            </td>
            <td v-for="column in batchColumns" :key="column.key" :style="batchColumnStyle(column)">
              <el-date-picker
                v-if="column.key === 'orderedAt'"
                v-model="row.orderedAt"
                type="date"
                value-format="YYYY-MM-DD"
                format="YYYY-MM-DD"
                :clearable="false"
              />
              <el-select
                v-else-if="column.key === 'platform'"
                v-model="row.platformId"
                filterable
                placeholder="选择"
                @change="row.importPlatformName = ''"
              >
                <el-option
                  v-for="item in platforms"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
              <el-input
                v-else-if="column.key === 'submitter'"
                v-model="row.accountName"
                placeholder="微信昵称/账号"
              />
              <el-select
                v-else-if="column.key === 'category'"
                v-model="row.categoryId"
                clearable
                filterable
                placeholder="选择"
                @change="row.importCategoryName = ''"
              >
                <el-option
                  v-for="item in categories"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
              <el-input
                v-else-if="column.key === 'product'"
                v-model="row.productName"
                placeholder="填写商品、方案和数量"
              />
              <el-input
                v-else-if="column.key === 'platformOrderNo'"
                v-model="row.platformOrderNo"
              />
              <el-input
                v-else-if="column.key === 'inboundTrackingNo'"
                v-model="row.inboundTrackingNo"
              />
              <el-input
                v-else-if="column.key === 'purchaseAddress'"
                v-model="row.purchaseAddress"
              />
              <div v-else-if="column.key === 'fundingType'" class="funding-cell">
                <el-select v-model="row.fundingType">
                  <el-option
                    v-for="item in fundingTypeOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
                <el-input
                  v-if="row.fundingType === 'OTHER'"
                  v-model="row.fundingTypeOther"
                  placeholder="填写具体方式"
                />
              </div>
              <el-input
                v-else-if="column.key === 'paymentDiscountAmount'"
                v-model="row.paymentDiscountAmount"
                inputmode="decimal"
              />
              <el-input
                v-else-if="column.key === 'orderAmount'"
                v-model="row.orderAmount"
                inputmode="decimal"
              />
              <el-input
                v-else-if="column.key === 'submitterSettlementAmount'"
                v-model="row.submitterSettlementAmount"
                inputmode="decimal"
              />
              <div v-else-if="column.key === 'platformRebateAmount'" class="scan-rebate-editor">
                <el-input v-model="row.scanAmount" inputmode="decimal" placeholder="原始扫码金额" />
                <span>实际 ¥{{ calculatedScanRebate(row.scanAmount).toFixed(2) }}</span>
              </div>
              <el-input
                v-else-if="column.key === 'saleAmount'"
                v-model="row.saleAmount"
                inputmode="decimal"
              />
              <el-input v-else-if="column.key === 'notes'" v-model="row.notes" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="batch-create-footer">
      <div>
        <strong>准备保存 {{ filledCount }} 笔</strong>
        <span>保存成功的订单会立即进入订单列表，失败行会保留在这里。</span>
      </div>
      <div class="batch-footer-actions">
        <el-button round @click="emit('cancel')">取消</el-button>
        <el-button
          type="primary"
          round
          :icon="Check"
          :loading="saving"
          :disabled="!filledCount"
          @click="saveBatch"
        >
          批量保存 {{ filledCount }} 笔
        </el-button>
      </div>
    </footer>

    <el-dialog
      v-model="pasteDialog"
      title="粘贴 WPS / Excel 数据"
      width="min(820px, 94vw)"
      append-to-body
      destroy-on-close
      class="batch-paste-dialog"
    >
      <div class="paste-guide">
        <div>
          <strong>复制表格后直接粘贴</strong>
          <p>带表头时按订单列表列名自动匹配，顺序不限；不带表头时按下方模板识别。</p>
        </div>
        <el-button round :icon="DocumentCopy" @click="copyTemplate">复制列名模板</el-button>
      </div>
      <code class="paste-column-preview">{{ pasteTemplate }}</code>
      <el-input
        v-model="pasteText"
        type="textarea"
        :rows="11"
        resize="vertical"
        placeholder="在这里粘贴从 WPS 或 Excel 复制的多行数据……"
      />
      <template #footer>
        <el-button round @click="pasteDialog = false">取消</el-button>
        <el-button type="primary" round @click="importPastedRows">识别并加入表格</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.batch-create-shell {
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.batch-intro,
.batch-section-title,
.batch-grid-summary,
.batch-create-footer,
.paste-guide {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.batch-intro {
  padding: 2px 2px 0;
}
.batch-intro strong,
.batch-section-title strong,
.batch-grid-summary strong,
.batch-create-footer strong,
.paste-guide strong {
  color: var(--app-heading);
  font-size: 16px;
}
.batch-intro p,
.paste-guide p {
  margin: 4px 0 0;
  color: var(--app-muted);
  font-size: 13px;
}
.batch-intro-actions,
.batch-footer-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.batch-intro-actions :deep(.el-button + .el-button),
.batch-footer-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.batch-default-panel {
  padding: 12px 14px 14px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-control) 62%, transparent);
}
.batch-section-title {
  margin-bottom: 10px;
}
.batch-section-title div,
.batch-grid-summary div,
.batch-create-footer div:first-child {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.batch-section-title span,
.batch-grid-summary span,
.batch-create-footer span {
  color: var(--app-muted);
  font-size: 13px;
}
.batch-default-grid {
  display: grid;
  grid-template-columns: 160px 160px 150px 170px minmax(220px, 1fr);
  gap: 10px;
}
.batch-default-grid label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.batch-default-grid label > span {
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 650;
}
.batch-default-grid :deep(.el-select),
.batch-default-grid :deep(.el-date-editor) {
  width: 100%;
}
.batch-grid-summary {
  padding: 0 2px;
}
.grid-scroll-hint {
  white-space: nowrap;
}
.batch-grid-scroll {
  position: relative;
  max-height: min(56vh, 610px);
  overflow: auto;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: var(--app-card-solid);
  scrollbar-gutter: stable;
}
.batch-grid {
  min-width: 100%;
  border-spacing: 0;
  border-collapse: separate;
  table-layout: fixed;
  color: var(--app-text);
}
.batch-grid th,
.batch-grid td {
  padding: 7px 6px;
  border-right: 1px solid color-mix(in srgb, var(--app-border) 68%, transparent);
  border-bottom: 1px solid var(--app-border);
  background: var(--app-card-solid);
  text-align: left;
  vertical-align: middle;
}
.batch-grid th {
  position: sticky;
  z-index: 3;
  top: 0;
  height: 40px;
  color: var(--app-heading);
  background: color-mix(in srgb, var(--app-control) 92%, var(--app-card-solid));
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.batch-grid tbody tr:nth-child(even) td {
  background: color-mix(in srgb, var(--app-control) 42%, var(--app-card-solid));
}
.batch-grid tbody tr.has-error td {
  background: color-mix(in srgb, var(--app-danger) 5%, var(--app-card-solid));
}
.batch-grid :deep(.el-input__wrapper),
.batch-grid :deep(.el-select__wrapper),
.batch-grid :deep(.el-date-editor) {
  min-height: 34px;
}
.batch-grid :deep(.el-date-editor),
.batch-grid :deep(.el-select) {
  width: 100%;
}
.batch-grid :deep(.el-input__inner),
.batch-grid :deep(.el-select__placeholder),
.batch-grid :deep(.el-select__selected-item) {
  font-size: 14px;
  font-weight: 550;
}
.sticky-tools-column {
  position: sticky !important;
  z-index: 4 !important;
  left: 0;
  width: 112px;
  min-width: 112px;
  box-shadow: 8px 0 16px rgba(15, 23, 42, 0.055);
}
th.sticky-tools-column {
  z-index: 6 !important;
}
.row-tools-cell {
  padding: 5px 7px !important;
}
.row-number-line,
.row-tool-buttons {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.row-number-line strong {
  color: var(--app-heading);
  font-size: 14px;
}
.row-error-badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  color: #dc2626;
  background: color-mix(in srgb, var(--app-danger) 10%, transparent);
  font-size: 11px;
  font-weight: 700;
  cursor: help;
}
.row-tool-buttons {
  justify-content: flex-start;
  margin-top: 1px;
}
.row-tool-buttons :deep(.el-button) {
  width: 25px;
  height: 25px;
}
.row-tool-buttons :deep(.el-button + .el-button) {
  margin-left: 0;
}
.funding-cell,
.scan-rebate-editor {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.scan-rebate-editor span {
  color: #059669;
  font-size: 12px;
  font-weight: 750;
  white-space: nowrap;
}
.batch-create-footer {
  position: sticky;
  z-index: 8;
  bottom: -18px;
  margin: 0 -20px -18px;
  padding: 13px 20px 16px;
  border-top: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-card-solid) 92%, transparent);
  box-shadow: 0 -10px 24px rgba(15, 23, 42, 0.055);
  backdrop-filter: blur(16px);
}
.paste-guide {
  margin-bottom: 12px;
}
.paste-column-preview {
  display: block;
  max-height: 74px;
  margin-bottom: 12px;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid var(--app-border);
  border-radius: 11px;
  color: var(--app-muted);
  background: var(--app-hover);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
}

@media (max-width: 1100px) {
  .batch-default-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .default-address {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .batch-intro,
  .batch-section-title,
  .batch-grid-summary,
  .batch-create-footer,
  .paste-guide {
    align-items: stretch;
    flex-direction: column;
  }
  .batch-default-grid {
    grid-template-columns: 1fr;
  }
  .default-address {
    grid-column: auto;
  }
  .batch-create-footer div:first-child,
  .batch-section-title div,
  .batch-grid-summary div {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
  .batch-footer-actions :deep(.el-button) {
    min-width: 0;
    flex: 1;
  }
  .batch-create-footer {
    bottom: -14px;
    margin: 0 -15px -14px;
    padding: 11px 15px 13px;
  }
}
</style>
