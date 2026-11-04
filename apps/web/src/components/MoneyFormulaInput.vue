<script setup lang="ts">
import type { InputInstance } from 'element-plus';
import { computed, nextTick, ref, watch } from 'vue';
import { parseMoneyInput, type MoneyFormulaVariables } from '../lib/money-formula';

const props = withDefaults(
  defineProps<{
    modelValue?: number | null;
    formula?: string;
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    max?: number;
    variables?: MoneyFormulaVariables;
    variableLabels?: Record<string, string>;
    variableKey?: string;
  }>(),
  {
    modelValue: null,
    formula: '',
    placeholder: '',
    disabled: false,
    clearable: true,
    max: 1_000_000_000_000,
    variables: () => ({}),
    variableLabels: () => ({}),
    variableKey: '',
  },
);
const emit = defineEmits<{
  'update:modelValue': [value: number | null];
  'update:formula': [value: string];
}>();

const text = ref('');
const formulaInput = ref<InputInstance | null>(null);
const focused = ref(false);
const invalid = ref(false);
const calculated = ref<number | null>(null);
const usableVariables = computed(() => {
  const next = { ...props.variables };
  if (props.variableKey) delete next[props.variableKey];
  return next;
});
const availableVariableLabels = computed(() =>
  Object.entries(props.variableLabels)
    .filter(([key]) => Object.hasOwn(usableVariables.value, key))
    .map(([, label]) => label),
);
const formulaMode = computed(() => text.value.trimStart().startsWith('='));
const variablesSnapshot = computed(() => JSON.stringify(usableVariables.value));

const displayValue = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : Number(value).toFixed(2);
const clampValue = (value: number) => Math.min(Math.max(value, 0), props.max);

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
watch(variablesSnapshot, () => {
  if (focused.value) return;
  const formula = props.formula?.trim();
  if (!formula?.startsWith('=')) return;
  const evaluated = parseMoneyInput(formula, usableVariables.value);
  if (evaluated === null) return;
  const value = clampValue(evaluated);
  calculated.value = value;
  if (props.modelValue !== value) emit('update:modelValue', value);
});

const handleInput = () => {
  invalid.value = false;
};

const nativeInput = () => {
  const input = formulaInput.value?.input;
  return input instanceof HTMLInputElement ? input : undefined;
};

const insertVariable = (label: string) => {
  if (!formulaMode.value) return;
  const input = nativeInput();
  const start = input?.selectionStart ?? text.value.length;
  const end = input?.selectionEnd ?? start;
  const token = `{${label}}`;
  text.value = `${text.value.slice(0, start)}${token}${text.value.slice(end)}`;
  invalid.value = false;
  nextTick(() => {
    const nextInput = nativeInput();
    nextInput?.focus();
    const nextCaret = start + token.length;
    nextInput?.setSelectionRange(nextCaret, nextCaret);
  });
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
  const evaluated = parseMoneyInput(text.value, usableVariables.value);
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
    (props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue));
  invalid.value = false;
};
</script>

<template>
  <div class="money-formula-control">
    <el-input
      ref="formulaInput"
      v-model="text"
      class="money-formula-input"
      :class="{ 'is-formula-invalid': invalid }"
      :placeholder="placeholder"
      :disabled="disabled"
      :clearable="clearable"
      :inputmode="availableVariableLabels.length ? 'text' : 'decimal'"
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
    <small v-else-if="invalid" class="money-formula-error"> 公式或变量不可用，请检查后重试 </small>
    <div v-if="focused && availableVariableLabels.length" class="money-formula-variables">
      <span>{{ formulaMode ? '点击变量插入：' : '先输入 =，才能使用公式变量' }}</span>
      <button
        v-for="label in availableVariableLabels"
        :key="label"
        type="button"
        class="money-variable-chip"
        :disabled="!formulaMode"
        :title="`插入 {${label}}`"
        @mousedown.prevent
        @click="insertVariable(label)"
      >
        {{ label }}
      </button>
    </div>
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
.money-formula-error {
  color: var(--el-color-danger);
  font-size: 11px;
  line-height: 1.35;
}
.money-formula-variables {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  color: var(--app-muted);
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.money-variable-chip {
  height: 22px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--app-primary) 24%, var(--app-border));
  border-radius: 999px;
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary) 7%, var(--app-card-solid));
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}
.money-variable-chip:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--app-primary) 46%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary) 12%, var(--app-card-solid));
}
.money-variable-chip:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
</style>
