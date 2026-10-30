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
    placement="bottom-start"
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
