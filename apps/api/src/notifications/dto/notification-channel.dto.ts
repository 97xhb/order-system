import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const NOTIFICATION_CHANNEL_TYPES = [
  'DINGTALK',
  'WECOM',
  'PUSHPLUS',
  'CUSTOM',
] as const;

export class CreateNotificationChannelDto {
  @ApiProperty({ description: '渠道名称，例如「运营群钉钉」' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiProperty({
    description: '渠道类型：DINGTALK 钉钉 / WECOM 企业微信 / PUSHPLUS PushPlus / CUSTOM 自定义 Webhook',
    enum: NOTIFICATION_CHANNEL_TYPES,
  })
  @IsIn(NOTIFICATION_CHANNEL_TYPES)
  type!: (typeof NOTIFICATION_CHANNEL_TYPES)[number];

  @ApiPropertyOptional({
    description: '推送地址；PushPlus 可留空，默认使用官方接口',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  endpoint?: string;

  @ApiPropertyOptional({
    description: '密钥：PushPlus 填 Token，钉钉可填加签密钥，自定义渠道填附加密钥',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  secret?: string;

  @ApiPropertyOptional({ description: '是否启用，默认启用' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateNotificationChannelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ enum: NOTIFICATION_CHANNEL_TYPES })
  @IsOptional()
  @IsIn(NOTIFICATION_CHANNEL_TYPES)
  type?: (typeof NOTIFICATION_CHANNEL_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  endpoint?: string;

  @ApiPropertyOptional({ description: '留空字符串表示清除密钥' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  secret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

