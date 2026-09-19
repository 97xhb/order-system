<script setup lang="ts">
import { CopyDocument, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, onMounted, ref } from 'vue';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

type PayoutQueryFieldKey = string;

interface PayoutQueryFieldOption {
  key: PayoutQueryFieldKey;
  orderColumnKey: string;
  label: string;
  description: string;
  defaultVisible: boolean;
  publicAllowed: boolean;
  sensitive?: boolean;
  customFieldId?: string;
  customFieldType?: string;
}

interface PayoutQueryForm {
  id: string;
  publicToken: string;
  path: string;
  enabled: boolean;
  visibleFields: PayoutQueryFieldKey[];
  lockedFields: PayoutQueryFieldKey[];
  fieldOptions: PayoutQueryFieldOption[];
  updatedAt: string;
}

const loading = ref(false);
const saving = ref(false);
const fieldSaving = ref(false);
const loadError = ref('');
const queryForm = ref<PayoutQueryForm | null>(null);
const editingVisibleFields = ref<PayoutQueryFieldKey[]>([]);
const editingLockedFields = ref<PayoutQueryFieldKey[]>([]);

const queryUrl = computed(() =>
  queryForm.value ? new URL(queryForm.value.path, window.location.origin).toString() : '',
);

const visibleFieldCount = computed(() => {
  const form = queryForm.value;
  if (!form) return 0;
  return editingVisibleFields.value.filter((key) =>
    form.fieldOptions.some(
      (field) => field.key === key && !editingLockedFields.value.includes(field.key),
    ),
  ).length;
});

const totalFieldCount = computed(() => queryForm.value?.fieldOptions.length ?? 0);

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const response = await http.get<PayoutQueryForm>('/admin/payout-query');
    queryForm.value = response.data;
    editingVisibleFields.value = [...(response.data.visibleFields ?? [])];
    editingLockedFields.value = [...(response.data.lockedFields ?? [])];
  } catch (error) {
    loadError.value = getApiErrorMessage(error, '订单查询配置加载失败');
  } finally {
    loading.value = false;
  }
};

const saveVisibleFields = async () => {
  if (!queryForm.value) return;
  fieldSaving.value = true;
  try {
    const response = await http.patch<PayoutQueryForm>('/admin/payout-query', {
      visibleFields: editingVisibleFields.value,
      lockedFields: editingLockedFields.value,
    });
    queryForm.value = response.data;
    editingVisibleFields.value = [...(response.data.visibleFields ?? [])];
    editingLockedFields.value = [...(response.data.lockedFields ?? [])];
    ElMessage.success('订单查询可见分类已保存');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '订单查询分类保存失败'));
  } finally {
    fieldSaving.value = false;
  }
};

const showAllFields = () => {
  if (!queryForm.value) return;
  editingVisibleFields.value = queryForm.value.fieldOptions
    .filter((field) => !editingLockedFields.value.includes(field.key))
    .map((field) => field.key);
};

const hideAllFields = () => {
  editingVisibleFields.value = [];
};

const isFieldSelected = (key: string) => editingVisibleFields.value.includes(key);

const isFieldLocked = (field: PayoutQueryFieldOption) =>
  editingLockedFields.value.includes(field.key);

const toggleVisibleField = (field: PayoutQueryFieldOption) => {
  if (isFieldLocked(field)) return;
  if (isFieldSelected(field.key)) {
    editingVisibleFields.value = editingVisibleFields.value.filter((key) => key !== field.key);
    return;
  }
  editingVisibleFields.value = [...editingVisibleFields.value, field.key];
};

const toggleFieldLock = (field: PayoutQueryFieldOption) => {
  if (isFieldLocked(field)) {
    editingLockedFields.value = editingLockedFields.value.filter((key) => key !== field.key);
    return;
  }
  editingLockedFields.value = [...editingLockedFields.value, field.key];
  editingVisibleFields.value = editingVisibleFields.value.filter((key) => key !== field.key);
};

const updateEnabled = async (value: string | number | boolean) => {
  if (!queryForm.value) return;
  saving.value = true;
  try {
    const response = await http.patch<PayoutQueryForm>('/admin/payout-query', {
      enabled: Boolean(value),
    });
    queryForm.value = response.data;
    ElMessage.success(response.data.enabled ? '订单查询链接已开启' : '订单查询链接已关闭');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '订单查询权限修改失败'));
  } finally {
    saving.value = false;
  }
};

const writeClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const copyQueryUrl = async () => {
  if (!queryUrl.value) return;
  try {
    await writeClipboard(queryUrl.value);
    ElMessage.success('订单查询链接已复制');
  } catch {
    ElMessage.error('链接复制失败，请手动选择复制');
  }
};

