<script setup lang="ts">
import {
  Bell,
  Check,
  Close,
  Delete,
  FullScreen,
  Minus,
} from '@element-plus/icons-vue';
import { ElMessage, ElNotification } from 'element-plus';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';

interface NotificationMessage {
  id: string;
  event: string;
  eventLabel: string;
  title: string;
  content: string;
  read: boolean;
  createdAt: string;
}

const visible = ref(false);
const expanded = ref(false);
const loading = ref(false);
const messages = ref<NotificationMessage[]>([]);
const unreadCount = ref(0);
let pollTimer: number | undefined;
let lastUnreadCount = 0;

const hasUnread = computed(() => unreadCount.value > 0);

const eventTone = (event: string) => {
  if (event === 'ORDER_SUBMITTED') return 'is-blue';
  if (event === 'ORDER_BATCH_SUBMITTED') return 'is-violet';
  if (event === 'ORDER_UPDATED_BY_SUBMITTER') return 'is-amber';
  return 'is-gray';
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

const loadMessages = async (silent = false) => {
  if (!silent) loading.value = true;
  try {
    const [listResponse, countResponse] = await Promise.all([
      http.get<NotificationMessage[]>('/admin/notifications/messages', {
        params: { limit: 50 },
      }),
      http.get<number>('/admin/notifications/messages/unread-count'),
    ]);
    messages.value = listResponse.data;
    const nextUnread = Number(countResponse.data) || 0;
    if (nextUnread > lastUnreadCount && lastUnreadCount > 0) {
      const latest = listResponse.data[0];
      if (latest) {
        ElNotification({
          title: latest.title,
          message: latest.content.split('\n')[0] ?? '',
          type: 'info',
          duration: 6000,
          position: 'bottom-right',
        });
      }
    }
    lastUnreadCount = nextUnread;
    unreadCount.value = nextUnread;
  } catch (error) {
    if (!silent) {
      ElMessage.error(getApiErrorMessage(error, '通知加载失败'));
    }
  } finally {
    loading.value = false;
  }
};

const togglePanel = async () => {
  visible.value = !visible.value;
  if (visible.value) {
    await loadMessages();
  }
};

const markRead = async (message: NotificationMessage) => {
  if (message.read) return;
  try {
    await http.post(`/admin/notifications/messages/${message.id}/read`);
    message.read = true;
    unreadCount.value = Math.max(0, unreadCount.value - 1);
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '标记已读失败'));
  }
};

const markAllRead = async () => {
  try {
    await http.post('/admin/notifications/messages/read-all');
    messages.value = messages.value.map((item) => ({ ...item, read: true }));
    unreadCount.value = 0;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '全部已读操作失败'));
  }
};

const removeMessage = async (message: NotificationMessage) => {
  try {
    await http.delete(`/admin/notifications/messages/${message.id}`);
    messages.value = messages.value.filter((item) => item.id !== message.id);
    if (!message.read) unreadCount.value = Math.max(0, unreadCount.value - 1);
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '删除消息失败'));
  }
};

const clearMessages = async () => {
  try {
    await http.delete('/admin/notifications/messages');
    messages.value = [];
    unreadCount.value = 0;
    ElMessage.success('通知已清空');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '清空通知失败'));
  }
};

onMounted(async () => {
  await loadMessages(true);
  pollTimer = window.setInterval(() => {
    void loadMessages(true);
  }, 15_000);
});

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>

<template>
  <div class="notification-center">
    <transition name="notification-fade">
      <section
        v-show="visible"
        class="notification-panel"
        :class="{ 'is-expanded': expanded }"
        aria-label="通知中心"
      >
        <header class="notification-panel-header">
          <div class="notification-panel-title">
            <span class="notification-panel-icon">
              <el-icon><Bell /></el-icon>
            </span>
            <div>
              <strong>通知中心</strong>
              <small>
                {{ hasUnread ? `${unreadCount} 条未读` : '全部已读' }}
              </small>
            </div>
          </div>
          <div class="notification-panel-actions">
            <el-tooltip content="全部标记已读" placement="top">
              <button
                type="button"
                class="notification-icon-button"
                :disabled="!hasUnread"
                aria-label="全部标记已读"
                @click="markAllRead"
              >
                <el-icon><Check /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip :content="expanded ? '还原窗口' : '放大窗口'" placement="top">
              <button
                type="button"
                class="notification-icon-button"
                aria-label="放大或还原"
                @click="expanded = !expanded"
              >
                <el-icon>
                  <Minus v-if="expanded" />
                  <FullScreen v-else />
                </el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="清空通知" placement="top">
              <button
                type="button"
                class="notification-icon-button"
                aria-label="清空通知"
                @click="clearMessages"
              >
                <el-icon><Delete /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="收起" placement="top">
              <button
                type="button"
                class="notification-icon-button"
                aria-label="收起通知"
                @click="visible = false"
              >
                <el-icon><Close /></el-icon>
              </button>
            </el-tooltip>
          </div>
        </header>

        <div v-loading="loading" class="notification-list">
          <p v-if="!messages.length" class="notification-empty">
            暂时没有新的通知
          </p>
          <article
            v-for="message in messages"
            :key="message.id"
            class="notification-item"
            :class="{ 'is-unread': !message.read }"
            @click="markRead(message)"
          >
            <div class="notification-item-heading">
              <span
                class="notification-event-tag"
                :class="eventTone(message.event)"
              >
                {{ message.eventLabel }}
              </span>
              <span class="notification-item-time">
                {{ formatTime(message.createdAt) }}
              </span>
            </div>
            <strong class="notification-item-title">{{ message.title }}</strong>
            <p class="notification-item-content">{{ message.content }}</p>
            <button
              type="button"
              class="notification-item-remove"
              aria-label="删除该通知"
              @click.stop="removeMessage(message)"
            >
              <el-icon><Delete /></el-icon>
            </button>
          </article>
        </div>
      </section>
    </transition>

    <button
      type="button"
      class="notification-trigger"
      :class="{ 'has-unread': hasUnread, 'is-active': visible }"
      aria-label="打开通知中心"
      @click="togglePanel"
    >
      <el-icon><Bell /></el-icon>
      <span v-if="hasUnread" class="notification-badge">
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.notification-center {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 2200;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.notification-trigger {
  position: relative;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  border: 1px solid var(--app-border);
  background: var(--app-surface-card);
  color: var(--app-primary);
  font-size: 20px;
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: 0 10px 24px -14px rgba(15, 23, 42, 0.45);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

.notification-trigger:hover,
.notification-trigger.is-active {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--app-primary) 45%, var(--app-border));
  box-shadow: 0 14px 28px -14px rgba(15, 23, 42, 0.55);
}

