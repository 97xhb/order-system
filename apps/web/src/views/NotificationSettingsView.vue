<script setup lang="ts">
import {
  Bell,
  ChatDotRound,
  Connection,
  Delete,
  EditPen,
  Link,
  Plus,
  Promotion,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

type ChannelType = 'DINGTALK' | 'WECOM' | 'PUSHPLUS' | 'CUSTOM';

interface NotificationChannel {
  id: string;
  name: string;
  type: ChannelType;
  endpoint: string;
  secret: string;
  secretConfigured: boolean;
  enabled: boolean;
}

interface NotificationRule {
  event: string;
  eventLabel: string;
  enabled: boolean;
  titleTemplate: string;
  bodyTemplate: string;
  channelIds: string[];
  updatedAt: string | null;
}

interface NotificationVariable {
  key: string;
  label: string;
  description: string;
  group: 'general' | 'order' | 'change';
}

const channelTypeOptions: Array<{
  value: ChannelType;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    value: 'DINGTALK',
    label: '钉钉机器人',
    hint: '填钉钉群机器人的 Webhook 地址，可选加签密钥。',
    placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
  },
  {
    value: 'WECOM',
    label: '企业微信机器人',
    hint: '填企业微信群机器人的 Webhook 地址。',
    placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx',
  },
  {
    value: 'PUSHPLUS',
    label: 'PushPlus',
    hint: '填 PushPlus 的 Token，接口地址可留空使用官方默认。',
    placeholder: '填写 PushPlus Token',
  },
  {
    value: 'CUSTOM',
    label: '自定义 Webhook',
    hint: '任意支持 POST JSON 的地址，会收到标题、正文与订单信息。',
    placeholder: 'https://example.com/hooks/order',
  },
];

const variableGroups: Array<{
  key: 'general' | 'order' | 'change';
  label: string;
}> = [
  { key: 'general', label: '通用' },
  { key: 'order', label: '订单' },
  { key: 'change', label: '变更' },
];

const VARIABLE_HINT = '{{变量}}';

const channels = ref<NotificationChannel[]>([]);
const rules = ref<NotificationRule[]>([]);
const variables = ref<NotificationVariable[]>([]);
const eventDescriptions = ref<Record<string, string>>({});
const loading = ref(false);
const savingRuleEvent = ref('');
const testingChannelId = ref('');

const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const channelForm = reactive({
  id: '',
  name: '',
  type: 'DINGTALK' as ChannelType,
  endpoint: '',
  secret: '',
  enabled: true,
});

const bodyRefs = new Map<string, HTMLTextAreaElement>();

const channelTypeLabel = (type: ChannelType) =>
  channelTypeOptions.find((option) => option.value === type)?.label ?? type;

const channelTypeIcon = (type: ChannelType) => {
  if (type === 'DINGTALK') return Promotion;
  if (type === 'WECOM') return ChatDotRound;
  if (type === 'PUSHPLUS') return Connection;
  return Link;
};

const activeChannelCount = computed(
  () => channels.value.filter((channel) => channel.enabled).length,
);

const enabledRuleCount = computed(
  () => rules.value.filter((rule) => rule.enabled).length,
);

const currentTypeOption = computed(
  () =>
    channelTypeOptions.find((option) => option.value === channelForm.type) ??
    channelTypeOptions[0],
);

/** PushPlus 填 Token，其余渠道填地址，这里用同一个输入框切换。 */
const channelAddress = computed({
  get: () =>
    channelForm.type === 'PUSHPLUS'
      ? channelForm.secret
      : channelForm.endpoint,
  set: (value: string) => {
    if (channelForm.type === 'PUSHPLUS') {
      channelForm.secret = value;
    } else {
      channelForm.endpoint = value;
    }
  },
});

const loadAll = async () => {
  loading.value = true;
  try {
    const [channelResponse, ruleResponse, variableResponse] = await Promise.all([
      http.get<NotificationChannel[]>('/admin/notifications/channels'),
      http.get<NotificationRule[]>('/admin/notifications/rules'),
      http.get<{
        variables: NotificationVariable[];
        events: Array<{ event: string; label: string; description: string }>;
      }>('/admin/notifications/variables'),
    ]);
    channels.value = channelResponse.data;
    rules.value = ruleResponse.data;
    variables.value = variableResponse.data.variables;
    eventDescriptions.value = Object.fromEntries(
      variableResponse.data.events.map((item) => [item.event, item.description]),
    );
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '通知设置加载失败'));
  } finally {
    loading.value = false;
  }
};

