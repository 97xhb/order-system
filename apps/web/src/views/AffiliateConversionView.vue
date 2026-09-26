<script setup lang="ts">
import {
  Connection,
  CopyDocument,
  Delete,
  Grid,
  MagicStick,
  Refresh,
  Setting,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import QRCode from 'qrcode';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

interface AffiliatePlatformItem {
  code: string;
  name: string;
  description: string;
  providerType: 'THIRD_PARTY' | 'OFFICIAL';
  supportedPlatforms: Array<{ code: string; name: string }>;
  enabled: boolean;
  configured: boolean;
  configuredCredentialFields: string[];
  device: string;
}

interface AffiliateConversionResult {
  id: string;
  platformCode: string;
  platformName: string;
  status: string;
  outputText: string;
  normalizedUrl: string | null;
  productExternalId: string | null;
  promotionUrl: string | null;
  shortUrl: string | null;
  providerCode: string | number | null;
  providerMessage: string | null;
  rawData: unknown;
  createdAt: string;
}

interface AffiliateConversionHistoryItem {
  id: string;
  platformCode: string;
  platformName: string;
  originalText: string;
  outputText: string;
  normalizedUrl: string | null;
  productExternalId: string | null;
  promotionUrl: string | null;
  shortUrl: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

const router = useRouter();
const loading = ref(false);
const converting = ref(false);
const historyLoading = ref(false);
const clearingHistory = ref(false);
const deletingHistoryId = ref('');
const loadError = ref('');
const platforms = ref<AffiliatePlatformItem[]>([]);
const platform = ref<AffiliatePlatformItem | null>(null);
const selectedCode = ref('third_party_aggregator');
const conversionInput = ref('');
const conversionResult = ref<AffiliateConversionResult | null>(null);
const qrDataUrl = ref('');
const qrContent = ref('');
const historyItems = ref<AffiliateConversionHistoryItem[]>([]);
const historyPagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
});

const supportedPlatformText = computed(() =>
  platform.value
    ? platform.value.supportedPlatforms.map((item) => item.name).join(' ') || '未声明支持平台'
    : '',
);
const conversionQrContent = computed(() => {
  return conversionResult.value?.outputText.trim() || '';
});

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const response = await http.get<{ items: AffiliatePlatformItem[] }>(
      '/admin/affiliate-platforms',
    );
    platforms.value = response.data.items.filter((item) => item.providerType === 'THIRD_PARTY');
    const selected =
      platforms.value.find((item) => item.code === selectedCode.value) ??
      platforms.value[0] ??
      null;
    platform.value = selected;
    if (!selected) {
      loadError.value = '没有找到可用的第三方返利接口配置，请先到接口配置中启用';
    } else {
      selectedCode.value = selected.code;
      await loadHistory(1);
    }
  } catch (error) {
    loadError.value = getApiErrorMessage(error, '返利转换功能加载失败');
  } finally {
    loading.value = false;
  }
};

const loadHistory = async (page = historyPagination.page) => {
  historyLoading.value = true;
  try {
    const response = await http.get<{
      items: AffiliateConversionHistoryItem[];
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    }>(`/admin/affiliate-platforms/${selectedCode.value}/conversions`, {
      params: { page, pageSize: historyPagination.pageSize },
    });
    historyItems.value = response.data.items;
    Object.assign(historyPagination, response.data.pagination);
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '转换历史加载失败'));
  } finally {
    historyLoading.value = false;
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
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('copy failed');
};

const convertLink = async () => {
  const selected = platform.value;
  const content = conversionInput.value.trim();
  if (!selected) {
    ElMessage.warning('请先完成返利平台配置');
    return;
  }
  if (!selected.enabled) {
    ElMessage.warning(`${selected.name}尚未启用，请先到返利平台配置中启用`);
    return;
  }
  if (!content) {
    ElMessage.warning('请先粘贴商品链接或分享文本');
    return;
  }

  converting.value = true;
  conversionResult.value = null;
  qrDataUrl.value = '';
  qrContent.value = '';
  try {
    const response = await http.post<AffiliateConversionResult>(
      `/admin/affiliate-platforms/${selected.code}/convert`,
      { content },
    );
    conversionResult.value = response.data;
    ElMessage.success('返利链接转换成功');
    await loadHistory(1);
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '返利链接转换失败'));
    await loadHistory(1);
  } finally {
    converting.value = false;
  }
};

