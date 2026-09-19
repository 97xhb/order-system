<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  DocumentCopy,
  Download,
  Filter,
  Picture,
  Plus,
  Refresh,
  Search,
  Setting,
  Tickets,
  Van,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { SheetData } from 'write-excel-file/browser';
import { getApiErrorMessage } from '../lib/api-error';
import { formatBusinessDate } from '../lib/business-date';
import { http } from '../lib/http';
import OrderBatchCreateView from './OrderBatchCreateView.vue';
import OrderCreateView from './OrderCreateView.vue';

interface OptionItem {
  id: string;
  name: string;
  code?: string;
}

type FundingType = 'SELF_PAID' | 'SUBMITTER_ADVANCED' | 'OTHER';
type ShipmentStatus = 'NOT_SHIPPED' | 'SHIPPED' | 'DELIVERED' | 'EXCEPTION';
type SettlementStatus = 'UNPAID' | 'PAID' | 'EXCEPTION';
type StoredSettlementStatus = SettlementStatus | 'PARTIAL';
type ReviewStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
type SerialSort = 'asc' | 'desc';
type CustomFieldType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'INTEGER'
  | 'QUANTITY'
  | 'MONEY'
  | 'DATE'
  | 'DATETIME'
  | 'SINGLE_SELECT'
  | 'MULTI_SELECT'
  | 'BOOLEAN'
  | 'LINK'
  | 'IMAGE'
  | 'FILE';

interface CustomFieldOption {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  showInTable: boolean;
  filterable: boolean;
  sortOrder: number;
}

interface OrderCustomFieldValue {
  definitionId: string;
  value: unknown;
}

interface EditReasonEntry {
  reason: string;
  createdAt: string;
}

interface OrderApiRow {
  id: string;
  serialNo: number;
  source: string;
  reviewStatus: ReviewStatus;
  orderedAt: string;
  platform: OptionItem;
  submitter: OptionItem;
  category: OptionItem | null;
  scheme: OptionItem | null;
  externalIdentity: { displayCode: string } | null;
  productNameSnapshot: string;
  schemeNameSnapshot: string | null;
  platformOrderNo: string | null;
  inboundTrackingNo: string | null;
  purchaseAddress: string | null;
  fundingType: FundingType;
  customData: unknown;
  shipmentLink: { shipment: { trackingNo: string; carrier?: string | null } } | null;
  shipmentStatus: ShipmentStatus;
  orderAmount: string | number;
  paymentDiscountAmount: string | number;
  saleAmount: string | number;
  customerReceivedAmount: string | number;
  receivableStatus: StoredSettlementStatus;
  submitterSettlementAmount: string | number;
  submitterPaidAmount: string | number;
  submitterSettlementStatus: StoredSettlementStatus;
  scanAmount: string | number;
  platformRebateAmount: string | number;
  expectedProfit: string | number;
  settledProfit: string | number;
  rebateScanned: boolean | null;
  notes: string | null;
  editReasonHistory: EditReasonEntry[];
  customValues: OrderCustomFieldValue[];
}

interface OrderRow extends OrderApiRow {
  displaySerialNo: number;
}

interface OrdersResponse {
  items: OrderApiRow[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  summary: {
    submitterSettlementAmount: string | number;
    settledProfit: string | number;
    saleAmount: string | number;
  };
  quickCounts: {
    pendingReview: number;
  };
  options: {
    platforms: OptionItem[];
    categories: OptionItem[];
    schemes: OptionItem[];
    submitters: OptionItem[];
    customFields: CustomFieldOption[];
    orderTableFields: OrderTableFieldMeta[];
  };
}

interface LogisticsQueryResult {
  success: boolean;
  kind: 'inbound' | 'shipment';
  trackingNo: string;
  carrierCode: string | null;
  carrierName: string | null;
  stateText: string;
  reason: string | null;
  updatedAt: string;
  traces: Array<{ time: string; station: string; remark: string; action: string }>;
}

interface OrderTableFieldMeta {
  key: string;
  label: string;
  description?: string;
  width?: number;
  minWidth?: number;
  defaultVisible?: boolean;
}

interface TableColumnOption {
  key: string;
  label: string;
  field?: string;
  width?: number;
  minWidth?: number;
  customFieldId?: string;
  customFieldType?: CustomFieldType;
  defaultVisible?: boolean;
}

const baseTableColumnOptions: TableColumnOption[] = [
  { key: 'serialNo', label: '序号', field: 'displaySerialNo', width: 68 },
  { key: 'orderedAt', label: '下单日期', field: 'orderedAt', width: 104 },
  { key: 'platform', label: '平台', width: 82 },
  { key: 'submitter', label: '下单人', width: 125 },
  { key: 'category', label: '品类', width: 82 },
  { key: 'product', label: '商品/方案*数量', minWidth: 210 },
  { key: 'platformOrderNo', label: '平台订单号', field: 'platformOrderNo', width: 145 },
  {
    key: 'inboundTrackingNo',
    label: '平台运单号',
    field: 'inboundTrackingNo',
    width: 215,
  },
  { key: 'purchaseAddress', label: '下单地址', field: 'purchaseAddress', minWidth: 180 },
  { key: 'shipmentTrackingNo', label: '寄件运单号', width: 215 },
  { key: 'shipmentStatus', label: '寄件状态', width: 102 },
  { key: 'fundingType', label: '支付方式', width: 108 },
  { key: 'paymentDiscountAmount', label: '支付优惠', width: 105 },
  { key: 'orderAmount', label: '下单金额', width: 108 },
  { key: 'submitterSettlementAmount', label: '结算金额', width: 108 },
  { key: 'platformRebateAmount', label: '扫码返利', width: 132 },
  { key: 'submitterSettlementStatus', label: '结算状态', width: 132 },
  { key: 'saleAmount', label: '回款金额', width: 108 },
  { key: 'receivableStatus', label: '回款状态', width: 132 },
  { key: 'profit', label: '利润', width: 150 },
  { key: 'notes', label: '备注', field: 'notes', minWidth: 190 },
  { key: 'editReasonHistory', label: '修改说明', minWidth: 260 },
];
const baseDefaultVisibleColumnKeys = baseTableColumnOptions.map((item) => item.key);
const columnSettingsStorageKey = 'order-system:order-table-columns-v3';
const copyColumnSettingsStorageKey = 'order-system:order-copy-columns-v1';
const defaultCopyColumnKeys = ['inboundTrackingNo', 'shipmentTrackingNo'];
const serialSortStorageKey = 'order-system:order-serial-sort';

const rows = ref<OrderRow[]>([]);
const options = reactive<OrdersResponse['options']>({
  platforms: [],
  categories: [],
  schemes: [],
  submitters: [],
  customFields: [],
  orderTableFields: [],
});
const tableColumnOptions = computed<TableColumnOption[]>(() => [
  ...(options.orderTableFields.length
    ? options.orderTableFields.map((field) => ({
        key: field.key,
        label: field.label,
        width: field.width,
        minWidth: field.minWidth,
        defaultVisible: field.defaultVisible,
      }))
    : baseTableColumnOptions),
  ...options.customFields.map((field) => ({
    key: `custom:${field.id}`,
    label: field.label,
    minWidth: field.type === 'LONG_TEXT' ? 210 : 140,
    customFieldId: field.id,
    customFieldType: field.type,
    defaultVisible: field.showInTable,
  })),
]);
const defaultVisibleColumnKeys = computed(() =>
  tableColumnOptions.value.filter((item) => item.defaultVisible !== false).map((item) => item.key),
);
const tableColumnOptionMap = computed(
  () => new Map(tableColumnOptions.value.map((item) => [item.key, item])),
);
const loading = ref(false);
const appliedFilterCount = ref(0);
const filteredSummary = reactive({
  submitterSettlementAmount: 0 as string | number,
  settledProfit: 0 as string | number,
  saleAmount: 0 as string | number,
});
const batchCustomerSaving = ref(false);
const batchSubmitterSaving = ref(false);
const selectedRows = ref<OrderRow[]>([]);
const copyPopoverVisible = ref(false);
const copyColumnKeys = ref<string[]>([...defaultCopyColumnKeys]);
const copyImageSaving = ref(false);
const exportSaving = ref(false);
const logisticsDialog = ref(false);
const logisticsLoading = ref(false);
const logisticsOrder = ref<OrderRow | null>(null);
const logisticsKind = ref<'inbound' | 'shipment'>('shipment');
const logisticsResult = ref<LogisticsQueryResult | null>(null);
const logisticsCarrierCode = ref('');
const logisticsPhoneSuffix = ref('');
const activeQuickView = ref('all');
let latestLoadRequest = 0;
const visibleColumnKeys = ref<string[]>([...baseDefaultVisibleColumnKeys]);
const columnOrderKeys = ref<string[]>([...baseDefaultVisibleColumnKeys]);
const route = useRoute();
const createDialog = ref(false);
const batchCreateDialog = ref(false);
const editDialog = ref(false);
const showAdvancedFilters = ref(false);
const quickPaymentSaving = ref('');
const activeEditOrder = ref<OrderRow | null>(null);
const pagination = reactive({ page: 1, pageSize: 50, total: 0 });
const serialSort = ref<SerialSort>(
  localStorage.getItem(serialSortStorageKey) === 'desc' ? 'desc' : 'asc',
);
const filters = reactive({
  keyword: '',
  dateRange: [] as string[],
  platformIds: [] as string[],
  submitterIds: [] as string[],
  categoryIds: [] as string[],
  schemeIds: [] as string[],
  reviewStatus: '',
  shipmentStatus: '',
  receivableStatus: '',
  submitterSettlementStatus: '',
  rebateScanned: '' as '' | 'true' | 'false',
  exceptionOnly: false,
});

const statusLabels: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '待确认',
  APPROVED: '已确认',
  REJECTED: '已驳回',
  NOT_SHIPPED: '未寄出',
  SHIPPED: '已寄出',
  DELIVERED: '已签收',
  UNPAID: '未回款',
  PARTIAL: '未回款',
  PAID: '已回款',
  EXCEPTION: '异常',
};
const statusTypes: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  DRAFT: 'info',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  NOT_SHIPPED: 'info',
  SHIPPED: 'primary',
  DELIVERED: 'success',
  UNPAID: 'danger',
  PARTIAL: 'danger',
  PAID: 'success',
  EXCEPTION: 'danger',
};
const submitterSettlementStatusLabels: Record<StoredSettlementStatus, string> = {
  UNPAID: '未结算',
  PARTIAL: '未结算',
  PAID: '已结算',
  EXCEPTION: '异常',
};
const activeFilterCount = computed(
  () =>
    Object.values(filters).filter((value) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    ).length,
);
const pendingCount = ref(0);

const handleOrderSaved = async () => {
  createDialog.value = false;
  pagination.page = 1;
  await load();
};

const handleBatchOrdersSaved = async (count: number, completed: boolean) => {
  if (completed) batchCreateDialog.value = false;
  if (!count) return;
  pagination.page = 1;
  await load();
};

const handleOrderUpdated = async () => {
  editDialog.value = false;
  activeEditOrder.value = null;
  await load();
};

const handleOrderDeleted = async () => {
  editDialog.value = false;
  activeEditOrder.value = null;
  if (rows.value.length === 1 && pagination.page > 1) pagination.page -= 1;
  await load();
};

const handleEditReasonsCleared = async () => {
  await load();
};

const openEdit = (row: OrderRow) => {
  activeEditOrder.value = row;
  editDialog.value = true;
};

const money = (value: string | number | null | undefined) => `¥${Number(value ?? 0).toFixed(2)}`;
const date = (value: string) => formatBusinessDate(value);
const editReasonTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(value))
    .replaceAll('/', '-');
const plainCustomValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) {
    const text = value.map((item) => plainCustomValue(item)).filter((item) => item !== '-');
    return text.length ? text.join('、') : '-';
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['name', 'label', 'fileName', 'value', 'url']) {
      if (record[key] !== undefined && record[key] !== null) {
        return plainCustomValue(record[key]);
      }
    }
    return JSON.stringify(value);
  }
  return String(value);
};
const customFieldText = (row: OrderRow, column: TableColumnOption) => {
  if (!column.customFieldId) return '-';
  const value = (row.customValues ?? []).find(
    (item) => item.definitionId === column.customFieldId,
  )?.value;
  if (value === null || value === undefined || value === '') return '-';
  if (column.customFieldType === 'MONEY') {
    const amount = Number(value);
    return Number.isFinite(amount) ? money(amount) : plainCustomValue(value);
  }
  if (column.customFieldType === 'BOOLEAN') {
    if (value === true || value === 'true' || value === 1) return '是';
    if (value === false || value === 'false' || value === 0) return '否';
  }
  if (column.customFieldType === 'DATE') return plainCustomValue(value).slice(0, 10);
  if (column.customFieldType === 'DATETIME') {
    return plainCustomValue(value).replace('T', ' ').slice(0, 16);
  }
  return plainCustomValue(value);
};
const fundingTypeLabels: Record<FundingType, string> = {
  SELF_PAID: '自己付',
  SUBMITTER_ADVANCED: '代付',
  OTHER: '其他',
};
const fundingTypeText = (row: OrderRow) => {
  if (row.fundingType !== 'OTHER') return fundingTypeLabels[row.fundingType];
  if (!row.customData || typeof row.customData !== 'object' || Array.isArray(row.customData)) {
    return fundingTypeLabels.OTHER;
  }
  const value = (row.customData as Record<string, unknown>).fundingTypeOther;
  return typeof value === 'string' && value.trim() ? value : fundingTypeLabels.OTHER;
};
const shipmentStatusText = (row: OrderRow) => statusLabels[row.shipmentStatus];
const submitterSettlementStatusText = (row: OrderRow) =>
  submitterSettlementStatusLabels[row.submitterSettlementStatus];

const copyPlainValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => copyPlainValue(item))
      .filter(Boolean)
      .join('&');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['name', 'label', 'fileName', 'value', 'url']) {
      if (record[key] !== undefined && record[key] !== null) {
        return copyPlainValue(record[key]);
      }
    }
    return JSON.stringify(value);
  }
  return String(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join('&');
};

const copyCustomFieldValue = (row: OrderRow, column: TableColumnOption) => {
  if (!column.customFieldId) return '';
  const value = (row.customValues ?? []).find(
    (item) => item.definitionId === column.customFieldId,
  )?.value;
  if (value === null || value === undefined || value === '') return '';
  if (column.customFieldType === 'MONEY') {
    const amount = Number(value);
    return Number.isFinite(amount) ? money(amount) : copyPlainValue(value);
  }
  if (column.customFieldType === 'BOOLEAN') {
    if (value === true || value === 'true' || value === 1) return '是';
    if (value === false || value === 'false' || value === 0) return '否';
  }
  if (column.customFieldType === 'DATE') return copyPlainValue(value).slice(0, 10);
  if (column.customFieldType === 'DATETIME') {
    return copyPlainValue(value).replace('T', ' ').slice(0, 16);
  }
  return copyPlainValue(value);
};

