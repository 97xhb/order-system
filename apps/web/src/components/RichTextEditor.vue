<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { TEXT_COLOR_PRESETS } from '../lib/text-colors';
import TextColorPalette from './TextColorPalette.vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    maxLength?: number;
    minHeight?: number;
    maxHeight?: number;
  }>(),
  {
    placeholder: '',
    maxLength: 5_000,
    minHeight: 120,
    maxHeight: 320,
  },
);
const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:plainText': [value: string];
}>();

const editor = ref<HTMLElement | null>(null);
const color = ref<string | null>(null);
const colorVisible = ref(false);
const fontSize = ref('3');
const plainTextLength = ref(0);
const sizeOptions = [
  { label: '小字', value: '2' },
  { label: '正文', value: '3' },
  { label: '大字', value: '5' },
  { label: '特大', value: '6' },
] as const;
let savedRange: Range | null = null;

const emitContent = () => {
  const element = editor.value;
  if (!element) return;
  const plainText = element.innerText
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim();
  plainTextLength.value = plainText.length;
  emit('update:plainText', plainText);
  emit('update:modelValue', plainText ? element.innerHTML.trim() : '');
};

const renderValue = () => {
  const element = editor.value;
  if (!element || element.innerHTML === props.modelValue) return;
  element.innerHTML = props.modelValue;
  const plainText = element.innerText
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim();
  plainTextLength.value = plainText.length;
  emit('update:plainText', plainText);
};

const rememberSelection = () => {
  const element = editor.value;
  const selection = window.getSelection();
  if (!element || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (element.contains(range.commonAncestorContainer)) {
    savedRange = range.cloneRange();
  }
};

const restoreSelection = () => {
  if (!savedRange) return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(savedRange);
};

const execCommand = (command: string, value?: string) => {
  editor.value?.focus();
  restoreSelection();
  document.execCommand(command, false, value);
  emitContent();
  rememberSelection();
};

const applyFontSize = (value: string) => {
  fontSize.value = value;
  execCommand('fontSize', value);
};

const applyTextColor = (value: string | null) => {
  const element = editor.value;
  if (!element) return;
  const nextColor = value || getComputedStyle(element).color;
  color.value = value;
  execCommand('foreColor', nextColor);
  colorVisible.value = false;
};

const handlePaste = (event: ClipboardEvent) => {
  event.preventDefault();
  restoreSelection();
  document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
  emitContent();
  rememberSelection();
};

watch(() => props.modelValue, renderValue);
onMounted(() => nextTick(renderValue));
</script>

<template>
  <div class="rich-text-field">
    <div class="rich-text-toolbar" @mousedown.capture="rememberSelection">
      <button
        type="button"
        class="rich-tool-button is-bold"
        title="加粗"
        aria-label="加粗"
        @mousedown.prevent
        @click="execCommand('bold')"
      >
        B
      </button>
      <button
        type="button"
        class="rich-tool-button is-italic"
        title="斜体"
        aria-label="斜体"
        @mousedown.prevent
        @click="execCommand('italic')"
      >
        I
      </button>
      <button
        type="button"
        class="rich-tool-button is-underline"
        title="下划线"
        aria-label="下划线"
        @mousedown.prevent
        @click="execCommand('underline')"
      >
        U
      </button>
      <div class="rich-size-buttons" aria-label="字号">
        <button
          v-for="option in sizeOptions"
          :key="option.value"
          type="button"
          class="rich-tool-button rich-size-button"
          :class="{ 'is-active': fontSize === option.value }"
          :title="`设置为${option.label}`"
          @mousedown.prevent
          @click="applyFontSize(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
      <el-popover
        v-model:visible="colorVisible"
        placement="bottom-start"
        :width="300"
        trigger="click"
      >
        <template #reference>
          <button
            type="button"
            class="rich-tool-button rich-color-trigger"
            title="文字颜色"
            aria-label="文字颜色"
            aria-haspopup="dialog"
            @mousedown.prevent="rememberSelection"
          >
            <span class="rich-color-letter" aria-hidden="true">A</span>
            <span
              class="rich-color-indicator"
              :style="{ '--rich-color-current': color || 'var(--app-text)' }"
              aria-hidden="true"
            />
          </button>
        </template>
        <div class="rich-color-picker-panel" @mousedown.prevent>
          <div class="rich-color-picker-heading">
            <strong>文字颜色</strong>
            <span>{{ color || '默认颜色' }}</span>
          </div>
          <TextColorPalette
            :presets="TEXT_COLOR_PRESETS"
            :selected="color"
            default-label="恢复默认"
            @select="applyTextColor"
          />
        </div>
      </el-popover>
      <button
        type="button"
        class="rich-tool-button rich-clear-button"
        title="清除格式"
        @mousedown.prevent
        @click="execCommand('removeFormat')"
      >
        清除格式
      </button>
    </div>
    <div
      ref="editor"
      class="rich-text-editor"
      contenteditable="true"
      :data-placeholder="placeholder"
      :style="{
        '--rich-text-min-height': `${minHeight}px`,
        '--rich-text-max-height': `${maxHeight}px`,
      }"
      @input="emitContent"
      @keyup="rememberSelection"
      @mouseup="rememberSelection"
      @focus="rememberSelection"
      @paste="handlePaste"
    ></div>
    <div class="rich-text-counter" :class="{ 'is-over-limit': plainTextLength > maxLength }">
      {{ plainTextLength }} / {{ maxLength }}
    </div>
  </div>
