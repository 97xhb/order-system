import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsObject } from 'class-validator';

export class CreatePublicOrdersBatchDto {
  @ApiProperty({
    type: [Object],
    description:
      '批量报单条目，单次最多 50 条。条目内部逐条校验，错误只影响该行，不会整批失败。',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsObject({ each: true })
  items!: Array<Record<string, unknown>>;
}