const openCreateDialog = () => {
  dialogMode.value = 'create';
  Object.assign(channelForm, {
    id: '',
    name: '',
    type: 'DINGTALK' as ChannelType,
    endpoint: '',
    secret: '',
    enabled: true,
  });
  dialogVisible.value = true;
};

const openEditDialog = (channel: NotificationChannel) => {
  dialogMode.value = 'edit';
  Object.assign(channelForm, {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    endpoint: channel.endpoint,
    secret: '',
    enabled: channel.enabled,
  });
  dialogVisible.value = true;
};

const saveChannel = async () => {
  const name = channelForm.name.trim();
  if (!name) {
    ElMessage.warning('请填写渠道名称');
    return;
  }
  const payload: Record<string, unknown> = {
    name,
    type: channelForm.type,
    enabled: channelForm.enabled,
  };
  if (channelForm.endpoint.trim()) payload.endpoint = channelForm.endpoint.trim();
  if (channelForm.type === 'PUSHPLUS') {
    if (!channelForm.secret.trim()) {
      ElMessage.warning('PushPlus 需要填写 Token');
      return;
    }
    payload.secret = channelForm.secret.trim();
  } else if (channelForm.secret.trim()) {
    payload.secret = channelForm.secret.trim();
  } else if (dialogMode.value === 'edit') {
    payload.secret = '';
  }

  try {
    if (dialogMode.value === 'create') {
      await http.post('/admin/notifications/channels', payload);
      ElMessage.success('通知渠道已新增');
    } else {
      await http.patch(
        `/admin/notifications/channels/${channelForm.id}`,
        payload,
      );
      ElMessage.success('通知渠道已更新');
    }
    dialogVisible.value = false;
    await loadAll();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '保存通知渠道失败'));
  }
};

const removeChannel = async (channel: NotificationChannel) => {
  try {
    await ElMessageBox.confirm(
      `确定删除通知渠道「${channel.name}」吗？删除后相关事件将不再推送到该渠道。`,
      '删除通知渠道',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await http.delete(`/admin/notifications/channels/${channel.id}`);
    ElMessage.success('通知渠道已删除');
    await loadAll();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '删除通知渠道失败'));
  }
};

const testChannel = async (channel: NotificationChannel) => {
  testingChannelId.value = channel.id;
  try {
    const response = await http.post<{ success: boolean; message: string }>(
      `/admin/notifications/channels/${channel.id}/test`,
    );
    if (response.data.success) {
      ElMessage.success('测试消息已发送，请到对应渠道查看');
    } else {
      ElMessage.error(`测试发送失败：${response.data.message}`);
    }
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '测试发送失败'));
  } finally {
    testingChannelId.value = '';
  }
};

const saveRule = async (rule: NotificationRule) => {
  savingRuleEvent.value = rule.event;
  try {
    await http.patch(`/admin/notifications/rules/${rule.event}`, {
      enabled: rule.enabled,
      titleTemplate: rule.titleTemplate,
      bodyTemplate: rule.bodyTemplate,
      channelIds: rule.channelIds,
    });
    ElMessage.success(`「${rule.eventLabel}」规则已保存`);
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '保存通知规则失败'));
  } finally {
    savingRuleEvent.value = '';
  }
};

const setBodyRef = (event: string, element: unknown) => {
  if (element instanceof HTMLTextAreaElement) {
    bodyRefs.set(event, element);
  }
};

const bodyRefFactory = (event: string) => (element: unknown) =>
  setBodyRef(event, element);

/** 点击变量按钮，把 {{变量}} 插入到正文光标处。 */
const insertVariable = (rule: NotificationRule, key: string) => {
  const element = bodyRefs.get(rule.event);
  const token = `{{${key}}}`;
  if (!element) {
    rule.bodyTemplate = `${rule.bodyTemplate}${token}`;
    return;
  }
  const start = element.selectionStart ?? rule.bodyTemplate.length;
  const end = element.selectionEnd ?? start;
  rule.bodyTemplate = `${rule.bodyTemplate.slice(0, start)}${token}${rule.bodyTemplate.slice(end)}`;
  void Promise.resolve().then(() => {
    element.focus();
    const cursor = start + token.length;
    element.setSelectionRange(cursor, cursor);
  });
};

