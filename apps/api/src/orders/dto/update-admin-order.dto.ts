import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { SettlementStatus, ShipmentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ORDER_SETTLEMENT_STATUSES } from '../order-statuses';
import { CreateAdminOrderDto } from './create-admin-order.dto';

export class UpdateAdminOrderDto extends OmitType(
  PartialType(CreateAdminOrderDto),
  ['accountId', 'categoryId', 'schemeId'] as const,
) {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  accountId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  schemeId?: string | null;

  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  shipmentStatus?: ShipmentStatus;

  @ApiPropertyOptional({ description: '寄件运单号，传空字符串表示清空' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  shipmentTrackingNo?: string;

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
