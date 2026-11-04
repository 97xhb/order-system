<script setup lang="ts">
import { Minus, Picture } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { nextTick, onMounted, ref, watch } from 'vue';
import { TEXT_COLOR_PRESETS } from '../lib/text-colors';
import TextColorPalette from './TextColorPalette.vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    maxLength?: number;
    maxHtmlLength?: number;
    minHeight?: number;
    maxHeight?: number;
  }>(),
  {
    placeholder: '',
    maxLength: 5_000,
    maxHtmlLength: 1_000_000,
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
const imageInput = ref<HTMLInputElement | null>(null);
const imageUploading = ref(false);
const selectedImage = ref<HTMLImageElement | null>(null);
const imageWidth = ref(100);
const sizeOptions = [
  { label: '小字', value: '2' },
  { label: '正文', value: '3' },
  { label: '大字', value: '5' },
  { label: '特大', value: '6' },
] as const;
let savedRange: Range | null = null;

const editorText = (element: HTMLElement) =>
  element.innerText
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim();

const hasEditorRichContent = (element: HTMLElement) => Boolean(element.querySelector('img, hr'));
const editorFallbackText = (element: HTMLElement) =>
  element.querySelector('img') ? '[图片]' : element.querySelector('hr') ? '[分割线]' : '';

const serializeEditorContent = (element: HTMLElement) => {
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('img.is-image-selected')
    .forEach((image) => image.classList.remove('is-image-selected'));
  return clone.innerHTML.trim();
};

const emitContent = () => {
  const element = editor.value;
  if (!element) return;
  const visibleText = editorText(element);
  const hasRichContent = hasEditorRichContent(element);
  plainTextLength.value = visibleText.length;
  emit('update:plainText', visibleText || editorFallbackText(element));
  emit('update:modelValue', visibleText || hasRichContent ? serializeEditorContent(element) : '');
};

const renderValue = () => {
  const element = editor.value;
  if (!element || serializeEditorContent(element) === props.modelValue) return;
  selectedImage.value = null;
  element.innerHTML = props.modelValue;
  const visibleText = editorText(element);
  plainTextLength.value = visibleText.length;
  emit('update:plainText', visibleText || editorFallbackText(element));
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

const chooseImage = () => {
  imageInput.value?.click();
};

const imageWidthPercent = (image: HTMLImageElement) => {
  const parsed = Number.parseFloat(image.style.width);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(100, Math.max(20, Math.round(parsed / 5) * 5));
};

const clearSelectedImage = () => {
  selectedImage.value?.classList.remove('is-image-selected');
  selectedImage.value = null;
};

const handleEditorClick = (event: MouseEvent) => {
  const target = event.target;
  if (!(target instanceof HTMLImageElement)) {
    clearSelectedImage();
    return;
  }
  if (!editor.value?.contains(target)) return;
  clearSelectedImage();
  selectedImage.value = target;
  imageWidth.value = imageWidthPercent(target);
  target.classList.add('is-image-selected');
};

const applyImageWidth = (value: number | number[]) => {
  const image = selectedImage.value;
  if (!image || !editor.value?.contains(image)) {
    clearSelectedImage();
    return;
  }
  const nextValue = Array.isArray(value) ? value[0] : value;
  const normalized = Math.min(100, Math.max(20, Math.round(nextValue / 5) * 5));
  imageWidth.value = normalized;
  image.style.width = `${normalized}%`;
  emitContent();
};

const handleEditorInput = () => {
  if (selectedImage.value && !editor.value?.contains(selectedImage.value)) {
    clearSelectedImage();
  }
  emitContent();
};

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片读取失败，请更换图片后重试'));
    };
    image.src = objectUrl;
  });

const compressImage = async (file: File) => {
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error('无法识别图片尺寸');

  const maxEdge = 1_600;
  const maxDataUrlLength = 180_000;
  let scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  let quality = 0.82;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理这张图片');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/webp', quality);
    if (dataUrl.length <= maxDataUrlLength) return dataUrl;
    scale *= 0.82;
    quality = Math.max(0.45, quality - 0.07);
  }

  throw new Error('图片压缩后仍然过大，请选择更小的图片');
};