onMounted(loadAll);
</script>

<template>
  <div v-loading="loading" class="notification-settings-view">
    <header class="notification-settings-header">
      <div class="notification-settings-heading">
        <span class="notification-settings-icon">
          <el-icon><Bell /></el-icon>
        </span>
        <div>
          <h1>消息通知</h1>
          <p>
            监控下单人的报单与改单动作，站内通知实时提醒，也可推送到钉钉、企业微信、PushPlus
            等外部渠道；通知内容支持变量自定义。
          </p>
        </div>
      </div>
      <div class="notification-settings-summary">
        <span>
          <strong>{{ enabledRuleCount }}</strong>
          <small>开启事件</small>
        </span>
        <span>
          <strong>{{ activeChannelCount }}</strong>
          <small>可用渠道</small>
        </span>
      </div>
    </header>

    <section class="notification-block">
      <div class="notification-block-heading">
        <div>
          <h2>推送渠道</h2>
          <p>通知可以同时推送到多个渠道；不配置渠道时消息只进入后台右下角的通知中心。</p>
        </div>
        <el-button round type="primary" :icon="Plus" @click="openCreateDialog">
          新增渠道
        </el-button>
      </div>

      <div v-if="!channels.length" class="notification-empty-card">
        <strong>还没有配置推送渠道</strong>
        <span>先新增一个渠道，例如钉钉群机器人，再回到下面的事件规则里勾选它。</span>
      </div>

      <div v-else class="notification-channel-grid">
        <article
          v-for="channel in channels"
          :key="channel.id"
          class="notification-channel-card"
          :class="{ 'is-disabled': !channel.enabled }"
        >
          <div class="notification-channel-top">
            <span class="notification-channel-icon">
              <el-icon>
                <component :is="channelTypeIcon(channel.type)" />
              </el-icon>
            </span>
            <div class="notification-channel-name">
              <strong>{{ channel.name }}</strong>
              <small>{{ channelTypeLabel(channel.type) }}</small>
            </div>
            <el-tag
              size="small"
              round
              effect="plain"
              :type="channel.enabled ? 'success' : 'info'"
            >
              {{ channel.enabled ? '已启用' : '已停用' }}
            </el-tag>
          </div>
          <p class="notification-channel-endpoint">
            {{ channel.endpoint || '使用默认接口地址' }}
          </p>
          <p v-if="channel.secretConfigured" class="notification-channel-secret">
            密钥已配置
          </p>
          <div class="notification-channel-actions">
            <el-button
              size="small"
              round
              plain
              :loading="testingChannelId === channel.id"
              @click="testChannel(channel)"
            >
              发送测试
            </el-button>
            <el-button
              size="small"
              round
              plain
              :icon="EditPen"
              @click="openEditDialog(channel)"
            >
              编辑
            </el-button>
            <el-button
              size="small"
              round
              plain
              type="danger"
              :icon="Delete"
              @click="removeChannel(channel)"
            >
              删除
            </el-button>
          </div>
        </article>
      </div>
    </section>

    <section class="notification-block">
      <div class="notification-block-heading">
        <div>
          <h2>事件规则</h2>
          <p>
            每个事件独立开关与模板；标题和正文里写
            <code>{{ VARIABLE_HINT }}</code>
            即可自动替换成真实内容。
          </p>
        </div>
      </div>

      <div class="notification-rule-list">
        <article
          v-for="rule in rules"
          :key="rule.event"
          class="notification-rule-card"
          :class="{ 'is-disabled': !rule.enabled }"
        >
          <header class="notification-rule-header">
            <div>
              <h3>{{ rule.eventLabel }}</h3>
              <p>{{ eventDescriptions[rule.event] }}</p>
            </div>
            <el-switch
              v-model="rule.enabled"
              active-text="启用"
              inactive-text="停用"
            />
          </header>

          <div class="notification-rule-body">
            <el-form label-position="top" class="notification-rule-form">
              <el-form-item label="通知标题">
                <el-input
                  v-model="rule.titleTemplate"
                  placeholder="例如：新报单：{{submitter}} 提交了订单 {{orderNo}}"
                />
              </el-form-item>
              <el-form-item label="通知正文">
                <el-input
                  :ref="bodyRefFactory(rule.event)"
                  v-model="rule.bodyTemplate"
                  type="textarea"
                  :rows="5"
                  placeholder="支持多行内容"
                />
              </el-form-item>
            </el-form>

            <aside class="notification-rule-side">
              <div class="notification-variable-panel">
                <strong>可用变量</strong>
                <span>点击即可插入到正文光标处</span>
                <div
                  v-for="group in variableGroups"
                  :key="group.key"
                  class="notification-variable-group"
                >
                  <small>{{ group.label }}</small>
                  <div class="notification-variable-tags">
                    <button
                      v-for="variable in variables.filter(
                        (item) => item.group === group.key,
                      )"
                      :key="variable.key"
                      type="button"
                      class="notification-variable-tag"
                      :title="variable.description"
                      @click="insertVariable(rule, variable.key)"
                    >
                      {{ variable.label }}
                      <em>{{ variable.key }}</em>
                    </button>
                  </div>
                </div>
              </div>

              <div class="notification-rule-channels">
                <strong>推送到渠道</strong>
                <el-checkbox-group v-model="rule.channelIds">
                  <el-checkbox
                    v-for="channel in channels"
                    :key="channel.id"
                    :value="channel.id"
                    :disabled="!channel.enabled"
                  >
                    {{ channel.name }}
                  </el-checkbox>
                </el-checkbox-group>
                <small v-if="!channels.length">
                  还没有渠道，消息只会进入站内通知中心。
                </small>
              </div>

              <el-button
                round
                type="primary"
                :loading="savingRuleEvent === rule.event"
                @click="saveRule(rule)"
              >
                保存规则
              </el-button>
            </aside>
          </div>
        </article>
      </div>
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增通知渠道' : '编辑通知渠道'"
      width="520px"
      round
    >
      <el-form label-position="top">
        <el-form-item label="渠道名称">
          <el-input
            v-model="channelForm.name"
            placeholder="例如：运营群钉钉机器人"
          />
        </el-form-item>
        <el-form-item label="渠道类型">
          <el-select v-model="channelForm.type" class="is-full">
            <el-option
              v-for="option in channelTypeOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <small class="notification-form-hint">{{
            currentTypeOption.hint
          }}</small>
        </el-form-item>
        <el-form-item
          :label="
            channelForm.type === 'PUSHPLUS' ? 'PushPlus Token' : '推送地址'
          "
        >
          <el-input
            v-model="channelAddress"
            :placeholder="currentTypeOption.placeholder"
          />
        </el-form-item>
        <el-form-item
          v-if="channelForm.type !== 'PUSHPLUS'"
          label="加签密钥 / 附加密钥（可选）"
        >
          <el-input
            v-model="channelForm.secret"
            placeholder="钉钉加签密钥可留空；自定义渠道会作为 X-Notification-Key 发送"
          />
        </el-form-item>
        <el-form-item label="是否启用">
          <el-switch v-model="channelForm.enabled" active-text="启用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button round @click="dialogVisible = false">取消</el-button>
        <el-button round type="primary" @click="saveChannel">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.notification-settings-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px 20px 32px;
}

