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
    radial-gradient(circle at 18% 12%, rgba(59, 130, 246, 0.2), transparent 34%),
    linear-gradient(145deg, #0f172a, #172554 48%, #111827);
}

.access-denied-card {
  display: grid;
  width: min(460px, 100%);
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 24px;
  color: #e5e7eb;
  background: rgba(15, 23, 42, 0.86);
  box-shadow: 0 28px 75px rgba(2, 6, 23, 0.48);
  text-align: center;
  backdrop-filter: blur(22px);
}

.brand-mark {
  display: grid;
  width: 54px;
  height: 54px;
  margin: 0 auto 22px;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(145deg, #409eff, #155eef);
  font-size: 15px;
  font-weight: 800;
}

.brand-mark.is-long {
  font-size: 11px;
  letter-spacing: 0;
}

.lock-icon {
  display: grid;
  width: 58px;
  height: 58px;
  margin: 0 auto 16px;
  place-items: center;
  border: 1px solid rgba(96, 165, 250, 0.28);
  border-radius: 18px;
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.12);
}

.lock-icon :deep(svg) {
  width: 25px;
  height: 25px;
}

h1 {
  margin: 0;
  color: #fff;
  font-size: 22px;
}

h2 {
  margin: 18px 0 7px;
  color: #f8fafc;
  font-size: 18px;
}

p {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
  line-height: 1.75;
}

.access-address {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 22px;
  padding: 11px 13px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 13px;
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.72);
  font-size: 13px;
}

.access-address strong {
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.refresh-button {
  width: 100%;
  margin-top: 14px;
}

.auto-refresh-note {
  margin-top: 10px;
  color: #64748b;
  font-size: 12px;
}
</style>
