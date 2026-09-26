<script setup lang="ts">
import { Connection, Key, Lock, Setting } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

type ProviderType = 'THIRD_PARTY' | 'OFFICIAL';
type CredentialKey = 'apiKey' | 'apiSecret' | 'accessToken' | 'promotionId';

interface CredentialField {
  key: CredentialKey;
  label: string;
  placeholder: string;
}

interface AffiliatePlatformItem {
  id: string | null;
  code: string;
  name: string;
  shortName: string;
  providerType: ProviderType;
  description: string;
  supportedPlatforms: Array<{ code: string; name: string }>;
  credentialFields: CredentialField[];
  enabled: boolean;
  accountName: string;
  apiBaseUrl: string;
  tokenEndpoint: string;
  device: string;
  notes: string;
  configured: boolean;
  configuredCredentialFields: CredentialKey[];
  credentialsReadable: boolean;
  updatedAt: string | null;
}

const providerTypeOptions: Array<{
  value: ProviderType;
  shortName: string;
  label: string;
  description: string;
}> = [
  {
    value: 'THIRD_PARTY',
    shortName: '三',
    label: '第三方聚合接口',
    description: '一个接口覆盖淘宝、京东、唯品会等多个平台',
  },
  {
    value: 'OFFICIAL',
    shortName: '官',
    label: '官方联盟接口',
    description: '每个联盟只转换自己对应平台的商品链接',
  },
];

const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const items = ref<AffiliatePlatformItem[]>([]);
const activeProviderType = ref<ProviderType>('THIRD_PARTY');
const selectedCode = ref('third_party_aggregator');
const form = reactive({
  enabled: false,
  accountName: '',
  apiBaseUrl: '',
  tokenEndpoint: '',
  device: 'pcweb',
  notes: '',
});
const tokenMode = ref<'manual' | 'online'>('manual');
const verifyingToken = ref(false);
const fetchingToken = ref(false);
const credentialDraft = reactive<Record<CredentialKey, string>>({
  apiKey: '',
  apiSecret: '',
  accessToken: '',
  promotionId: '',
});
const visiblePlatforms = computed(() =>
  items.value.filter((item) => item.providerType === activeProviderType.value),
);
const selectedPlatform = computed(
  () => items.value.find((item) => item.code === selectedCode.value) ?? null,
);
const enabledCount = computed(() => items.value.filter((item) => item.enabled).length);
const configuredCount = computed(() => items.value.filter((item) => item.configured).length);

const hydrateForm = (item: AffiliatePlatformItem | null) => {
  form.enabled = item?.enabled ?? false;
  form.accountName = item?.accountName ?? '';
  form.apiBaseUrl = item?.apiBaseUrl ?? '';
  form.tokenEndpoint = item?.tokenEndpoint ?? '';
  form.device = item?.device || 'pcweb';
  form.notes = item?.notes ?? '';
  credentialDraft.apiKey = '';
  credentialDraft.apiSecret = '';
  credentialDraft.accessToken = '';
  credentialDraft.promotionId = '';
};

const selectPlatform = (item: AffiliatePlatformItem) => {
  selectedCode.value = item.code;
  tokenMode.value = 'manual';
  hydrateForm(item);
};

const selectProviderType = (type: ProviderType) => {
  activeProviderType.value = type;
  const first = items.value.find((item) => item.providerType === type);
  if (first) selectPlatform(first);
};

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const response = await http.get<{ items: AffiliatePlatformItem[] }>(
      '/admin/affiliate-platforms',
    );
    items.value = response.data.items;
    const selected =
      items.value.find((item) => item.code === selectedCode.value) ?? items.value[0] ?? null;
    if (selected) {
      activeProviderType.value = selected.providerType;
      selectPlatform(selected);
    }
  } catch (error) {
    loadError.value = getApiErrorMessage(error, '返利平台配置加载失败');
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  const selected = selectedPlatform.value;
  if (!selected) return;

  saving.value = true;
  try {
    const credentials = Object.fromEntries(
      (Object.keys(credentialDraft) as CredentialKey[])
        .map((key) => [key, credentialDraft[key].trim()] as const)
        .filter(([, value]) => Boolean(value)),
    );
    const response = await http.patch<AffiliatePlatformItem>(
      `/admin/affiliate-platforms/${selected.code}`,
      {
        enabled: form.enabled,
        accountName: form.accountName,
        apiBaseUrl: form.apiBaseUrl,
        tokenEndpoint: form.tokenEndpoint,
        device: form.device,
        notes: form.notes,
        credentials,
      },
    );
    const index = items.value.findIndex((item) => item.code === response.data.code);
    if (index >= 0) items.value.splice(index, 1, response.data);
    hydrateForm(response.data);
    ElMessage.success(`${response.data.name}配置已保存`);
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '返利平台配置保存失败'));
  } finally {
    saving.value = false;
  }
};

