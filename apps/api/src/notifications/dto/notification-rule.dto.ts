import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateNotificationRuleDto {
  @ApiPropertyOptional({ description: '是否开启该事件的通知' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: '通知标题模板，支持 {{变量}}',
    example: '新报单：{{submitter}} 提交了订单 {{orderNo}}',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleTemplate?: string;

  @ApiPropertyOptional({
    description: '通知正文模板，支持 {{变量}}',
    example: '报单人：{{submitter}}\n商品：{{product}}\n金额：{{amount}}',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  bodyTemplate?: string;

  @ApiPropertyOptional({
    description: '推送到哪些渠道；为空表示只进入站内通知中心',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  channelIds?: string[];
}

