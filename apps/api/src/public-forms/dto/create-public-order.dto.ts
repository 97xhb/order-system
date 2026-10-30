import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DispatchStatus, FundingType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePublicOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  platformId!: string;

  @ApiProperty({ example: '微信昵称小黄牛' })
  @IsString()
  @MaxLength(100)
  wechatNickname!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'iPhone 16 128G * 1' })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  productName?: string;

  @ApiPropertyOptional({ example: '2026-08-14' })
  @IsOptional()
  @IsDateString()
  orderedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(800)
  platformOrderNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  inboundTrackingNo?: string;

  @ApiPropertyOptional({ enum: DispatchStatus })
  @IsOptional()
  @IsEnum(DispatchStatus)
  dispatchStatus?: DispatchStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  purchaseAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiverName?: string;

  @ApiPropertyOptional({ enum: FundingType })
  @IsOptional()
  @IsEnum(FundingType)
  fundingType?: FundingType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  orderAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  paymentDiscountAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  rebateScanned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  submitterSettlementAmount?: number;

  @ApiPropertyOptional({
    description: '金额字段的原始公式，例如 {"orderAmount":"=100+5"}',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  amountFormulas?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  notes?: string;
}
