<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSystemStore } from '../stores/system';
import NotFoundView from './NotFoundView.vue';

const router = useRouter();
const system = useSystemStore();
const redirecting = ref(false);

onMounted(async () => {
  if (system.localRequest) {
    await router.replace('/admin/dashboard');
    return;
  }

  if (system.rootAccessMode === 'REDIRECT' && system.rootRedirectUrl) {
    redirecting.value = true;
    window.location.replace(system.rootRedirectUrl);
  }
});
</script>

<template>
  <main v-if="redirecting" class="root-redirect-page">
    <section>
      <span></span>
      <h1>正在跳转</h1>
      <p>即将前往配置的页面…</p>
    </section>
  </main>
  <NotFoundView v-else />
</template>

<style scoped>
.root-redirect-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  color: var(--app-text-body);
  background:
    radial-gradient(
      circle at 20% 12%,
      color-mix(in srgb, var(--app-primary) 14%, transparent),
      transparent 36%
    ),
    linear-gradient(180deg, var(--app-surface-sunken) 0, var(--app-background) 420px);
  text-align: center;
}

.root-redirect-page section {
  display: grid;
  justify-items: center;
}

.root-redirect-page span {
  width: 34px;
  height: 34px;
  border: 3px solid color-mix(in srgb, var(--app-primary) 24%, transparent);
  border-top-color: var(--app-info-border);
  border-radius: 50%;
  animation: rotate 0.75s linear infinite;
}

.root-redirect-page h1 {
  margin: 16px 0 4px;
  font-size: var(--app-text-xl);
}

.root-redirect-page p {
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