const copyConversionResult = async () => {
  const outputText = conversionResult.value?.outputText.trim();
  if (!outputText) return;
  try {
    await writeClipboard(outputText);
    ElMessage.success('转换结果已复制');
  } catch {
    ElMessage.error('复制失败，请手动选择结果复制');
  }
};

const showConversionQr = async () => {
  const content = conversionQrContent.value;
  if (!content) {
    ElMessage.warning('当前转换结果没有可生成二维码的内容');
    return;
  }

  try {
    qrContent.value = content;
    qrDataUrl.value = await QRCode.toDataURL(content, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#101828', light: '#ffffff' },
    });
  } catch {
    ElMessage.error('二维码生成失败，请稍后重试');
  }
};

const copyHistoryResult = async (item: AffiliateConversionHistoryItem) => {
  if (!item.outputText.trim()) return;
  try {
    await writeClipboard(item.outputText);
    ElMessage.success('历史转换结果已复制');
  } catch {
    ElMessage.error('复制失败，请手动选择结果复制');
  }
};

const deleteHistory = async (item: AffiliateConversionHistoryItem) => {
  try {
    await ElMessageBox.confirm(
      '确定删除这条转换历史吗？删除后不会影响已经发出的链接。',
      '删除历史',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    );
    deletingHistoryId.value = item.id;
    await http.delete(`/admin/affiliate-platforms/${selectedCode.value}/conversions/${item.id}`);
    const nextPage =
      historyItems.value.length === 1 && historyPagination.page > 1
        ? historyPagination.page - 1
        : historyPagination.page;
    await loadHistory(nextPage);
    ElMessage.success('转换历史已删除');
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '删除转换历史失败'));
  } finally {
    deletingHistoryId.value = '';
  }
};

const clearHistory = async () => {
  if (!historyPagination.total) return;
  try {
    await ElMessageBox.confirm(
      `确定清空全部 ${historyPagination.total} 条转换历史吗？此操作不会影响已经发出的链接。`,
      '清空转换历史',
      {
        type: 'warning',
        confirmButtonText: '全部清空',
        cancelButtonText: '取消',
      },
    );
    clearingHistory.value = true;
    await http.delete(`/admin/affiliate-platforms/${selectedCode.value}/conversions`);
    conversionResult.value = null;
    qrDataUrl.value = '';
    qrContent.value = '';
    await loadHistory(1);
    ElMessage.success('转换历史已清空');
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(getApiErrorMessage(error, '清空转换历史失败'));
  } finally {
    clearingHistory.value = false;
  }
};

const selectPlatform = async (item: AffiliatePlatformItem) => {
  if (item.code === selectedCode.value) return;
  selectedCode.value = item.code;
  platform.value = item;
  conversionResult.value = null;
  qrDataUrl.value = '';
  qrContent.value = '';
  await loadHistory(1);
};

const openSettings = () => void router.push('/admin/settings/affiliate-platforms');
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));

onMounted(() => void load());
</script>

