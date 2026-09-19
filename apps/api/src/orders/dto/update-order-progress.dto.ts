import { ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementStatus, ShipmentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ORDER_SETTLEMENT_STATUSES } from '../order-statuses';

export class UpdateOrderProgressDto {
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
}
