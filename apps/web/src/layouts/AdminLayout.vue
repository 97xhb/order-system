<script setup lang="ts">
import {
  Bell,
  DataAnalysis,
  Document,
  Expand,
  Fold,
  Link,
  MagicStick,
  Menu,
  Money,
  Setting,
  Tools,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getApiErrorMessage } from '../lib/api-error';
import { APP_BUILD_TIME, APP_VERSION } from '../lib/app-version';
import { http } from '../lib/http';
import AdminNotificationCenter from '../components/AdminNotificationCenter.vue';
import { useAuthStore } from '../stores/auth';
import { useSystemStore } from '../stores/system';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const system = useSystemStore();
const collapsed = ref(false);
const mobileMenuVisible = ref(false);
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
const buildDate = APP_BUILD_TIME.slice(0, 10);
const navigationItems = [
  { path: '/admin/dashboard', label: '业务总览', icon: DataAnalysis },
  { path: '/admin/orders', label: '订单列表', icon: Document },
  { path: '/admin/affiliate-conversion', label: '返利转换', icon: MagicStick },
  { path: '/admin/schemes', label: '在线报单', icon: Link },
  { path: '/admin/submitters', label: '回款登记', icon: Money },
  { path: '/admin/settings', label: '基础设置', icon: Setting },
  { path: '/admin/system-settings', label: '系统设置', icon: Tools },
  { path: '/admin/notifications', label: '消息通知', icon: Bell },
];

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
        text-color="var(--app-text-placeholder)"
        active-text-color="var(--app-surface-card)"
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
          <span class="version-chip" :title="`构建时间 ${APP_BUILD_TIME}`">
            v{{ APP_VERSION }} <small>{{ buildDate }}</small>
          </span>
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
          text-color="var(--app-text-placeholder)"
          active-text-color="var(--app-surface-card)"
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

    <AdminNotificationCenter />
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
  flex: 0 0 212px;
  flex-direction: column;
  height: 100vh;
  padding: 12px 10px;
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
  min-height: 50px;
  padding: 0 6px 12px;
  gap: 10px;
}

.brand-mark {
  display: grid;
  width: 34px;
  min-width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: var(--app-radius-control);
  color: var(--app-surface-card);
  font-size: var(--app-text-micro);
  font-weight: 800;
  letter-spacing: 0.02em;
  background: var(--app-primary);
  box-shadow:
    0 8px 18px -8px color-mix(in srgb, var(--app-primary) 46%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--app-surface-card) 26%, transparent);
}

.brand-mark.is-long {
  font-size: var(--app-text-micro);
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
  font-size: var(--app-text-base);
  font-weight: 600;
  white-space: nowrap;
}

.brand-copy span {
  margin-top: 3px;
  color: var(--app-muted);
  font-size: var(--app-text-micro);
  letter-spacing: 0.14em;
}

.sidebar :deep(.el-menu) {
  flex: 1;
  border-right: 0;
}

.sidebar :deep(.el-menu-item) {
  height: 36px;
  margin: 2px 0;
  border-radius: var(--app-radius-control);
  font-size: var(--app-text-sm);
  color: var(--app-muted) !important;
}

.sidebar :deep(.el-menu-item:hover) {
  color: var(--app-heading) !important;
  background: var(--app-hover);
}

.sidebar :deep(.el-menu-item.is-active) {
  color: var(--app-primary) !important;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--app-primary) 13%, transparent),
    color-mix(in srgb, var(--app-primary) 3%, transparent)
  );
  box-shadow: inset 2px 0 0 var(--app-primary);
  font-weight: 600;
}

.collapse-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  border: 0;
  border-radius: var(--app-radius-control);
  color: var(--app-muted);
  background: var(--app-hover);
  cursor: pointer;
  font-size: var(--app-text-xs);
  gap: 8px;
}

.workspace {
  min-width: 0;
  flex: 1;
  background:
    radial-gradient(900px 420px at 88% -12%, var(--app-glow), transparent 62%),
    radial-gradient(
      760px 380px at 12% -8%,
      color-mix(in srgb, var(--app-primary) 9%, transparent),
      transparent 60%
    ),
    linear-gradient(180deg, var(--app-surface-sunken) 0, var(--app-background) 240px);
}

.topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 20px;
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
  font-size: var(--app-text-xs);
}
.topbar-eyebrow i {
  margin: 0 5px;
  font-style: normal;
  opacity: 0.45;
}

.topbar strong {
  margin-top: 2px;
  color: var(--app-heading);
  font-size: var(--app-text-base);
}

.topbar-actions,
.admin-chip {
  display: flex;
  align-items: center;
}
.topbar-actions {
  gap: 8px;
}
.version-chip {
  display: flex;
  min-height: 34px;
  flex-direction: column;
  justify-content: center;
  padding: 5px 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-control);
  color: var(--app-heading);
  background: var(--app-control);
  box-shadow: var(--app-shadow-sm);
  font-size: var(--app-text-xs);
  font-weight: 700;
  line-height: 1.15;
  white-space: nowrap;
}
.version-chip small {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: var(--app-text-micro);
  font-weight: 500;
}
.icon-chip,
.admin-chip {
  padding: 6px 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-control);
  color: var(--app-text);
  background: var(--app-control);
  cursor: pointer;
  font-size: var(--app-text-base);
  box-shadow: var(--app-shadow-sm);
}
.icon-chip {
  display: grid;
  width: 34px;
  height: 34px;
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
  border-radius: var(--app-radius-control);
  color: var(--app-surface-card);
  background: var(--app-primary);
  font-size: var(--app-text-xs);
  font-weight: 700;
}

.content {
  padding: 16px 20px 32px;
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
    font-size: var(--app-text-base);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .topbar-actions {
    gap: 6px;
  }

  .version-chip {
    min-height: 38px;
    padding-inline: 8px;
  }

  .version-chip small {
    display: none;
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
  box-shadow: var(--app-shadow-pop);
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
  border-radius: var(--app-radius-card);
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
