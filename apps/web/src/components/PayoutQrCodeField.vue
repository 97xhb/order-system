<script setup lang="ts">
import { Delete, Picture, Upload } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, ref } from 'vue';
import { compressImageToDataUrl } from '../lib/image-compress';

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const processing = ref(false);

const hasValue = computed(() => Boolean(props.modelValue));

const pickFile = () => {
  if (props.disabled) return;
  fileInput.value?.click();
};

const handleFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  processing.value = true;
  try {
    // 二维码需要保持边缘锐利才能被扫出来，所以这里用无损 PNG。
    const dataUrl = await compressImageToDataUrl(file, {
      mimeType: 'image/png',
      maxEdge: 900,
      maxDataUrlLength: 180_000,
    });
    emit('update:modelValue', dataUrl);
    ElMessage.success('二维码已上传');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '二维码上传失败');
  } finally {
    processing.value = false;
  }
};

const clear = () => {
  emit('update:modelValue', null);
};
</script>

<template>
  <div class="qr-field" :class="{ 'is-disabled': disabled }">
    <div class="qr-preview">
      <img v-if="hasValue" :src="modelValue ?? ''" alt="收款二维码" />
      <div v-else class="qr-placeholder">
        <el-icon><Picture /></el-icon>
        <span>未上传</span>
      </div>
      <span v-if="processing" class="qr-loading">处理中…</span>
    </div>

    <div class="qr-actions">
      <div class="qr-copy">
        <b>收款二维码</b>
        <span>选填，支持 PNG / JPG 图片</span>
      </div>
      <div class="qr-buttons">
        <el-button
          class="app-action-button app-action-button--primary"
          size="small"
          :icon="hasValue ? Upload : Picture"
          :loading="processing"
          :disabled="disabled"
          @click="pickFile"
        >
          {{ hasValue ? '更换' : '上传' }}
        </el-button>
        <el-button
          v-if="hasValue"
          class="app-action-button app-action-button--danger"
          size="small"
          :icon="Delete"
          :disabled="disabled"
          @click="clear"
        >
          移除
        </el-button>
      </div>
    </div>

    <input
      ref="fileInput"
      class="qr-file-input"
      type="file"
      accept="image/png,image/jpeg,image/jpg,image/webp"
      @change="handleFile"
    />
  </div>
</template>

<style scoped>
.qr-field {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-card);
  background: var(--app-surface-sunken);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-surface-card) 62%, transparent);
}

.qr-field.is-disabled {
  opacity: 0.6;
}

.qr-preview {
  position: relative;
  display: grid;
  width: 64px;
  height: 64px;
  flex: 0 0 64px;
  overflow: hidden;
  place-items: center;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-control);
  background: var(--app-surface-card);
}

.qr-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-placeholder {
  display: grid;
  place-items: center;
  color: var(--app-text-placeholder);
  font-size: var(--app-text-micro);
  gap: 2px;
}

.qr-placeholder svg {
  width: 16px;
  height: 16px;
}

.qr-loading {
  position: absolute;
  inset: auto 0 0 0;
  padding: 2px 0;
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-surface-card) 88%, transparent);
  font-size: var(--app-text-micro);
  text-align: center;
}

.qr-actions {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.qr-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.qr-copy b {
  color: var(--app-heading);
  font-size: var(--app-text-sm);
}

.qr-copy span {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: var(--app-text-micro);
}

.qr-buttons {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

.qr-buttons .el-button + .el-button {
  margin-left: 6px;
}

.qr-file-input {
  display: none;
}
</style>