const copyColumnValue = (row: OrderRow, column: TableColumnOption): string => {
  switch (column.key) {
    case 'serialNo':
      return String(row.displaySerialNo);
    case 'orderedAt':
      return date(row.orderedAt);
    case 'platform':
      return copyPlainValue(row.platform.name);
    case 'submitter':
      return copyPlainValue(row.submitter.name);
    case 'category':
      return copyPlainValue(row.category?.name);
    case 'product':
      return copyPlainValue(row.productNameSnapshot);
    case 'platformOrderNo':
      return copyPlainValue(row.platformOrderNo);
    case 'inboundTrackingNo':
      return copyPlainValue(row.inboundTrackingNo);
    case 'purchaseAddress':
      return copyPlainValue(row.purchaseAddress);
    case 'shipmentTrackingNo':
      return copyPlainValue(row.shipmentLink?.shipment.trackingNo);
    case 'shipmentStatus':
      return shipmentStatusText(row);
    case 'fundingType':
      return copyPlainValue(fundingTypeText(row));
    case 'paymentDiscountAmount':
      return money(row.paymentDiscountAmount);
    case 'orderAmount':
      return money(row.orderAmount);
    case 'submitterSettlementAmount':
      return money(row.submitterSettlementAmount);
    case 'platformRebateAmount':
      return `实际${money(row.platformRebateAmount)}&原始${money(row.scanAmount)}`;
    case 'submitterSettlementStatus':
      return submitterSettlementStatusText(row);
    case 'saleAmount':
      return money(row.saleAmount);
    case 'receivableStatus':
      return statusLabels[row.receivableStatus] ?? '';
    case 'profit':
      return `已结算${money(row.settledProfit)}&预结算${money(row.expectedProfit)}`;
    case 'notes':
      return copyPlainValue(row.notes);
    case 'editReasonHistory':
      return (row.editReasonHistory ?? [])
        .map((entry) => `${editReasonTime(entry.createdAt)} ${copyPlainValue(entry.reason)}`.trim())
        .filter(Boolean)
        .join('&');
    default:
      if (column.customFieldId) return copyCustomFieldValue(row, column);
      return copyPlainValue(
        (row as unknown as Record<string, unknown>)[column.field ?? column.key],
      );
  }
};

const withDisplaySerialNumbers = (
  items: OrderApiRow[],
  pageInfo: OrdersResponse['pagination'],
  sort: SerialSort,
): OrderRow[] => {
  const pageOffset = (pageInfo.page - 1) * pageInfo.pageSize;
  return items.map((row, index) => ({
    ...row,
    displaySerialNo: sort === 'asc' ? pageOffset + index + 1 : pageInfo.total - pageOffset - index,
  }));
};

const orderQueryParams = (page: number, pageSize: number) => ({
  page,
  pageSize,
  serialSort: serialSort.value,
  keyword: filters.keyword || undefined,
  orderedFrom: filters.dateRange[0],
  orderedTo: filters.dateRange[1],
  platformIds: filters.platformIds.join(',') || undefined,
  submitterIds: filters.submitterIds.join(',') || undefined,
  categoryIds: filters.categoryIds.join(',') || undefined,
  schemeIds: filters.schemeIds.join(',') || undefined,
  reviewStatus: filters.reviewStatus || undefined,
  shipmentStatus: filters.shipmentStatus || undefined,
  receivableStatus: filters.receivableStatus || undefined,
  submitterSettlementStatus: filters.submitterSettlementStatus || undefined,
  rebateScanned: filters.rebateScanned || undefined,
  exceptionOnly: filters.exceptionOnly || undefined,
});

const load = async () => {
  const requestId = ++latestLoadRequest;
  loading.value = true;
  try {
    const response = await http.get<OrdersResponse>('/admin/orders', {
      params: orderQueryParams(pagination.page, pagination.pageSize),
    });
    if (requestId !== latestLoadRequest) return;
    rows.value = withDisplaySerialNumbers(
      response.data.items,
      response.data.pagination,
      serialSort.value,
    );
    selectedRows.value = [];
    Object.assign(options, response.data.options);
    Object.assign(filteredSummary, response.data.summary);
    pendingCount.value = response.data.quickCounts.pendingReview;
    loadVisibleColumns();
    loadCopyColumnKeys();
    pagination.total = response.data.pagination.total;
    appliedFilterCount.value = activeFilterCount.value;
  } catch (error) {
    if (requestId !== latestLoadRequest) return;
    ElMessage.error(getApiErrorMessage(error, '订单列表加载失败'));
  } finally {
    if (requestId === latestLoadRequest) loading.value = false;
  }
};

const query = () => {
  activeQuickView.value = 'custom';
  pagination.page = 1;
  void load();
};

const toggleSerialSort = () => {
  serialSort.value = serialSort.value === 'asc' ? 'desc' : 'asc';
  localStorage.setItem(serialSortStorageKey, serialSort.value);
  pagination.page = 1;
  void load();
};

const resetFilters = () => {
  filters.keyword = '';
  filters.dateRange = [];
  filters.platformIds = [];
  filters.submitterIds = [];
  filters.categoryIds = [];
  filters.schemeIds = [];
  filters.reviewStatus = '';
  filters.shipmentStatus = '';
  filters.receivableStatus = '';
  filters.submitterSettlementStatus = '';
  filters.rebateScanned = '';
  filters.exceptionOnly = false;
};

const clearFilters = () => {
  resetFilters();
  query();
  activeQuickView.value = 'all';
};

const canSelectOrder = ({ row }: { row: OrderRow }) => row.reviewStatus === 'APPROVED';

const selectableRows = computed(() => rows.value.filter((row) => canSelectOrder({ row })));
const selectedCustomerRows = computed(() =>
  selectedRows.value.filter(
    (row) => row.reviewStatus === 'APPROVED' && row.receivableStatus !== 'PAID',
  ),
);
const selectedSubmitterRows = computed(() =>
  selectedRows.value.filter(
    (row) => row.reviewStatus === 'APPROVED' && row.submitterSettlementStatus !== 'PAID',
  ),
);
const selectedSettlementTotal = computed(() =>
  selectedSubmitterRows.value.reduce(
    (total, row) => total + Number(row.submitterSettlementAmount),
    0,
  ),
);
const selectedReceivableTotal = computed(() =>
  selectedCustomerRows.value.reduce((total, row) => total + Number(row.saleAmount), 0),
);
const selectedOrdersSummary = computed(() =>
  selectedRows.value.reduce(
    (summary, row) => ({
      submitterSettlementAmount:
        summary.submitterSettlementAmount + Number(row.submitterSettlementAmount),
      settledProfit: summary.settledProfit + Number(row.settledProfit),
      saleAmount: summary.saleAmount + Number(row.saleAmount),
    }),
    { submitterSettlementAmount: 0, settledProfit: 0, saleAmount: 0 },
  ),
);
const selectedRowIds = computed(() => new Set(selectedRows.value.map((row) => row.id)));
const allSelectableChecked = computed(
  () =>
    selectableRows.value.length > 0 &&
    selectableRows.value.every((row) => selectedRowIds.value.has(row.id)),
);
const selectionIndeterminate = computed(
  () => selectedRows.value.length > 0 && !allSelectableChecked.value,
);
const visibleColumnSet = computed(() => new Set(visibleColumnKeys.value));
const orderedTableColumnOptions = computed(() =>
  columnOrderKeys.value
    .map((key) => tableColumnOptionMap.value.get(key))
    .filter((item): item is TableColumnOption => Boolean(item)),
);
const visibleTableColumns = computed(() =>
  orderedTableColumnOptions.value.filter((item) => visibleColumnSet.value.has(item.key)),
);
const copyColumnSet = computed(() => new Set(copyColumnKeys.value));
const selectedCopyColumns = computed(() =>
  orderedTableColumnOptions.value.filter((item) => copyColumnSet.value.has(item.key)),
);
const tableRenderKey = computed(
  () => `${columnOrderKeys.value.join('|')}::${visibleColumnKeys.value.join('|')}`,
);

const isRowSelected = (row: OrderRow) => selectedRowIds.value.has(row.id);
const orderRowClassName = ({ row }: { row: OrderRow }) =>
  isRowSelected(row) ? 'is-selected-row' : '';
const isColumnVisible = (key: string) => visibleColumnSet.value.has(key);
const isCopyColumnSelected = (key: string) => copyColumnSet.value.has(key);

const setCopyColumnKeys = (keys: string[]) => {
  const allowedKeys = new Set(tableColumnOptions.value.map((item) => item.key));
  copyColumnKeys.value = [...new Set(keys)].filter((key) => allowedKeys.has(key));
  localStorage.setItem(copyColumnSettingsStorageKey, JSON.stringify(copyColumnKeys.value));
};

const loadCopyColumnKeys = () => {
  const allowedKeys = new Set(tableColumnOptions.value.map((item) => item.key));
  const stored = localStorage.getItem(copyColumnSettingsStorageKey);
  if (!stored) {
    copyColumnKeys.value = defaultCopyColumnKeys.filter((key) => allowedKeys.has(key));
    return;
  }
  try {
    const value = JSON.parse(stored) as unknown;
    copyColumnKeys.value = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && allowedKeys.has(item))
      : defaultCopyColumnKeys.filter((key) => allowedKeys.has(key));
  } catch {
    localStorage.removeItem(copyColumnSettingsStorageKey);
    copyColumnKeys.value = defaultCopyColumnKeys.filter((key) => allowedKeys.has(key));
  }
};

const toggleCopyColumn = (key: string) => {
  setCopyColumnKeys(
    isCopyColumnSelected(key)
      ? copyColumnKeys.value.filter((item) => item !== key)
      : [...copyColumnKeys.value, key],
  );
};

const selectVisibleCopyColumns = () => {
  setCopyColumnKeys(visibleTableColumns.value.map((item) => item.key));
};

const selectAllCopyColumns = () => {
  setCopyColumnKeys(orderedTableColumnOptions.value.map((item) => item.key));
};

const writeClipboardText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('copy failed');
};

const copySelectedContent = async () => {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先勾选需要复制内容的订单');
    return;
  }
  if (!selectedCopyColumns.value.length) {
    ElMessage.warning('请至少选择一个需要复制的分类');
    return;
  }
  const selectedIds = new Set(selectedRows.value.map((row) => row.id));
  const selectedInListOrder = rows.value.filter((row) => selectedIds.has(row.id));
  let emptyCellCount = 0;
  const copiedLines = selectedInListOrder.map((row) =>
    selectedCopyColumns.value
      .map((column) => {
        const value = copyColumnValue(row, column);
        if (!value) emptyCellCount += 1;
        return value;
      })
      .join('&'),
  );

  try {
    await writeClipboardText(copiedLines.join('\n'));
    copyPopoverVisible.value = false;
    ElMessage.success(
      `已复制 ${copiedLines.length} 笔订单的 ${selectedCopyColumns.value.length} 个分类${emptyCellCount ? `，保留 ${emptyCellCount} 个空值` : ''}`,
    );
  } catch {
    ElMessage.error('复制失败，请重新操作');
  }
};

const imageFontFamily = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
const imageRightAlignedColumnKeys = new Set([
  'paymentDiscountAmount',
  'orderAmount',
  'submitterSettlementAmount',
  'platformRebateAmount',
  'saleAmount',
  'profit',
]);
const imageCenteredColumnKeys = new Set([
  'serialNo',
  'orderedAt',
  'platform',
  'category',
  'shipmentStatus',
  'fundingType',
  'submitterSettlementStatus',
  'receivableStatus',
]);

const wrapCanvasText = (context: CanvasRenderingContext2D, value: string, maxWidth: number) => {
  const result: string[] = [];
  const paragraphs = value.replaceAll('&', '\n').split(/\r?\n/);
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      result.push('');
      continue;
    }
    let line = '';
    for (const character of paragraph) {
      const nextLine = `${line}${character}`;
      if (line && context.measureText(nextLine).width > maxWidth) {
        result.push(line);
        line = character;
      } else {
        line = nextLine;
      }
    }
    result.push(line);
  }
  return result.length ? result : [''];
};

const copyImageColumnWidthRange = (column: TableColumnOption) => {
  if (column.key === 'serialNo') return { min: 68, max: 82 };
  if (column.key === 'orderedAt') return { min: 112, max: 132 };
  if (
    ['product', 'purchaseAddress', 'notes', 'editReasonHistory'].includes(column.key) ||
    column.customFieldType === 'LONG_TEXT'
  ) {
    return { min: 190, max: 290 };
  }
  if (['platformOrderNo', 'inboundTrackingNo', 'shipmentTrackingNo'].includes(column.key)) {
    return { min: 155, max: 220 };
  }
  if (imageRightAlignedColumnKeys.has(column.key)) return { min: 120, max: 165 };
  return { min: 104, max: 190 };
};

const canvasToPngBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('IMAGE_BLOB_FAILED'));
    }, 'image/png');
  });

const writeClipboardImage = async (canvas: HTMLCanvasElement) => {
  const blob = await canvasToPngBlob(canvas);
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return;
  }

  const holder = document.createElement('div');
  const image = document.createElement('img');
  holder.contentEditable = 'true';
  holder.style.position = 'fixed';
  holder.style.left = '0';
  holder.style.top = '0';
  holder.style.width = '1px';
  holder.style.height = '1px';
  holder.style.overflow = 'hidden';
  holder.style.opacity = '0.001';
  holder.appendChild(image);
  document.body.appendChild(holder);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
      image.src = canvas.toDataURL('image/png');
    });
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNode(image);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const copied = document.execCommand('copy');
    selection?.removeAllRanges();
    if (!copied) throw new Error('IMAGE_COPY_FAILED');
  } finally {
    holder.remove();
  }
};

