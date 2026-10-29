import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  DispatchStatus,
  SettlementStatus,
  ShipmentStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';
import { ORDER_SETTLEMENT_STATUSES } from '../order-statuses';

export class UpdateOrderProgressDto {
  @ApiPropertyOptional({ description: '寄件运单号，传空字符串表示清空' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  shipmentTrackingNo?: string;

  @ApiPropertyOptional({ enum: DispatchStatus })
  @IsOptional()
  @IsEnum(DispatchStatus)
  dispatchStatus?: DispatchStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiverName?: string;

  @ApiPropertyOptional({ example: '#2563EB', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  textColor?: string | null;

  @ApiPropertyOptional({ description: '下单金额' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  orderAmount?: number;

  @ApiPropertyOptional({ description: '寄件单号，传空字符串表示清空' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  inboundTrackingNo?: string;

  @ApiPropertyOptional({ description: '下单地址，传空字符串表示清空' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  purchaseAddress?: string;

  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  shipmentStatus?: ShipmentStatus;

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
  customerReceivedAmount?: number;

  @ApiPropertyOptional({ enum: ORDER_SETTLEMENT_STATUSES })
  @IsOptional()
  @IsIn(ORDER_SETTLEMENT_STATUSES)
  receivableStatus?: SettlementStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  submitterSettlementAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  submitterPaidAmount?: number;

  @ApiPropertyOptional({ enum: ORDER_SETTLEMENT_STATUSES })
  @IsOptional()
  @IsIn(ORDER_SETTLEMENT_STATUSES)
  submitterSettlementStatus?: SettlementStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;

  @ApiPropertyOptional({
    description: '金额字段的原始公式，例如 {"orderAmount":"=100+5"}',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  amountFormulas?: Record<string, string>;
}
