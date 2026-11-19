<script setup lang="ts">
import FieldHint from './FieldHint.vue';

defineProps<{
  label: string;
  hint?: string;
  color?: string;
  required?: boolean;
}>();
</script>

<template>
  <div class="order-field-label">
    <span class="order-field-label-row">
      <span v-if="required" class="order-field-required">必填</span>
      <span class="order-field-label-text">{{ label }}</span>
    </span>
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

.order-field-label-row {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 6px;
}

.order-field-label-text {
  color: inherit;
  font: inherit;
}

.order-field-required {
  flex: none;
  padding: 0 6px;
  border: 1px solid var(--app-danger-border);
  border-radius: var(--app-radius-chip);
  background: var(--app-danger-soft);
  color: var(--app-danger);
  font-size: var(--app-text-micro);
  font-weight: 600;
  line-height: 15px;
  letter-spacing: 0;
  white-space: nowrap;
}

.order-field-label :deep(.field-hint) {
  margin-top: 3px;
  font-size: var(--app-text-micro);
  font-weight: 500;
  line-height: 1.45;
}
</style>