<template>
  <div v-loading="loading" class="page-shell affiliate-conversion-page">
    <div class="page-heading">
      <div>
        <span class="page-kicker">AFFILIATE TOOLS</span>
        <h1>返利转换</h1>
        <p>日常转换商品返利链接，可在下方切换已接入的第三方接口，结果可复制或生成二维码。</p>
      </div>
      <div class="heading-actions">
        <el-button round :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button round :icon="Setting" @click="openSettings">接口配置</el-button>
      </div>
    </div>

    <section v-if="loadError" class="surface-card load-error-card">
      <span>{{ loadError }}</span>
      <el-button round size="small" @click="load">重新加载</el-button>
    </section>

    <template v-else-if="platform">
      <section class="surface-card conversion-status-card">
        <div class="status-copy">
          <span class="status-icon"><Connection /></span>
          <div>
            <div class="status-title">
              <strong>{{ platform.name }}</strong>
              <el-tag :type="platform.enabled ? 'success' : 'warning'" size="small" effect="light">
                {{ platform.enabled ? '接口已启用' : '接口未启用' }}
              </el-tag>
            </div>
            <p>
              支持平台：{{ supportedPlatformText }}
              <template v-if="platform.device"> · Device：{{ platform.device }}</template>
            </p>
          </div>
        </div>
        <div class="status-actions">
          <div
            v-if="platforms.length > 1"
            class="platform-switch"
            role="radiogroup"
            aria-label="选择返利接口"
          >
            <button
              v-for="item in platforms"
              :key="item.code"
              type="button"
              class="card-choice platform-switch-option"
              :class="{ 'is-selected': item.code === selectedCode }"
              role="radio"
              :aria-checked="item.code === selectedCode"
              @click="selectPlatform(item)"
            >
              {{ item.name }}
            </button>
          </div>
          <button class="config-shortcut" type="button" @click="openSettings">
            <span>{{ platform.configuredCredentialFields.length }}</span>
            <small>已配置密钥</small>
          </button>
        </div>
      </section>

      <section class="surface-card conversion-workbench">
        <div class="conversion-heading">
          <div>
            <span><MagicStick /></span>
            <div>
              <strong>返利链接转换</strong>
              <p>左侧粘贴原链接，右侧查看转换结果并生成二维码。</p>
            </div>
          </div>
          <el-tag :type="platform.enabled ? 'success' : 'warning'" size="small" effect="light">
            {{ platform.enabled ? '可以开始转换' : '请先启用接口' }}
          </el-tag>
        </div>

        <div class="conversion-panels">
          <section class="conversion-panel conversion-input-panel">
            <div class="conversion-panel-heading">
              <div>
                <span>01</span>
                <div>
                  <strong>链接转换</strong>
                  <small>支持商品链接或包含链接的分享文本</small>
                </div>
              </div>
            </div>

            <div class="conversion-editor">
              <el-input
                v-model="conversionInput"
                type="textarea"
                :rows="8"
                maxlength="20000"
                resize="vertical"
                placeholder="粘贴淘宝、京东、唯品会、拼多多、抖音、快手、美团等商品链接，或包含链接的分享文本"
              />
              <div class="conversion-input-actions">
                <span>转换记录会自动保存在本机数据库</span>
                <el-button
                  type="primary"
                  round
                  :icon="MagicStick"
                  :loading="converting"
                  @click="convertLink"
                >
                  开始转换
                </el-button>
              </div>
            </div>
          </section>

          <section
            class="conversion-panel conversion-result-card"
            :class="{ 'is-empty': !conversionResult }"
          >
            <div class="conversion-result-heading">
              <div>
                <span>02</span>
                <div>
                  <strong>转换结果</strong>
                  <small v-if="conversionResult?.providerMessage">
                    {{ conversionResult.providerMessage }}
                  </small>
                  <small v-else>转换成功后可复制或生成二维码</small>
                </div>
              </div>
              <div v-if="conversionResult" class="conversion-result-actions">
                <el-button
                  size="small"
                  round
                  plain
                  type="primary"
                  :icon="CopyDocument"
                  @click="copyConversionResult"
                >
                  复制结果
                </el-button>
                <el-button
                  size="small"
                  round
                  type="success"
                  plain
                  :icon="Grid"
                  @click="showConversionQr"
                >
                  生成二维码
                </el-button>
              </div>
            </div>

            <template v-if="conversionResult">
              <el-input
                :model-value="conversionResult.outputText"
                type="textarea"
                :rows="8"
                resize="vertical"
                readonly
              />
              <div class="conversion-result-meta">
                <span v-if="conversionResult.promotionUrl">
                  推广链接：{{ conversionResult.promotionUrl }}
                </span>
                <span v-if="conversionResult.shortUrl">
                  短链：{{ conversionResult.shortUrl }}
                </span>
                <span>已保存转换记录</span>
              </div>
              <div v-if="qrDataUrl" class="conversion-inline-qr">
                <img :src="qrDataUrl" alt="返利链接二维码" />
                <div>
                  <strong>转换结果二维码</strong>
                  <p>微信扫码即可打开转换后的链接。</p>
                  <small>{{ qrContent }}</small>
                </div>
              </div>
            </template>
            <div v-else class="conversion-empty-state">
              <span><Grid /></span>
              <strong>转换结果显示在这里</strong>
              <p>左侧输入商品链接并开始转换后，可直接复制结果或生成二维码。</p>
            </div>
          </section>
        </div>
      </section>

      <section class="surface-card conversion-history-card">
        <div class="history-heading">
          <div>
            <span><Grid /></span>
            <div>
              <strong>转换历史</strong>
              <p>共 {{ historyPagination.total }} 条，最新转换记录显示在最前面。</p>
            </div>
          </div>
          <div class="history-actions">
            <el-button
              size="small"
              round
              :icon="Refresh"
              :loading="historyLoading"
              @click="loadHistory()"
            >
              刷新
            </el-button>
            <el-button
              size="small"
              round
              plain
              type="danger"
              :icon="Delete"
              :loading="clearingHistory"
              :disabled="!historyPagination.total"
              @click="clearHistory"
            >
              清空历史
            </el-button>
          </div>
        </div>

        <el-table
          v-loading="historyLoading"
          :data="historyItems"
          row-key="id"
          empty-text="还没有转换历史"
          class="history-table"
        >
          <el-table-column label="转换时间" width="170">
            <template #default="{ row }">
              <span class="history-time">{{ formatDateTime(row.createdAt) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag
                :type="row.status === 'SUCCESS' ? 'success' : 'danger'"
                size="small"
                effect="light"
              >
                {{ row.status === 'SUCCESS' ? '成功' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="原始内容" min-width="260">
            <template #default="{ row }">
              <div class="history-text">{{ row.originalText }}</div>
            </template>
          </el-table-column>
          <el-table-column label="转换结果" min-width="320">
            <template #default="{ row }">
              <div v-if="row.outputText" class="history-text history-output">
                {{ row.outputText }}
              </div>
              <span v-else class="history-error">{{ row.errorMessage || '转换失败' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" align="center" fixed="right">
            <template #default="{ row }">
              <div class="history-row-actions">
                <el-button
                  class="history-row-action history-row-action--copy"
                  size="small"
                  :icon="CopyDocument"
                  :disabled="!row.outputText"
                  @click="copyHistoryResult(row)"
                >
                  复制
                </el-button>
                <el-button
                  class="history-row-action history-row-action--delete"
                  size="small"
                  :icon="Delete"
                  :loading="deletingHistoryId === row.id"
                  @click="deleteHistory(row)"
                >
                  删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="historyPagination.totalPages > 1" class="history-pagination">
          <el-pagination
            background
            layout="prev, pager, next"
            :current-page="historyPagination.page"
            :page-size="historyPagination.pageSize"
            :total="historyPagination.total"
            @current-change="loadHistory"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.affiliate-conversion-page {
  display: grid;
  gap: 14px;
}

.heading-actions,
.conversion-status-card,
.status-copy,
.status-title,
.conversion-heading,
.conversion-heading > div,
.conversion-panel-heading,
.conversion-panel-heading > div,
.conversion-result-heading,
.conversion-result-heading > div,
.conversion-result-actions,
.conversion-input-actions,
.conversion-result-meta,
.history-heading,
.history-heading > div,
.history-actions,
.history-row-actions,
.load-error-card {
  display: flex;
  align-items: center;
}

.heading-actions {
  gap: 8px;
}

.conversion-status-card {
  justify-content: space-between;
  padding: 17px 18px;
  gap: 16px;
}

.status-copy {
  min-width: 0;
  gap: 12px;
}

.status-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  place-items: center;
  border-radius: 14px;
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.11);
}

.status-icon svg {
  width: 18px;
  height: 18px;
}

.status-title {
  flex-wrap: wrap;
  gap: 8px;
}

.status-title strong {
  color: var(--app-heading);
  font-size: 15px;
}

.status-copy p {
  margin: 4px 0 0;
  color: var(--app-muted);
  font-size: 11px;
}

.status-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 10px;
}

.platform-switch {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--app-border);
  border-radius: 13px;
  background: var(--app-hover);
  gap: 4px;
}

.platform-switch-option {
  padding: 7px 12px;
  border-radius: 10px;
  font-size: 12px;
}

.config-shortcut {
  display: flex;
  min-width: 92px;
  padding: 9px 12px;
  border: 1px solid var(--app-border);
  border-radius: 13px;
  color: var(--app-text);
  background: var(--app-hover);
  cursor: pointer;
  flex-direction: column;
}

.config-shortcut span {
  color: var(--app-primary);
  font-size: 16px;
  font-weight: 750;
}

.config-shortcut small {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 10px;
}

.conversion-workbench {
  padding: 17px;
  border-color: color-mix(in srgb, var(--app-primary) 22%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary-soft) 32%, var(--app-control));
}

.conversion-heading {
  justify-content: space-between;
  gap: 14px;
}

.conversion-heading > div {
  min-width: 0;
  gap: 10px;
}

.conversion-heading > div > span {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 12px;
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.12);
}

