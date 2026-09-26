import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AffiliateCredentialsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  apiSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  accessToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  promotionId?: string;
}

export class UpdateAffiliatePlatformDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  apiBaseUrl?: string;

  @ApiPropertyOptional({
    description: '梨花熊请求设备类型，PC 端使用 pcweb，APP 端使用 web',
    example: 'pcweb',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  device?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;

  @ApiPropertyOptional({
    description:
      '在线获取 Authorization 的接口地址，返回值或 data.token 会回填输入框',
    example: 'https://example.com/api/youzai-token',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  tokenEndpoint?: string;

  @ApiPropertyOptional({ type: AffiliateCredentialsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AffiliateCredentialsDto)
  credentials?: AffiliateCredentialsDto;
}