const insertImage = (dataUrl: string) => {
  const element = editor.value;
  if (!element) return;
  if (element.innerHTML.length + dataUrl.length + 64 > props.maxHtmlLength) {
    throw new Error('方案内容中的图片总大小过大，请删除部分图片后重试');
  }
  element.focus();
  restoreSelection();

  const selection = window.getSelection();
  let range = savedRange;
  if (!range || !element.contains(range.commonAncestorContainer)) {
    range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
  }

  const image = document.createElement('img');
  image.src = dataUrl;
  image.alt = '方案图片';
  image.style.width = '100%';
  const lineBreak = document.createElement('br');
  range.deleteContents();
  range.insertNode(image);
  image.after(lineBreak);
  range.setStartAfter(lineBreak);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  savedRange = range.cloneRange();
  clearSelectedImage();
  selectedImage.value = image;
  imageWidth.value = 100;
  image.classList.add('is-image-selected');
  emitContent();
};

const insertDivider = () => {
  const element = editor.value;
  if (!element) return;
  element.focus();
  restoreSelection();

  const selection = window.getSelection();
  let range = savedRange;
  if (!range || !element.contains(range.commonAncestorContainer)) {
    range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
  }

  const divider = document.createElement('hr');
  const paragraph = document.createElement('p');
  paragraph.appendChild(document.createElement('br'));
  range.deleteContents();
  range.insertNode(divider);
  divider.after(paragraph);

  const nextRange = document.createRange();
  nextRange.setStart(paragraph, 0);
  nextRange.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
  savedRange = nextRange.cloneRange();
  emitContent();
};

const handleImageSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
    ElMessage.warning('仅支持 PNG、JPG 或 WebP 图片');
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    ElMessage.warning('原始图片不能超过 15MB');
    return;
  }

  imageUploading.value = true;
  try {
    insertImage(await compressImage(file));
    ElMessage.success('图片已插入');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '图片处理失败');
  } finally {
    imageUploading.value = false;
  }
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
        class="rich-tool-button rich-image-button"
        title="插入图片，自动压缩"
        :disabled="imageUploading"
        @mousedown.prevent
        @click="chooseImage"
      >
        <el-icon><Picture /></el-icon>
        {{ imageUploading ? '处理中' : '图片' }}
      </button>
      <input
        ref="imageInput"
        class="rich-image-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        @change="handleImageSelected"
      />
      <button
        type="button"
        class="rich-tool-button rich-divider-button"
        title="插入分割线"
        @mousedown.prevent
        @click="insertDivider"
      >
        <el-icon><Minus /></el-icon>
        分割线
      </button>
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
    <div v-if="selectedImage" class="rich-image-size-panel">
      <span class="rich-image-size-label">图片宽度</span>
      <el-slider
        v-model="imageWidth"
        :min="20"
        :max="100"
        :step="5"
        :show-tooltip="false"
        @input="applyImageWidth"
      />
      <span class="rich-image-size-value">{{ imageWidth }}%</span>
      <button type="button" class="rich-image-size-reset" @click="applyImageWidth(100)">
        恢复默认
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
      @input="handleEditorInput"
      @click="handleEditorClick"
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
.rich-image-button {
  display: inline-flex;
  min-width: 58px;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.rich-image-button:disabled {
  cursor: wait;
  opacity: 0.65;
}
.rich-image-input {
  display: none;
}
.rich-divider-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.rich-image-size-panel {
  display: flex;
  min-height: 42px;
  align-items: center;
  padding: 5px 10px;
  border-bottom: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-primary) 6%, var(--app-card-solid));
  gap: 10px;
}
.rich-image-size-panel :deep(.el-slider) {
  min-width: 100px;
  flex: 1;
}
.rich-image-size-label,
.rich-image-size-value {
  flex: 0 0 auto;
  color: var(--app-text-secondary);
  font-size: 12px;
}
.rich-image-size-value {
  min-width: 38px;
  color: var(--app-primary);
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rich-image-size-reset {
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  color: var(--app-text);
  background: var(--app-card-solid);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.rich-image-size-reset:hover {
  border-color: color-mix(in srgb, var(--app-primary) 42%, var(--app-border));
  color: var(--app-primary);
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
.rich-text-editor :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 10px 0;
  border-radius: 10px;
}
.rich-text-editor :deep(img.is-image-selected) {
  outline: 3px solid color-mix(in srgb, var(--app-primary) 72%, transparent);
  outline-offset: 3px;
}
.rich-text-editor :deep(hr) {
  height: 0;
  margin: 14px 0;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--app-border) 88%, transparent);
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