const fetchAuthorization = async () => {
  const selected = selectedPlatform.value;
  if (!selected) return;
  const endpoint = form.tokenEndpoint.trim();
  if (!endpoint) {
    ElMessage.warning('请先填写在线获取 Authorization 的接口地址');
    return;
  }

  fetchingToken.value = true;
  try {
    const response = await http.post<{ authorization: string; endpoint: string }>(
      `/admin/affiliate-platforms/${selected.code}/refresh-authorization`,
      { endpoint },
    );
    credentialDraft.accessToken = response.data.authorization;
    ElMessage.success('Authorization 已获取，确认无误后点击保存');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, 'Authorization 获取失败'));
  } finally {
    fetchingToken.value = false;
  }
};

const verifyAuthorization = async () => {
  const selected = selectedPlatform.value;
  if (!selected) return;

  verifyingToken.value = true;
  try {
    const response = await http.post<{
      valid: boolean;
      message: string;
      account: string | null;
    }>(`/admin/affiliate-platforms/${selected.code}/verify-authorization`, {
      token: credentialDraft.accessToken.trim() || undefined,
      apiBaseUrl: selected.apiBaseUrl || undefined,
    });
    if (response.data.valid) {
      ElMessage.success(
        response.data.account
          ? `Authorization 有效，账号：${response.data.account}`
          : 'Authorization 有效',
      );
    } else {
      ElMessage.error(`Authorization 无效：${response.data.message}`);
    }
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, 'Authorization 校验失败'));
  } finally {
    verifyingToken.value = false;
  }
};

const credentialConfigured = (key: CredentialKey) =>
  selectedPlatform.value?.configuredCredentialFields.includes(key) ?? false;

onMounted(() => void load());
</script>

