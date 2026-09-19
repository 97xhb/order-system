import {
  normalizePayoutQueryFields,
  normalizePayoutQueryLockedFields,
  publicPayoutQueryFieldOptions,
  type PayoutQueryFieldOption,
} from './payout-query-fields';

describe('payout query field permissions', () => {
  const options: PayoutQueryFieldOption[] = [
    {
      key: 'orderAmount',
      orderColumnKey: 'orderAmount',
      label: 'Order amount',
      description: '',
      defaultVisible: true,
      publicAllowed: true,
    },
    {
      key: 'notes',
      orderColumnKey: 'notes',
      label: 'Notes',
      description: '',
      defaultVisible: false,
      publicAllowed: true,
      sensitive: true,
    },
    {
      key: 'custom:internal',
      orderColumnKey: 'custom:internal',
      label: 'Internal custom field',
      description: '',
      defaultVisible: false,
      publicAllowed: false,
      customFieldId: 'internal',
    },
  ];

  it('uses sensitive and legacy private fields only as the initial lock state', () => {
    expect(normalizePayoutQueryLockedFields(undefined, options)).toEqual([
      'notes',
      'custom:internal',
    ]);
    expect(normalizePayoutQueryLockedFields([], options)).toEqual([]);
  });

  it('lets an explicit unlocked configuration expose every field', () => {
    expect(
      normalizePayoutQueryFields(
        ['orderAmount', 'notes', 'custom:internal'],
        options,
        [],
      ),
    ).toEqual(['orderAmount', 'notes', 'custom:internal']);
    expect(publicPayoutQueryFieldOptions(options, [])).toHaveLength(3);
  });

  it('removes locked fields from both selected and public options', () => {
    const locked = ['notes'];
    expect(
      normalizePayoutQueryFields(['orderAmount', 'notes'], options, locked),
    ).toEqual(['orderAmount']);
    expect(
      publicPayoutQueryFieldOptions(options, locked).map((field) => field.key),
    ).toEqual(['orderAmount', 'custom:internal']);
  });
});