const createSelectedOrdersTableCanvas = () => {
  const selectedIds = new Set(selectedRows.value.map((row) => row.id));
  const selectedInListOrder = rows.value.filter((row) => selectedIds.has(row.id));
  const columns = selectedCopyColumns.value;
  const measuringCanvas = document.createElement('canvas');
  const measuringContext = measuringCanvas.getContext('2d');
  if (!measuringContext) throw new Error('CANVAS_UNAVAILABLE');

  const horizontalPadding = 7;
  const bodyLineHeight = 17;
  const headerLineHeight = 17;
  measuringContext.font = `14px ${imageFontFamily}`;
  const rawRows = selectedInListOrder.map((row) =>
    columns.map((column) => copyColumnValue(row, column)),
  );
  const columnWidths = columns.map((column, columnIndex) => {
    const { min, max } = copyImageColumnWidthRange(column);
    const measuredWidths = [column.label, ...rawRows.map((row) => row[columnIndex])].flatMap(
      (value) => value.replaceAll('&', '\n').split(/\r?\n/),
    );
    const contentWidth = Math.max(
      ...measuredWidths.map((value) => measuringContext.measureText(value).width),
      0,
    );
    return Math.min(max, Math.max(min, Math.ceil(contentWidth + horizontalPadding * 2)));
  });
  const minimumImageWidth = 380;
  const measuredTableWidth = columnWidths.reduce((total, width) => total + width, 0);
  if (measuredTableWidth < minimumImageWidth && columnWidths.length) {
    columnWidths[columnWidths.length - 1] += minimumImageWidth - measuredTableWidth;
  }
  const logicalWidth = columnWidths.reduce((total, width) => total + width, 0);

  measuringContext.font = `600 13px ${imageFontFamily}`;
  const headerLines = columns.map((column, index) =>
    wrapCanvasText(measuringContext, column.label, columnWidths[index] - horizontalPadding * 2),
  );
  const headerHeight = Math.max(
    34,
    ...headerLines.map((lines) => lines.length * headerLineHeight + 10),
  );

  measuringContext.font = `14px ${imageFontFamily}`;
  const wrappedRows = rawRows.map((row) =>
    row.map((value, index) =>
      wrapCanvasText(measuringContext, value, columnWidths[index] - horizontalPadding * 2),
    ),
  );
  const rowHeights = wrappedRows.map((row) =>
    Math.max(24, ...row.map((lines) => lines.length * bodyLineHeight + 6)),
  );
  const headerTop = 0;
  const logicalHeight = headerHeight + rowHeights.reduce((a, b) => a + b, 0) + 1;
  const maximumDimension = 16_000;
  const maximumPixels = 64_000_000;
  const scale = Math.min(
    2,
    maximumDimension / logicalWidth,
    maximumDimension / logicalHeight,
    Math.sqrt(maximumPixels / (logicalWidth * logicalHeight)),
  );
  if (!Number.isFinite(scale) || scale < 0.45) throw new Error('IMAGE_TOO_LARGE');

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(logicalWidth * scale));
  canvas.height = Math.max(1, Math.ceil(logicalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_UNAVAILABLE');
  context.scale(scale, scale);
  context.textBaseline = 'top';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, logicalWidth, logicalHeight);

  const drawTextLines = (
    lines: string[],
    x: number,
    y: number,
    width: number,
    height: number,
    lineHeight: number,
    align: CanvasTextAlign,
  ) => {
    context.textAlign = align;
    const textX =
      align === 'right'
        ? x + width - horizontalPadding
        : align === 'center'
          ? x + width / 2
          : x + horizontalPadding;
    const textY = y + Math.max(0, (height - lines.length * lineHeight) / 2);
    lines.forEach((line, index) => context.fillText(line, textX, textY + index * lineHeight));
  };

  let currentX = 0;
  context.font = `700 14px ${imageFontFamily}`;
  columnWidths.forEach((width, index) => {
    context.fillStyle = '#a7c6e2';
    context.fillRect(currentX, headerTop, width, headerHeight);
    context.strokeStyle = '#1f2937';
    context.lineWidth = 1;
    context.strokeRect(currentX + 0.5, headerTop + 0.5, width, headerHeight);
    context.fillStyle = '#111827';
    drawTextLines(
      headerLines[index],
      currentX,
      headerTop,
      width,
      headerHeight,
      headerLineHeight,
      'center',
    );
    currentX += width;
  });

  let currentY = headerHeight;
  context.font = `13px ${imageFontFamily}`;
  wrappedRows.forEach((row, rowIndex) => {
    currentX = 0;
    const rowHeight = rowHeights[rowIndex];
    row.forEach((lines, columnIndex) => {
      const column = columns[columnIndex];
      const width = columnWidths[columnIndex];
      context.fillStyle = '#ffffff';
      context.fillRect(currentX, currentY, width, rowHeight);
      context.strokeStyle = '#1f2937';
      context.lineWidth = 1;
      context.strokeRect(currentX + 0.5, currentY + 0.5, width, rowHeight);
      context.fillStyle = '#1e293b';
      const align: CanvasTextAlign = imageRightAlignedColumnKeys.has(column.key)
        ? 'right'
        : imageCenteredColumnKeys.has(column.key)
          ? 'center'
          : 'left';
      drawTextLines(lines, currentX, currentY, width, rowHeight, bodyLineHeight, align);
      currentX += width;
    });
    currentY += rowHeight;
  });
  return canvas;
};

const copySelectedContentAsImage = async () => {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先勾选需要复制内容的订单');
    return;
  }
  if (!selectedCopyColumns.value.length) {
    ElMessage.warning('请至少选择一个需要复制的分类');
    return;
  }
  copyImageSaving.value = true;
  try {
    const canvas = createSelectedOrdersTableCanvas();
    await writeClipboardImage(canvas);
    copyPopoverVisible.value = false;
    ElMessage.success(`已将 ${selectedRows.value.length} 笔订单复制为表格图片，可直接粘贴发送`);
  } catch (error) {
    ElMessage.error(
      error instanceof Error && error.message === 'IMAGE_TOO_LARGE'
        ? '选择的内容过多，请减少订单或分类后再复制图片'
        : '表格图片复制失败，请使用新版 Chrome 或 Edge 重试',
    );
  } finally {
    copyImageSaving.value = false;
  }
};

type SpreadsheetCellValue = string | number | boolean;

const spreadsheetText = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => spreadsheetText(item))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['name', 'label', 'fileName', 'value', 'url']) {
      if (record[key] !== undefined && record[key] !== null) {
        return spreadsheetText(record[key]);
      }
    }
    return JSON.stringify(value);
  }
  return String(value).replace(/\r\n/g, '\n').trim();
};

const spreadsheetNumber = (value: unknown): number | string => {
  const number = Number(value);
  return Number.isFinite(number) ? number : spreadsheetText(value);
};

const spreadsheetCustomFieldValue = (
  row: OrderRow,
  column: TableColumnOption,
): SpreadsheetCellValue => {
  if (!column.customFieldId) return '';
  const value = (row.customValues ?? []).find(
    (item) => item.definitionId === column.customFieldId,
  )?.value;
  if (value === null || value === undefined || value === '') return '';
  if (['MONEY', 'INTEGER', 'QUANTITY'].includes(column.customFieldType ?? '')) {
    return spreadsheetNumber(value);
  }
  if (column.customFieldType === 'BOOLEAN') {
    if (value === true || value === 'true' || value === 1) return '是';
    if (value === false || value === 'false' || value === 0) return '否';
  }
  if (column.customFieldType === 'DATE') return spreadsheetText(value).slice(0, 10);
  if (column.customFieldType === 'DATETIME') {
    return spreadsheetText(value).replace('T', ' ').slice(0, 16);
  }
  return spreadsheetText(value);
};

const spreadsheetColumnValue = (row: OrderRow, column: TableColumnOption): SpreadsheetCellValue => {
  switch (column.key) {
    case 'serialNo':
      return row.displaySerialNo;
    case 'orderedAt':
      return date(row.orderedAt);
    case 'platform':
      return spreadsheetText(row.platform.name);
    case 'submitter':
      return spreadsheetText(row.submitter.name);
    case 'category':
      return spreadsheetText(row.category?.name);
    case 'product':
      return spreadsheetText(row.productNameSnapshot);
    case 'platformOrderNo':
      return spreadsheetText(row.platformOrderNo);
    case 'inboundTrackingNo':
      return spreadsheetText(row.inboundTrackingNo);
    case 'purchaseAddress':
      return spreadsheetText(row.purchaseAddress);
    case 'shipmentTrackingNo':
      return spreadsheetText(row.shipmentLink?.shipment.trackingNo);
    case 'shipmentStatus':
      return shipmentStatusText(row);
    case 'fundingType':
      return spreadsheetText(fundingTypeText(row));
    case 'paymentDiscountAmount':
      return spreadsheetNumber(row.paymentDiscountAmount);
    case 'orderAmount':
      return spreadsheetNumber(row.orderAmount);
    case 'submitterSettlementAmount':
      return spreadsheetNumber(row.submitterSettlementAmount);
    case 'platformRebateAmount':
      return `实际返利 ${Number(row.platformRebateAmount).toFixed(2)}\n原始扫码 ${Number(row.scanAmount).toFixed(2)}`;
    case 'submitterSettlementStatus':
      return submitterSettlementStatusText(row);
    case 'saleAmount':
      return spreadsheetNumber(row.saleAmount);
    case 'receivableStatus':
      return statusLabels[row.receivableStatus] ?? '';
    case 'profit':
      return `已结算 ${Number(row.settledProfit).toFixed(2)}\n预结算 ${Number(row.expectedProfit).toFixed(2)}`;
    case 'notes':
      return spreadsheetText(row.notes);
    case 'editReasonHistory':
      return (row.editReasonHistory ?? [])
        .map((entry) =>
          `${editReasonTime(entry.createdAt)} ${spreadsheetText(entry.reason)}`.trim(),
        )
        .filter(Boolean)
        .join('\n');
    default:
      if (column.customFieldId) return spreadsheetCustomFieldValue(row, column);
      return spreadsheetText(
        (row as unknown as Record<string, unknown>)[column.field ?? column.key],
      );
  }
};

const spreadsheetNumberFormat = (column: TableColumnOption) => {
  if (
    ['paymentDiscountAmount', 'orderAmount', 'submitterSettlementAmount', 'saleAmount'].includes(
      column.key,
    ) ||
    column.customFieldType === 'MONEY'
  ) {
    return '¥#,##0.00';
  }
  if (
    column.key === 'serialNo' ||
    column.customFieldType === 'INTEGER' ||
    column.customFieldType === 'QUANTITY'
  ) {
    return '0';
  }
  return undefined;
};

const spreadsheetColumnWidth = (column: TableColumnOption) => {
  const pixelWidth = column.width ?? column.minWidth ?? 150;
  return Math.min(42, Math.max(10, Math.round(pixelWidth / 8)));
};

