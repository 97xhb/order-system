<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const activeSection = computed(() => {
  if (route.path.endsWith('/affiliate-platforms')) return 'affiliate-platforms';
  if (route.path.endsWith('/profit-rules')) return 'profit-rules';
  if (route.path.endsWith('/order-query')) return 'order-query';
  return 'catalog';
});

const changeSection = (value: string | number) => {
  void router.push(`/admin/settings/${String(value)}`);
};
</script>

<template>
  <div class="page-shell settings-shell">
    <div class="page-heading">
      <div>
        <span class="page-kicker">SYSTEM SETTINGS</span>
        <h1>基础设置</h1>
        <p>集中维护返利接口参数、下单平台、品类、利润规则以及订单查询权限。</p>
      </div>
    </div>

    <section class="surface-card settings-navigation">
      <el-tabs :model-value="activeSection" stretch @tab-change="changeSection">
        <el-tab-pane label="返利平台配置" name="affiliate-platforms" />
        <el-tab-pane label="平台与品类配置" name="catalog" />
        <el-tab-pane label="利润规则配置" name="profit-rules" />
        <el-tab-pane label="订单查询配置" name="order-query" />
      </el-tabs>
    </section>

    <RouterView />
  </div>
</template>

<style scoped>
.settings-navigation {
  padding: 7px;
  border: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-control) 72%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 58%, transparent);
}

.settings-navigation :deep(.el-tabs__header) {
  margin: 0;
}

.settings-navigation :deep(.el-tabs__nav-wrap::before),
.settings-navigation :deep(.el-tabs__nav-wrap::after),
.settings-navigation :deep(.el-tabs__active-bar) {
  display: none;
}

.settings-navigation :deep(.el-tabs__nav) {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.settings-navigation :deep(.el-tabs__item) {
  height: 42px;
  padding: 0 14px !important;
  border: 1px solid transparent;
  border-radius: 12px;
  color: var(--app-muted);
  line-height: 40px;
  font-size: 15px;
  font-weight: 600;
  transition:
    color 160ms ease,
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.settings-navigation :deep(.el-tabs__item:hover) {
  color: var(--app-heading);
  background: color-mix(in srgb, var(--app-hover) 70%, transparent);
}

.settings-navigation :deep(.el-tabs__item.is-active) {
  border-color: color-mix(in srgb, var(--app-primary) 22%, var(--app-border));
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary-soft) 68%, var(--app-card-solid));
  box-shadow:
    0 4px 12px color-mix(in srgb, var(--app-primary) 10%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 72%, transparent);
}

.settings-navigation :deep(.el-tabs__item:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 54%, transparent);
  outline-offset: 1px;
}

.settings-navigation :deep(.el-tabs__content) {
  display: none;
}

@media (max-width: 650px) {
  .settings-navigation {
    padding-inline: 10px;
  }

  .settings-navigation :deep(.el-tabs__nav-scroll) {
    overflow-x: auto;
    scrollbar-width: none;
  }

  .settings-navigation :deep(.el-tabs__nav-scroll::-webkit-scrollbar) {
    display: none;
  }

  .settings-navigation :deep(.el-tabs__nav) {
    display: flex;
    width: max-content;
    min-width: 100%;
  }

  .settings-navigation :deep(.el-tabs__item) {
    min-width: 142px;
    flex: 0 0 auto;
    padding-inline: 8px;
    font-size: 14px;
  }
}
</style>
