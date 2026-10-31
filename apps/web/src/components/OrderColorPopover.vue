<script setup lang="ts">
import { ref } from 'vue';
import type { TextColorPreset } from '../lib/text-colors';
import TextColorPalette from './TextColorPalette.vue';

const props = defineProps<{
  color: string | null;
  presets: readonly TextColorPreset[];
  save: (color: string | null) => Promise<boolean>;
}>();

const visible = ref(false);
const draft = ref('');
const saving = ref(false);

const syncDraft = () => {
  draft.value = props.color ?? '';
};

const close = () => {
  if (saving.value) return;
  visible.value = false;
  draft.value = '';
};

const confirm = async () => {
  if (saving.value) return;
  saving.value = true;
  try {
    if (await props.save(draft.value || null)) {
      visible.value = false;
      draft.value = '';
    }
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <el-popover
    v-model:visible="visible"
    placement="right-start"
    :width="300"
    trigger="click"
    @show="syncDraft"
  >
    <template #reference>
      <button
        type="button"
        class="order-color-dot"
        :class="{ 'has-color': color }"
        :style="{ '--order-color-dot': color || 'transparent' }"
        title="修改订单文本颜色"
        aria-label="修改订单文本颜色"
        aria-haspopup="dialog"
        @click.stop
      />
    </template>

    <div class="text-color-picker-panel" @keydown.esc.prevent="close">
      <div class="text-color-picker-heading">
        <strong>订单文本颜色</strong>
        <span>{{ draft || '默认颜色' }}</span>
      </div>
      <TextColorPalette
        :presets="presets"
        :selected="draft"
        default-label="恢复默认"
        @select="draft = $event || ''"
      />
      <div class="text-color-picker-actions">
        <el-button size="small" :disabled="saving" @click="close">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="confirm"> 确定 </el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.text-color-picker-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.text-color-picker-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.text-color-picker-heading strong {
  color: var(--app-heading);
  font-size: 13px;
}
.text-color-picker-heading span {
  color: var(--app-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.text-color-picker-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
  gap: 7px;
}
.text-color-picker-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.order-color-dot {
  position: relative;
  display: grid;
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--app-muted) 42%, transparent);
  border-radius: 50%;
  background: var(--order-color-dot);
  box-shadow: inset 0 0 0 2px var(--app-card-solid);
  cursor: pointer;
}
.order-color-dot:not(.has-color) {
  background: conic-gradient(#f97316, #eab308, #22c55e, #3b82f6, #a855f7, #f97316);
}
.order-color-dot:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 62%, transparent);
  outline-offset: 2px;
}
</style>
