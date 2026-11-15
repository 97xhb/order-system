<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AccessDeniedView from './views/AccessDeniedView.vue';
import NotFoundView from './views/NotFoundView.vue';
import { useSystemStore } from './stores/system';

const system = useSystemStore();
const route = useRoute();

const isPublicLink = computed(() => Boolean(route.meta.publicAccess));
const routeAccessAllowed = computed(() =>
  isPublicLink.value ? system.publicAccessAllowed : system.accessAllowed,
);
const hideRestrictedAdminRoute = computed(
  () => !isPublicLink.value && !routeAccessAllowed.value && !system.localRequest,
);
</script>

<template>
  <div v-if="!system.initialized" class="app-boot">正在连接系统…</div>
  <NotFoundView v-else-if="hideRestrictedAdminRoute" />
  <AccessDeniedView
    v-else-if="!routeAccessAllowed"
    :access-reason="isPublicLink ? system.publicAccessReason : system.accessReason"
  />
  <RouterView v-else />
</template>

<style scoped>
.app-boot {
  display: grid;
  min-height: 100vh;
  place-items: center;
  color: var(--app-text-subtle);
  background: var(--app-surface-page);
  font-size: var(--app-text-base);
}
</style>
