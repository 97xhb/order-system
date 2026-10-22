<script setup lang="ts">
import { ref, watch } from 'vue';
import { parseMoneyInput } from '../lib/money-formula';

const props = withDefaults(
  defineProps<{
    modelValue?: number | null;
    formula?: string;
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    max?: number;
  }>(),
  {
    modelValue: null,
    formula: '',
    placeholder: '',
    disabled: false,
    clearable: true,
    max: 1_000_000_000_000,
  },
);
const emit = defineEmits<{
  'update:modelValue': [value: number | null];
  'update:formula': [value: string];
}>();

const text = ref('');
const focused = ref(false);
const invalid = ref(false);
const calculated = ref<number | null>(null);

const displayValue = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : Number(value).toFixed(2);
const clampValue = (value: number) =>
  Math.min(Math.max(value, 0), props.max);

watch(
  () => props.modelValue,
  (value) => {
    if (focused.value) return;
    calculated.value = value ?? null;
    text.value = props.formula?.trim() || displayValue(value);
  },
  { immediate: true },
);
watch(
  () => props.formula,
  (formula) => {
    if (focused.value) return;
    text.value = formula?.trim() || displayValue(props.modelValue);
  },
);

const handleInput = () => {
  invalid.value = false;
};

const commit = () => {
  focused.value = false;
  if (!text.value.trim()) {
    text.value = '';
    invalid.value = false;
    calculated.value = null;
    emit('update:modelValue', null);
    emit('update:formula', '');
    return;
  }
  const evaluated = parseMoneyInput(text.value);
  if (evaluated === null) {
    invalid.value = true;
    return;
  }
  const value = clampValue(evaluated);
  const formula = text.value.trim().startsWith('=') ? text.value.trim() : '';
  text.value = formula || displayValue(value);
  calculated.value = value;
  invalid.value = false;
  emit('update:modelValue', value);
  emit('update:formula', formula);
};

const focus = () => {
  focused.value = true;
  text.value =
    props.formula?.trim() ||
    (props.modelValue === null || props.modelValue === undefined
      ? ''
      : String(props.modelValue));
  invalid.value = false;
};
</script>

<template>
  <div class="money-formula-control">
    <el-input
      v-model="text"
      class="money-formula-input"
      :class="{ 'is-formula-invalid': invalid }"
      :placeholder="placeholder"
      :disabled="disabled"
      :clearable="clearable"
      inputmode="decimal"
      @focus="focus"
      @input="handleInput"
      @blur="commit"
      @keydown.enter.prevent="commit"
    />
    <small
      v-if="text.trim().startsWith('=') && calculated !== null && !invalid"
      class="money-formula-result"
    >
      计算结果 {{ calculated.toFixed(2) }}
    </small>
  </div>
</template>

<style scoped>
.money-formula-control {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.money-formula-input {
  width: 100%;
}

.money-formula-input.is-formula-invalid :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}

.money-formula-result {
  color: var(--el-color-primary);
  font-size: 11px;
  line-height: 1.35;
}
</style>