.conversion-heading svg {
  width: 16px;
  height: 16px;
}

.conversion-heading strong,
.conversion-panel-heading strong,
.conversion-result-heading strong {
  color: var(--app-heading);
  font-size: 14px;
}

.conversion-heading p {
  margin: 2px 0 0;
  color: var(--app-muted);
  font-size: 11px;
  line-height: 1.6;
}

.conversion-panels {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  align-items: stretch;
  margin-top: 13px;
  gap: 12px;
}

.conversion-panel {
  display: flex;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-card-solid) 92%, transparent);
  flex-direction: column;
}

.conversion-panel-heading,
.conversion-result-heading {
  min-height: 38px;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 12px;
}

.conversion-panel-heading > div,
.conversion-result-heading > div {
  min-width: 0;
  gap: 9px;
}

.conversion-panel-heading > div > span,
.conversion-result-heading > div > span {
  display: grid;
  width: 31px;
  height: 31px;
  flex: 0 0 31px;
  place-items: center;
  border-radius: 10px;
  color: #2563eb;
  background: rgba(59, 130, 246, 0.11);
  font-size: 11px;
  font-weight: 750;
}

.conversion-result-heading > div > span {
  color: #059669;
  background: rgba(16, 185, 129, 0.11);
}

.conversion-panel-heading > div > div,
.conversion-result-heading > div > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.conversion-panel-heading small,
.conversion-result-heading small {
  overflow: hidden;
  color: var(--app-muted);
  font-size: 10px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversion-editor {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
}

.conversion-editor :deep(.el-textarea),
.conversion-result-card > :deep(.el-textarea) {
  display: flex;
  min-height: 174px;
  flex: 1;
}

.conversion-editor :deep(.el-textarea__inner),
.conversion-result-card > :deep(.el-textarea__inner) {
  min-height: 174px !important;
}

.conversion-input-actions {
  justify-content: space-between;
  gap: 10px;
}

.conversion-input-actions > span,
.conversion-result-meta {
  color: var(--app-muted);
  font-size: 10px;
}

.conversion-input-actions :deep(.el-button) {
  min-width: 118px;
}

.conversion-result-card {
  border-color: rgba(16, 185, 129, 0.24);
  background: color-mix(in srgb, rgba(16, 185, 129, 0.08) 68%, var(--app-card-solid));
}

.conversion-result-card.is-empty {
  border-color: var(--app-border);
  background: color-mix(in srgb, var(--app-hover) 56%, var(--app-card-solid));
}

.conversion-result-actions {
  flex: 0 0 auto;
  gap: 7px;
}

.conversion-result-meta {
  flex-wrap: wrap;
  margin-top: 8px;
  gap: 6px;
}

.conversion-result-meta span {
  overflow: hidden;
  max-width: 100%;
  padding: 4px 7px;
  border-radius: 8px;
  background: var(--app-hover);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversion-empty-state {
  display: flex;
  min-height: 210px;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 18px;
  text-align: center;
  flex-direction: column;
  box-sizing: border-box;
}

.conversion-empty-state > span {
  display: grid;
  width: 48px;
  height: 48px;
  margin-bottom: 10px;
  place-items: center;
  border-radius: 16px;
  color: #64748b;
  background: color-mix(in srgb, var(--app-hover) 78%, transparent);
}

.conversion-empty-state svg {
  width: 20px;
  height: 20px;
}

.conversion-empty-state strong {
  color: var(--app-heading);
  font-size: 13px;
}

.conversion-empty-state p {
  max-width: 310px;
  margin: 5px 0 0;
  color: var(--app-muted);
  font-size: 11px;
  line-height: 1.65;
}

.conversion-inline-qr {
  display: flex;
  min-width: 0;
  align-items: center;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid rgba(16, 185, 129, 0.22);
  border-radius: 14px;
  background: color-mix(in srgb, rgba(16, 185, 129, 0.07) 68%, var(--app-card-solid));
  gap: 12px;
}

.conversion-inline-qr img {
  display: block;
  width: 118px;
  height: 118px;
  flex: 0 0 118px;
  padding: 7px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  box-sizing: border-box;
}

.conversion-inline-qr > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.conversion-inline-qr strong {
  color: var(--app-heading);
  font-size: 13px;
}

.conversion-inline-qr p,
.conversion-inline-qr small {
  margin: 4px 0 0;
  color: var(--app-muted);
  font-size: 10px;
  line-height: 1.6;
}

.conversion-inline-qr small {
  overflow: hidden;
  max-width: 100%;
  padding: 5px 7px;
  border-radius: 8px;
  background: var(--app-hover);
  overflow-wrap: anywhere;
}

.conversion-history-card {
  min-width: 0;
  padding: 17px;
}

.history-heading {
  justify-content: space-between;
  margin-bottom: 13px;
  gap: 14px;
}

.history-heading > div:first-child {
  min-width: 0;
  gap: 10px;
}

.history-heading > div:first-child > span {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 12px;
  color: #2563eb;
  background: rgba(59, 130, 246, 0.11);
}

.history-heading svg {
  width: 16px;
  height: 16px;
}

.history-heading strong {
  color: var(--app-heading);
  font-size: 14px;
}

.history-heading p {
  margin: 2px 0 0;
  color: var(--app-muted);
  font-size: 11px;
}

.history-actions,
.history-row-actions {
  gap: 6px;
}

.history-row-actions {
  display: inline-flex;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--app-control) 72%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 62%, transparent),
    0 1px 3px rgba(15, 23, 42, 0.04);
}

