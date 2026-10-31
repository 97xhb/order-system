<script setup lang="ts">
import type { TextColorPreset } from '../lib/text-colors';

withDefaults(
  defineProps<{
    presets: readonly TextColorPreset[];
    selected?: string | null;
    defaultLabel?: string;
  }>(),
  {
    selected: null,
    defaultLabel: '恢复默认',
  },
);

const emit = defineEmits<{
  select: [value: string | null];
}>();
</script>

<template>
  <div class="text-color-choice-grid">
    <button
      type="button"
      class="text-color-choice text-color-choice--default"
      :class="{ 'is-selected': !selected }"
      :title="defaultLabel"
      @click="emit('select', null)"
    >
      {{ defaultLabel }}
    </button>
    <button
      v-for="preset in presets"
      :key="preset.value"
      type="button"
      class="text-color-choice"
      :class="{ 'is-selected': selected === preset.value }"
      :style="{ '--choice-color': preset.value }"
      :title="preset.label"
      :aria-label="preset.label"
      @click="emit('select', preset.value)"
    >
      <span aria-hidden="true">✓</span>
    </button>
  </div>
</template>

<style scoped>
.text-color-choice-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 5px;
}
.text-color-choice {
  position: relative;
  display: grid;
  width: 100%;
  aspect-ratio: 1;
  min-height: 24px;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--choice-color) 74%, var(--app-border));
  border-radius: 7px;
  color: var(--app-muted);
  background: var(--choice-color);
  cursor: pointer;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--app-card-solid) 24%, transparent);
}
.text-color-choice > span {
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  opacity: 0;
  text-shadow: 0 1px 3px rgba(15, 23, 42, 0.46);
}
.text-color-choice:hover {
  transform: translateY(-1px);
}
.text-color-choice.is-selected {
  box-shadow:
    0 0 0 2px var(--app-card-solid),
    0 0 0 4px var(--app-primary);
}
.text-color-choice.is-selected > span {
  opacity: 1;
}
.text-color-choice--default {
  aspect-ratio: auto;
  min-height: 28px;
  grid-column: 1 / -1;
  border-color: var(--app-border);
  color: var(--app-text);
  background: var(--app-control);
  font-size: 11px;
  font-weight: 650;
}
</style>
