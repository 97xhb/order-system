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
  color: #e2e8f0;
  background: #0f172a;
  text-align: center;
}

.root-redirect-page section {
  display: grid;
  justify-items: center;
}

.root-redirect-page span {
  width: 34px;
  height: 34px;
  border: 3px solid rgba(96, 165, 250, 0.24);
  border-top-color: #60a5fa;
  border-radius: 50%;
  animation: rotate 0.75s linear infinite;
}

.root-redirect-page h1 {
  margin: 16px 0 4px;
  font-size: 20px;
}

.root-redirect-page p {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
}

@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}
</style>
