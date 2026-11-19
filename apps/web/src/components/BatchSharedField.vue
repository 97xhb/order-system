<script setup lang="ts">
import { computed } from 'vue';
import type { MoneyFormulaVariables } from '../lib/money-formula';
import MoneyFormulaInput from './MoneyFormulaInput.vue';
import OrderFieldLabel from './OrderFieldLabel.vue';

type FieldKind =
  | 'text'
  | 'textarea'
  | 'money'
  | 'date'
  | 'boolean'
  | 'platform'
  | 'category'
  | 'funding'
  | 'dispatch';

const props = withDefaults(
  defineProps<{
    kind: FieldKind;
    label: string;
    required?: boolean;
    hint?: string;
    noteColor?: string;
    modelValue?: unknown;
    formula?: string;
    disabled?: boolean;
    platforms?: Array<{ id: string; name: string }>;
    categories?: Array<{ id: string; name: string }>;
    fundingMethods?: Array<{ code: string; name: string }>;
    dispatchOptions?: Array<{ value: string; label: string }>;
    settlementMode?: 'FREE' | 'PRESET' | 'FIXED' | 'ADMIN_ONLY';
    settlementOptions?: number[];
    isSettlement?: boolean;
    variables?: MoneyFormulaVariables;
    variableLabels?: Record<string, string>;
  }>(),
  {
    required: false,
    hint: '',
    noteColor: '',
    modelValue: undefined,
    formula: '',
    disabled: false,
    platforms: () => [],
    categories: () => [],
    fundingMethods: () => [],
    dispatchOptions: () => [],
    settlementMode: 'FREE',
    settlementOptions: () => [],
    isSettlement: false,
    variables: () => ({}),
    variableLabels: () => ({}),
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: unknown];
  'update:formula': [value: string];
}>();

const textValue = computed(() =>
  props.modelValue === undefined || props.modelValue === null ? '' : String(props.modelValue),
);
const moneyValue = computed(() =>
  typeof props.modelValue === 'number' && Number.isFinite(props.modelValue)
    ? props.modelValue
    : null,
);
const booleanValue = computed(() =>
  props.modelValue === undefined || props.modelValue === null ? null : Boolean(props.modelValue),
);
const settlementPresetValue = computed(() =>
  typeof props.modelValue === 'number' ? props.modelValue : undefined,
);

const setText = (value: string) => emit('update:modelValue', value);
const setMoney = (value: number | null) => emit('update:modelValue', value ?? undefined);
const setBoolean = (value: boolean) => emit('update:modelValue', value);
</script>

<template>
  <el-form-item
    :required="required"
    label-position="top"
    :class="{
      'span-two': kind === 'textarea' || kind === 'funding' || kind === 'boolean',
    }"
  >
    <template #label>
      <OrderFieldLabel :label="label" :hint="hint" :color="noteColor" :required="required" />
    </template>

    <el-input
      v-if="kind === 'text'"
      :model-value="textValue"
      :disabled="disabled"
      clearable
      :placeholder="label"
      @update:model-value="setText"
    />
    <el-input
      v-else-if="kind === 'textarea'"
      :model-value="textValue"
      :disabled="disabled"
      type="textarea"
      :rows="3"
      :placeholder="label"
      @update:model-value="setText"
    />
    <MoneyFormulaInput
      v-else-if="kind === 'money' && (!isSettlement || settlementMode === 'FREE')"
      :model-value="moneyValue"
      :formula="formula"
      :disabled="disabled"
      :variables="variables"
      :variable-labels="variableLabels"
      :variable-key="label"
      placeholder="数字或公式"
      @update:model-value="setMoney"
      @update:formula="emit('update:formula', $event)"
    />
    <el-radio-group
      v-else-if="kind === 'money' && settlementMode === 'PRESET'"
      :model-value="settlementPresetValue"
      :disabled="disabled"
      class="amount-options"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <el-radio-button v-for="amount in settlementOptions" :key="amount" :value="amount">
        ¥{{ amount.toFixed(2) }}
      </el-radio-button>
    </el-radio-group>
    <el-input-number
      v-else-if="kind === 'money'"
      :model-value="moneyValue ?? undefined"
      :precision="2"
      :controls="false"
      :disabled="true"
    />
    <el-date-picker
      v-else-if="kind === 'date'"
      :model-value="textValue"
      :disabled="disabled"
      type="date"
      value-format="YYYY-MM-DD"
      @update:model-value="setText"
    />
    <div
      v-else-if="kind === 'boolean'"
      class="funding-options scan-choice-options"
      role="radiogroup"
      :aria-label="label"
    >
      <button
        type="button"
        role="radio"
        class="card-choice funding-option"
        :class="{ 'is-selected': booleanValue === false }"
        :disabled="disabled"
        :aria-checked="booleanValue === false"
        @click="setBoolean(false)"
      >
        <span><strong>未扫码</strong><small>返利金额为 0</small></span>
      </button>
      <button
        type="button"
        role="radio"
        class="card-choice funding-option"
        :class="{ 'is-selected': booleanValue === true }"
        :disabled="disabled"
        :aria-checked="booleanValue === true"
        @click="setBoolean(true)"
      >
        <span><strong>已扫码</strong><small>金额由管理员核对</small></span>
      </button>
    </div>
    <el-select
      v-else-if="kind === 'platform'"
      :model-value="textValue"
      :disabled="disabled"
      placeholder="请选择平台"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <el-option
        v-for="platform in platforms"
        :key="platform.id"
        :label="platform.name"
        :value="platform.id"
      />
    </el-select>
    <el-select
      v-else-if="kind === 'category'"
      :model-value="textValue"
      :disabled="disabled"
      clearable
      placeholder="可留空，由管理员补充"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <el-option
        v-for="category in categories"
        :key="category.id"
        :label="category.name"
        :value="category.id"
      />
    </el-select>
    <div
      v-else-if="kind === 'funding'"
      class="funding-options"
      role="radiogroup"
      :aria-label="label"
    >
      <button
        v-for="option in fundingMethods"
        :key="option.code"
        type="button"
        role="radio"
        class="card-choice funding-option"
        :class="{ 'is-selected': textValue === option.code }"
        :disabled="disabled"
        :aria-checked="textValue === option.code"
        @click="emit('update:modelValue', option.code)"
      >
        <span>
          <strong>{{ option.name }}</strong>
          <small>{{ option.code === 'OTHER' ? '由管理员补充说明' : '' }}</small>
        </span>
      </button>
    </div>
    <el-select
      v-else-if="kind === 'dispatch'"
      :model-value="textValue"
      :disabled="disabled"
      placeholder="请选择发货状态"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <el-option
        v-for="option in dispatchOptions"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-select>
  </el-form-item>
</template>

<style scoped>
.amount-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
