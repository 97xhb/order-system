<script setup lang="ts">
import { Delete, Edit, Plus, Refresh, SwitchButton } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

interface PlatformItem {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  _count: { orders: number };
}

interface CategoryItem {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  _count: { schemes: number; orders: number; profitRules: number };
}

interface FundingMethodItem {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
}

type EditorType = 'platform' | 'category' | 'funding';

const basePaths: Record<EditorType, string> = {
  platform: '/admin/platforms',
  category: '/admin/categories',
  funding: '/admin/funding-methods',
};

const activeTab = ref<EditorType>('platform');
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const editorType = ref<EditorType>('platform');
const platforms = ref<PlatformItem[]>([]);
const categories = ref<CategoryItem[]>([]);
const fundingMethods = ref<FundingMethodItem[]>([]);

const editor = reactive({
  id: '',
  code: '',
  name: '',
  enabled: true,
  sortOrder: 0,
});

const loadData = async () => {
  loading.value = true;
  try {
    const [platformResponse, categoryResponse, fundingResponse] = await Promise.all([
      http.get<{ items: PlatformItem[] }>('/admin/platforms', {
        params: { includeDisabled: true },
      }),
      http.get<{ items: CategoryItem[] }>('/admin/categories', {
        params: { includeDisabled: true },
      }),
      http.get<{ items: FundingMethodItem[] }>('/admin/funding-methods', {
        params: { includeDisabled: true },
      }),
    ]);
    platforms.value = platformResponse.data.items;
    categories.value = categoryResponse.data.items;
    fundingMethods.value = fundingResponse.data.items;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '基础数据加载失败'));
  } finally {
    loading.value = false;
  }
};

const openCreate = (type: EditorType) => {
  editorType.value = type;
  Object.assign(editor, {
    id: '',
    code: '',
    name: '',
    enabled: true,
    sortOrder:
      type === 'platform'
        ? platforms.value.length * 10 + 10
        : type === 'category'
          ? categories.value.length * 10 + 10
          : fundingMethods.value.length * 10 + 10,
  });
  dialogVisible.value = true;
};

const openEditPlatform = (item: PlatformItem) => {
  editorType.value = 'platform';
  Object.assign(editor, item);
  dialogVisible.value = true;
};

const openEditCategory = (item: CategoryItem) => {
  editorType.value = 'category';
  Object.assign(editor, { ...item, code: '' });
  dialogVisible.value = true;
};

const openEditFunding = (item: FundingMethodItem) => {
  editorType.value = 'funding';
  Object.assign(editor, { ...item });
  dialogVisible.value = true;
};

const saveEditor = async () => {
  if (!editor.name.trim()) {
    ElMessage.warning('请填写名称');
    return;
  }
  if (editorType.value === 'platform' && !editor.code.trim()) {
    ElMessage.warning('请填写平台编码');
    return;
  }
  if (editorType.value === 'funding' && !editor.code.trim()) {
    ElMessage.warning('请填写支付方式编码');
    return;
  }

  saving.value = true;
  try {
    const basePath = basePaths[editorType.value];
    const payload = {
      ...(editorType.value === 'platform'
        ? { code: editor.code.trim().toLowerCase() }
        : editorType.value === 'funding'
          ? { code: editor.code.trim().toUpperCase() }
          : {}),
      name: editor.name.trim(),
      enabled: editor.enabled,
      sortOrder: editor.sortOrder,
    };

    if (editor.id) {
      await http.patch(`${basePath}/${editor.id}`, payload);
    } else {
      await http.post(basePath, payload);
    }

    dialogVisible.value = false;
    ElMessage.success(editor.id ? '修改已保存' : '新增成功');
    await loadData();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  } finally {
    saving.value = false;
  }
};

const togglePlatform = async (item: PlatformItem) => {
  const nextValue = !item.enabled;
  try {
    await http.patch(`/admin/platforms/${item.id}`, { enabled: nextValue });
    item.enabled = nextValue;
    ElMessage.success(nextValue ? '平台已启用' : '平台已停用');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  }
};

