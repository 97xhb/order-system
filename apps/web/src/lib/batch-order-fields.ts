import {
  SHARE_FORM_FIELD_META,
  SHARE_FORM_FIELD_ORDER,
  type ShareFormFieldKey,
  type ShareFormFieldKind,
} from './share-form-fields';
import { normalizeHeaderLabel } from './clipboard-table';

export interface ShareFormFieldRuleView {
  visible: boolean;
  editable: boolean;
  required: boolean;
  batchScope: 'SHARED' | 'ROW';
  note?: string;
  noteColor?: string;
}

export type ShareFormFieldConfigView = {
  fields: Record<ShareFormFieldKey, ShareFormFieldRuleView>;
};

export interface BatchFieldColumn {
  key: ShareFormFieldKey;
  label: string;
  kind: ShareFormFieldKind;
  required: boolean;
  minWidth: number;
}

const COLUMN_WIDTHS: Record<ShareFormFieldKind, number> = {
  text: 170,
  textarea: 220,
  money: 140,
  date: 140,
  boolean: 130,
  platform: 150,
  category: 140,
  funding: 170,
  dispatch: 170,
};

export const batchColumnWidth = (kind: ShareFormFieldKind) => COLUMN_WIDTHS[kind] ?? 160;

export const fieldLabel = (key: ShareFormFieldKey) => SHARE_FORM_FIELD_META[key].label;

/**
 * 批量报单的公共字段：整批填写一次，配置为「整批统一」且允许填写的字段。
 */
export const sharedBatchFields = (
  config: ShareFormFieldConfigView | undefined,
): ShareFormFieldKey[] =>
  SHARE_FORM_FIELD_ORDER.filter((key) => {
    const rule = config?.fields[key];
    return !!rule && rule.visible && rule.editable && rule.batchScope === 'SHARED';
  });

/**
 * 批量报单的逐行字段：配置为「逐行填写」且允许填写的字段。
 */
export const rowBatchFields = (config: ShareFormFieldConfigView | undefined): ShareFormFieldKey[] =>
  SHARE_FORM_FIELD_ORDER.filter((key) => {
    const rule = config?.fields[key];
    return !!rule && rule.visible && rule.editable && rule.batchScope === 'ROW';
  });

export const batchFieldColumns = (
  config: ShareFormFieldConfigView | undefined,
): BatchFieldColumn[] =>
  rowBatchFields(config).map((key) => ({
    key,
    label: SHARE_FORM_FIELD_META[key].label,
    kind: SHARE_FORM_FIELD_META[key].kind,
    required: !!config?.fields[key]?.required,
    minWidth: batchColumnWidth(SHARE_FORM_FIELD_META[key].kind),
  }));

/**
 * 表头别名表：只保留逐行字段，粘贴时按当前方案的字段配置识别列。
 */
export const batchHeaderAliasMap = (config: ShareFormFieldConfigView | undefined) => {
  const map = new Map<string, ShareFormFieldKey>();
  for (const key of rowBatchFields(config)) {
    const meta = SHARE_FORM_FIELD_META[key];
    for (const alias of [meta.label, ...meta.headerAliases]) {
      map.set(normalizeHeaderLabel(alias), key);
    }
  }
  return map;
};

/**
 * 所有已知字段的表头别名，用于识别「粘贴了但当前方案不会提交」的列。
 */
export const allHeaderAliasMap = () => {
  const map = new Map<string, ShareFormFieldKey>();
  for (const key of SHARE_FORM_FIELD_ORDER) {
    const meta = SHARE_FORM_FIELD_META[key];
    for (const alias of [meta.label, ...meta.headerAliases]) {
      map.set(normalizeHeaderLabel(alias), key);
    }
  }
  return map;
};

export const isMoneyFieldKind = (kind: ShareFormFieldKind) => kind === 'money';
export const isDateFieldKind = (kind: ShareFormFieldKind) => kind === 'date';