const exportTimestamp = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}${part('month')}${part('day')}_${part('hour')}${part('minute')}${part('second')}`;
};

const filteredRowsForSpreadsheet = async () => {
  const pageSize = 200;
  const frozenParams = orderQueryParams(1, pageSize);
  const firstResponse = await http.get<OrdersResponse>('/admin/orders', {
    params: frozenParams,
  });
  const allRows = withDisplaySerialNumbers(
    firstResponse.data.items,
    firstResponse.data.pagination,
    serialSort.value,
  );
  for (let page = 2; page <= firstResponse.data.pagination.pageCount; page += 1) {
    const response = await http.get<OrdersResponse>('/admin/orders', {
      params: { ...frozenParams, page },
    });
    allRows.push(
      ...withDisplaySerialNumbers(response.data.items, response.data.pagination, serialSort.value),
    );
  }
  return allRows;
};

const exportOrdersAsSpreadsheet = async () => {
  const columns = [...visibleTableColumns.value];
  if (!columns.length) {
    ElMessage.warning('请先在列设置中至少显示一个导出字段');
    return;
  }

  exportSaving.value = true;
  try {
    const selectedIds = new Set(selectedRows.value.map((row) => row.id));
    const exportRows = selectedIds.size
      ? rows.value.filter((row) => selectedIds.has(row.id))
      : await filteredRowsForSpreadsheet();
    if (!exportRows.length) {
      ElMessage.warning('当前没有可导出的订单');
      return;
    }

    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const headerRow: SheetData[number] = columns.map((column) => ({
      value: column.label,
      type: String,
      format: '@',
      backgroundColor: '#3B82F6',
      textColor: '#FFFFFF',
      fontWeight: 'bold',
      align: 'center',
      alignVertical: 'center',
      wrap: true,
      height: 25,
      borderColor: '#2563EB',
      borderStyle: 'thin',
    }));
    const dataRows: SheetData = exportRows.map((row) => {
      const values = columns.map((column) => spreadsheetColumnValue(row, column));
      const height = values.some((value) => String(value).includes('\n')) ? 34 : 22;
      return values.map((value, columnIndex) => {
        const numberFormat = spreadsheetNumberFormat(columns[columnIndex]);
        const baseStyle = {
          alignVertical: 'top' as const,
          wrap: true,
          height,
          borderColor: '#DCE3EE',
          borderStyle: 'thin' as const,
        };
        if (typeof value === 'number') {
          return {
            ...baseStyle,
            value,
            type: Number,
            format: numberFormat,
            align: 'right' as const,
          };
        }
        if (typeof value === 'boolean') {
          return {
            ...baseStyle,
            value,
            type: Boolean,
            align: 'center' as const,
          };
        }
        return {
          ...baseStyle,
          value,
          type: String,
          format: '@',
          align: 'left' as const,
        };
      });
    });
    const sheetData: SheetData = [headerRow, ...dataRows];
    const scope = selectedIds.size
      ? '所选订单'
      : appliedFilterCount.value
        ? '筛选订单'
        : '全部订单';
    const fileName = `订单列表_${scope}_${exportTimestamp()}.xlsx`;
    await writeXlsxFile(
      sheetData,
      {
        sheet: '订单列表',
        columns: columns.map((column) => ({ width: spreadsheetColumnWidth(column) })),
        stickyRowsCount: 1,
        orientation: 'landscape',
      },
      {
        fontFamily: 'Microsoft YaHei',
        fontSize: 11,
      },
    ).toFile(fileName);
    ElMessage.success(`已导出 ${exportRows.length} 笔订单（XLSX）`);
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '订单导出失败'));
  } finally {
    exportSaving.value = false;
  }
};

const resetVisibleColumns = () => {
  visibleColumnKeys.value = [...defaultVisibleColumnKeys.value];
  columnOrderKeys.value = tableColumnOptions.value.map((item) => item.key);
};

const loadVisibleColumns = () => {
  const stored = localStorage.getItem(columnSettingsStorageKey);
  if (!stored) {
    resetVisibleColumns();
    return;
  }
  try {
    const value = JSON.parse(stored) as unknown;
    const allColumnKeys = tableColumnOptions.value.map((item) => item.key);
    const allowedKeys = new Set(allColumnKeys);
    const defaultVisibleKeys = new Set(defaultVisibleColumnKeys.value);
    const normalizeKeys = (items: unknown) =>
      Array.isArray(items)
        ? items.filter((item): item is string => typeof item === 'string' && allowedKeys.has(item))
        : [];
    if (Array.isArray(value)) {
      visibleColumnKeys.value = normalizeKeys(value);
      columnOrderKeys.value = [...allColumnKeys];
      return;
    }
    if (!value || typeof value !== 'object') return;
    const settings = value as { version?: unknown; visible?: unknown; order?: unknown };
    const storedVisible = normalizeKeys(settings.visible);
    const storedOrder = normalizeKeys(settings.order);
    const newlyAddedKeys = allColumnKeys.filter((key) => !storedOrder.includes(key));
    visibleColumnKeys.value = [
      ...storedVisible,
      ...newlyAddedKeys.filter(
        (key) => defaultVisibleKeys.has(key) && !storedVisible.includes(key),
      ),
    ];
    columnOrderKeys.value = [
      ...storedOrder,
      ...allColumnKeys.filter((key) => !storedOrder.includes(key)),
    ];
  } catch {
    localStorage.removeItem(columnSettingsStorageKey);
    resetVisibleColumns();
  }
};

const toggleColumnVisibility = (key: string, checked: boolean) => {
  if (checked) {
    if (!visibleColumnSet.value.has(key)) {
      visibleColumnKeys.value = [...visibleColumnKeys.value, key];
    }
    return;
  }
  visibleColumnKeys.value = visibleColumnKeys.value.filter((item) => item !== key);
};

const moveColumn = (key: string, offset: -1 | 1) => {
  const index = columnOrderKeys.value.indexOf(key);
  const targetIndex = index + offset;
  if (index < 0 || targetIndex < 0 || targetIndex >= columnOrderKeys.value.length) return;
  const next = [...columnOrderKeys.value];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  columnOrderKeys.value = next;
};

const toggleRowSelection = (row: OrderRow, checked: unknown) => {
  if (!canSelectOrder({ row })) return;
  if (Boolean(checked)) {
    if (!isRowSelected(row)) selectedRows.value = [...selectedRows.value, row];
    return;
  }
  selectedRows.value = selectedRows.value.filter((item) => item.id !== row.id);
};

const toggleAllSelection = (checked: unknown) => {
  selectedRows.value = Boolean(checked) ? [...selectableRows.value] : [];
};

watch(
  [visibleColumnKeys, columnOrderKeys],
  ([visible, order]) =>
    localStorage.setItem(columnSettingsStorageKey, JSON.stringify({ version: 4, visible, order })),
  { deep: true },
);

const batchMarkPaid = async (target: 'CUSTOMER' | 'SUBMITTER') => {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先勾选需要批量处理的订单');
    return;
  }

  const isCustomer = target === 'CUSTOMER';
  const targetRows = isCustomer ? selectedCustomerRows.value : selectedSubmitterRows.value;
  if (!targetRows.length) {
    ElMessage.warning(isCustomer ? '勾选的订单均已收到回款' : '勾选的订单均已给下单人结算');
    return;
  }

  const submitterIds = new Set(targetRows.map((row) => row.submitter.id));
  if (!isCustomer && submitterIds.size !== 1) {
    ElMessage.warning('一次只能给同一个下单人批量结算，请先按下单人筛选');
    return;
  }

  const excludedCount = selectedRows.value.length - targetRows.length;
  const total = isCustomer ? selectedReceivableTotal.value : selectedSettlementTotal.value;
  const title = isCustomer ? '批量标记收货佬已回款' : '批量给下单人结算';
  const completedLabel = isCustomer ? '已回款' : '已结算';
  const submitterName = targetRows[0]?.submitter.name ?? '该下单人';
  const targetDescription = isCustomer ? '' : `“${submitterName}”的 `;
  const excludedDescription = excludedCount
    ? ` 已自动排除 ${excludedCount} 笔已完成该项回款的订单。`
    : '';
  try {
    await ElMessageBox.confirm(
      `确定将${targetDescription}${targetRows.length} 笔订单统一标记为${completedLabel}吗？金额合计 ${money(total)}。${excludedDescription}`,
      title,
      {
        type: 'success',
        confirmButtonText: `确认${completedLabel}`,
        cancelButtonText: '取消',
      },
    );

    if (isCustomer) batchCustomerSaving.value = true;
    else batchSubmitterSaving.value = true;
    const results = await Promise.allSettled(
      targetRows.map((row) =>
        http.patch(
          `/admin/orders/${row.id}/progress`,
          isCustomer
            ? {
                shipmentStatus: 'DELIVERED',
                customerReceivedAmount: Number(row.saleAmount),
                receivableStatus: 'PAID',
                reason: '批量标记收货佬已回款',
              }
            : {
                submitterPaidAmount: Number(row.submitterSettlementAmount),
                submitterSettlementStatus: 'PAID',
                reason: '批量标记给下单人已结算',
              },
        ),
      ),
    );
    const failedCount = results.filter((result) => result.status === 'rejected').length;
    const successCount = results.length - failedCount;

    if (failedCount) {
      ElMessage.warning(
        `已成功处理 ${successCount} 笔，另有 ${failedCount} 笔处理失败，请重新筛选核对`,
      );
    } else {
      ElMessage.success(
        `已将 ${successCount} 笔订单统一标记为${isCustomer ? '收货佬已回款' : '给下单人已结算'}`,
      );
    }
    selectedRows.value = [];
    await load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, `${title}失败`));
  } finally {
    if (isCustomer) batchCustomerSaving.value = false;
    else batchSubmitterSaving.value = false;
  }
};

const quickView = (type: string) => {
  resetFilters();
  if (type === 'shipped-unpaid') {
    filters.shipmentStatus = 'SHIPPED';
    filters.receivableStatus = 'UNPAID';
  } else if (type === 'received-not-paid') {
    filters.receivableStatus = 'PAID';
    filters.submitterSettlementStatus = 'UNPAID';
  } else if (type === 'settled') {
    filters.receivableStatus = 'PAID';
    filters.submitterSettlementStatus = 'PAID';
  } else if (type === 'pending') {
    filters.reviewStatus = 'PENDING';
  } else if (type === 'exception') {
    filters.exceptionOnly = true;
  }
  query();
  activeQuickView.value = type;
};

const review = async (row: OrderRow, status: 'APPROVED' | 'REJECTED') => {
  try {
    let reason = '';
    if (status === 'REJECTED') {
      const result = await ElMessageBox.prompt(
        '填写驳回说明，提交人会看到订单已驳回。',
        '驳回登记',
        {
          inputPlaceholder: '例如：订单号有误，请修改后重新提交',
          inputValidator: (value) => Boolean(value.trim()) || '请填写驳回说明',
          type: 'warning',
        },
      );
      reason = result.value;
    } else {
      await ElMessageBox.confirm(
        `确认登记 #${row.displaySerialNo} 入库？确认后下单人不能再修改。`,
        '确认入库',
        { type: 'success' },
      );
    }
    await http.patch(`/admin/orders/${row.id}/review`, { status, reason });
    ElMessage.success(status === 'APPROVED' ? '报单已确认并入库锁定' : '报单已驳回');
    await load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '审核操作失败'));
  }
};

const quickMarkPaid = async (row: OrderRow, target: 'CUSTOMER' | 'SUBMITTER') => {
  const isCustomer = target === 'CUSTOMER';
  const title = isCustomer ? '标记收货佬已回款' : '标记给下单人已结算';
  const amount = isCustomer ? Number(row.saleAmount) : Number(row.submitterSettlementAmount);
  const savingKey = `${row.id}:${target}`;
  try {
    await ElMessageBox.confirm(
      `${title}？系统会将对应实收/实付金额填写为 ${money(amount)}。`,
      title,
      {
        type: 'success',
        confirmButtonText: '确认标记',
        cancelButtonText: '取消',
      },
    );
    quickPaymentSaving.value = savingKey;
    await http.patch(
      `/admin/orders/${row.id}/progress`,
      isCustomer
        ? {
            shipmentStatus: 'DELIVERED',
            customerReceivedAmount: amount,
            receivableStatus: 'PAID',
            reason: '订单列表快捷标记收货佬已回款',
          }
        : {
            submitterPaidAmount: amount,
            submitterSettlementStatus: 'PAID',
            reason: '订单列表快捷标记给下单人已结算',
          },
    );
    ElMessage.success(`${title}成功`);
    await load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, `${title}失败`));
  } finally {
    quickPaymentSaving.value = '';
  }
};

/**
 * 订单列表里的运单号允许写成 `运单号-手机尾号`，例如 `SF5137788186075-1429`。
 * 顺丰、中通等快递查询时必须单独提供收件人手机号后四位，
 * 所以展示和查询时都要把两者分开。
 */
const splitTrackingInput = (value?: string | null) => {
  const raw = (value || '').trim();
  const matched = /^(.*\S)-(\d{4})$/.exec(raw);
  if (!matched) return { trackingNo: raw, phoneSuffix: '' };
  return { trackingNo: matched[1].trim(), phoneSuffix: matched[2] };
};

const trackingNoOnly = (value?: string | null) => splitTrackingInput(value).trackingNo;

const queryActiveLogistics = async () => {
  const row = logisticsOrder.value;
  if (!row) return;
  logisticsLoading.value = true;
  try {
    const response = await http.post<LogisticsQueryResult>(
      `/admin/logistics/orders/${row.id}/query`,
      {
        kind: logisticsKind.value,
        carrierCode: logisticsCarrierCode.value.trim() || undefined,
        phoneSuffix: logisticsPhoneSuffix.value.trim() || undefined,
      },
    );
    logisticsResult.value = response.data;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '物流查询失败，请检查 ApiZero 配置'));
  } finally {
    logisticsLoading.value = false;
  }
};

const openLogisticsQuery = async (row: OrderRow, kind: 'inbound' | 'shipment') => {
  const trackingNo =
    kind === 'inbound' ? row.inboundTrackingNo : row.shipmentLink?.shipment.trackingNo;
  if (!trackingNo) return;
  const parsed = splitTrackingInput(trackingNo);
  logisticsOrder.value = row;
  logisticsKind.value = kind;
  logisticsResult.value = null;
  logisticsCarrierCode.value = kind === 'shipment' ? row.shipmentLink?.shipment.carrier || '' : '';
  // 运单号自带的手机尾号直接预填，无需手动再输入。
  logisticsPhoneSuffix.value = parsed.phoneSuffix;
  logisticsDialog.value = true;
  await queryActiveLogistics();
};

onMounted(() => {
  const view = typeof route.query.view === 'string' ? route.query.view : '';
  if (view) {
    resetFilters();
    if (view === 'not-shipped') filters.shipmentStatus = 'NOT_SHIPPED';
    if (view === 'unpaid-receipt') filters.receivableStatus = 'UNPAID';
    if (view === 'unpaid-payout') filters.submitterSettlementStatus = 'UNPAID';
    if (view === 'received-not-paid') {
      filters.receivableStatus = 'PAID';
      filters.submitterSettlementStatus = 'UNPAID';
    }
    if (view === 'pending') filters.reviewStatus = 'PENDING';
    const schemeId = typeof route.query.schemeId === 'string' ? route.query.schemeId : '';
    if (schemeId) filters.schemeIds = [schemeId];
    if (view === 'exception') filters.exceptionOnly = true;
  }
  void load();
});
</script>

