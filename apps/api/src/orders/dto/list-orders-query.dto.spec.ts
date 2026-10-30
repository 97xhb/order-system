import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListOrdersQueryDto } from './list-orders-query.dto';

describe('ListOrdersQueryDto text color', () => {
  it.each(['NONE', '#2563EB'])('accepts %s', async (textColor) => {
    const errors = await validate(
      plainToInstance(ListOrdersQueryDto, { textColor }),
    );

    expect(errors.some((error) => error.property === 'textColor')).toBe(false);
  });
});

describe('ListOrdersQueryDto lightweight list flags', () => {
  it('converts query string booleans', () => {
    const query = plainToInstance(ListOrdersQueryDto, {
      includeOptions: 'false',
      includeSummary: 'false',
    });

    expect(query.includeOptions).toBe(false);
    expect(query.includeSummary).toBe(false);
  });
});
