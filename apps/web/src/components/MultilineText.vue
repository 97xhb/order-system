<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    text?: string | number | null;
    placeholder?: string;
    tag?: string;
  }>(),
  {
    text: '',
    placeholder: '-',
    tag: 'div',
  },
);

const lines = computed(() => {
  const raw = String(props.text ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  return raw ? raw.split('\n') : [props.placeholder];
});
</script>

<template>
  <component :is="tag" class="multiline-text">
    <span
      v-for="(line, index) in lines"
      :key="`${index}:${line}`"
      class="multiline-text-line"
      :title="line"
    >
      {{ line || '\u00a0' }}
    </span>
  </component>
</template>

<style scoped>
.multiline-text {
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  flex-direction: column;
  gap: 1px;
}

.multiline-text-line {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