<template>
  <div v-loading="loading" class="affiliate-settings-stack">
    <section class="surface-card affiliate-overview-card">
      <div class="overview-copy">
        <span class="overview-icon"><Connection /></span>
        <div>
          <div class="overview-title-row">
            <strong>返利平台接口</strong>
            <el-tag type="success" size="small" effect="light">2 个第三方接口已接入</el-tag>
          </div>
          <p>梨花熊与有赞助手均已接入真实转换；官方联盟接口后续逐个平台接入。</p>
        </div>
      </div>
      <div class="overview-stats">
        <span
          ><b>{{ items.length }}</b
          ><small>预留接口</small></span
        >
        <span
          ><b>{{ configuredCount }}</b
          ><small>已填密钥</small></span
        >
        <span
          ><b>{{ enabledCount }}</b
          ><small>已启用</small></span
        >
      </div>
    </section>

    <section v-if="loadError" class="surface-card load-error-card">
      <span>{{ loadError }}</span>
      <el-button round size="small" @click="load">重新加载</el-button>
    </section>

    <template v-else>
      <section class="surface-card affiliate-selection-card">
        <div class="section-heading">
          <div>
            <span>01</span>
            <div>
              <strong>选择接口类型</strong>
              <p>第三方聚合接口支持多平台；官方接口只负责对应平台。</p>
            </div>
          </div>
        </div>

        <div class="provider-type-options" role="radiogroup" aria-label="返利接口类型">
          <button
            v-for="option in providerTypeOptions"
            :key="option.value"
            type="button"
            class="card-choice provider-type-option"
            :class="{ 'is-selected': activeProviderType === option.value }"
            :aria-checked="activeProviderType === option.value"
            role="radio"
            @click="selectProviderType(option.value)"
          >
            <span>{{ option.shortName }}</span>
            <div>
              <b>{{ option.label }}</b>
              <small>{{ option.description }}</small>
            </div>
          </button>
        </div>

        <div class="provider-list-heading">
          <strong>{{
            activeProviderType === 'THIRD_PARTY' ? '第三方接口' : '官方联盟接口'
          }}</strong>
          <span>点击卡片后在下方配置该接口</span>
        </div>

        <div class="provider-grid">
          <button
            v-for="item in visiblePlatforms"
            :key="item.code"
            type="button"
            class="card-choice provider-card"
            :class="{ 'is-selected': selectedCode === item.code }"
            @click="selectPlatform(item)"
          >
            <div class="provider-card-top">
              <span class="provider-logo">{{ item.shortName }}</span>
              <div class="provider-statuses">
                <el-tag :type="item.enabled ? 'success' : 'info'" size="small" effect="light">
                  {{ item.enabled ? '已启用' : '未启用' }}
                </el-tag>
                <el-tag v-if="item.configured" type="primary" size="small" effect="light">
                  已配置 {{ item.configuredCredentialFields.length }} 项
                </el-tag>
              </div>
            </div>
            <strong>{{ item.name }}</strong>
            <p>{{ item.description }}</p>
            <div class="supported-platforms">
              <span v-for="platform in item.supportedPlatforms" :key="platform.code">
                {{ platform.name }}
              </span>
            </div>
          </button>
        </div>
      </section>

      <section v-if="selectedPlatform" class="surface-card affiliate-config-card">
        <div class="config-heading">
          <div class="config-heading-copy">
            <span class="config-icon"><Setting /></span>
            <div>
              <strong>配置 {{ selectedPlatform.name }}</strong>
              <p>
                支持平台：{{
                  selectedPlatform.supportedPlatforms.map((item) => item.name).join('、')
                }}
              </p>
            </div>
          </div>
          <div class="enabled-switch-card">
            <div>
              <b>启用此接口</b>
              <span>{{ form.enabled ? '后续允许转换服务调用' : '保存配置但暂不调用' }}</span>
            </div>
            <el-switch v-model="form.enabled" />
          </div>
        </div>

        <div v-if="!selectedPlatform.credentialsReadable" class="credential-warning">
          当前密钥使用旧加密信息或已经损坏，重新填写对应字段并保存后会更新配置。
        </div>

        <el-form label-position="top" class="affiliate-config-form" @submit.prevent>
          <div
            class="base-config-grid"
            :class="{ 'has-device-field': selectedPlatform.code === 'third_party_aggregator' }"
          >
            <el-form-item label="接口配置名称">
              <el-input
                v-model="form.accountName"
                maxlength="100"
                placeholder="例如：主账号、备用聚合接口"
              />
            </el-form-item>
            <el-form-item label="API 接口地址">
              <el-input
                v-model="form.apiBaseUrl"
                maxlength="1000"
                placeholder="后续按接口文档填写，可暂时留空"
              />
            </el-form-item>
            <el-form-item
              v-if="selectedPlatform.code === 'third_party_aggregator'"
              label="Device（设备类型）"
            >
              <el-input v-model="form.device" maxlength="32" clearable placeholder="例如：pcweb" />
              <span class="protocol-field-hint">
                PC 端填写 <b>pcweb</b>，APP 端填写 <b>web</b>；需要与抓取 Token 的客户端保持一致。
              </span>
            </el-form-item>
          </div>

          <div class="credential-section-heading">
            <div>
              <span><Key /></span>
              <div>
                <strong>API 与密钥</strong>
                <p>敏感字段加密保存；已配置字段留空保存时会保留原值。</p>
              </div>
            </div>
            <div class="credential-heading-actions">
              <span class="secure-label"><Lock /> 加密存储</span>
              <el-button
                v-if="selectedPlatform.code === 'youzai_assistant'"
                size="small"
                round
                plain
                :loading="verifyingToken"
                @click="verifyAuthorization"
              >
                测试 Authorization
              </el-button>
            </div>
          </div>

          <div v-if="selectedPlatform.code === 'youzai_assistant'" class="token-source-card">
            <div class="token-source-head">
              <div>
                <strong>Authorization 获取方式</strong>
                <p>手动填写抓包值，或配置一个接口地址由系统自动取回。</p>
              </div>
              <div
                class="token-source-options"
                role="radiogroup"
                aria-label="Authorization 获取方式"
              >
                <button
                  type="button"
                  class="card-choice token-source-option"
                  :class="{ 'is-selected': tokenMode === 'manual' }"
                  role="radio"
                  :aria-checked="tokenMode === 'manual'"
                  @click="tokenMode = 'manual'"
                >
                  手动获取
                </button>
                <button
                  type="button"
                  class="card-choice token-source-option"
                  :class="{ 'is-selected': tokenMode === 'online' }"
                  role="radio"
                  :aria-checked="tokenMode === 'online'"
                  @click="tokenMode = 'online'"
                >
                  在线获取
                </button>
              </div>
            </div>

            <div v-if="tokenMode === 'online'" class="token-endpoint-row">
              <el-input
                v-model="form.tokenEndpoint"
                maxlength="1000"
                clearable
                placeholder="填写返回 Authorization 的接口地址，例如 https://example.com/api/token"
              />
              <el-button type="primary" round :loading="fetchingToken" @click="fetchAuthorization">
                获取并回填
              </el-button>
            </div>
            <p class="protocol-field-hint">
              在线接口需返回纯文本 token 或 JSON 的
              <b>token</b> / <b>authorization</b> /
              <b>data.token</b>；取回后只会回填到下方输入框，保存后才加密入库。
            </p>
          </div>

          <div class="credential-grid">
            <el-form-item
              v-for="field in selectedPlatform.credentialFields"
              :key="field.key"
              :label="field.label"
            >
              <el-input
                v-model="credentialDraft[field.key]"
                type="password"
                show-password
                clearable
                :placeholder="
                  credentialConfigured(field.key) ? '已配置，留空表示保留原值' : field.placeholder
                "
              />
              <span v-if="credentialConfigured(field.key)" class="configured-field-hint">
                已安全保存
              </span>
            </el-form-item>
          </div>

          <el-form-item label="接口备注" class="notes-field">
            <el-input
              v-model="form.notes"
              type="textarea"
              :rows="2"
              maxlength="2000"
              show-word-limit
              placeholder="可记录申请账号、接口版本或后续待补事项"
            />
          </el-form-item>
        </el-form>

        <div class="config-actions">
          <div>
            <strong>配置会加密保存在本机数据库</strong>
            <span>密钥输入框留空时保留原值，页面不会回显 Token 明文。</span>
          </div>
          <el-button type="primary" round :loading="saving" @click="save"> 保存接口配置 </el-button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.affiliate-settings-stack {
  display: grid;
  gap: 14px;
}

