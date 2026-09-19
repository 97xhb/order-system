<script setup lang="ts">
import {
  DataAnalysis,
  Document,
  Expand,
  Fold,
  Link,
  MagicStick,
  Menu,
  Money,
  Moon,
  Setting,
  Sunny,
  Tools,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';
import { useAuthStore } from '../stores/auth';
import { useSystemStore } from '../stores/system';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const system = useSystemStore();
const collapsed = ref(false);
const mobileMenuVisible = ref(false);
const theme = ref<'light' | 'dark'>(
  localStorage.getItem('order-system:theme') === 'dark' ? 'dark' : 'light',
);
const passwordDialogVisible = ref(false);
const changingPassword = ref(false);
const MIN_ADMIN_PASSWORD_LENGTH = 6;
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const pageTitle = computed(() => String(route.meta.title ?? system.systemName));
const activeMenu = computed(() =>
  route.path.startsWith('/admin/settings')
    ? '/admin/settings'
    : route.path.startsWith('/admin/system-settings')
      ? '/admin/system-settings'
      : route.path,
);
const isDark = computed(() => theme.value === 'dark');
const navigationItems = [
  { path: '/admin/dashboard', label: '业务总览', icon: DataAnalysis },
  { path: '/admin/orders', label: '订单列表', icon: Document },
  { path: '/admin/affiliate-conversion', label: '返利转换', icon: MagicStick },
  { path: '/admin/schemes', label: '在线报单', icon: Link },
  { path: '/admin/submitters', label: '回款登记', icon: Money },
  { path: '/admin/settings', label: '基础设置', icon: Setting },
  { path: '/admin/system-settings', label: '系统设置', icon: Tools },
];

const applyTheme = (value: 'light' | 'dark') => {
  document.documentElement.classList.toggle('dark', value === 'dark');
  document.documentElement.dataset.theme = value;
  // VXE UI uses its own theme selector. Keep it in sync with the app theme
  // so table borders, backgrounds, scrollbars and text do not fall back to
  // the light palette while the rest of the application is dark.
  document.documentElement.setAttribute('data-vxe-ui-theme', value);
  localStorage.setItem('order-system:theme', value);
};

applyTheme(theme.value);
watch(theme, applyTheme);

const toggleTheme = () => {
  theme.value = isDark.value ? 'light' : 'dark';
};

const handleMenuSelect = (path: string) => {
  mobileMenuVisible.value = false;
  void router.push(path);
};

const handleAdminCommand = async (command: string) => {
  if (command === 'password') {
    Object.assign(passwordForm, {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    passwordDialogVisible.value = true;
    return;
  }

  if (command === 'logout') {
    await auth.logout();
    await router.replace('/login');
  }
};

const changePassword = async () => {
  if (passwordForm.newPassword.length < MIN_ADMIN_PASSWORD_LENGTH) {
    ElMessage.warning(`新密码至少需要 ${MIN_ADMIN_PASSWORD_LENGTH} 个字符`);
    return;
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致');
    return;
  }

  changingPassword.value = true;
  try {
    await http.patch('/auth/password', {
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
    passwordDialogVisible.value = false;
    ElMessage.success('密码已修改，其他设备的登录已退出');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '密码修改失败'));
  } finally {
    changingPassword.value = false;
  }
};
</script>

<template>
  <div class="admin-layout">
    <aside class="sidebar" :class="{ collapsed }">
      <div class="brand">
        <div class="brand-mark" :class="{ 'is-long': (system.brandMarkText || '浪姐').length > 2 }">
          {{ system.brandMarkText || '浪姐' }}
        </div>
        <div v-if="!collapsed" class="brand-copy">
          <strong>{{ system.systemName }}</strong>
          <span>ORDER WORKSPACE</span>
        </div>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="collapsed"
        :collapse-transition="false"
        background-color="transparent"
        text-color="#98a2b3"
        active-text-color="#ffffff"
        @select="handleMenuSelect"
      >
        <el-menu-item v-for="item in navigationItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>

      <button class="collapse-button" type="button" @click="collapsed = !collapsed">
        <el-icon><Expand v-if="collapsed" /><Fold v-else /></el-icon>
        <span v-if="!collapsed">收起菜单</span>
      </button>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="topbar-leading">
          <button
            class="icon-chip mobile-menu-button"
            type="button"
            aria-label="打开导航菜单"
            @click="mobileMenuVisible = true"
          >
            <el-icon><Menu /></el-icon>
          </button>
          <div class="topbar-title">
            <span class="topbar-eyebrow">工作台 <i>/</i> {{ pageTitle }}</span>
            <strong>{{ pageTitle }}</strong>
          </div>
        </div>
        <div class="topbar-actions">
          <el-tooltip :content="isDark ? '切换为亮色' : '切换为暗色'" placement="bottom">
            <button
              class="icon-chip"
              type="button"
              :aria-label="isDark ? '切换为亮色' : '切换为暗色'"
              @click="toggleTheme"
            >
              <el-icon><Sunny v-if="isDark" /><Moon v-else /></el-icon>
            </button>
          </el-tooltip>
          <el-dropdown trigger="click" @command="handleAdminCommand">
            <button class="admin-chip" type="button">
              <span class="admin-avatar">{{ (auth.user?.displayName ?? '管').slice(0, 1) }}</span>
              <span>{{ auth.user?.displayName ?? '管理员' }}</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="password">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <RouterView />
      </main>
    </section>

    <el-drawer
      v-model="mobileMenuVisible"
      direction="ltr"
      size="min(286px, 84vw)"
      :with-header="false"
      append-to-body
      class="mobile-nav-drawer"
    >
      <div class="mobile-drawer-shell">
        <div class="brand mobile-drawer-brand">
          <div
            class="brand-mark"
            :class="{ 'is-long': (system.brandMarkText || '浪姐').length > 2 }"
          >
            {{ system.brandMarkText || '浪姐' }}
          </div>
          <div class="brand-copy">
            <strong>{{ system.systemName }}</strong>
            <span>ORDER WORKSPACE</span>
          </div>
        </div>
        <el-menu
          :default-active="activeMenu"
          background-color="transparent"
          text-color="#98a2b3"
          active-text-color="#ffffff"
          @select="handleMenuSelect"
        >
          <el-menu-item v-for="item in navigationItems" :key="item.path" :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>{{ item.label }}</template>
          </el-menu-item>
        </el-menu>
      </div>
    </el-drawer>

    <el-dialog v-model="passwordDialogVisible" title="修改管理员密码" width="min(440px, 92vw)">
      <el-form :model="passwordForm" label-position="top">
        <el-form-item label="当前密码">
          <el-input
            v-model="passwordForm.currentPassword"
            type="password"
            minlength="6"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            minlength="6"
            show-password
            autocomplete="new-password"
            placeholder="至少 6 个字符"
          />
        </el-form-item>
        <el-form-item label="再次输入新密码">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            minlength="6"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="changingPassword" @click="changePassword"
          >保存新密码</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--app-background);
}

.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex: 0 0 218px;
  flex-direction: column;
  height: 100vh;
  padding: 14px 10px;
  overflow: hidden;
  border-right: 1px solid var(--app-border);
  color: var(--app-text);
  background: var(--app-sidebar);
  backdrop-filter: blur(22px) saturate(135%);
  transition: flex-basis 0.2s ease;
}

