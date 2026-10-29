import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSchemeDto } from './create-scheme.dto';
import { UpdateSchemeDto } from './update-scheme.dto';

describe('scheme content limits', () => {
  it('accepts up to 5000 characters for create and update', async () => {
    const productName = '方'.repeat(5_000);
    const createErrors = await validate(
      plainToInstance(CreateSchemeDto, {
        name: '测试方案',
        productName,
      }),
    );
    const updateErrors = await validate(
      plainToInstance(UpdateSchemeDto, { productName }),
    );

    expect(createErrors.some((error) => error.property === 'productName')).toBe(
      false,
    );
    expect(updateErrors.some((error) => error.property === 'productName')).toBe(
      false,
    );
  });

  it('rejects more than 5000 plain-text characters', async () => {
    const productName = '方'.repeat(5_001);
    const createErrors = await validate(
      plainToInstance(CreateSchemeDto, {
        name: '测试方案',
        productName,
      }),
    );

    expect(createErrors.some((error) => error.property === 'productName')).toBe(
      true,
    );
  });

  it('accepts sanitized rich HTML separately from plain text', async () => {
    const errors = await validate(
      plainToInstance(CreateSchemeDto, {
        name: '测试方案',
        productName: '红色大字',
        productNameHtml:
          '<p><strong>红色</strong><span style="color:#d92d20">大字</span></p>',
      }),
    );

    expect(errors.some((error) => error.property === 'productNameHtml')).toBe(
      false,
    );
  });
});
