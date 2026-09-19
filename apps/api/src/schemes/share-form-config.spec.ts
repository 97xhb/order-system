import {
  DEFAULT_SHARE_FORM_FIELD_CONFIG,
  normalizeShareFormFieldConfig,
} from './share-form-config';

describe('share form field config', () => {
  it('normalizes a valid preset settlement configuration', () => {
    const config = normalizeShareFormFieldConfig({
      ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
      settlementAmount: {
        mode: 'PRESET',
        options: [120, 100, 120],
      },
    });

    expect(config.settlementAmount.options).toEqual([100, 120]);
  });

  it('does not allow required hidden fields', () => {
    expect(() =>
      normalizeShareFormFieldConfig({
        ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
        fields: {
          ...DEFAULT_SHARE_FORM_FIELD_CONFIG.fields,
          notes: { visible: false, required: true },
        },
      }),
    ).toThrow('隐藏字段 notes 不能设置为必填');
  });

  it('hides settlement amount in admin-only mode', () => {
    const config = normalizeShareFormFieldConfig({
      ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
      settlementAmount: { mode: 'ADMIN_ONLY', options: [] },
    });

    expect(config.fields.submitterSettlementAmount.visible).toBe(false);
  });

  it('keeps legacy configs editable and supports read-only fields', () => {
    const config = normalizeShareFormFieldConfig({
      ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
      fields: {
        ...DEFAULT_SHARE_FORM_FIELD_CONFIG.fields,
        purchaseAddress: { visible: true, required: false, editable: false },
      },
    });

    expect(config.fields.purchaseAddress).toEqual({
      visible: true,
      editable: false,
      required: false,
    });
    expect(() =>
      normalizeShareFormFieldConfig({
        ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
        fields: {
          ...DEFAULT_SHARE_FORM_FIELD_CONFIG.fields,
          notes: { visible: true, editable: false, required: true },
        },
      }),
    ).toThrow('只读字段 notes 不能设置为必填');
  });
});
