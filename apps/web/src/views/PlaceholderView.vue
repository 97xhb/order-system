<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const sectionTitle = computed(() => String(route.meta.sectionTitle ?? route.meta.title));
</script>

<template>
  <div class="page-shell">
    <div class="page-heading">
      <div>
        <h1>{{ sectionTitle }}</h1>
        <p>该模块已经纳入数据模型，将在后续步骤中接入。</p>
      </div>
    </div>
    <section class="surface-card placeholder-card">
      <el-empty description="模块开发中" />
    </section>
  </div>
</template>

<style scoped>
.placeholder-card {
  display: grid;
  min-height: 520px;
  place-items: center;
}
</style>