.sidebar.collapsed {
  flex-basis: 72px;
}

.brand {
  display: flex;
  align-items: center;
  min-height: 58px;
  padding: 0 8px 14px;
  gap: 11px;
}

.brand-mark {
  display: grid;
  width: 44px;
  min-width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.04em;
  background: linear-gradient(145deg, #60a5fa, #2563eb);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.22);
}

.brand-mark.is-long {
  font-size: 10px;
  letter-spacing: 0;
}

.sidebar.collapsed .brand {
  justify-content: center;
  padding-inline: 4px;
}

.brand-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.brand-copy strong {
  color: var(--app-heading);
  font-size: 16px;
  white-space: nowrap;
}

.brand-copy span {
  margin-top: 3px;
  color: var(--app-muted);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.sidebar :deep(.el-menu) {
  flex: 1;
  border-right: 0;
}

.sidebar :deep(.el-menu-item) {
  height: 43px;
  margin: 3px 0;
  border-radius: 12px;
  color: var(--app-muted) !important;
}

.sidebar :deep(.el-menu-item:hover) {
  color: var(--app-heading) !important;
  background: var(--app-hover);
}

.sidebar :deep(.el-menu-item.is-active) {
  color: var(--app-primary) !important;
  background: var(--app-primary-soft);
  font-weight: 600;
}

.collapse-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  border: 0;
  border-radius: 11px;
  color: var(--app-muted);
  background: var(--app-hover);
  cursor: pointer;
  font-size: 14px;
  gap: 8px;
}

.workspace {
  min-width: 0;
  flex: 1;
  background:
    radial-gradient(circle at 85% -10%, var(--app-glow), transparent 30%), var(--app-background);
}

.topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 22px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-topbar);
  backdrop-filter: blur(22px) saturate(140%);
}

