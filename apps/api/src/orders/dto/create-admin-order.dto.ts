import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FundingType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAdminOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  platformId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: '从账号库选择时传入' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiProperty({ example: '京东账号 138****8899' })
  @IsString()
  @MaxLength(100)
  accountName!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  schemeId?: string;

  @ApiProperty({ example: '2026-08-14' })
  @IsDateString()
  orderedAt!: string;

  @ApiProperty({ example: 'iPhone 16 128G' })
  @IsString()
  @MaxLength(200)
  productName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  schemeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  wechatNickname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  platformOrderNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  inboundTrackingNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  purchaseAddress?: string;

  @ApiProperty({ enum: FundingType })
  @IsEnum(FundingType)
  fundingType!: FundingType;

  @ApiPropertyOptional({ description: '支付方式选择“其他”时填写的具体说明' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fundingTypeOther?: string;

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
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  submitterSettlementAmount?: number;

  @ApiPropertyOptional({ description: '选择扫码后填写的原始扫码金额' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  scanAmount?: number;

  @ApiPropertyOptional({
    description: '实际扫码返利，由扫码金额乘以 0.9 计算；保留用于兼容旧客户端',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  platformRebateAmount?: number;

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
  saleAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  shippingCostAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  serviceFeeAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  otherIncomeAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  otherCostAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(1_000_000_000_000)
  profitAdjustment?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  profitAdjustmentReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  notes?: string;
}
