<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    value?: string | null;
  }>(),
  {
    value: '',
  },
);

const lines = computed(() => {
  const raw = (props.value ?? '').replace(/\r\n?/g, '\n').trim();
  if (!raw) return [{ trackingNo: '-', phoneSuffix: '' }];
  return raw.split('\n').map((line) => {
    const normalized = line.trim();
    const matched = /^(.*\S)-(\d{4})$/.exec(normalized);
    return matched
      ? { trackingNo: matched[1]?.trim() || '-', phoneSuffix: matched[2] ?? '' }
      : { trackingNo: normalized || '-', phoneSuffix: '' };
  });
});
</script>

<template>
  <span class="tracking-text-lines">
    <span
      v-for="(line, index) in lines"
      :key="`${index}:${line.trackingNo}`"
      class="tracking-text-line"
    >
      <span class="tracking-text-number" :title="line.trackingNo">
        {{ line.trackingNo }}
      </span>
      <small v-if="line.phoneSuffix" class="tracking-phone-suffix">
        尾号 {{ line.phoneSuffix }}
      </small>
    </span>
  </span>
</template>

<style scoped>
.tracking-text-lines {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.tracking-text-line {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 5px;
}

.tracking-text-number {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tracking-phone-suffix {
  flex: 0 0 auto;
  padding: 0 5px;
  border-radius: 6px;
  color: var(--app-muted);
  background: color-mix(in srgb, var(--app-primary) 10%, transparent);
  font-size: 11px;
  font-weight: 600;
  line-height: 17px;
}
</style>