.notification-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  padding: 18px 20px;
  border-radius: var(--app-radius-card, 12px);
  border: 1px solid var(--app-border);
  background:
    linear-gradient(
      120deg,
      color-mix(in srgb, var(--app-primary) 10%, var(--app-surface-card)),
      var(--app-surface-card) 62%
    ),
    var(--app-surface-card);
}

.notification-settings-heading {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-width: 0;
}

.notification-settings-icon {
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #ffffff;
  background: var(--app-primary);
  box-shadow: 0 12px 24px -14px
    color-mix(in srgb, var(--app-primary) 75%, transparent);
}

.notification-settings-heading h1 {
  margin: 0 0 6px;
  font-size: 19px;
  color: var(--app-text-strong);
}

.notification-settings-heading p {
  margin: 0;
  max-width: 720px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--app-muted);
}

.notification-settings-summary {
  display: flex;
  gap: 10px;
}

.notification-settings-summary span {
  min-width: 92px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--app-border);
  background: var(--app-surface-card);
  text-align: center;
}

.notification-settings-summary strong {
  display: block;
  font-size: 20px;
  color: var(--app-primary);
}

.notification-settings-summary small {
  display: block;
  font-size: 11px;
  color: var(--app-muted);
}

.notification-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.notification-block-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.notification-block-heading h2 {
  margin: 0 0 4px;
  font-size: 16px;
  color: var(--app-text-strong);
}