.affiliate-overview-card,
.overview-copy,
.overview-title-row,
.overview-stats,
.section-heading > div,
.provider-card-top,
.provider-statuses,
.config-heading,
.config-heading-copy,
.enabled-switch-card,
.credential-section-heading,
.credential-section-heading > div,
.secure-label,
.config-actions,
.load-error-card {
  display: flex;
  align-items: center;
}

.affiliate-overview-card {
  justify-content: space-between;
  padding: 19px 20px;
  gap: 18px;
}

.overview-copy {
  min-width: 0;
  gap: 13px;
}

.overview-icon,
.config-icon {
  display: grid;
  flex: 0 0 46px;
  height: 46px;
  place-items: center;
  border-radius: 16px;
  color: #2563eb;
  background: rgba(59, 130, 246, 0.12);
}

.overview-icon :deep(svg),
.config-icon :deep(svg) {
  width: 19px;
  height: 19px;
}

.overview-title-row {
  flex-wrap: wrap;
  gap: 8px;
}

.overview-title-row strong {
  color: var(--app-heading);
  font-size: 17px;
}

.overview-copy p,
.section-heading p,
.provider-card p,
.config-heading p,
.credential-section-heading p,
.config-actions span {
  margin: 3px 0 0;
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.65;
}

.overview-stats {
  flex: 0 0 auto;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: var(--app-hover);
  gap: 5px;
}