.topbar-leading,
.topbar-title {
  display: flex;
  min-width: 0;
}
.topbar-leading {
  align-items: center;
  gap: 10px;
}
.topbar-title {
  flex-direction: column;
}

.topbar-eyebrow {
  color: var(--app-muted);
  font-size: 12px;
}
.topbar-eyebrow i {
  margin: 0 5px;
  font-style: normal;
  opacity: 0.45;
}

.topbar strong {
  margin-top: 2px;
  color: var(--app-heading);
  font-size: 16px;
}

.topbar-actions,
.admin-chip {
  display: flex;
  align-items: center;
}
.topbar-actions {
  gap: 8px;
}
.icon-chip,
.admin-chip {
  padding: 7px 11px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  color: var(--app-text);
  background: var(--app-control);
  cursor: pointer;
  font-size: 14px;
  box-shadow: var(--app-shadow-sm);
}
.icon-chip {
  display: grid;
  width: 38px;
  height: 38px;
  padding: 0;
  place-items: center;
}
.mobile-menu-button {
  display: none;
  flex: 0 0 38px;
}
.admin-chip {
  gap: 8px;
}
.admin-avatar {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 8px;
  color: #fff;
  background: #3b82f6;
  font-size: 12px;
  font-weight: 700;
}

.content {
  padding: 20px 22px 38px;
}

@media (max-width: 900px) {
  .sidebar,
  .sidebar.collapsed {
    flex-basis: 68px;
    padding-right: 8px;
    padding-left: 8px;
  }

  .sidebar .brand {
    justify-content: center;
    padding-right: 0;
    padding-left: 0;
  }

  .brand-copy,
  .collapse-button span {
    display: none;
  }

  .content {
    padding: 15px 13px 28px;
  }

  .topbar {
    height: 64px;
    padding: 0 14px;
  }
}

@media (max-width: 560px) {
  .sidebar,
  .sidebar.collapsed {
    display: none;
  }

  .mobile-menu-button {
    display: grid;
  }

  .topbar {
    height: 60px;
    padding: 0 10px;
  }

  .topbar-leading {
    gap: 8px;
  }

  .topbar-eyebrow {
    display: none;
  }

  .topbar strong {
    max-width: 36vw;
    margin-top: 0;
    overflow: hidden;
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .topbar-actions {
    gap: 6px;
  }

  .admin-chip {
    width: 38px;
    height: 38px;
    justify-content: center;
    padding: 0;
  }

  .admin-chip > span:last-child {
    display: none;
  }

  .content {
    padding: 12px 10px 24px;
  }
}

:global(.mobile-nav-drawer.el-drawer) {
  border-right: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-sidebar) 96%, var(--app-card-solid));
  box-shadow: 20px 0 54px rgba(15, 23, 42, 0.2);
  backdrop-filter: blur(24px) saturate(140%);
}

:global(.mobile-nav-drawer .el-drawer__body) {
  padding: 0;
}

.mobile-drawer-shell {
  display: flex;
  height: 100%;
  flex-direction: column;
  padding: 14px 10px;
}

.mobile-drawer-brand {
  padding-inline: 8px;
}

.mobile-drawer-shell :deep(.el-menu) {
  border-right: 0;
}

.mobile-drawer-shell :deep(.el-menu-item) {
  height: 46px;
  margin: 4px 0;
  border-radius: 13px;
  color: var(--app-muted) !important;
}

.mobile-drawer-shell :deep(.el-menu-item:hover) {
  color: var(--app-heading) !important;
  background: var(--app-hover);
}

.mobile-drawer-shell :deep(.el-menu-item.is-active) {
  color: var(--app-primary) !important;
  background: var(--app-primary-soft);
  font-weight: 600;
}
</style>