<template>
  <div class="page-shell orders-page">
    <div class="page-heading">
      <div>
        <span class="page-kicker">ORDER WORKSPACE</span>
        <h1>订单列表</h1>
        <p>订单、寄件、回款状态和结算状态集中在一张工作表中。</p>
      </div>
      <div class="heading-actions">
        <el-button round :icon="DocumentCopy" @click="batchCreateDialog = true">批量添加</el-button>
        <el-button type="primary" round :icon="Plus" @click="createDialog = true"
          >新建订单</el-button
        >
      </div>
    </div>

    <section class="surface-card order-workbar">
      <div class="view-tabs">
        <button
          type="button"
          class="view-tab view-tab--all"
          :class="{ 'is-active': activeQuickView === 'all' }"
          @click="clearFilters"
        >
          全部订单
        </button>
        <button
          type="button"
          class="view-tab view-tab--pending"
          :class="{ 'is-active': activeQuickView === 'pending' }"
          @click="quickView('pending')"
        >
          待确认 {{ pendingCount }}
        </button>
        <button
          type="button"
          class="view-tab view-tab--shipped"
          :class="{ 'is-active': activeQuickView === 'shipped-unpaid' }"
          @click="quickView('shipped-unpaid')"
        >
          已寄出未收款
        </button>
        <button
          type="button"
          class="view-tab view-tab--received"
          :class="{ 'is-active': activeQuickView === 'received-not-paid' }"
          @click="quickView('received-not-paid')"
        >
          已收未结算
        </button>
        <button
          type="button"
          class="view-tab view-tab--settled"
          :class="{ 'is-active': activeQuickView === 'settled' }"
          @click="quickView('settled')"
        >
          双向结清
        </button>
        <button
          type="button"
          class="view-tab view-tab--exception"
          :class="{ 'is-active': activeQuickView === 'exception' }"
          @click="quickView('exception')"
        >
          异常
        </button>
      </div>
      <div class="filter-surface">
        <div class="primary-filters">
          <el-input
            v-model="filters.keyword"
            class="keyword-filter"
            :prefix-icon="Search"
            clearable
            placeholder="搜索订单号、商品、账号、运单号"
            @keyup.enter="query"
          />
          <el-select
            v-model="filters.platformIds"
            multiple
            collapse-tags
            clearable
            placeholder="平台"
          >
            <el-option
              v-for="item in options.platforms"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
          <el-select
            v-model="filters.submitterIds"
            multiple
            collapse-tags
            clearable
            filterable
            placeholder="下单人"
          >
            <el-option
              v-for="item in options.submitters"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
          <el-select v-model="filters.receivableStatus" clearable placeholder="回款状态">
            <el-option label="未回款" value="UNPAID" />
            <el-option label="已回款" value="PAID" />
            <el-option label="异常" value="EXCEPTION" />
          </el-select>
          <el-select v-model="filters.submitterSettlementStatus" clearable placeholder="结算状态">
            <el-option label="未结算" value="UNPAID" />
            <el-option label="已结算" value="PAID" />
            <el-option label="异常" value="EXCEPTION" />
          </el-select>
          <div class="filter-actions">
            <el-button round :icon="Filter" @click="showAdvancedFilters = !showAdvancedFilters">
              高级筛选<span v-if="activeFilterCount">（{{ activeFilterCount }}）</span>
            </el-button>
            <el-button type="primary" round :loading="loading" @click="query">查询</el-button>
            <el-button type="danger" plain round @click="clearFilters">重置</el-button>
          </div>
        </div>
        <p class="filter-hint">
          不同筛选条件会同时满足；同一分类选择多个选项时，匹配其中任一选项。
        </p>

        <el-collapse-transition>
          <el-form v-show="showAdvancedFilters" label-position="top" class="advanced-filter-grid">
            <el-form-item label="下单日期">
              <el-date-picker
                v-model="filters.dateRange"
                type="daterange"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
            <el-form-item label="下单品类">
              <el-select v-model="filters.categoryIds" multiple collapse-tags clearable>
                <el-option
                  v-for="item in options.categories"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="分享方案">
              <el-select v-model="filters.schemeIds" multiple collapse-tags clearable filterable>
                <el-option
                  v-for="item in options.schemes"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="审核状态">
              <el-select v-model="filters.reviewStatus" clearable>
                <el-option label="待确认" value="PENDING" />
                <el-option label="已确认" value="APPROVED" />
                <el-option label="已驳回" value="REJECTED" />
              </el-select>
            </el-form-item>
            <el-form-item label="寄件状态">
              <el-select v-model="filters.shipmentStatus" clearable>
                <el-option label="未寄出" value="NOT_SHIPPED" />
                <el-option label="已寄出" value="SHIPPED" />
                <el-option label="已签收" value="DELIVERED" />
                <el-option label="异常" value="EXCEPTION" />
              </el-select>
            </el-form-item>
            <el-form-item label="是否扫码">
              <el-select v-model="filters.rebateScanned" clearable>
                <el-option label="已扫码" value="true" />
                <el-option label="未扫码" value="false" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-collapse-transition>
      </div>
    </section>

    <section class="surface-card table-card">
      <div class="table-toolbar">
        <div class="table-title">
          <span class="table-title-icon" aria-hidden="true">
            <el-icon><Tickets /></el-icon>
          </span>
          <div>
            <strong>订单列表</strong><span>共 {{ pagination.total }} 条数据</span>
          </div>
        </div>
        <div class="table-toolbar-actions">
          <div
            v-if="appliedFilterCount || selectedRows.length"
            class="order-summary-stack"
            aria-live="polite"
          >
            <div v-if="appliedFilterCount" class="filtered-summary" aria-label="筛选订单金额汇总">
              <span
                >总结算金额
                <strong>{{ money(filteredSummary.submitterSettlementAmount) }}</strong></span
              >
              <span
                >总利润 <strong>{{ money(filteredSummary.settledProfit) }}</strong></span
              >
              <span
                >总回款金额 <strong>{{ money(filteredSummary.saleAmount) }}</strong></span
              >
            </div>
            <div
              v-if="selectedRows.length"
              class="filtered-summary selected-orders-summary"
              aria-label="已选订单金额汇总"
            >
              <span class="selected-summary-count">已选 {{ selectedRows.length }} 笔</span>
              <span
                >总结算金额
                <strong>{{ money(selectedOrdersSummary.submitterSettlementAmount) }}</strong></span
              >
              <span
                >总利润 <strong>{{ money(selectedOrdersSummary.settledProfit) }}</strong></span
              >
              <span
                >总回款金额 <strong>{{ money(selectedOrdersSummary.saleAmount) }}</strong></span
              >
            </div>
          </div>
          <el-button
            class="export-orders-button"
            round
            :icon="Download"
            :loading="exportSaving"
            :disabled="!pagination.total && !selectedRows.length"
            :title="
              selectedRows.length
                ? `导出已勾选的 ${selectedRows.length} 笔订单`
                : '导出当前全部筛选结果，不受分页限制'
            "
            @click="exportOrdersAsSpreadsheet"
          >
            {{ selectedRows.length ? `导出所选 ${selectedRows.length} 笔` : '导出 XLSX' }}
          </el-button>
          <el-button
            class="serial-sort-button"
            round
            :icon="serialSort === 'asc' ? ArrowUp : ArrowDown"
            @click="toggleSerialSort"
          >
            {{ serialSort === 'asc' ? '序号正序' : '序号倒序' }}
          </el-button>
          <el-popover placement="bottom-end" :width="360" trigger="click">
            <template #reference>
              <el-button round :icon="Setting">列设置</el-button>
            </template>
            <div class="column-settings">
              <div class="column-settings-header">
                <div>
                  <strong>选择需要显示的字段</strong>
                  <span>选择结果会自动保存在当前浏览器</span>
                </div>
                <el-button text type="primary" @click="resetVisibleColumns">恢复默认</el-button>
              </div>
              <div class="column-settings-options">
                <div
                  v-for="(item, index) in orderedTableColumnOptions"
                  :key="item.key"
                  class="column-setting-row"
                >
                  <button
                    type="button"
                    class="card-choice column-setting-choice"
                    :class="{ 'is-selected': isColumnVisible(item.key) }"
                    :aria-pressed="isColumnVisible(item.key)"
                    @click="toggleColumnVisibility(item.key, !isColumnVisible(item.key))"
                  >
                    <span class="column-setting-label">
                      {{ item.label }}
                      <small v-if="item.customFieldId">扩展</small>
                    </span>
                  </button>
                  <div class="column-order-actions">
                    <el-button
                      text
                      circle
                      :icon="ArrowUp"
                      :disabled="index === 0"
                      :aria-label="`上移${item.label}`"
                      @click="moveColumn(item.key, -1)"
                    />
                    <el-button
                      text
                      circle
                      :icon="ArrowDown"
                      :disabled="index === orderedTableColumnOptions.length - 1"
                      :aria-label="`下移${item.label}`"
                      @click="moveColumn(item.key, 1)"
                    />
                  </div>
                </div>
              </div>
              <div class="column-settings-note">
                已启用的订单扩展字段会自动加入这里；选择列和操作 / 审核列始终显示。
              </div>
            </div>
          </el-popover>
          <div class="batch-payment-actions">
            <el-popover
              v-model:visible="copyPopoverVisible"
              placement="bottom-end"
              :width="440"
              trigger="click"
              popper-class="order-copy-popover"
              :disabled="!selectedRows.length"
            >
              <template #reference>
                <el-button
                  class="copy-tracking-button"
                  round
                  :icon="DocumentCopy"
                  :disabled="!selectedRows.length"
                >
                  复制所选内容
                  <el-icon class="copy-dropdown-arrow"><ArrowDown /></el-icon>
                </el-button>
              </template>
              <div class="copy-content-panel">
                <div class="copy-content-heading">
                  <div>
                    <strong>选择复制分类</strong>
                    <span>已勾选 {{ selectedRows.length }} 笔订单</span>
                  </div>
                  <b>{{ selectedCopyColumns.length }} 项</b>
                </div>
                <div class="copy-content-tools">
                  <el-button text type="primary" size="small" @click="selectVisibleCopyColumns">
                    选择当前显示
                  </el-button>
                  <el-button text type="primary" size="small" @click="selectAllCopyColumns">
                    全部分类
                  </el-button>
                  <el-button text type="danger" size="small" @click="setCopyColumnKeys([])">
                    清空
                  </el-button>
                </div>
                <div class="copy-content-options">
                  <button
                    v-for="item in orderedTableColumnOptions"
                    :key="item.key"
                    type="button"
                    class="card-choice copy-column-choice"
                    :class="{ 'is-selected': isCopyColumnSelected(item.key) }"
                    :aria-pressed="isCopyColumnSelected(item.key)"
                    @click="toggleCopyColumn(item.key)"
                  >
                    <span>{{ item.label }}</span>
                    <small v-if="item.customFieldId">扩展</small>
                  </button>
                </div>
                <p class="copy-content-note">
                  文本复制每笔订单一行并用 &amp; 分隔；图片复制会保留分类表头并按表格排版。
                </p>
                <div class="copy-content-submit-row">
                  <el-button
                    class="copy-content-submit"
                    type="primary"
                    plain
                    round
                    :icon="DocumentCopy"
                    :disabled="!selectedCopyColumns.length"
                    @click="copySelectedContent"
                  >
                    复制文本
                  </el-button>
                  <el-button
                    class="copy-content-submit copy-content-image-submit"
                    type="primary"
                    round
                    :icon="Picture"
                    :loading="copyImageSaving"
                    :disabled="!selectedCopyColumns.length"
                    @click="copySelectedContentAsImage"
                  >
                    复制表格图片
                  </el-button>
                </div>
              </div>
            </el-popover>
            <el-button
              class="batch-payment-button customer-payment-button"
              round
              :disabled="!selectedCustomerRows.length"
              :loading="batchCustomerSaving"
              @click="batchMarkPaid('CUSTOMER')"
            >
              批量已回款
              <span v-if="selectedCustomerRows.length">{{ selectedCustomerRows.length }} 笔</span>
            </el-button>
            <el-button
              class="batch-payment-button submitter-payment-button"
              round
              :disabled="!selectedSubmitterRows.length"
              :loading="batchSubmitterSaving"
              @click="batchMarkPaid('SUBMITTER')"
            >
              批量已结算
              <span v-if="selectedSubmitterRows.length">{{ selectedSubmitterRows.length }} 笔</span>
            </el-button>
          </div>
          <el-button circle :icon="Refresh" :loading="loading" @click="load" />
        </div>
      </div>
      <div class="order-table-shell desktop-order-table">
        <vxe-table
          :key="tableRenderKey"
          class="order-table"
          v-loading="loading"
          :data="rows"
          stripe
          :max-height="640"
          show-overflow
          :column-config="{ resizable: true }"
          :row-config="{ keyField: 'id', isHover: true }"
          :row-class-name="orderRowClassName"
        >
          <vxe-column width="54" align="center">
            <template #header>
              <el-checkbox
                class="selection-checkbox"
                :model-value="allSelectableChecked"
                :indeterminate="selectionIndeterminate"
                :disabled="!selectableRows.length"
                aria-label="全选已确认订单"
                @change="toggleAllSelection"
              />
            </template>
            <template #default="{ row }">
              <el-checkbox
                class="selection-checkbox"
                :model-value="isRowSelected(row)"
                :disabled="!canSelectOrder({ row })"
                :aria-label="`选择订单 ${row.displaySerialNo}`"
                @change="toggleRowSelection(row, $event)"
              />
            </template>
          </vxe-column>
          <vxe-column
            v-for="column in visibleTableColumns"
            :key="column.key"
            :field="column.field"
            :title="column.label"
            :width="column.width"
            :min-width="column.minWidth"
            :show-overflow="!['product', 'editReasonHistory'].includes(column.key)"
          >
            <template #default="{ row }">
              <template v-if="column.key === 'serialNo'">{{ row.displaySerialNo }}</template>
              <template v-else-if="column.key === 'orderedAt'">{{ date(row.orderedAt) }}</template>
              <template v-else-if="column.key === 'platform'">{{ row.platform.name }}</template>
              <template v-else-if="column.key === 'submitter'">{{ row.submitter.name }}</template>
              <template v-else-if="column.key === 'category'">
                {{ row.category?.name || '-' }}
              </template>
              <template v-else-if="column.key === 'product'">
                <div class="product-lines">{{ row.productNameSnapshot }}</div>
              </template>
              <template v-else-if="column.key === 'platformOrderNo'">
                {{ row.platformOrderNo || '-' }}
              </template>
              <template v-else-if="column.key === 'inboundTrackingNo'">
                <div class="tracking-cell">
                  <span class="tracking-number">
                    {{ trackingNoOnly(row.inboundTrackingNo) || '-' }}
                    <small
                      v-if="splitTrackingInput(row.inboundTrackingNo).phoneSuffix"
                      class="tracking-phone-suffix"
                    >
                      尾号 {{ splitTrackingInput(row.inboundTrackingNo).phoneSuffix }}
                    </small>
                  </span>
                  <el-button
                    v-if="row.inboundTrackingNo"
                    class="tracking-query-button"
                    text
                    circle
                    size="small"
                    :icon="Van"
                    title="查询物流"
                    aria-label="查询平台运单物流"
                    @click.stop="openLogisticsQuery(row, 'inbound')"
                  />
                </div>
              </template>
              <template v-else-if="column.key === 'purchaseAddress'">
                {{ row.purchaseAddress || '-' }}
              </template>
              <template v-else-if="column.key === 'shipmentTrackingNo'">
                <div class="tracking-cell">
                  <span class="tracking-number">
                    {{ trackingNoOnly(row.shipmentLink?.shipment.trackingNo) || '-' }}
                    <small
                      v-if="splitTrackingInput(row.shipmentLink?.shipment.trackingNo).phoneSuffix"
                      class="tracking-phone-suffix"
                    >
                      尾号
                      {{ splitTrackingInput(row.shipmentLink?.shipment.trackingNo).phoneSuffix }}
                    </small>
                  </span>
                  <el-button
                    v-if="row.shipmentLink?.shipment.trackingNo"
                    class="tracking-query-button"
                    text
                    circle
                    size="small"
                    :icon="Van"
                    title="查询物流"
                    aria-label="查询寄件运单物流"
                    @click.stop="openLogisticsQuery(row, 'shipment')"
                  />
                </div>
              </template>
              <template v-else-if="column.key === 'shipmentStatus'">
                <el-tag :type="statusTypes[row.shipmentStatus]" size="small">
                  {{ shipmentStatusText(row) }}
                </el-tag>
              </template>
              <template v-else-if="column.key === 'fundingType'">
                {{ fundingTypeText(row) }}
              </template>
              <template v-else-if="column.key === 'paymentDiscountAmount'">
                {{ money(row.paymentDiscountAmount) }}
              </template>
              <template v-else-if="column.key === 'orderAmount'">
                {{ money(row.orderAmount) }}
              </template>
              <template v-else-if="column.key === 'saleAmount'">
                {{ money(row.saleAmount) }}
              </template>
              <template v-else-if="column.key === 'receivableStatus'">
                <el-tag :type="statusTypes[row.receivableStatus]">
                  {{ statusLabels[row.receivableStatus] }}
                </el-tag>
              </template>
              <template v-else-if="column.key === 'submitterSettlementAmount'">
                {{ money(row.submitterSettlementAmount) }}
              </template>
              <template v-else-if="column.key === 'submitterSettlementStatus'">
                <el-tag :type="statusTypes[row.submitterSettlementStatus]">
                  {{ submitterSettlementStatusText(row) }}
                </el-tag>
              </template>
              <template v-else-if="column.key === 'platformRebateAmount'">
                <div
                  class="rebate-stack"
                  :class="{ 'is-unscanned': !row.rebateScanned }"
                  title="实际返利金额 = 原始扫码金额 × 0.9"
                >
                  <strong><small>实际</small>{{ money(row.platformRebateAmount) }}</strong>
                  <span><small>原始</small>{{ money(row.scanAmount) }}</span>
                </div>
              </template>
              <div v-else-if="column.key === 'profit'" class="profit-stack">
                <strong :class="{ 'is-unsettled': row.receivableStatus !== 'PAID' }">
                  <span>已结算</span>{{ money(row.settledProfit) }}
                </strong>
                <small><span>预结算</span>{{ money(row.expectedProfit) }}</small>
              </div>
              <template v-else-if="column.key === 'notes'">{{ row.notes || '-' }}</template>
              <template v-else-if="column.key === 'editReasonHistory'">
                <div v-if="row.editReasonHistory.length" class="edit-reason-history">
                  <div
                    v-for="entry in row.editReasonHistory"
                    :key="`${entry.createdAt}:${entry.reason}`"
                    class="edit-reason-entry"
                  >
                    <time>{{ editReasonTime(entry.createdAt) }}</time>
                    <span>{{ entry.reason }}</span>
                  </div>
                </div>
                <span v-else>-</span>
              </template>
              <template v-else-if="column.customFieldId">
                {{ customFieldText(row, column) }}
              </template>
            </template>
          </vxe-column>
          <vxe-column title="操作 / 审核" width="296" fixed="right" align="center">
            <template #default="{ row }">
              <div v-if="row.reviewStatus === 'PENDING'" class="row-actions">
                <el-button
                  class="order-action order-action--edit"
                  size="small"
                  @click="openEdit(row)"
                  ><span class="order-action-dot" aria-hidden="true"></span>编辑</el-button
                >
                <el-button
                  class="order-action order-action--approve"
                  size="small"
                  @click="review(row, 'APPROVED')"
                  ><span class="order-action-dot" aria-hidden="true"></span>通过</el-button
                >
                <el-button
                  class="order-action order-action--reject"
                  size="small"
                  @click="review(row, 'REJECTED')"
                  ><span class="order-action-dot" aria-hidden="true"></span>驳回</el-button
                >
                <span class="order-review-state is-pending">待确认</span>
              </div>
              <div v-else-if="row.reviewStatus === 'APPROVED'" class="row-actions">
                <el-button
                  class="order-action order-action--edit"
                  size="small"
                  @click="openEdit(row)"
                  ><span class="order-action-dot" aria-hidden="true"></span>编辑</el-button
                >
                <el-button
                  v-if="row.receivableStatus !== 'PAID'"
                  class="order-action order-action--receipt"
                  size="small"
                  :loading="quickPaymentSaving === `${row.id}:CUSTOMER`"
                  @click="quickMarkPaid(row, 'CUSTOMER')"
                >
                  <span class="order-action-dot" aria-hidden="true"></span>已回款
                </el-button>
                <el-button
                  v-if="row.submitterSettlementStatus !== 'PAID'"
                  class="order-action order-action--settlement"
                  size="small"
                  :loading="quickPaymentSaving === `${row.id}:SUBMITTER`"
                  @click="quickMarkPaid(row, 'SUBMITTER')"
                >
                  <span class="order-action-dot" aria-hidden="true"></span>已结算
                </el-button>
                <span
                  v-if="row.receivableStatus === 'PAID' && row.submitterSettlementStatus === 'PAID'"
                  class="order-complete-state"
                >
                  双向结清
                </span>
                <span class="order-review-state is-approved">已确认</span>
              </div>
              <div v-else class="row-actions">
                <el-button
                  class="order-action order-action--edit"
                  size="small"
                  @click="openEdit(row)"
                  ><span class="order-action-dot" aria-hidden="true"></span>编辑</el-button
                >
                <span
                  class="order-review-state"
                  :class="row.reviewStatus === 'REJECTED' ? 'is-rejected' : 'is-draft'"
                >
                  {{ statusLabels[row.reviewStatus] }}
                </span>
              </div>
            </template>
          </vxe-column>
        </vxe-table>
      </div>
      <div v-loading="loading" class="mobile-order-list">
        <el-empty
          v-if="!rows.length && !loading"
          description="暂无符合条件的订单"
          :image-size="72"
        />
        <article
          v-for="row in rows"
          :key="row.id"
          class="mobile-order-card"
          :class="{ 'is-selected': isRowSelected(row) }"
        >
          <header class="mobile-order-header">
            <el-checkbox
              class="selection-checkbox mobile-order-checkbox"
              :model-value="isRowSelected(row)"
              :disabled="!canSelectOrder({ row })"
              :aria-label="`选择订单 ${row.displaySerialNo}`"
              @change="toggleRowSelection(row, $event)"
            />
            <div class="mobile-order-heading-copy">
              <div class="mobile-order-meta">
                <span>#{{ row.displaySerialNo }}</span>
                <time>{{ date(row.orderedAt) }}</time>
              </div>
              <strong class="product-lines">{{ row.productNameSnapshot }}</strong>
              <small>{{ row.platform.name }} · {{ row.submitter.name }}</small>
            </div>
            <el-tag :type="statusTypes[row.reviewStatus]" size="small">
              {{ statusLabels[row.reviewStatus] }}
            </el-tag>
          </header>

          <div class="mobile-order-status-grid">
            <div>
              <span>寄件</span>
              <el-tag :type="statusTypes[row.shipmentStatus]" size="small">
                {{ shipmentStatusText(row) }}
              </el-tag>
            </div>
            <div>
              <span>回款</span>
              <el-tag :type="statusTypes[row.receivableStatus]" size="small">
                {{ statusLabels[row.receivableStatus] }}
              </el-tag>
            </div>
            <div>
              <span>结算</span>
              <el-tag :type="statusTypes[row.submitterSettlementStatus]" size="small">
                {{ submitterSettlementStatusText(row) }}
              </el-tag>
            </div>
          </div>

          <div class="mobile-order-money-grid">
            <div>
              <span>下单金额</span><strong>{{ money(row.orderAmount) }}</strong>
            </div>
            <div>
              <span>结算金额</span><strong>{{ money(row.submitterSettlementAmount) }}</strong>
            </div>
            <div>
              <span>回款金额</span><strong>{{ money(row.saleAmount) }}</strong>
            </div>
            <div>
              <span>扫码返利</span>
              <strong class="mobile-rebate-amount">{{ money(row.platformRebateAmount) }}</strong>
              <small>原始 {{ money(row.scanAmount) }}</small>
            </div>
          </div>

          <details class="mobile-order-details">
            <summary>运单、支付与备注</summary>
            <dl>
              <div>
                <dt>平台订单号</dt>
                <dd>{{ row.platformOrderNo || '-' }}</dd>
              </div>
              <div>
                <dt>平台运单号</dt>
                <dd class="mobile-tracking-value">
                  <span>
                    {{ trackingNoOnly(row.inboundTrackingNo) || '-' }}
                  </span>
                  <small
                    v-if="splitTrackingInput(row.inboundTrackingNo).phoneSuffix"
                    class="tracking-phone-suffix"
                  >
                    尾号 {{ splitTrackingInput(row.inboundTrackingNo).phoneSuffix }}
                  </small>
                  <el-button
                    v-if="row.inboundTrackingNo"
                    text
                    circle
                    size="small"
                    :icon="Van"
                    title="查询物流"
                    @click="openLogisticsQuery(row, 'inbound')"
                  />
                </dd>
              </div>
              <div>
                <dt>寄件运单号</dt>
                <dd class="mobile-tracking-value">
                  <span>
                    {{ trackingNoOnly(row.shipmentLink?.shipment.trackingNo) || '-' }}
                  </span>
                  <small
                    v-if="splitTrackingInput(row.shipmentLink?.shipment.trackingNo).phoneSuffix"
                    class="tracking-phone-suffix"
                  >
                    尾号 {{ splitTrackingInput(row.shipmentLink?.shipment.trackingNo).phoneSuffix }}
                  </small>
                  <el-button
                    v-if="row.shipmentLink?.shipment.trackingNo"
                    text
                    circle
                    size="small"
                    :icon="Van"
                    title="查询物流"
                    @click="openLogisticsQuery(row, 'shipment')"
                  />
                </dd>
              </div>
              <div>
                <dt>支付方式</dt>
                <dd>{{ fundingTypeText(row) }}</dd>
              </div>
              <div>
                <dt>下单地址</dt>
                <dd>{{ row.purchaseAddress || '-' }}</dd>
              </div>
              <div>
                <dt>备注</dt>
                <dd class="product-lines">{{ row.notes || '-' }}</dd>
              </div>
            </dl>
            <div v-if="row.editReasonHistory.length" class="mobile-edit-history">
              <strong>修改说明</strong>
              <div
                v-for="entry in row.editReasonHistory"
                :key="`${entry.createdAt}:${entry.reason}`"
                class="edit-reason-entry"
              >
                <time>{{ editReasonTime(entry.createdAt) }}</time>
                <span>{{ entry.reason }}</span>
              </div>
            </div>
          </details>

          <footer class="mobile-order-actions">
            <div v-if="row.reviewStatus === 'PENDING'" class="row-actions">
              <el-button
                class="order-action order-action--edit"
                size="small"
                @click="openEdit(row)"
              >
                <span class="order-action-dot" aria-hidden="true"></span>编辑
              </el-button>
              <el-button
                class="order-action order-action--approve"
                size="small"
                @click="review(row, 'APPROVED')"
              >
                <span class="order-action-dot" aria-hidden="true"></span>通过
              </el-button>
              <el-button
                class="order-action order-action--reject"
                size="small"
                @click="review(row, 'REJECTED')"
              >
                <span class="order-action-dot" aria-hidden="true"></span>驳回
              </el-button>
            </div>
            <div v-else-if="row.reviewStatus === 'APPROVED'" class="row-actions">
              <el-button
                class="order-action order-action--edit"
                size="small"
                @click="openEdit(row)"
              >
                <span class="order-action-dot" aria-hidden="true"></span>编辑
              </el-button>
              <el-button
                v-if="row.receivableStatus !== 'PAID'"
                class="order-action order-action--receipt"
                size="small"
                :loading="quickPaymentSaving === `${row.id}:CUSTOMER`"
                @click="quickMarkPaid(row, 'CUSTOMER')"
              >
                <span class="order-action-dot" aria-hidden="true"></span>已回款
              </el-button>
              <el-button
                v-if="row.submitterSettlementStatus !== 'PAID'"
                class="order-action order-action--settlement"
                size="small"
                :loading="quickPaymentSaving === `${row.id}:SUBMITTER`"
                @click="quickMarkPaid(row, 'SUBMITTER')"
              >
                <span class="order-action-dot" aria-hidden="true"></span>已结算
              </el-button>
              <span
                v-if="row.receivableStatus === 'PAID' && row.submitterSettlementStatus === 'PAID'"
                class="order-complete-state"
              >
                双向结清
              </span>
            </div>
            <div v-else class="row-actions">
              <el-button
                class="order-action order-action--edit"
                size="small"
                @click="openEdit(row)"
              >
                <span class="order-action-dot" aria-hidden="true"></span>编辑
              </el-button>
              <span
                class="order-review-state"
                :class="row.reviewStatus === 'REJECTED' ? 'is-rejected' : 'is-draft'"
              >
                {{ statusLabels[row.reviewStatus] }}
              </span>
            </div>
          </footer>
        </article>
      </div>
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[20, 50, 100, 200]"
        :pager-count="5"
        layout="total, sizes, prev, pager, next"
        @change="load"
      />
    </section>

    <el-dialog
      v-model="batchCreateDialog"
      title="批量添加订单"
      width="min(1540px, 98vw)"
      top="2vh"
      destroy-on-close
      append-to-body
      class="batch-order-create-dialog"
    >
      <OrderBatchCreateView
        :order-fields="options.orderTableFields"
        @saved="handleBatchOrdersSaved"
        @cancel="batchCreateDialog = false"
      />
    </el-dialog>

    <el-dialog
      v-model="createDialog"
      title="新建订单"
      width="min(1220px, 96vw)"
      top="3vh"
      destroy-on-close
      append-to-body
      class="order-create-dialog"
    >
      <OrderCreateView embedded @saved="handleOrderSaved" @cancel="createDialog = false" />
    </el-dialog>

    <el-dialog
      v-model="editDialog"
      :title="`编辑订单 #${activeEditOrder?.displaySerialNo ?? ''}`"
      width="min(1220px, 96vw)"
      top="3vh"
      destroy-on-close
      append-to-body
      class="order-create-dialog"
      @closed="activeEditOrder = null"
    >
      <OrderCreateView
        v-if="activeEditOrder"
        embedded
        mode="edit"
        :order="activeEditOrder"
        @saved="handleOrderUpdated"
        @deleted="handleOrderDeleted"
        @history-cleared="handleEditReasonsCleared"
        @cancel="editDialog = false"
      />
    </el-dialog>

    <el-dialog
      v-model="logisticsDialog"
      :title="`${logisticsKind === 'inbound' ? '平台' : '寄件'}运单物流`"
      width="min(620px, 94vw)"
      append-to-body
      class="logistics-query-dialog"
    >
      <div v-loading="logisticsLoading" class="logistics-query-content">
        <div class="logistics-query-summary">
          <span>运单号</span>
          <strong>{{
            logisticsResult?.trackingNo ||
            splitTrackingInput(
              logisticsKind === 'inbound'
                ? logisticsOrder?.inboundTrackingNo
                : logisticsOrder?.shipmentLink?.shipment.trackingNo,
            ).trackingNo ||
            '无'
          }}</strong>
          <el-tag v-if="logisticsResult" round effect="plain" type="success">
            {{ logisticsResult.stateText }}
          </el-tag>
        </div>
        <div class="logistics-query-options">
          <el-input
            v-model="logisticsCarrierCode"
            clearable
            placeholder="承运商编码（可空，默认自动识别）"
          />
          <el-input
            v-model="logisticsPhoneSuffix"
            clearable
            maxlength="4"
            inputmode="numeric"
            placeholder="手机号后4位（顺丰/中通可能需要）"
            @keyup.enter="queryActiveLogistics"
          />
          <el-button round type="primary" :loading="logisticsLoading" @click="queryActiveLogistics">
            重新查询
          </el-button>
        </div>
        <p v-if="logisticsResult?.carrierName" class="logistics-query-carrier">
          {{ logisticsResult.carrierName }}
          <span v-if="logisticsResult.carrierCode">{{ logisticsResult.carrierCode }}</span>
        </p>
        <p v-if="logisticsResult?.reason" class="logistics-query-reason">
          {{ logisticsResult.reason }}
        </p>
        <el-empty
          v-if="!logisticsLoading && logisticsResult && !logisticsResult.traces.length"
          description="暂无物流轨迹"
          :image-size="64"
        />
        <ol v-if="logisticsResult?.traces.length" class="logistics-trace-list">
          <li v-for="(trace, index) in logisticsResult.traces" :key="`${trace.time}-${index}`">
            <span class="logistics-trace-dot"></span>
            <div>
              <time>{{ trace.time || '—' }}</time>
              <p>{{ trace.station || trace.remark || '—' }}</p>
              <small v-if="trace.remark && trace.remark !== trace.station">{{
                trace.remark
              }}</small>
            </div>
          </li>
        </ol>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.orders-page {
  display: grid;
  gap: 14px;
}