const toggleCategory = async (item: CategoryItem) => {
  const nextValue = !item.enabled;
  try {
    await http.patch(`/admin/categories/${item.id}`, { enabled: nextValue });
    item.enabled = nextValue;
    ElMessage.success(nextValue ? '品类已启用' : '品类已停用');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  }
};

const toggleFunding = async (item: FundingMethodItem) => {
  const nextValue = !item.enabled;
  try {
    await http.patch(`/admin/funding-methods/${item.id}`, { enabled: nextValue });
    item.enabled = nextValue;
    ElMessage.success(nextValue ? '支付方式已启用' : '支付方式已停用');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  }
};

const deleteItem = async (type: EditorType, id: string, name: string) => {
  try {
    await ElMessageBox.confirm(
      `确定删除“${name}”吗？已被业务使用的数据会提示改为停用。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
    const basePath = basePaths[type];
    await http.delete(`${basePath}/${id}`);
    ElMessage.success('删除成功');
    await loadData();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error));
  }
};

onMounted(loadData);
</script>

<template>
  <div class="settings-section">
    <section class="surface-card catalog-card">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="下单平台" name="platform">
          <div class="tab-toolbar">
            <span>维护下单平台和下单品类，停用后不影响历史订单。</span>
            <div class="tab-toolbar-actions">
              <el-button :icon="Refresh" :loading="loading" @click="loadData">刷新</el-button>
              <el-button type="primary" :icon="Plus" @click="openCreate('platform')"
                >新增平台</el-button
              >
            </div>
          </div>
          <el-table v-loading="loading" :data="platforms" border stripe>
            <el-table-column prop="sortOrder" label="排序" width="86" />
            <el-table-column prop="name" label="平台名称" min-width="150" />
            <el-table-column prop="code" label="平台编码" min-width="150" />
            <el-table-column label="关联数据" min-width="180">
              <template #default="{ row }">订单 {{ row._count.orders }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'">{{
                  row.enabled ? '启用' : '停用'
                }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="270" fixed="right" align="center">
              <template #default="{ row }">
                <div class="catalog-actions">
                  <el-button
                    class="app-action-button app-action-button--primary"
                    size="small"
                    :icon="Edit"
                    @click="openEditPlatform(row)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    class="app-action-button app-action-button--warning"
                    :class="{ 'is-enable-action': !row.enabled }"
                    size="small"
                    :icon="SwitchButton"
                    @click="togglePlatform(row)"
                  >
                    {{ row.enabled ? '停用' : '启用' }}
                  </el-button>
                  <el-button
                    class="app-action-button app-action-button--danger"
                    size="small"
                    :icon="Delete"
                    @click="deleteItem('platform', row.id, row.name)"
                  >
                    删除
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="下单品类" name="category">
          <div class="tab-toolbar">
            <span>预置数码、美妆、转寄、电玩、刷单。</span>
            <div class="tab-toolbar-actions">
              <el-button :icon="Refresh" :loading="loading" @click="loadData">刷新</el-button>
              <el-button type="primary" :icon="Plus" @click="openCreate('category')"
                >新增品类</el-button
              >
            </div>
          </div>
          <el-table v-loading="loading" :data="categories" border stripe>
            <el-table-column prop="sortOrder" label="排序" width="86" />
            <el-table-column prop="name" label="品类名称" min-width="180" />
            <el-table-column label="关联数据" min-width="220">
              <template #default="{ row }">
                方案 {{ row._count.schemes }} · 订单 {{ row._count.orders }} · 规则
                {{ row._count.profitRules }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'">{{
                  row.enabled ? '启用' : '停用'
                }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="270" fixed="right" align="center">
              <template #default="{ row }">
                <div class="catalog-actions">
                  <el-button
                    class="app-action-button app-action-button--primary"
                    size="small"
                    :icon="Edit"
                    @click="openEditCategory(row)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    class="app-action-button app-action-button--warning"
                    :class="{ 'is-enable-action': !row.enabled }"
                    size="small"
                    :icon="SwitchButton"
                    @click="toggleCategory(row)"
                  >
                    {{ row.enabled ? '停用' : '启用' }}
                  </el-button>
                  <el-button
                    class="app-action-button app-action-button--danger"
                    size="small"
                    :icon="Delete"
                    @click="deleteItem('category', row.id, row.name)"
                  >
                    删除
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="支付方式" name="funding">
          <div class="tab-toolbar">
            <span> 维护订单可选的支付方式（自己付 / 代付 / 其他…），利润规则也按这里配置。 </span>
            <div class="tab-toolbar-actions">
              <el-button :icon="Refresh" :loading="loading" @click="loadData">刷新</el-button>
              <el-button type="primary" :icon="Plus" @click="openCreate('funding')"
                >新增支付方式</el-button
              >
            </div>
          </div>
          <el-table v-loading="loading" :data="fundingMethods" border stripe>
            <el-table-column prop="sortOrder" label="排序" width="86" />
            <el-table-column prop="name" label="支付方式" min-width="160" />
            <el-table-column prop="code" label="编码" min-width="150" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'">{{
                  row.enabled ? '启用' : '停用'
                }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="270" fixed="right" align="center">
              <template #default="{ row }">
                <div class="catalog-actions">
                  <el-button
                    class="app-action-button app-action-button--primary"
                    size="small"
                    :icon="Edit"
                    @click="openEditFunding(row)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    class="app-action-button app-action-button--warning"
                    :class="{ 'is-enable-action': !row.enabled }"
                    size="small"
                    :icon="SwitchButton"
                    @click="toggleFunding(row)"
                  >
                    {{ row.enabled ? '停用' : '启用' }}
                  </el-button>
                  <el-button
                    class="app-action-button app-action-button--danger"
                    size="small"
                    :icon="Delete"
                    @click="deleteItem('funding', row.id, row.name)"
                  >
                    删除
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="`${editor.id ? '编辑' : '新增'}${
        editorType === 'platform' ? '平台' : editorType === 'category' ? '品类' : '支付方式'
      }`"
      width="min(480px, 92vw)"
    >
      <el-form :model="editor" label-position="top">
        <el-form-item v-if="editorType === 'platform'" label="平台编码" required>
          <el-input v-model="editor.code" placeholder="例如 jd，只使用小写字母、数字、_、-" />
        </el-form-item>
        <el-form-item v-if="editorType === 'funding'" label="支付方式编码" required>
          <el-input v-model="editor.code" placeholder="例如 FRIEND_PAID，只使用字母、数字、_、-" />
        </el-form-item>
        <el-form-item
          :label="
            editorType === 'platform'
              ? '平台名称'
              : editorType === 'category'
                ? '品类名称'
                : '支付方式名称'
          "
          required
        >
          <el-input v-model="editor.name" />
        </el-form-item>
        <el-form-item label="排序值">
          <el-input-number
            v-model="editor.sortOrder"
            :min="-100000"
            :max="100000"
            :precision="0"
            :controls="false"
          />
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="editor.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEditor">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.catalog-card {
  padding: 18px;
}

.catalog-card :deep(.el-table__body tr > td.el-table__cell) {
  background: var(--app-card-solid) !important;
  transition: background 0.16s ease;
}

.catalog-card :deep(.el-table__header-wrapper th.el-table__cell) {
  background: var(--app-table-header-solid) !important;
}

.catalog-card :deep(.el-table__body tr.el-table__row--striped > td.el-table__cell) {
  background: color-mix(in srgb, var(--app-control) 58%, var(--app-card-solid)) !important;
}

.catalog-card :deep(.el-table__body tr:hover > td.el-table__cell) {
  background: var(--app-hover) !important;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 5px 0 14px;
  gap: 14px;
}

.tab-toolbar span {
  color: var(--app-text-subtle);
  font-size: var(--app-text-base);
}

.tab-toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.catalog-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}

.catalog-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

@media (max-width: 650px) {
  .tab-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
