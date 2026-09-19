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
    radial-gradient(circle at 18% 12%, rgba(59, 130, 246, 0.16), transparent 34%),
    linear-gradient(145deg, #0f172a, #172554 48%, #111827);
}

.not-found-card {
  display: grid;
  width: min(440px, 100%);
  padding: 34px 28px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 24px;
  color: #e5e7eb;
  background: rgba(15, 23, 42, 0.86);
  box-shadow: 0 28px 75px rgba(2, 6, 23, 0.48);
  text-align: center;
  backdrop-filter: blur(22px);
}

.error-code {
  color: #60a5fa;
  font-size: clamp(58px, 15vw, 92px);
  font-weight: 800;
  letter-spacing: -0.07em;
  line-height: 0.95;
}

h1 {
  margin: 20px 0 8px;
  color: #f8fafc;
  font-size: 22px;
}

p {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
  line-height: 1.75;
}
</style>