.notification-trigger.has-unread {
  color: #ffffff;
  background: var(--app-primary);
  border-color: transparent;
}

.notification-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: 10px;
  background: #f04438;
  color: #ffffff;
  font-size: 11px;
  line-height: 19px;
  text-align: center;
  font-weight: 700;
  box-shadow: 0 0 0 2px var(--app-surface-card);
}

.notification-panel {
  width: 372px;
  max-height: 560px;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1px solid var(--app-border);
  background: var(--app-surface-card);
  box-shadow: 0 26px 60px -30px rgba(15, 23, 42, 0.55);
  overflow: hidden;
  transition:
    width 0.2s ease,
    max-height 0.2s ease;
}

.notification-panel.is-expanded {
  width: min(760px, calc(100vw - 48px));
  max-height: min(680px, calc(100vh - 120px));
}

.notification-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--app-border);
  background: linear-gradient(
    120deg,
    color-mix(in srgb, var(--app-primary) 12%, var(--app-surface-card)),
    var(--app-surface-card)
  );
}

.notification-panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.notification-panel-title strong {
  display: block;
  font-size: 15px;
  color: var(--app-text-strong);
}

.notification-panel-title small {
  display: block;
  font-size: 12px;
  color: var(--app-muted);
}

.notification-panel-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: #ffffff;
  background: var(--app-primary);
  box-shadow: 0 8px 18px -10px color-mix(in srgb, var(--app-primary) 70%, transparent);
}

.notification-panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.notification-icon-button {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--app-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition:
    background 0.16s ease,
    color 0.16s ease;
}

.notification-icon-button:hover:not(:disabled) {
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary) 10%, transparent);
}

.notification-icon-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.notification-list {
  flex: 1;
  min-height: 160px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-empty {
  margin: 0;
  padding: 36px 12px;
  text-align: center;
  color: var(--app-muted);
  font-size: 13px;
}

.notification-item {
  position: relative;
  padding: 12px 34px 12px 12px;
  border-radius: 12px;
  border: 1px solid var(--app-border);
  background: var(--app-surface-card);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.notification-item:hover {
  border-color: color-mix(in srgb, var(--app-primary) 38%, var(--app-border));
  box-shadow: 0 10px 22px -16px rgba(15, 23, 42, 0.5);
}

.notification-item.is-unread {
  background: color-mix(in srgb, var(--app-primary) 5%, var(--app-surface-card));
  border-color: color-mix(in srgb, var(--app-primary) 22%, var(--app-border));
}

.notification-item-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.notification-event-tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: #ffffff;
  background: #64748b;
}

.notification-event-tag.is-blue {
  background: #2f6fed;
}

.notification-event-tag.is-violet {
  background: #7c5cff;
}

.notification-event-tag.is-amber {
  background: #d97706;
}

.notification-item-time {
  font-size: 11px;
  color: var(--app-muted);
}

.notification-item-title {
  display: block;
  font-size: 13.5px;
  color: var(--app-text-strong);
  margin-bottom: 4px;
}

.notification-item-content {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--app-muted);
  white-space: pre-wrap;
  word-break: break-word;
}

.notification-item-remove {
  position: absolute;
  top: 10px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--app-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.16s ease,
    color 0.16s ease;
}

.notification-item:hover .notification-item-remove {
  opacity: 1;
}

.notification-item-remove:hover {
  color: #f04438;
}

.notification-fade-enter-active,
.notification-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.notification-fade-enter-from,
.notification-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

@media (max-width: 640px) {
  .notification-center {
    right: 12px;
    bottom: 12px;
  }

  .notification-panel {
    width: calc(100vw - 24px);
  }
}
</style>

