import { createRouter, createWebHistory } from 'vue-router';
import AdminLayout from '../layouts/AdminLayout.vue';
import { useAuthStore } from '../stores/auth';
import { pinia } from '../stores/pinia';
import { useSystemStore } from '../stores/system';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { title: '管理员登录' },
    },
    {
      path: '/',
      name: 'root-entry',
      component: () => import('../views/RootEntryView.vue'),
      meta: { title: '404', publicAccess: true },
    },
    {
      path: '/admin',
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: 'dashboard',
          component: () => import('../views/DashboardView.vue'),
          meta: { title: '业务总览' },
        },
        {
          path: 'orders',
          component: () => import('../views/OrdersView.vue'),
          meta: { title: '订单列表' },
        },
        {
          path: 'orders/new',
          component: () => import('../views/OrderCreateView.vue'),
          meta: { title: '后台手动录单' },
        },
        {
          path: 'affiliate-conversion',
          component: () => import('../views/AffiliateConversionView.vue'),
          meta: { title: '返利转换' },
        },
        {
          path: 'schemes',
          component: () => import('../views/SchemesView.vue'),
          meta: { title: '在线报单' },
        },
        {
          path: 'profit-rules',
          redirect: '/admin/settings/profit-rules',
        },
        {
          path: 'submitters',
          component: () => import('../views/SubmittersView.vue'),
          meta: { title: '回款登记' },
        },
        {
          path: 'settlements',
          redirect: '/admin/submitters',
        },
        {
          path: 'settings',
          component: () => import('../views/SettingsView.vue'),
          meta: { title: '基础设置' },
          children: [
            {
              path: '',
              redirect: '/admin/settings/affiliate-platforms',
            },
            {
              path: 'affiliate-platforms',
              component: () => import('../views/AffiliatePlatformsSettingsView.vue'),
              meta: { title: '返利平台配置' },
            },
            {
              path: 'catalog',
              component: () => import('../views/CatalogSettingsView.vue'),
              meta: { title: '平台与品类配置' },
            },
            {
              path: 'profit-rules',
              component: () => import('../views/ProfitRulesView.vue'),
              meta: { title: '利润规则配置' },
            },
            {
              path: 'order-query',
              component: () => import('../views/PayoutQuerySettingsView.vue'),
              meta: { title: '订单查询配置' },
            },
            {
              path: 'settlements',
              redirect: '/admin/submitters',
            },
          ],
        },
        {
          path: 'system-settings',
          component: () => import('../views/SystemSettingsView.vue'),
          meta: { title: '系统设置' },
        },
        {
          path: 'api-directory',
          component: () => import('../views/ApiDirectoryView.vue'),
          meta: { title: 'API 接口目录' },
        },
      ],
    },
    {
      path: '/form/:token',
      component: () => import('../views/PublicOrderFormView.vue'),
      meta: { title: '填写下单信息', publicAccess: true },
    },
    {
      path: '/payout/:token',
      component: () => import('../views/PublicPayoutRegistrationView.vue'),
      meta: { title: '填写回款资料', publicAccess: true },
    },
    {
      path: '/order-query/:token',
      component: () => import('../views/PublicPayoutLookupView.vue'),
      meta: { title: '查询回款与订单', publicAccess: true },
    },
    {
      path: '/:adminEntry',
      name: 'admin-security-entry',
      component: () => import('../views/AdminEntryView.vue'),
      meta: { title: '访问验证', publicAccess: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
      meta: { title: '404', publicAccess: true },
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia);
  const system = useSystemStore(pinia);

  if (to.meta.requiresAuth) {
    if (!system.accessAllowed) return true;
    try {
      if (!(await auth.loadCurrentUser())) {
        return { name: 'login', query: { redirect: to.fullPath } };
      }
    } catch {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
  }

  if (to.name === 'login' && auth.user) {
    return '/admin/dashboard';
  }

  return true;
});

router.afterEach((to) => {
  const system = useSystemStore(pinia);
  const title = typeof to.meta.title === 'string' ? to.meta.title : system.systemName;
  document.title = `${title} - ${system.systemName}`;
});

export default router;
