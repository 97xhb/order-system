<script setup lang="ts">
import { Connection, Document, Refresh, Search } from '@element-plus/icons-vue';
import { computed, onMounted, ref } from 'vue';
import {
  apiTagLabel,
  normalizeApiEndpoints,
  type ApiEndpointItem,
  type OpenApiDocument,
} from '../lib/api-catalog';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

const loading = ref(false);
const errorMessage = ref('');
const endpoints = ref<ApiEndpointItem[]>([]);
const documentTitle = ref('系统 API');
const documentVersion = ref('');
const keyword = ref('');
const activeTag = ref('ALL');

const apiBaseUrl = computed(() => {
  const baseUrl = http.defaults.baseURL || '/api';
  return new URL(baseUrl, window.location.origin).toString().replace(/\/$/, '');
});
const swaggerUrl = computed(() => `${apiBaseUrl.value}/docs`);

const tagOptions = computed(() => {
  const counts = new Map<string, number>();
  for (const endpoint of endpoints.value) {
    counts.set(endpoint.tag, (counts.get(endpoint.tag) || 0) + 1);
  }
  return Array.from(counts, ([value, count]) => ({
    value,
    label: apiTagLabel(value),
    count,
  })).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
});

const filteredEndpoints = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  return endpoints.value.filter((endpoint) => {
    if (activeTag.value !== 'ALL' && endpoint.tag !== activeTag.value) return false;
    if (!query) return true;
    return [
      endpoint.method,
      endpoint.path,
      endpoint.summary,
      endpoint.tag,
      apiTagLabel(endpoint.tag),
    ].some((value) => value.toLowerCase().includes(query));
  });
});

const endpointGroups = computed(() => {
  const groups = new Map<string, ApiEndpointItem[]>();
  for (const endpoint of filteredEndpoints.value) {
    const items = groups.get(endpoint.tag) || [];
    items.push(endpoint);
    groups.set(endpoint.tag, items);
  }
  return Array.from(groups, ([tag, items]) => ({
    tag,
    label: apiTagLabel(tag),
    items,
  })).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
});

const load = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    const response = await http.get<OpenApiDocument>('/docs-json', { timeout: 8_000 });
    endpoints.value = normalizeApiEndpoints(response.data);
    documentTitle.value = response.data.info?.title || '系统 API';
    documentVersion.value = response.data.info?.version || '';
    if (!endpoints.value.length) errorMessage.value = 'OpenAPI 文档中暂未发现接口。';
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, 'API 接口目录暂时加载失败');
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="page-shell api-directory-page">
    <div class="page-heading">
      <div>
        <span class="page-kicker">API DIRECTORY</span>
        <h1>API 接口目录</h1>
        <p>自动读取当前服务的 OpenAPI 文档，后续新增接口会同步出现在这里。</p>
      </div>
      <div class="heading-actions">
        <el-button round :icon="Refresh" :loading="loading" @click="load">刷新目录</el-button>
        <el-button
          round
          type="primary"
          tag="a"
          :href="swaggerUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          打开原始文档
        </el-button>
      </div>
    </div>

    <section class="surface-card api-overview-card">
      <div class="overview-main">
        <span class="overview-icon"
          ><el-icon><Connection /></el-icon
        ></span>
        <span>
          <small>API 基础地址</small>
          <strong>{{ apiBaseUrl }}</strong>
        </span>
      </div>
      <div class="overview-document">
        <span class="overview-icon is-document"
          ><el-icon><Document /></el-icon
        ></span>
        <span>
          <small>接口文档</small>
          <strong>{{ documentTitle }}</strong>
          <em v-if="documentVersion">v{{ documentVersion }}</em>
        </span>
      </div>
      <div class="overview-count">
        <strong>{{ endpoints.length }}</strong>
        <span>个接口</span>
      </div>
    </section>

    <section class="surface-card api-catalog-card">
      <div class="api-catalog-toolbar">
        <el-input
          v-model="keyword"
          class="api-search"
          clearable
          :prefix-icon="Search"
          placeholder="搜索接口路径、方法、模块或说明"
        />
        <el-select v-model="activeTag" class="api-module-select" placeholder="选择接口模块">
          <el-option :label="`全部模块（${endpoints.length}）`" value="ALL" />
          <el-option
            v-for="item in tagOptions"
            :key="item.value"
            :label="`${item.label}（${item.count}）`"
            :value="item.value"
          />
        </el-select>
        <span class="api-filter-summary">
          当前显示 <strong>{{ filteredEndpoints.length }}</strong> 个
        </span>
      </div>

      <p v-if="errorMessage" class="api-catalog-error">{{ errorMessage }}</p>
      <div v-if="loading && !endpoints.length" class="api-catalog-loading">
        <el-skeleton :rows="6" animated />
      </div>
      <div v-else-if="endpointGroups.length" class="api-groups">
        <section v-for="group in endpointGroups" :key="group.tag" class="api-group">
          <div class="api-group-heading">
            <span>{{ group.label }}</span>
            <small>{{ group.items.length }} 个接口</small>
          </div>
          <div class="api-endpoint-list">
            <article
              v-for="endpoint in group.items"
              :key="`${endpoint.method}:${endpoint.path}`"
              class="api-endpoint-row"
            >
              <span :class="['api-method', `api-method--${endpoint.method}`]">
                {{ endpoint.method.toUpperCase() }}
              </span>
              <code>{{ endpoint.path }}</code>
              <span class="api-endpoint-summary">{{ endpoint.summary }}</span>
            </article>
          </div>
        </section>
      </div>
      <el-empty
        v-else
        class="api-catalog-empty"
        description="没有找到匹配的 API 接口"
        :image-size="76"
      />
    </section>
  </div>
</template>

