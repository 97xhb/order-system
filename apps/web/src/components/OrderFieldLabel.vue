<script setup lang="ts">
import FieldHint from './FieldHint.vue';

defineProps<{
  label: string;
  hint?: string;
  color?: string;
}>();
</script>

<template>
  <div class="order-field-label">
    <span class="order-field-label-text">{{ label }}</span>
    <FieldHint :text="hint" :color="color" />
  </div>
</template>

<style scoped>
.order-field-label {
  display: flex;
  width: 100%;
  align-items: flex-start;
  flex-direction: column;
  line-height: 1.4;
}

.order-field-label-text {
  color: inherit;
  font: inherit;
}

.order-field-label :deep(.field-hint) {
  margin-top: 3px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.45;
}
</style>