.overview-stats > span {
  display: flex;
  min-width: 72px;
  flex-direction: column;
  align-items: center;
  padding: 5px 10px;
  border-radius: 11px;
}

.overview-stats b {
  color: var(--app-heading);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.overview-stats small {
  margin-top: 1px;
  color: var(--app-muted);
  font-size: 10px;
}

.affiliate-selection-card,
.affiliate-config-card {
  padding: 20px;
}

.section-heading {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--app-border);
}

.section-heading > div {
  align-items: flex-start;
  gap: 10px;
}

.section-heading > div > span {
  display: grid;
  width: 31px;
  height: 31px;
  flex: 0 0 31px;
  place-items: center;
  border-radius: 11px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
  font-size: 11px;
  font-weight: 800;
}

.section-heading strong,
.provider-list-heading strong,
.config-heading strong,
.credential-section-heading strong,
.config-actions strong {
  color: var(--app-heading);
  font-size: 14px;
}

.provider-type-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 15px;
  padding: 5px;
  border: 1px solid var(--app-border);
  border-radius: 17px;
  background: var(--app-hover);
  gap: 5px;
}

.provider-type-option {
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 11px 12px;
  border: 1px solid transparent;
  border-radius: 13px;
  color: var(--app-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
  gap: 10px;
  transition: 0.18s ease;
}

.provider-type-option:hover {
  border-color: rgba(59, 130, 246, 0.25);
  background: var(--app-control);
  transform: translateY(-1px);
}

.provider-type-option.is-selected {
  border-color: rgba(59, 130, 246, 0.42);
  color: var(--app-primary);
  background: var(--app-card-solid);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.1);
}

.provider-type-option > span {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 11px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
  font-size: 13px;
  font-weight: 800;
}

.provider-type-option > div {
  min-width: 0;
}

.provider-type-option b,
.provider-type-option small {
  display: block;
}

.provider-type-option b {
  color: var(--app-heading);
  font-size: 14px;
}

.provider-type-option small {
  margin-top: 2px;
  overflow: hidden;
  color: var(--app-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-list-heading {
  display: flex;
  align-items: baseline;
  margin: 18px 1px 10px;
  gap: 8px;
}

.provider-list-heading span {
  color: var(--app-muted);
  font-size: 11px;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.provider-card {
  align-items: stretch;
  flex-direction: column;
  justify-content: flex-start;
  min-width: 0;
  min-height: 156px;
  padding: 13px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-control) 72%, transparent);
  text-align: left;
  cursor: pointer;
  transition: 0.18s ease;
}

.provider-card:hover {
  border-color: rgba(59, 130, 246, 0.34);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
}

.provider-card.is-selected {
  border-color: rgba(59, 130, 246, 0.54);
  background: color-mix(in srgb, var(--app-primary-soft) 70%, var(--app-card-solid));
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.08);
}

.provider-card-top {
  justify-content: space-between;
  margin-bottom: 11px;
  gap: 8px;
}

.provider-logo {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 12px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
  font-size: 14px;
  font-weight: 800;
}

.provider-statuses {
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}

.provider-card > strong {
  color: var(--app-heading);
  font-size: 14px;
}

.provider-card p {
  min-height: 36px;
}

.supported-platforms {
  display: flex;
  flex-wrap: wrap;
  margin-top: 9px;
  gap: 5px;
}

.supported-platforms span {
  padding: 3px 7px;
  border-radius: 8px;
  color: var(--app-muted);
  background: var(--app-hover);
  font-size: 10px;
}

.config-heading {
  justify-content: space-between;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--app-border);
  gap: 16px;
}

.config-heading-copy {
  min-width: 0;
  gap: 12px;
}

