<template>
  <main class="not-found-page">
    <section class="not-found-card">
      <div class="error-code">404</div>
      <h1>页面不存在</h1>
      <p>当前地址无效、已失效或没有可访问的内容。</p>
    </section>
  </main>
</template>

<style scoped>
.not-found-page {
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

.not-found-card {
  display: grid;
  width: min(440px, 100%);
  padding: 34px 28px;
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-card);
  color: var(--app-text-body);
  background: var(--app-card);
  box-shadow: var(--app-shadow-pop);
  text-align: center;
  backdrop-filter: blur(18px);
}

.error-code {
  color: var(--app-primary);
  font-size: var(--app-text-display);
  font-weight: 800;
  letter-spacing: 0;
  line-height: 0.95;
}

h1 {
  margin: 20px 0 8px;
  color: var(--app-text-strong);
  font-size: var(--app-text-xl);
}

p {
  margin: 0;
  color: var(--app-text-subtle);
  font-size: var(--app-text-base);
  line-height: 1.75;
}
</style>