.notification-block-heading p {
  margin: 0;
  font-size: 12.5px;
  color: var(--app-muted);
}

.notification-block-heading code {
  padding: 1px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--app-primary) 10%, transparent);
  color: var(--app-primary);
}

.notification-channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.notification-channel-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--app-radius-card, 12px);
  border: 1px solid var(--app-border);
  background: var(--app-surface-card);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.notification-channel-card:hover {
  border-color: color-mix(in srgb, var(--app-primary) 35%, var(--app-border));
  box-shadow: 0 16px 30px -22px rgba(15, 23, 42, 0.5);
}

.notification-channel-card.is-disabled {
  opacity: 0.68;
}

.notification-channel-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.notification-channel-icon {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary) 12%, transparent);
}

.notification-channel-name {
  flex: 1;
  min-width: 0;
}

.notification-channel-name strong {
  display: block;
  font-size: 14px;
  color: var(--app-text-strong);
}

.notification-channel-name small {
  display: block;
  font-size: 11.5px;
  color: var(--app-muted);
}

.notification-channel-endpoint {
  margin: 0;
  font-size: 12px;
  color: var(--app-muted);
  word-break: break-all;
}

.notification-channel-secret {
  margin: 0;
  font-size: 11.5px;
  color: #12a150;
}

.notification-channel-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
}

.notification-empty-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 26px;
  border-radius: var(--app-radius-card, 12px);
  border: 1px dashed var(--app-border);
  background: var(--app-surface-card);
  text-align: center;
}

.notification-empty-card strong {
  font-size: 14px;
  color: var(--app-text-strong);
}

.notification-empty-card span {
  font-size: 12.5px;
  color: var(--app-muted);
}

.notification-rule-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notification-rule-card {
  border-radius: var(--app-radius-card, 12px);
  border: 1px solid var(--app-border);
  background: var(--app-surface-card);
  overflow: hidden;
}

.notification-rule-card.is-disabled .notification-rule-body {
  opacity: 0.6;
}

.notification-rule-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-primary) 5%, var(--app-surface-card));
}

.notification-rule-header h3 {
  margin: 0 0 3px;
  font-size: 14.5px;
  color: var(--app-text-strong);
}

.notification-rule-header p {
  margin: 0;
  font-size: 12px;
  color: var(--app-muted);
}

.notification-rule-body {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.85fr);
  gap: 16px;
  padding: 16px;
}

.notification-rule-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.notification-rule-form :deep(.el-form-item__label) {
  padding-bottom: 4px;
  font-size: 12.5px;
  color: var(--app-muted);
}

.notification-rule-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-surface-card) 70%, transparent);
}

.notification-variable-panel strong,
.notification-rule-channels strong {
  display: block;
  font-size: 13px;
  color: var(--app-text-strong);
}

.notification-variable-panel > span {
  display: block;
  margin: 2px 0 10px;
  font-size: 11.5px;
  color: var(--app-muted);
}

.notification-variable-group {
  margin-bottom: 10px;
}

.notification-variable-group > small {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--app-muted);
}

.notification-variable-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.notification-variable-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--app-primary) 26%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary) 7%, transparent);
  color: var(--app-primary);
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.16s ease,
    transform 0.16s ease;
}

.notification-variable-tag:hover {
  background: color-mix(in srgb, var(--app-primary) 16%, transparent);
  transform: translateY(-1px);
}

.notification-variable-tag em {
  font-style: normal;
  font-size: 10.5px;
  opacity: 0.66;
}

.notification-rule-channels {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.notification-rule-channels :deep(.el-checkbox-group) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notification-rule-channels small {
  font-size: 11.5px;
  color: var(--app-muted);
}

.notification-form-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--app-muted);
}

@media (max-width: 1080px) {
  .notification-rule-body {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

