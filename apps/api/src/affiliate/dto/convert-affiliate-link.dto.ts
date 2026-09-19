import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConvertAffiliateLinkDto {
  @ApiProperty({
    description: '商品链接，或包含商品链接的整段分享文本',
    example: 'https://item.example.com/goods/10001',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  content!: string;
}