.heading-actions,
.filter-actions,
.table-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.table-toolbar-actions {
  min-width: 0;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.batch-payment-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.heading-actions :deep(.el-button),
.table-toolbar-actions :deep(.el-button) {
  backdrop-filter: blur(12px);
}
:global(.order-create-dialog .el-dialog__body) {
  max-height: calc(94vh - 72px);
  overflow-y: auto;
  scrollbar-gutter: stable;
}
:global(.batch-order-create-dialog .el-dialog__body) {
  max-height: calc(96vh - 72px);
  overflow-y: auto;
  scrollbar-gutter: stable;
}
.batch-payment-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.tracking-cell,
.mobile-tracking-value {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 3px;
}

.tracking-cell > span,
.mobile-tracking-value > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 运单号与手机尾号分开显示，避免混在一起被当成运单号提交给快递接口。 */
.tracking-number {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
}

.tracking-phone-suffix {
  flex: 0 0 auto;
  padding: 0 5px;
  border-radius: 6px;
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 17px;
  background: color-mix(in srgb, var(--app-primary) 10%, transparent);
}

.tracking-query-button {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--app-primary) !important;
  background: color-mix(in srgb, var(--app-primary) 10%, transparent) !important;
}

.tracking-query-button:hover {
  color: var(--app-primary-strong) !important;
  background: color-mix(in srgb, var(--app-primary) 18%, transparent) !important;
}

