<script setup lang="ts">
import { ref } from 'vue';

interface ColorPreset {
  label: string;
  value: string;
}

const props = defineProps<{
  color: string | null;
  presets: ColorPreset[];
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
      <div class="text-color-choice-grid">
        <button
          type="button"
          class="text-color-choice text-color-choice--default"
          :class="{ 'is-selected': !draft }"
          title="恢复默认颜色"
          @click="draft = ''"
        >
          恢复默认
        </button>
        <button
          v-for="preset in presets"
          :key="preset.value"
          type="button"
          class="text-color-choice"
          :class="{ 'is-selected': draft === preset.value }"
          :style="{ '--choice-color': preset.value }"
          :title="preset.label"
          :aria-label="preset.label"
          @click="draft = preset.value"
        >
          <span aria-hidden="true">✓</span>
        </button>
      </div>
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
