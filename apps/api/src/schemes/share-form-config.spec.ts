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

  it('keeps per-field hints and colors while accepting legacy configs', () => {
    const config = normalizeShareFormFieldConfig({
      ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
      fields: {
        ...DEFAULT_SHARE_FORM_FIELD_CONFIG.fields,
        platformOrderNo: {
          visible: true,
          editable: true,
          required: true,
          note: '  请填写平台生成的完整订单号  ',
          noteColor: '#2563eb',
        },
      },
    });

    expect(config.fields.platformOrderNo).toMatchObject({
      note: '请填写平台生成的完整订单号',
      noteColor: '#2563EB',
    });
    expect(
      normalizeShareFormFieldConfig(DEFAULT_SHARE_FORM_FIELD_CONFIG).fields
        .notes,
    ).toMatchObject({ visible: true, editable: true, required: false });
  });

  it('rejects invalid per-field hint colors', () => {
    expect(() =>
      normalizeShareFormFieldConfig({
        ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
        fields: {
          ...DEFAULT_SHARE_FORM_FIELD_CONFIG.fields,
          notes: {
            visible: true,
            editable: true,
            required: false,
            noteColor: 'blue',
          },
        },
      }),
    ).toThrow('字段 notes 的提示颜色格式不正确');
  });

  it('keeps legacy configs editable and supports read-only fields', () => {
    const config = normalizeShareFormFieldConfig({
      ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
      fields: {
        ...DEFAULT_SHARE_FORM_FIELD_CONFIG.fields,
        purchaseAddress: { visible: true, required: false, editable: false },
      },
    });

    expect(config.fields.purchaseAddress).toMatchObject({
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

  it('keeps the configured batch scope and rejects unsupported row fields', () => {
    const config = normalizeShareFormFieldConfig({
      ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
      fields: {
        ...DEFAULT_SHARE_FORM_FIELD_CONFIG.fields,
        platformOrderNo: {
          visible: true,
          editable: true,
          required: true,
          batchScope: 'ROW',
        },
        wechatNickname: {
          visible: true,
          editable: true,
          required: true,
          batchScope: 'SHARED',
        },
      },
    });

    expect(config.fields.platformOrderNo.batchScope).toBe('ROW');
    expect(config.fields.wechatNickname.batchScope).toBe('SHARED');

    expect(() =>
      normalizeShareFormFieldConfig({
        ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
        fields: {
          ...DEFAULT_SHARE_FORM_FIELD_CONFIG.fields,
          wechatNickname: {
            visible: true,
            editable: true,
            required: true,
            batchScope: 'ROW',
          },
        },
      }),
    ).toThrow('字段 wechatNickname 不支持逐行填写');
  });

  it('forces hidden fields back to shared scope and defaults settlement to row in free mode', () => {
    const config = normalizeShareFormFieldConfig({
      ...DEFAULT_SHARE_FORM_FIELD_CONFIG,
      settlementAmount: { mode: 'FREE', options: [] },
      fields: {
        ...DEFAULT_SHARE_FORM_FIELD_CONFIG.fields,
        platformOrderNo: {
          visible: false,
          editable: false,
          required: false,
          batchScope: 'ROW',
        },
      },
    });

    expect(config.fields.platformOrderNo.batchScope).toBe('SHARED');
    expect(config.fields.submitterSettlementAmount.batchScope).toBe('ROW');
  });
});