.logistics-query-content {
  min-height: 120px;
}

.logistics-query-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 13px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-control) 70%, transparent);
}

.logistics-query-summary span {
  color: var(--app-muted);
  font-size: 12px;
}

.logistics-query-summary strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--app-heading);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logistics-query-reason {
  margin: 10px 0 0;
  color: var(--app-warning);
  font-size: 13px;
}

.logistics-query-options {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(180px, 1fr) auto;
  gap: 8px;
  margin-top: 10px;
}

.logistics-query-carrier {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 10px 2px 0;
  color: var(--app-text);
  font-size: 13px;
}

.logistics-query-carrier span {
  color: var(--app-muted);
  font-size: 12px;
  text-transform: uppercase;
}

.logistics-trace-list {
  display: grid;
  gap: 0;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.logistics-trace-list li {
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
  padding-bottom: 15px;
}

.logistics-trace-list li:not(:last-child)::before {
  position: absolute;
  top: 11px;
  bottom: 0;
  left: 8px;
  width: 1px;
  background: var(--app-border);
  content: '';
}

.logistics-trace-dot {
  z-index: 1;
  width: 9px;
  height: 9px;
  margin: 3px 0 0 4px;
  border: 2px solid var(--app-primary);
  border-radius: 50%;
  background: var(--app-card-solid);
}

.logistics-trace-list time {
  color: var(--app-muted);
  font-size: 11px;
}

.logistics-trace-list p {
  margin: 3px 0 0;
  color: var(--app-text);
  font-size: 13px;
  line-height: 1.55;
}

.logistics-trace-list small {
  display: block;
  margin-top: 2px;
  color: var(--app-muted);
}

@media (max-width: 560px) {
  .logistics-query-options {
    grid-template-columns: 1fr;
  }

  .logistics-query-options .el-button {
    width: 100%;
  }
}
.batch-payment-button :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.batch-payment-button :deep(span > span) {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
}
:global(.el-popper.order-copy-popover) {
  max-width: calc(100vw - 24px);
  overflow: hidden;
  padding: 0 !important;
  border: 1px solid color-mix(in srgb, var(--app-primary) 18%, var(--app-border)) !important;
  border-radius: 18px !important;
  background: color-mix(in srgb, var(--app-card-solid) 92%, transparent) !important;
  box-shadow: var(--app-shadow-lg) !important;
  backdrop-filter: blur(20px) saturate(130%);
}
:global(.el-popper.order-copy-popover .el-popper__arrow::before) {
  border-color: color-mix(in srgb, var(--app-primary) 18%, var(--app-border)) !important;
  background: var(--app-card-solid) !important;
}
.copy-content-panel {
  display: flex;
  padding: 14px;
  flex-direction: column;
  gap: 10px;
}
.copy-content-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.copy-content-heading > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.copy-content-heading strong {
  color: var(--app-heading);
  font-size: 15px;
}
.copy-content-heading span {
  color: var(--app-muted);
  font-size: 12px;
}
.copy-content-heading b {
  min-width: 46px;
  padding: 3px 9px;
  border-radius: 999px;
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary-soft) 72%, var(--app-card-solid));
  font-size: 12px;
  text-align: center;
}
.copy-content-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}
.copy-content-tools :deep(.el-button + .el-button) {
  margin-left: 0;
}
.copy-content-options {
  display: grid;
  max-height: 292px;
  padding: 2px;
  overflow-y: auto;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.copy-column-choice {
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 11px;
  gap: 7px;
}
.copy-column-choice span {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy-column-choice small {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 999px;
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary-soft) 72%, var(--app-card-solid));
  font-size: 10px;
}
.copy-column-choice.is-selected {
  color: var(--app-heading);
}
.copy-content-note {
  margin: 0;
  padding-top: 9px;
  border-top: 1px solid var(--app-border);
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.55;
}
.copy-content-submit-row {
  display: grid;
  grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
  gap: 8px;
}
.copy-content-submit {
  width: 100%;
  margin: 0;
}
.copy-content-submit-row :deep(.el-button + .el-button) {
  margin-left: 0;
}
.copy-content-image-submit {
  box-shadow: 0 8px 18px color-mix(in srgb, var(--app-primary) 18%, transparent);
}
.copy-tracking-button {
  border-color: color-mix(in srgb, #64748b 24%, var(--app-border));
  color: color-mix(in srgb, var(--app-text) 78%, #64748b);
  background: color-mix(in srgb, #64748b 6%, var(--app-card-solid));
}
.copy-tracking-button:hover,
.copy-tracking-button:focus {
  border-color: color-mix(in srgb, #64748b 50%, var(--app-border));
  color: var(--app-heading);
  background: color-mix(in srgb, #64748b 12%, var(--app-card-solid));
}
.copy-tracking-button :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.copy-dropdown-arrow {
  margin-left: 1px;
  font-size: 13px;
}
.customer-payment-button {
  border-color: color-mix(in srgb, #10b981 26%, var(--app-border));
  color: color-mix(in srgb, #059669 82%, var(--app-heading));
  background: color-mix(in srgb, rgba(16, 185, 129, 0.1) 74%, var(--app-card-solid));
}
.customer-payment-button :deep(span > span) {
  background: rgba(16, 185, 129, 0.11);
}
.submitter-payment-button {
  border-color: color-mix(in srgb, var(--app-primary) 26%, var(--app-border));
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary-soft) 74%, var(--app-card-solid));
}
.submitter-payment-button :deep(span > span) {
  background: rgba(59, 130, 246, 0.12);
}
.order-workbar {
  min-width: 0;
  padding: 15px;
  border-color: color-mix(in srgb, var(--app-primary) 19%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary-soft) 30%, var(--app-card));
  box-shadow:
    var(--app-shadow-sm),
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 66%, transparent);
}
.view-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 11px;
  gap: 8px;
}
.view-tabs button {
  --view-tab-color: var(--app-primary);
  appearance: none;
  min-height: 32px;
  padding: 6px 13px;
  border: 1px solid color-mix(in srgb, var(--view-tab-color) 24%, var(--app-border));
  border-radius: 12px;
  color: var(--view-tab-color);
  background: color-mix(in srgb, var(--view-tab-color) 7%, var(--app-card-solid));
  font: inherit;
  font-size: 14px;
  font-weight: 400;
  line-height: 1;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 64%, transparent);
  cursor: pointer;
  transition:
    color 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}
.view-tabs button.view-tab--pending {
  --view-tab-color: #e4a13a;
}
.view-tabs button.view-tab--shipped {
  --view-tab-color: #3a9dcc;
}
.view-tabs button.view-tab--received {
  --view-tab-color: #9b80e7;
}
.view-tabs button.view-tab--settled {
  --view-tab-color: #2aaa82;
}
.view-tabs button.view-tab--exception {
  --view-tab-color: #ed7078;
}
.view-tabs button:hover {
  border-color: color-mix(in srgb, var(--view-tab-color) 42%, var(--app-border));
  color: var(--view-tab-color);
  background: color-mix(in srgb, var(--view-tab-color) 12%, var(--app-card-solid));
  transform: translateY(-1px);
}
.view-tabs button.is-active {
  border-color: color-mix(in srgb, var(--view-tab-color) 46%, var(--app-border));
  color: var(--view-tab-color);
  background: color-mix(in srgb, var(--view-tab-color) 17%, var(--app-card-solid));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 64%, transparent),
    0 5px 13px color-mix(in srgb, var(--view-tab-color) 14%, transparent);
}
.filter-surface {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-card-solid) 91%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 70%, transparent);
}
.filter-hint {
  margin: 9px 2px 0;
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.5;
}
.primary-filters {
  display: grid;
  grid-template-columns: minmax(250px, 1.45fr) repeat(4, minmax(145px, 1fr)) auto;
  align-items: center;
  gap: 9px;
}
.primary-filters :deep(.el-input),
.primary-filters :deep(.el-select) {
  width: 100%;
}
.filter-surface :deep(.el-input__wrapper),
.filter-surface :deep(.el-select__wrapper),
.filter-surface :deep(.el-date-editor.el-input__wrapper) {
  min-height: 34px;
  border-radius: 12px !important;
  background: color-mix(in srgb, var(--app-control) 90%, transparent);
  transition:
    box-shadow 0.18s ease,
    background 0.18s ease;
}
.filter-surface :deep(.el-input__wrapper:hover),
.filter-surface :deep(.el-select__wrapper:hover),
.filter-surface :deep(.el-date-editor.el-input__wrapper:hover) {
  background: color-mix(in srgb, var(--app-hover) 58%, var(--app-control));
}
.filter-actions {
  justify-content: flex-end;
  white-space: nowrap;
}
.filter-actions :deep(.el-button) {
  min-height: 34px;
}
.advanced-filter-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(140px, 1fr));
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--app-primary) 10%, var(--app-border));
  gap: 0 10px;
}
.advanced-filter-grid :deep(.el-form-item) {
  margin-bottom: 10px;
}
.advanced-filter-grid :deep(.el-select),
.advanced-filter-grid :deep(.el-date-editor) {
  width: 100%;
}
.table-card {
  min-width: 0;
  overflow: hidden;
  padding: 17px;
  border-color: color-mix(in srgb, var(--app-primary) 10%, var(--app-border));
}
.table-toolbar {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 13px;
  gap: 14px;
}
.table-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.table-title-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 12px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
  font-size: 17px;
}
.table-title > div {
  display: flex;
  min-width: 0;
  align-items: baseline;
}
.table-toolbar strong {
  color: var(--app-heading);
  font-size: 15px;
}
.table-toolbar span {
  margin-left: 9px;
  color: var(--app-muted);
  font-size: 13px;
}
.order-summary-stack {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  flex-direction: column;
  gap: 5px;
}
.filtered-summary {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--app-danger) 16%, var(--app-border));
  border-radius: 13px;
  background: color-mix(in srgb, rgba(239, 68, 68, 0.07) 66%, var(--app-card-solid));
  gap: 12px;
}
.table-toolbar .filtered-summary span {
  display: inline-flex;
  align-items: baseline;
  margin-left: 0;
  color: var(--app-muted);
  white-space: nowrap;
  gap: 5px;
}
.table-toolbar .filtered-summary strong {
  color: var(--app-danger);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.selected-orders-summary {
  border-color: color-mix(in srgb, var(--app-primary) 22%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary-soft) 54%, var(--app-card-solid));
}
.table-toolbar .selected-orders-summary .selected-summary-count {
  padding-right: 10px;
  border-right: 1px solid color-mix(in srgb, var(--app-primary) 22%, var(--app-border));
  color: var(--app-primary);
  font-weight: 700;
}
.serial-sort-button {
  border-color: color-mix(in srgb, var(--app-primary) 26%, var(--app-border));
  color: var(--app-primary);
  background: var(--app-primary-soft);
}
.serial-sort-button:hover,
.serial-sort-button:focus {
  border-color: var(--app-primary);
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary) 16%, var(--app-card-solid));
}
.order-table-shell {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-card-solid) 94%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 68%, transparent),
    0 8px 24px rgba(15, 23, 42, 0.035);
}
.order-table {
  width: 100%;
}
.mobile-order-list {
  display: none;
}
.product-lines,
.edit-reason-entry span {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.edit-reason-history {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.edit-reason-entry {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 6px;
}
.edit-reason-entry time {
  flex: 0 0 auto;
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.edit-reason-entry span {
  min-width: 0;
  color: var(--app-text);
  font-size: 13px;
  line-height: 1.45;
}
.table-card :deep(.el-pagination) {
  width: fit-content;
  justify-content: flex-end;
  margin: 14px 0 0 auto;
  padding: 7px 9px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-control) 72%, transparent);
}
.table-card :deep(.el-pagination button),
.table-card :deep(.el-pagination .el-pager li) {
  border-radius: 9px;
}
.column-settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
}
.column-settings-header > div {
  display: flex;
  flex-direction: column;
}
.column-settings-header strong {
  color: var(--app-heading);
  font-size: 15px;
}
.column-settings-header span,
.column-settings-note {
  margin-top: 3px;
  color: var(--app-muted);
  font-size: 12px;
}
.column-settings-options {
  display: flex;
  max-height: 380px;
  flex-direction: column;
  overflow-y: auto;
  gap: 4px;
}
.column-setting-row {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.column-setting-choice {
  min-width: 0;
  min-height: 34px;
  flex: 1;
  align-items: center;
  padding: 6px 9px;
  border-radius: 11px;
}
.column-setting-choice.is-selected {
  color: var(--app-heading);
}
.column-setting-label {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  overflow: hidden;
  gap: 6px;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.column-setting-label small {
  padding: 1px 5px;
  border-radius: 999px;
  color: var(--app-primary);
  background: rgba(59, 130, 246, 0.1);
  font-size: 10px;
  font-weight: 750;
}
.column-order-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 1px;
}
.column-order-actions :deep(.el-button) {
  width: 25px;
  height: 25px;
  margin-left: 0;
}
.column-settings-note {
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--app-border);
}
.order-table :deep(.vxe-header--column .vxe-cell) {
  color: var(--app-heading);
  font-size: 13px;
  font-weight: 650;
}
.order-table :deep(.vxe-table--header-wrapper),
.order-table :deep(.vxe-table--header-wrapper .vxe-header--column),
.order-table :deep(.vxe-table--fixed-right-wrapper .vxe-table--header-wrapper),
.order-table :deep(.vxe-table--fixed-right-wrapper .vxe-header--column) {
  background: color-mix(in srgb, var(--app-primary-soft) 22%, var(--app-control)) !important;
}
.order-table :deep(.vxe-body--column .vxe-cell) {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}
.order-table :deep(.vxe-body--column) {
  height: 46px;
}
.order-table :deep(.el-tag),
.order-table :deep(.el-button) {
  font-size: 13px;
  font-weight: 600;
}
.order-table :deep(.vxe-table--body-wrapper .vxe-body--row > .vxe-body--column) {
  background: var(--app-card-solid) !important;
  transition: background 0.16s ease;
}
.order-table :deep(.vxe-table--body-wrapper .vxe-body--row.row--stripe > .vxe-body--column) {
  background: color-mix(in srgb, var(--app-control) 44%, var(--app-card-solid)) !important;
}
.order-table :deep(.vxe-table--body-wrapper .vxe-body--row.row--hover > .vxe-body--column),
.order-table :deep(.vxe-table--body-wrapper .vxe-body--row:hover > .vxe-body--column) {
  background: color-mix(in srgb, var(--app-primary-soft) 30%, var(--app-card-solid)) !important;
}
.order-table :deep(.vxe-table--body-wrapper .vxe-body--row.is-selected-row > .vxe-body--column),
.order-table
  :deep(.vxe-table--fixed-right-wrapper .vxe-body--row.is-selected-row > .vxe-body--column) {
  background: color-mix(in srgb, var(--app-primary-soft) 72%, var(--app-card-solid)) !important;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--app-primary) 20%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--app-primary) 20%, transparent);
}
.order-table :deep(.vxe-table--body-wrapper),
.order-table :deep(.vxe-table--fixed-right-wrapper .vxe-table--body-wrapper) {
  background: var(--app-card-solid) !important;
}
.order-table :deep(.vxe-table--fixed-right-wrapper) {
  z-index: 6;
  border-left: 1px solid var(--app-border);
  background: transparent;
  box-shadow: -10px 0 22px rgba(15, 23, 42, 0.055);
}
.selection-checkbox :deep(.el-checkbox__inner) {
  width: 17px;
  height: 17px;
  border-width: 1.5px;
  border-color: #94a3b8;
  border-radius: 5px;
  background: var(--app-card-solid);
}
.selection-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner),
.selection-checkbox :deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner) {
  border-color: var(--app-primary);
  background: var(--app-primary);
}
.selection-checkbox :deep(.el-checkbox__input.is-disabled .el-checkbox__inner) {
  border-color: var(--app-border);
  background: var(--app-hover);
  opacity: 0.7;
}
.row-actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  justify-content: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--app-border) 76%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--app-control) 68%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 64%, transparent),
    0 1px 3px rgba(15, 23, 42, 0.035);
}
.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.order-action {
  --order-action-accent: #94a3b8;
  height: 26px;
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  color: color-mix(in srgb, var(--app-text) 82%, var(--app-muted));
  background: transparent;
  font-size: 13px !important;
  font-weight: 650 !important;
  line-height: 24px;
  box-shadow: none;
  transition:
    color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}