const openQueryUrl = () => {
  if (queryUrl.value) window.open(queryUrl.value, '_blank', 'noopener,noreferrer');
};

onMounted(() => void load());
</script>

<template>
  <div class="query-settings-stack">
    <section v-loading="loading" class="surface-card query-access-card">
      <div class="query-card-heading">
        <div class="query-card-icon">查</div>
        <div class="query-card-copy">
          <div>
            <strong>下单人订单查询链接</strong>
            <el-tag
              v-if="queryForm"
              :type="queryForm.enabled ? 'success' : 'info'"
              size="small"
              effect="light"
            >
              {{ queryForm.enabled ? '查询已开启' : '查询已关闭' }}
            </el-tag>
          </div>
          <p>把此固定链接单独分享给下单人，通过唯一识别码只读查看回款资料和历史订单。</p>
        </div>
      </div>

      <template v-if="queryForm">
        <div class="query-permission">
          <div>
            <b>允许下单人查询</b>
            <span>
              {{ queryForm.enabled ? '链接当前可以查询历史记录' : '链接保留，但不能查询任何资料' }}
            </span>
          </div>
          <el-switch :model-value="queryForm.enabled" :loading="saving" @change="updateEnabled" />
        </div>

        <div class="query-link-row">
          <span :title="queryUrl">{{ queryUrl }}</span>
          <el-button size="small" round :icon="CopyDocument" @click="copyQueryUrl">
            复制链接
          </el-button>
          <el-button size="small" round type="primary" plain :icon="View" @click="openQueryUrl">
            打开预览
          </el-button>
        </div>
      </template>

      <div v-else-if="loadError" class="query-error">
        <span>{{ loadError }}</span>
        <el-button size="small" round @click="load">重新加载</el-button>
      </div>
    </section>

    <section v-if="queryForm" class="surface-card query-fields-card">
      <div class="query-fields-heading">
        <div>
          <strong>客户可见分类</strong>
          <span>
            以下分类与订单列表保持同步；点选卡片控制下单人是否可见，点击右下角按钮可单独锁定或解锁后台专用字段。
          </span>
        </div>
        <div class="query-fields-actions">
          <span class="query-fields-count">
            已开放 {{ visibleFieldCount }} / {{ totalFieldCount }}，后台专用
            {{ editingLockedFields.length }}
          </span>
          <el-button size="small" round @click="showAllFields">全部显示</el-button>
          <el-button size="small" round @click="hideAllFields">全部隐藏</el-button>
          <el-button
            size="small"
            round
            type="primary"
            :loading="fieldSaving"
            @click="saveVisibleFields"
          >
            保存设置
          </el-button>
        </div>
      </div>

      <div class="query-field-grid" role="group" aria-label="客户可见分类">
        <div
          v-for="field in queryForm.fieldOptions"
          :key="field.key"
          class="card-choice query-field-card"
          :class="{
            'is-selected': isFieldSelected(field.key),
            'is-locked': isFieldLocked(field),
          }"
          :aria-pressed="isFieldSelected(field.key)"
          :aria-label="`${field.label}${isFieldLocked(field) ? '（后台专用）' : ''}`"
          role="button"
          tabindex="0"
          @click="toggleVisibleField(field)"
          @keydown.enter.prevent="toggleVisibleField(field)"
        >
          <span class="query-field-copy">
            <strong>
              {{ field.label }}
              <el-tag v-if="field.customFieldId" size="small" effect="plain">扩展</el-tag>
              <el-tag v-if="isFieldLocked(field)" size="small" type="warning" effect="plain">
                后台专用
              </el-tag>
            </strong>
            <small>{{ field.description }}</small>
          </span>
          <button
            type="button"
            class="field-lock-toggle"
            :class="{ 'is-unlocked': !isFieldLocked(field) }"
            @click.stop="toggleFieldLock(field)"
            @keydown.enter.stop.prevent="toggleFieldLock(field)"
            @keydown.space.stop.prevent="toggleFieldLock(field)"
          >
            {{ isFieldLocked(field) ? '解锁' : '锁定' }}
          </button>
        </div>
      </div>
    </section>

    <section class="query-notes-grid">
      <article class="surface-card query-note">
        <span>01</span>
        <div>
          <strong>独立链接</strong>
          <p>订单查询链接拥有自己的 Token，不使用回款填写链接的 Token。</p>
        </div>
      </article>
      <article class="surface-card query-note">
        <span>02</span>
        <div>
          <strong>独立开关</strong>
          <p>关闭订单查询不会关闭回款填写，关闭回款填写也不会影响订单查询。</p>
        </div>
      </article>
      <article class="surface-card query-note">
        <span>03</span>
        <div>
          <strong>只读查看</strong>
          <p>下单人只能查看自己的脱敏回款资料和历史订单，不能修改或删除。</p>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.query-settings-stack {
  display: grid;
  gap: 14px;
}