.history-row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.history-row-action {
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

.history-row-action :deep(.el-icon) {
  margin-right: 4px;
  font-size: 13px;
}

.history-row-action--copy {
  color: color-mix(in srgb, var(--app-primary) 82%, var(--app-text));
}

.history-row-action--copy:hover,
.history-row-action--copy:focus {
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary-soft) 58%, var(--app-card-solid));
  box-shadow: 0 2px 7px color-mix(in srgb, var(--app-primary) 12%, transparent);
}

.history-row-action--delete {
  color: color-mix(in srgb, var(--app-danger) 78%, var(--app-text));
}

.history-row-action--delete:hover,
.history-row-action--delete:focus {
  color: var(--app-danger);
  background: color-mix(in srgb, var(--app-danger) 10%, var(--app-card-solid));
  box-shadow: 0 2px 7px color-mix(in srgb, var(--app-danger) 12%, transparent);
}

.history-table {
  width: 100%;
}

.history-table :deep(.el-table__header-wrapper th.el-table__cell) {
  background: var(--app-table-header-solid) !important;
}

.history-time {
  color: var(--app-muted);
  font-size: 11px;
}

.history-text {
  display: -webkit-box;
  overflow: hidden;
  color: var(--app-text);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.history-output {
  color: var(--app-heading);
}

.history-error {
  color: var(--app-danger);
  font-size: 11px;
}

.history-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.load-error-card {
  justify-content: space-between;
  padding: 16px 18px;
  color: var(--app-danger);
  font-size: 13px;
}

@media (max-width: 980px) {
  .conversion-panels {
    grid-template-columns: 1fr;
  }

  .status-actions {
    align-self: stretch;
    justify-content: space-between;
  }
}

@media (max-width: 680px) {
  .page-heading,
  .conversion-status-card,
  .conversion-heading,
  .conversion-input-actions,
  .conversion-result-heading,
  .history-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .heading-actions,
  .heading-actions :deep(.el-button),
  .conversion-input-actions :deep(.el-button),
  .conversion-result-actions,
  .conversion-result-actions :deep(.el-button) {
    width: 100%;
  }

  .conversion-result-actions {
    flex-direction: column;
  }

  .history-actions,
  .history-actions :deep(.el-button) {
    width: 100%;
  }

  .conversion-inline-qr {
    align-items: stretch;
    flex-direction: column;
  }

  .conversion-inline-qr img {
    width: min(220px, 100%);
    height: auto;
    align-self: center;
  }

  .status-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .platform-switch {
    display: flex;
    width: 100%;
    box-sizing: border-box;
  }

  .platform-switch-option {
    flex: 1;
  }

  .config-shortcut {
    width: 100%;
    box-sizing: border-box;
  }
}
</style>
