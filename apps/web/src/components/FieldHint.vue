<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  text?: string;
  color?: string;
}>();

const normalizedText = computed(() => props.text?.trim() ?? '');
</script>

<template>
  <div v-if="normalizedText" class="field-hint" :style="{ color: color || 'var(--app-muted)' }">
    {{ normalizedText }}
  </div>
</template>

<style scoped>
.field-hint {
  width: 100%;
  margin-top: 6px;
  font-size: 11px;
  font-weight: 550;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
</style>