.query-access-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  padding: 20px;
  gap: 16px 24px;
}

.query-card-heading,
.query-card-copy > div,
.query-permission,
.query-link-row,
.query-error,
.query-note {
  display: flex;
  align-items: center;
}

.query-card-heading {
  min-width: 0;
  gap: 13px;
}

.query-card-icon {
  display: grid;
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  place-items: center;
  border-radius: 16px;
  color: #2563eb;
  background: rgba(59, 130, 246, 0.12);
  font-size: 15px;
  font-weight: 800;
}

.query-card-copy {
  min-width: 0;
}

.query-card-copy > div {
  flex-wrap: wrap;
  gap: 8px;
}

.query-card-copy strong {
  color: var(--app-heading);
  font-size: 17px;
}

.query-card-copy p,
.query-note p {
  margin: 4px 0 0;
  color: var(--app-muted);
  font-size: 13px;
  line-height: 1.65;
}

.query-permission {
  padding: 10px 13px;
  border: 1px solid var(--app-border);
  border-radius: 15px;
  background: var(--app-hover);
  gap: 18px;
}

.query-permission > div {
  display: flex;
  flex-direction: column;
}

.query-permission b {
  color: var(--app-heading);
  font-size: 14px;
}

.query-permission span {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 11px;
}

.query-link-row,
.query-error {
  grid-column: 1 / -1;
  min-width: 0;
  padding: 10px 10px 10px 13px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: var(--app-control);
  gap: 9px;
}

.query-link-row > span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--app-muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.query-error {
  justify-content: space-between;
  color: var(--app-danger);
  font-size: 13px;
}

.query-fields-card {
  padding: 20px;
}

.query-fields-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.query-fields-heading > div:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.query-fields-heading strong {
  color: var(--app-heading);
  font-size: 16px;
}

.query-fields-heading span {
  margin-top: 4px;
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.6;
}

.query-fields-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}

.query-fields-actions .query-fields-count {
  margin: 0 3px 0 0;
  color: var(--app-muted);
  font-size: 12px;
}

.query-field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  margin-top: 14px;
  gap: 7px;
}

.query-field-card {
  align-items: flex-start;
  min-width: 0;
  min-height: 50px;
  overflow: hidden;
  padding: 8px 9px;
  gap: 7px;
}

.query-field-card.is-locked {
  border-color: color-mix(in srgb, var(--app-warning) 48%, var(--app-border));
  background: color-mix(in srgb, var(--app-warning) 8%, var(--app-control));
}

.field-lock-toggle {
  align-self: center;
  flex: 0 0 auto;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--app-warning) 48%, var(--app-border));
  border-radius: 999px;
  color: var(--app-warning);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  line-height: 1.2;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.field-lock-toggle:hover {
  color: var(--app-card-solid);
  background: var(--app-warning);
}

.field-lock-toggle.is-unlocked {
  border-color: color-mix(in srgb, var(--app-primary) 45%, var(--app-border));
  color: var(--app-primary);
}

.query-field-copy {
  display: flex;
  min-width: 0;
  width: 100%;
  flex-direction: column;
}

.query-field-copy strong {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  color: var(--app-heading);
  font-size: 12.5px;
  line-height: 1.35;
}

.query-field-copy small {
  display: -webkit-box;
  margin-top: 2px;
  overflow: hidden;
  color: var(--app-muted);
  font-size: 9.5px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.query-notes-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.query-note {
  align-items: flex-start;
  padding: 17px;
  gap: 11px;
}

.query-note > span {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border-radius: 11px;
  color: #2563eb;
  background: rgba(59, 130, 246, 0.1);
  font-size: 11px;
  font-weight: 800;
}

.query-note strong {
  color: var(--app-heading);
  font-size: 14px;
}

@media (max-width: 860px) {
  .query-notes-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .query-access-card {
    grid-template-columns: 1fr;
    padding: 16px;
  }

  .query-permission {
    justify-content: space-between;
  }

  .query-link-row {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .query-link-row > span {
    width: 100%;
    flex-basis: 100%;
    padding-bottom: 3px;
  }

  .query-fields-card {
    padding: 16px;
  }

  .query-fields-heading {
    flex-direction: column;
  }

  .query-fields-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .query-field-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }
}
</style>
