<script setup lang="ts">
import { Lock, Refresh } from '@element-plus/icons-vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useSystemStore } from '../stores/system';

const system = useSystemStore();
const props = defineProps<{ accessReason?: string }>();
const checking = ref(false);
let refreshTimer: number | undefined;

const denialCopy = computed(() => {
  const accessReason = props.accessReason || system.accessReason;
  if (accessReason === 'HOST_NOT_ALLOWED') {
    return {
      title: '当前域名未加入白名单',
      description: '请在本机后台的系统设置中添加此域名并保存，页面会自动恢复访问。',
    };
  }
  if (accessReason === 'SYSTEM_SETTINGS_UNAVAILABLE') {
    return {
      title: '暂时无法连接系统服务',
      description: '页面会自动重试；也可以检查本机 API 服务是否正在运行。',
    };
  }
  return {
    title: '管理员后台仅允许本机访问',
    description: '管理员已关闭后台外网访问；公开报单、回款登记和订单查询链接不受此开关影响。',
  };
});

const refreshAccess = async () => {
  if (checking.value) return;
  checking.value = true;
  try {
    await system.loadPublicSettings(true);
  } finally {
    checking.value = false;
  }
};

onMounted(() => {
  refreshTimer = window.setInterval(() => void refreshAccess(), 5_000);
});

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<template>
  <main class="access-denied-page">
    <section class="access-denied-card">
      <div class="brand-mark" :class="{ 'is-long': (system.brandMarkText || '浪姐').length > 2 }">
        {{ system.brandMarkText || '浪姐' }}
      </div>
      <span class="lock-icon"
        ><el-icon><Lock /></el-icon
      ></span>
      <h1>{{ system.systemName }}</h1>
      <h2>{{ denialCopy.title }}</h2>
      <p>{{ denialCopy.description }}</p>
      <div class="access-address">
        <span>当前域名 / 地址</span>
        <strong>{{ system.requestHost || system.clientIp || '未知' }}</strong>
      </div>
      <el-button
        class="refresh-button"
        type="primary"
        round
        :icon="Refresh"
        :loading="checking"
        @click="refreshAccess"
      >
        重新检测访问权限
      </el-button>
      <small class="auto-refresh-note"
        >页面每 5 秒自动检测一次，管理员开启后台外网访问后会自动进入。</small
      >
    </section>
  </main>
</template>

<style scoped>
.access-denied-page {
  display: grid;
  min-height: 100vh;
  padding: 22px;
  place-items: center;
  background:
    radial-gradient(
      circle at 18% 12%,
      color-mix(in srgb, var(--app-primary) 14%, transparent),
      transparent 34%
    ),
    radial-gradient(
      circle at 82% 86%,
      color-mix(in srgb, var(--app-purple) 10%, transparent),
      transparent 38%
    ),
    linear-gradient(180deg, var(--app-surface-sunken) 0, var(--app-background) 420px);
}

.access-denied-card {
  display: grid;
  width: min(460px, 100%);
  padding: 30px;
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-card);
  color: var(--app-text-body);
  background: var(--app-card);
  box-shadow: var(--app-shadow-pop);
  text-align: center;
  backdrop-filter: blur(18px);
}

.brand-mark {
  display: grid;
  width: 54px;
  height: 54px;
  margin: 0 auto 22px;
  place-items: center;
  border-radius: var(--app-radius-card);
  color: var(--app-surface-card);
  background: var(--app-primary);
  box-shadow: 0 6px 16px -8px var(--app-primary);
  font-size: var(--app-text-base);
  font-weight: 800;
}

.brand-mark.is-long {
  font-size: var(--app-text-micro);
  letter-spacing: 0;
}

.lock-icon {
  display: grid;
  width: 58px;
  height: 58px;
  margin: 0 auto 16px;
  place-items: center;
  border: 1px solid var(--app-info-border);
  border-radius: var(--app-radius-card);
  color: var(--app-info);
  background: var(--app-info-soft);
}

.lock-icon :deep(svg) {
  width: 25px;
  height: 25px;
}

h1 {
  margin: 0;
  color: var(--app-text-strong);
  font-size: var(--app-text-xl);
}

h2 {
  margin: 18px 0 7px;
  color: var(--app-text-strong);
  font-size: var(--app-text-lg);
}

p {
  margin: 0;
  color: var(--app-text-subtle);
  font-size: var(--app-text-base);
  line-height: 1.75;
}

.access-address {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 22px;
  padding: 11px 13px;
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-card);
  color: var(--app-text-subtle);
  background: var(--app-surface-sunken);
  font-size: var(--app-text-sm);
}

.access-address strong {
  color: var(--app-text-strong);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.refresh-button {
  width: 100%;
  margin-top: 14px;
}

.auto-refresh-note {
  margin-top: 10px;
  color: var(--app-text-subtle);
  font-size: var(--app-text-xs);
}
</style>