.order-action:hover,
.order-action:focus {
  color: var(--app-heading);
  background: color-mix(in srgb, var(--app-primary-soft) 24%, var(--app-card-solid));
  box-shadow: 0 2px 7px rgba(15, 23, 42, 0.08);
}
.order-action:active {
  background: var(--app-hover);
}
.order-action--edit {
  --order-action-accent: #94a3b8;
}
.order-action--approve {
  --order-action-accent: #22c55e;
}
.order-action--receipt {
  --order-action-accent: #14b8a6;
}
.order-action--settlement {
  --order-action-accent: #60a5fa;
}
.order-action--reject {
  --order-action-accent: #f87171;
}
.order-action-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 5px;
  border-radius: 50%;
  background: var(--order-action-accent);
  vertical-align: 1px;
}
.order-complete-state,
.order-review-state {
  display: inline-flex;
  height: 24px;
  align-items: center;
  justify-content: center;
  margin-left: 2px;
  padding: 0 7px 0 9px;
  border: 0;
  border-left: 1px solid color-mix(in srgb, var(--app-border) 88%, transparent);
  border-radius: 0 8px 8px 0;
  color: var(--app-muted);
  background: transparent;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}
.order-complete-state {
  color: var(--app-muted);
}
.order-complete-state::before {
  width: 6px;
  height: 6px;
  margin-right: 5px;
  border-radius: 50%;
  background: #14b8a6;
  content: '';
}
.order-review-state::before {
  width: 6px;
  height: 6px;
  margin-right: 5px;
  border-radius: 50%;
  background: #94a3b8;
  content: '';
}
.order-review-state.is-approved {
  color: var(--app-muted);
}
.order-review-state.is-approved::before {
  background: #22c55e;
}
.order-review-state.is-pending {
  color: var(--app-muted);
}
.order-review-state.is-pending::before {
  background: #f59e0b;
}
.order-review-state.is-rejected {
  color: var(--app-muted);
}
.order-review-state.is-rejected::before {
  background: #ef4444;
}
.muted {
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 500;
}
.rebate-stack {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  line-height: 1.35;
  white-space: nowrap;
}
.rebate-stack span,
.rebate-stack strong {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  font-variant-numeric: tabular-nums;
}
.rebate-stack span {
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 650;
}
.rebate-stack strong {
  color: #059669;
  font-size: 13px;
}
.rebate-stack span {
  margin-top: 2px;
}
.rebate-stack small {
  min-width: 28px;
  font-size: 11px;
  font-weight: 700;
}
.rebate-stack.is-unscanned {
  opacity: 0.58;
}
.profit-stack {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  line-height: 1.35;
  white-space: nowrap;
}
.profit-stack strong,
.profit-stack small {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  font-variant-numeric: tabular-nums;
}
.profit-stack strong {
  color: #16a34a;
  font-size: 14px;
}
.profit-stack strong.is-unsettled {
  color: var(--app-text);
}
.profit-stack strong span,
.profit-stack small span {
  min-width: 42px;
  font-size: 12px;
  font-weight: 600;
}
.profit-stack small {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 600;
}
@media (max-width: 1440px) {
  .primary-filters {
    grid-template-columns: repeat(3, minmax(160px, 1fr));
  }
  .filter-actions {
    grid-column: 1 / -1;
  }
  .advanced-filter-grid {
    grid-template-columns: repeat(3, minmax(160px, 1fr));
  }
  .table-toolbar {
    align-items: flex-start;
  }
}
@media (max-width: 760px) {
  .order-workbar,
  .table-card {
    padding: 12px;
  }
  .view-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .view-tabs button {
    width: 100%;
    padding-inline: 9px;
  }
  .filter-surface {
    padding: 10px;
    border-radius: 14px;
  }
  .primary-filters,
  .advanced-filter-grid {
    grid-template-columns: 1fr;
  }
  .filter-actions {
    grid-column: 1;
  }
  .filter-actions :deep(.el-button) {
    min-width: 0;
    flex: 1;
  }
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
  .heading-actions :deep(.el-button:last-child) {
    grid-column: 1 / -1;
  }
  .table-toolbar-actions {
    display: grid;
    flex: 1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .table-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .table-title > div {
    align-items: flex-start;
    flex-direction: column;
  }
  .table-toolbar span {
    margin-left: 0;
  }
  .table-toolbar-actions {
    width: 100%;
  }
  .table-toolbar-actions > :deep(.el-button),
  .table-toolbar-actions > :deep(.el-popover__reference-wrapper),
  .table-toolbar-actions > :deep(.el-dropdown) {
    width: 100%;
    min-width: 0;
    margin-left: 0;
  }
  .table-toolbar-actions > :deep(.el-button) {
    border-radius: 999px;
  }
  .order-summary-stack,
  .filtered-summary,
  .batch-payment-actions {
    grid-column: 1 / -1;
  }
  .order-summary-stack {
    width: 100%;
    align-items: stretch;
  }
  .filtered-summary {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }
  .table-toolbar .selected-orders-summary .selected-summary-count {
    width: 100%;
    padding-right: 0;
    padding-bottom: 5px;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--app-primary) 22%, var(--app-border));
  }
  .batch-payment-actions {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .batch-payment-actions > :first-child {
    grid-column: 1 / -1;
  }
  .batch-payment-actions :deep(.el-dropdown),
  .batch-payment-actions :deep(.el-button) {
    width: 100%;
    min-width: 0;
    margin-left: 0;
  }
  .copy-content-options {
    grid-template-columns: 1fr;
  }
  .desktop-order-table {
    display: none;
  }
  .mobile-order-list {
    display: flex;
    min-height: 120px;
    flex-direction: column;
    gap: 10px;
  }
  .mobile-order-card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--app-border);
    border-radius: 16px;
    background: color-mix(in srgb, var(--app-card-solid) 94%, transparent);
    box-shadow: var(--app-shadow-sm);
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease;
  }
  .mobile-order-card.is-selected {
    border-color: color-mix(in srgb, var(--app-primary) 44%, var(--app-border));
    background: color-mix(in srgb, var(--app-primary-soft) 58%, var(--app-card-solid));
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--app-primary) 12%, transparent),
      var(--app-shadow-sm);
  }
  .mobile-order-header {
    display: grid;
    align-items: flex-start;
    padding: 12px;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    gap: 9px;
  }
  .mobile-order-checkbox {
    margin-top: 2px;
  }
  .mobile-order-heading-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }
  .mobile-order-meta {
    display: flex;
    align-items: center;
    margin-bottom: 4px;
    color: var(--app-muted);
    font-size: 11px;
    gap: 8px;
  }
  .mobile-order-meta span {
    color: var(--app-primary);
    font-weight: 700;
  }
  .mobile-order-heading-copy > strong {
    color: var(--app-heading);
    font-size: 14px;
    line-height: 1.45;
  }
  .mobile-order-heading-copy > small {
    margin-top: 4px;
    overflow: hidden;
    color: var(--app-muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-order-status-grid {
    display: grid;
    padding: 9px 12px;
    border-top: 1px solid var(--app-border);
    border-bottom: 1px solid var(--app-border);
    background: color-mix(in srgb, var(--app-control) 52%, transparent);
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .mobile-order-status-grid > div {
    display: flex;
    min-width: 0;
    align-items: center;
    flex-direction: column;
    gap: 4px;
  }
  .mobile-order-status-grid span {
    color: var(--app-muted);
    font-size: 10px;
  }
  .mobile-order-status-grid :deep(.el-tag) {
    max-width: 100%;
    font-size: 11px;
  }
  .mobile-order-money-grid {
    display: grid;
    padding: 11px 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 12px;
  }
  .mobile-order-money-grid > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }
  .mobile-order-money-grid span,
  .mobile-order-money-grid small {
    color: var(--app-muted);
    font-size: 10.5px;
  }
  .mobile-order-money-grid strong {
    margin-top: 2px;
    color: var(--app-heading);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .mobile-order-money-grid .mobile-rebate-amount {
    color: #059669;
  }
  .mobile-order-details {
    margin: 0 12px 11px;
    border: 1px solid var(--app-border);
    border-radius: 12px;
    background: color-mix(in srgb, var(--app-control) 50%, transparent);
  }
  .mobile-order-details summary {
    padding: 9px 10px;
    color: var(--app-text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
  }
  .mobile-order-details[open] summary {
    border-bottom: 1px solid var(--app-border);
  }
  .mobile-order-details dl {
    display: grid;
    margin: 0;
    padding: 9px 10px;
    gap: 8px;
  }
  .mobile-order-details dl > div {
    display: grid;
    min-width: 0;
    grid-template-columns: 78px minmax(0, 1fr);
    gap: 8px;
  }
  .mobile-order-details dt,
  .mobile-order-details dd {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
  }
  .mobile-order-details dt {
    color: var(--app-muted);
  }
  .mobile-order-details dd {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--app-text);
  }
  .mobile-edit-history {
    display: flex;
    flex-direction: column;
    padding: 0 10px 10px;
    gap: 4px;
  }
  .mobile-edit-history > strong {
    color: var(--app-muted);
    font-size: 11px;
  }
  .mobile-order-actions {
    padding: 9px 10px 10px;
    border-top: 1px solid var(--app-border);
  }
  .mobile-order-actions .row-actions {
    display: flex;
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
  .mobile-order-actions .order-action {
    min-width: 64px;
    flex: 1;
  }
  .mobile-order-actions .order-complete-state,
  .mobile-order-actions .order-review-state {
    flex: 0 0 auto;
  }
  .table-card :deep(.el-pagination) {
    width: 100%;
    justify-content: center;
    overflow: hidden;
  }
  .table-card :deep(.el-pagination__total),
  .table-card :deep(.el-pagination__sizes) {
    display: none;
  }
}

@media (max-width: 380px) {
  .orders-page {
    gap: 10px;
  }
  .copy-content-submit-row {
    grid-template-columns: 1fr;
  }
  .order-workbar,
  .table-card {
    padding: 9px;
  }
  .view-tabs {
    gap: 6px;
  }
  .view-tabs button {
    min-height: 30px;
    padding: 5px 6px;
    font-size: 12px;
  }
  .filter-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    white-space: normal;
  }
  .filter-actions :deep(.el-button:first-child) {
    grid-column: 1 / -1;
  }
  .mobile-order-header {
    padding-inline: 10px;
  }
  .mobile-order-status-grid,
  .mobile-order-money-grid {
    padding-inline: 10px;
  }
  .mobile-order-details {
    margin-inline: 10px;
  }
}
</style>