.enabled-switch-card {
  flex: 0 0 auto;
  padding: 9px 12px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: var(--app-hover);
  gap: 16px;
}

.enabled-switch-card > div {
  display: flex;
  flex-direction: column;
}

.enabled-switch-card b {
  color: var(--app-heading);
  font-size: 13px;
}

.enabled-switch-card span {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 10px;
}

.credential-warning {
  margin-top: 13px;
  padding: 9px 11px;
  border: 1px solid rgba(245, 158, 11, 0.22);
  border-radius: 11px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.09);
  font-size: 12px;
}

.affiliate-config-form {
  margin-top: 16px;
}

.base-config-grid,
.credential-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}

.base-config-grid.has-device-field {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.affiliate-config-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.affiliate-config-form :deep(.el-form-item__label) {
  color: var(--app-text);
  font-size: 12px;
  font-weight: 650;
}

.credential-heading-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
}

.token-source-card {
  margin: 2px 0 14px;
  padding: 12px 13px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: var(--app-hover);
}

.token-source-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.token-source-head strong {
  color: var(--app-heading);
  font-size: 13px;
}

.token-source-head p {
  margin: 3px 0 0;
  color: var(--app-muted);
  font-size: 11px;
}

.token-source-options {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 6px;
}

.token-source-option {
  padding: 6px 12px;
  border-radius: 10px;
  font-size: 12px;
}

.token-endpoint-row {
  display: flex;
  align-items: center;
  margin-top: 12px;
  gap: 10px;
}

.token-endpoint-row :deep(.el-input) {
  flex: 1;
}

@media (max-width: 680px) {
  .token-source-head,
  .token-endpoint-row {
    align-items: stretch;
    flex-direction: column;
  }

  .token-source-option {
    flex: 1;
  }

  .token-endpoint-row :deep(.el-button) {
    width: 100%;
  }
}

.credential-section-heading {
  justify-content: space-between;
  margin: 2px 0 13px;
  padding: 11px 12px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: var(--app-hover);
  gap: 12px;
}

.credential-section-heading > div {
  gap: 9px;
}

.credential-section-heading > div > span {
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border-radius: 10px;
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.11);
}

.credential-section-heading svg,
.secure-label svg {
  width: 14px;
  height: 14px;
}

.secure-label {
  flex: 0 0 auto;
  color: #059669;
  font-size: 11px;
  gap: 4px;
}

.configured-field-hint {
  width: 100%;
  margin-top: 3px;
  color: #059669;
  font-size: 10px;
}

.protocol-field-hint {
  width: 100%;
  margin-top: 4px;
  color: var(--app-muted);
  font-size: 10px;
  line-height: 1.55;
}

.protocol-field-hint b {
  color: var(--app-primary);
  font-weight: 700;
}

.notes-field {
  margin-bottom: 0 !important;
}

.config-actions {
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--app-border);
  gap: 14px;
}

.config-actions > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.load-error-card {
  justify-content: space-between;
  padding: 16px 18px;
  color: var(--app-danger);
  font-size: 13px;
}

@media (max-width: 980px) {
  .affiliate-overview-card,
  .config-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .overview-stats {
    align-self: flex-start;
  }

  .enabled-switch-card {
    justify-content: space-between;
  }

  .provider-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .affiliate-overview-card,
  .affiliate-selection-card,
  .affiliate-config-card {
    padding: 16px;
  }

  .provider-type-options,
  .provider-grid,
  .base-config-grid,
  .base-config-grid.has-device-field,
  .credential-grid {
    grid-template-columns: 1fr;
  }

  .provider-type-option small {
    white-space: normal;
  }

  .provider-card {
    min-height: 0;
  }

  .provider-card p {
    min-height: 0;
  }

  .overview-stats {
    width: 100%;
    box-sizing: border-box;
    justify-content: space-around;
  }

  .overview-stats > span {
    min-width: 0;
    flex: 1;
  }

  .credential-section-heading,
  .config-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .secure-label {
    align-self: flex-start;
  }

  .config-actions :deep(.el-button) {
    width: 100%;
  }
}
</style>
