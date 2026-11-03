<script setup lang="ts">
import { ref } from 'vue';
import { TEXT_COLOR_PRESETS } from '../lib/text-colors';
import TextColorPalette from './TextColorPalette.vue';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    defaultColor: string;
  }>(),
  {
    modelValue: '',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const visible = ref(false);
const draft = ref(props.defaultColor);

const syncDraft = () => {
  draft.value = props.modelValue || props.defaultColor;
};

const close = () => {
  visible.value = false;
  syncDraft();
};

const confirm = () => {
  emit('update:modelValue', draft.value || props.defaultColor);
  visible.value = false;
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
        class="field-note-color-dot"
        :style="{ '--field-note-color-dot': modelValue || defaultColor }"
        title="修改提示文字颜色"
        aria-label="修改提示文字颜色"
        aria-haspopup="dialog"
      />
    </template>

    <div class="field-note-color-panel" @keydown.esc.prevent="close">
      <div class="field-note-color-heading">
        <strong>提示文字颜色</strong>
        <span>{{ draft === defaultColor ? '默认颜色' : draft }}</span>
      </div>
      <TextColorPalette
        :presets="TEXT_COLOR_PRESETS"
        :selected="draft === defaultColor ? null : draft"
        default-label="恢复默认"
        @select="draft = $event || defaultColor"
      />
      <div class="field-note-color-actions">
        <el-button size="small" @click="close">取消</el-button>
        <el-button size="small" type="primary" @click="confirm">确定</el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.field-note-color-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field-note-color-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.field-note-color-heading strong {
  color: var(--app-heading);
  font-size: 13px;
}
.field-note-color-heading span {
  color: var(--app-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.field-note-color-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
  gap: 7px;
}
.field-note-color-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.field-note-color-dot {
  display: grid;
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--app-muted) 42%, transparent);
  border-radius: 50%;
  background: var(--field-note-color-dot);
  box-shadow: inset 0 0 0 2px var(--app-card-solid);
  cursor: pointer;
}
.field-note-color-dot:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 62%, transparent);
  outline-offset: 2px;
}
</style>
