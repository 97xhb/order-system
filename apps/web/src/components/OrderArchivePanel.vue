<script setup lang="ts">
import { Delete, Edit, Plus, ArrowRight } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

type GroupStatus = 'EMPTY' | 'SETTLED' | 'OPEN' | 'EXCEPTION';

interface OrderGroupSummary {
  orderCount: number;
  orderAmount: number;
  receivableDue: number;
  receivableReceived: number;
  settlementDue: number;
  settlementPaid: number;
  settledProfit: number;
  expectedProfit: number;
  status: GroupStatus;
}

export interface OrderArchiveGroup {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  summary: OrderGroupSummary;
}

const emit = defineEmits<{
  changed: [];
  'open-group': [group: OrderArchiveGroup];
}>();

const loading = ref(false);
const groups = ref<OrderArchiveGroup[]>([]);

const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'rename'>('create');
const dialogSaving = ref(false);
const editingId = ref('');
const form = reactive({ name: '', description: '' });

const money = (value: string | number | null | undefined) =>
  `¥${Number(value ?? 0).toFixed(2)}`;

const statusText: Record<GroupStatus, string> = {
  EMPTY: '空分组',
  SETTLED: '全部结清',
  OPEN: '有未结清',
  EXCEPTION: '有异常',
};
const statusTagType: Record<GroupStatus, 'info' | 'success' | 'warning' | 'danger'> = {
  EMPTY: 'info',
  SETTLED: 'success',
  OPEN: 'warning',
  EXCEPTION: 'danger',
};

const loadGroups = async () => {
  loading.value = true;
  try {
    const response = await http.get<OrderArchiveGroup[]>('/admin/order-groups');
    groups.value = response.data;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '归档分组加载失败'));
  } finally {
    loading.value = false;
  }
};

const openCreate = () => {
  dialogMode.value = 'create';
  editingId.value = '';
  form.name = '';
  form.description = '';
  dialogVisible.value = true;
};

const openRename = (group: OrderArchiveGroup) => {
  dialogMode.value = 'rename';
  editingId.value = group.id;
  form.name = group.name;
  form.description = group.description ?? '';
  dialogVisible.value = true;
};

const submitDialog = async () => {
  const name = form.name.trim();
  if (!name) {
    ElMessage.warning('请填写归档名称');
    return;
  }
  dialogSaving.value = true;
  try {
    const payload = { name, description: form.description.trim() || undefined };
    if (dialogMode.value === 'create') {
      await http.post('/admin/order-groups', payload);
      ElMessage.success('归档分组已创建');
    } else {
      await http.patch(`/admin/order-groups/${editingId.value}`, payload);
      ElMessage.success('归档分组已更新');
    }
    dialogVisible.value = false;
    await loadGroups();
    emit('changed');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '保存失败'));
  } finally {
    dialogSaving.value = false;
  }
};

const removeGroup = async (group: OrderArchiveGroup) => {
  try {
    await ElMessageBox.confirm(
      `删除归档「${group.name}」后，组内 ${group.summary.orderCount} 笔订单会回到未归档列表。`,
      '删除归档分组',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await http.delete(`/admin/order-groups/${group.id}`);
    ElMessage.success('归档分组已删除');
    await loadGroups();
    emit('changed');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '删除失败'));
  }
};

onMounted(loadGroups);
</script>

<template>
  <div class="archive-panel" v-loading="loading">
    <div class="archive-panel-head">
      <div>
        <strong>归档分组</strong>
        <span>按自定义名称归档订单；点开分组后使用和订单列表完全相同的表格查看明细。</span>
      </div>
      <el-button type="primary" round :icon="Plus" @click="openCreate">新建归档</el-button>
    </div>

    <el-empty v-if="!loading && !groups.length" description="还没有归档分组" />

    <section v-for="group in groups" :key="group.id" class="surface-card archive-group">
      <header class="archive-group-head" @click="emit('open-group', group)">
        <el-icon class="archive-caret"><ArrowRight /></el-icon>
        <div class="archive-title">
          <strong>{{ group.name }}</strong>
          <span>{{ group.summary.orderCount }} 笔订单</span>
        </div>
        <div class="archive-metrics">
          <span>
            <small>下单金额</small>
            {{ money(group.summary.orderAmount) }}
          </span>
          <span>
            <small>回款</small>
            {{ money(group.summary.receivableReceived) }}
            <em>/ {{ money(group.summary.receivableDue) }}</em>
          </span>
          <span>
            <small>结算</small>
            {{ money(group.summary.settlementPaid) }}
            <em>/ {{ money(group.summary.settlementDue) }}</em>
          </span>
          <span class="is-profit">
            <small>利润</small>
            {{ money(group.summary.settledProfit || group.summary.expectedProfit) }}
          </span>
        </div>
        <el-tag :type="statusTagType[group.summary.status]" effect="light" size="small">
          {{ statusText[group.summary.status] }}
        </el-tag>
        <div class="archive-actions" @click.stop>
          <el-button text type="primary" @click="emit('open-group', group)">查看订单</el-button>
          <el-button text :icon="Edit" @click="openRename(group)">重命名</el-button>
          <el-button text type="danger" :icon="Delete" @click="removeGroup(group)">删除</el-button>
        </div>
      </header>
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建归档分组' : '重命名归档分组'"
      width="420px"
    >
      <el-form label-position="top">
        <el-form-item label="归档名称">
          <el-input
            v-model="form.name"
            maxlength="120"
            placeholder="例如：美的空调N8KS"
          />
        </el-form-item>
        <el-form-item label="备注（可选）">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            maxlength="2000"
            placeholder="例如：付款3900，米100，给我结算1200"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dialogSaving" @click="submitDialog">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.archive-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.archive-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.archive-panel-head strong {
  display: block;
  color: var(--app-heading);
  font-size: 17px;
}

.archive-panel-head span {
  color: var(--app-muted);
  font-size: 13px;
}

.archive-group {
  overflow: hidden;
}

.archive-group-head {
  display: flex;
  align-items: center;
  padding: 14px 18px;
  cursor: pointer;
  gap: 12px;
  transition: background-color 140ms ease;
}

.archive-group-head:hover {
  background: color-mix(in srgb, var(--app-hover) 60%, transparent);
}

.archive-caret {
  color: var(--app-muted);
}

.archive-title {
  display: flex;
  min-width: 160px;
  flex-direction: column;
  gap: 2px;
}

.archive-title strong {
  color: var(--app-heading);
  font-size: 15px;
}

.archive-title span {
  color: var(--app-muted);
  font-size: 12px;
}

.archive-metrics {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}

.archive-metrics span {
  color: var(--app-text);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.archive-metrics small {
  margin-right: 4px;
  color: var(--app-muted);
  font-size: 11px;
}

.archive-metrics em {
  color: var(--app-muted);
  font-size: 11px;
  font-style: normal;
}

.archive-metrics .is-profit {
  color: #059669;
  font-weight: 700;
}

.archive-actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
}
</style>