</template>

<style scoped>
.rich-text-field {
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 15px;
  background: var(--app-card-solid);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--app-heading) 5%, transparent);
}
.rich-text-toolbar {
  display: flex;
  min-height: 42px;
  align-items: center;
  flex-wrap: wrap;
  padding: 5px 7px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-hover);
  gap: 5px;
}
.rich-tool-button {
  min-width: 30px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  color: var(--app-text);
  background: var(--app-card-solid);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.rich-tool-button:hover {
  border-color: color-mix(in srgb, var(--app-primary) 42%, var(--app-border));
  color: var(--app-primary);
}
.rich-tool-button.is-bold {
  font-weight: 800;
}
.rich-tool-button.is-italic {
  font-style: italic;
}
.rich-tool-button.is-underline {
  text-decoration: underline;
}
.rich-clear-button {
  min-width: 74px;
}
.rich-size-buttons {
  display: inline-flex;
  gap: 4px;
}
.rich-size-button {
  min-width: 38px;
  padding: 0 6px;
}
.rich-size-button.is-active {
  border-color: color-mix(in srgb, var(--app-primary) 52%, var(--app-border));
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary) 10%, var(--app-card-solid));
}
.rich-color-trigger {
  position: relative;
  display: inline-flex;
  width: 34px;
  align-items: center;
  justify-content: center;
  padding: 0 0 4px;
}
.rich-color-letter {
  font-size: 15px;
  font-weight: 800;
  line-height: 1;
}
.rich-color-indicator {
  position: absolute;
  right: 6px;
  bottom: 4px;
  left: 6px;
  height: 3px;
  border-radius: 999px;
  background: var(--rich-color-current);
}
.rich-color-picker-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rich-color-picker-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.rich-color-picker-heading strong {
  color: var(--app-heading);
  font-size: 13px;
}
.rich-color-picker-heading span {
  color: var(--app-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.rich-text-editor {
  min-height: var(--rich-text-min-height);
  max-height: var(--rich-text-max-height);
  overflow-y: auto;
  padding: 10px 12px;
  color: var(--app-text);
  outline: none;
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.rich-text-editor:empty::before {
  color: var(--app-muted);
  content: attr(data-placeholder);
  pointer-events: none;
}
.rich-text-counter {
  padding: 4px 10px 6px;
  color: var(--app-muted);
  font-size: 11px;
  text-align: right;
}
.rich-text-counter.is-over-limit {
  color: var(--el-color-danger);
  font-weight: 700;
}
</style>
