<script setup lang="ts">
import { ref, watch } from 'vue';
import { evaluateMoneyFormula } from '../lib/money-formula';

const props = withDefaults(
  defineProps<{
    modelValue?: number | null;
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    max?: number;
  }>(),
  {
    modelValue: null,
    placeholder: '',
    disabled: false,
    clearable: true,
    max: 1_000_000_000_000,
  },
);
const emit = defineEmits<{
  'update:modelValue': [value: number | null];
}>();

const text = ref('');
const focused = ref(false);
const invalid = ref(false);

const displayValue = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : Number(value).toFixed(2);
const clampValue = (value: number) =>
  Math.min(Math.max(value, 0), props.max);

watch(
  () => props.modelValue,
  (value) => {
    if (!focused.value) text.value = displayValue(value);
  },
  { immediate: true },
);

const handleInput = (value: string) => {
  invalid.value = false;
  if (!value.trim()) {
    emit('update:modelValue', null);
    return;
  }
  const evaluated = evaluateMoneyFormula(value);
  if (evaluated === null) return;
  emit('update:modelValue', clampValue(evaluated));
};

const commit = () => {
  focused.value = false;
  if (!text.value.trim()) {
    text.value = '';
    invalid.value = false;
    emit('update:modelValue', null);
    return;
  }
  const evaluated = evaluateMoneyFormula(text.value);
  if (evaluated === null) {
    invalid.value = true;
    return;
  }
  const value = clampValue(evaluated);
  text.value = displayValue(value);
  invalid.value = false;
  emit('update:modelValue', value);
};

const focus = () => {
  focused.value = true;
  text.value =
    props.modelValue === null || props.modelValue === undefined
      ? ''
      : String(props.modelValue);
  invalid.value = false;
};
</script>

<template>
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
</template>

<style scoped>
.money-formula-input {
  width: 100%;
}

.money-formula-input.is-formula-invalid :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
</style>
