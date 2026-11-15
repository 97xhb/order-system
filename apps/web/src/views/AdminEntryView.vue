<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { http } from '../lib/http';
import { useAuthStore } from '../stores/auth';
import { useSystemStore } from '../stores/system';
import NotFoundView from './NotFoundView.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const system = useSystemStore();
const checking = ref(true);
const granted = ref(false);

onMounted(async () => {
  const entry = Array.isArray(route.params.adminEntry)
    ? route.params.adminEntry[0]
    : route.params.adminEntry;

  try {
    await http.post('/system/admin-entry', { entry });
    await system.loadPublicSettings(true);
    if (!system.accessAllowed) return;
    granted.value = true;
    const authenticated = await auth.loadCurrentUser(true);
    await router.replace(authenticated ? '/admin/dashboard' : '/login');
  } catch {
    granted.value = false;
  } finally {
    checking.value = false;
  }
});
</script>

<template>
  <main v-if="checking || granted" class="entry-check-page">
    <section>
      <span></span>
      <h1>正在验证访问地址</h1>
      <p>验证通过后将进入管理员登录页。</p>
    </section>
  </main>
  <NotFoundView v-else />
</template>

<style scoped>
.entry-check-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  color: var(--app-text-body);
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
  text-align: center;
}

.entry-check-page section {
  display: grid;
  justify-items: center;
}

.entry-check-page span {
  width: 36px;
  height: 36px;
  border: 3px solid color-mix(in srgb, var(--app-primary) 24%, transparent);
  border-top-color: var(--app-info-border);
  border-radius: 50%;
  animation: rotate 0.75s linear infinite;
}

.entry-check-page h1 {
  margin: 17px 0 5px;
  font-size: var(--app-text-xl);
}

.entry-check-page p {
  margin: 0;
  color: var(--app-text-subtle);
  font-size: var(--app-text-base);
}

@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}
</style>