<style scoped>
.api-directory-page {
  display: grid;
  gap: 14px;
}

.heading-actions {
  display: flex;
  gap: 8px;
}

.api-overview-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) auto;
  align-items: stretch;
  padding: 14px;
  gap: 12px;
}

.overview-main,
.overview-document,
.overview-count {
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 15px;
  background: color-mix(in srgb, var(--app-control) 72%, transparent);
  gap: 11px;
}

.overview-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border-radius: 12px;
  color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 12%, transparent);
}

.overview-icon.is-document {
  color: var(--app-primary);
  background: var(--app-primary-soft);
}

.overview-main > span:last-child,
.overview-document > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.overview-main small,
.overview-document small {
  color: var(--app-muted);
  font-size: 12px;
}

.overview-main strong,
.overview-document strong {
  overflow: hidden;
  color: var(--app-heading);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-main strong {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
}

.overview-document em {
  color: var(--app-primary);
  font-size: 12px;
  font-style: normal;
}

.overview-count {
  min-width: 112px;
  justify-content: center;
  border-color: color-mix(in srgb, var(--app-primary) 18%, var(--app-border));
  color: var(--app-primary);
  background: var(--app-primary-soft);
}

.overview-count strong {
  font-size: 25px;
  font-variant-numeric: tabular-nums;
}

.overview-count span {
  color: var(--app-muted);
  font-size: 12px;
}

.api-catalog-card {
  padding: 15px;
}

.api-catalog-toolbar {
  display: flex;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 15px;
  background: color-mix(in srgb, var(--app-card-solid) 54%, transparent);
  gap: 10px;
}

.api-search {
  width: min(460px, 42vw);
}

.api-module-select {
  width: 240px;
}

.api-search :deep(.el-input__wrapper),
.api-module-select :deep(.el-select__wrapper) {
  min-height: 39px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-control) 82%, transparent);
  box-shadow: 0 0 0 1px var(--app-border) inset;
}

.api-filter-summary {
  margin-left: auto;
  color: var(--app-muted);
  font-size: 13px;
  white-space: nowrap;
}

.api-filter-summary strong {
  color: var(--app-primary);
  font-size: 15px;
}

.api-catalog-error {
  margin: 11px 0 0;
  padding: 9px 11px;
  border-radius: 11px;
  color: var(--app-danger);
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  font-size: 13px;
}

.api-catalog-loading {
  margin-top: 12px;
  padding: 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-card-solid) 48%, transparent);
}

.api-groups {
  display: grid;
  margin-top: 12px;
  gap: 10px;
}

.api-group {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 15px;
  background: color-mix(in srgb, var(--app-card-solid) 63%, transparent);
}

.api-group-heading {
  display: flex;
  min-height: 43px;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-heading);
  background: color-mix(in srgb, var(--app-primary-soft) 30%, transparent);
  font-size: 14px;
  font-weight: 650;
}

.api-group-heading small {
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 500;
}

.api-endpoint-list {
  display: grid;
}

.api-endpoint-row {
  display: grid;
  grid-template-columns: 68px minmax(280px, 0.9fr) minmax(260px, 1.1fr);
  min-height: 47px;
  align-items: center;
  padding: 8px 12px;
  gap: 12px;
}

.api-endpoint-row + .api-endpoint-row {
  border-top: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
}

.api-endpoint-row:hover {
  background: color-mix(in srgb, var(--app-primary-soft) 22%, transparent);
}

.api-method {
  --method-color: #64748b;
  display: inline-flex;
  width: 62px;
  min-height: 25px;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--method-color) 24%, transparent);
  border-radius: 9px;
  color: var(--method-color);
  background: color-mix(in srgb, var(--method-color) 9%, transparent);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.04em;
}

.api-method--get {
  --method-color: #3b82f6;
}
.api-method--post {
  --method-color: #10b981;
}
.api-method--put {
  --method-color: #8b5cf6;
}
.api-method--patch {
  --method-color: #f59e0b;
}
.api-method--delete {
  --method-color: #ef4444;
}

.api-endpoint-row code {
  overflow-wrap: anywhere;
  color: var(--app-heading);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
}

.api-endpoint-summary {
  color: var(--app-muted);
  font-size: 13px;
  line-height: 1.55;
}

.api-catalog-empty {
  padding: 26px 0 8px;
}

@media (max-width: 900px) {
  .api-overview-card {
    grid-template-columns: 1fr 1fr;
  }
  .overview-count {
    grid-column: 1 / -1;
  }
  .api-endpoint-row {
    grid-template-columns: 68px minmax(210px, 0.9fr) minmax(210px, 1.1fr);
  }
}

@media (max-width: 700px) {
  .api-overview-card {
    grid-template-columns: 1fr;
  }
  .overview-count {
    grid-column: auto;
  }
  .api-catalog-toolbar {
    flex-wrap: wrap;
  }
  .api-search,
  .api-module-select {
    width: calc(50% - 5px);
  }
  .api-filter-summary {
    width: 100%;
    margin-left: 0;
    text-align: right;
  }
  .api-endpoint-row {
    grid-template-columns: 62px minmax(0, 1fr);
  }
  .api-endpoint-summary {
    grid-column: 1 / -1;
    padding-left: 74px;
  }
}

@media (max-width: 560px) {
  .heading-actions {
    width: 100%;
  }
  .heading-actions :deep(.el-button) {
    flex: 1;
  }
  .api-catalog-toolbar {
    display: grid;
  }
  .api-search,
  .api-module-select {
    width: 100%;
  }
  .api-filter-summary {
    text-align: left;
  }
  .api-endpoint-row {
    padding: 9px 10px;
    gap: 9px;
  }
  .api-endpoint-summary {
    padding-left: 71px;
  }
}
</style>
