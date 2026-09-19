import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewStatus, SettlementStatus, ShipmentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ORDER_SETTLEMENT_STATUSES } from '../order-statuses';

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  serialSort?: 'asc' | 'desc';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @ApiPropertyOptional({ description: '多个 UUID 使用英文逗号分隔' })
  @IsOptional()
  @IsString()
  platformIds?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  submitterIds?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryIds?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schemeIds?: string;

  @ApiPropertyOptional({ enum: ReviewStatus })
  @IsOptional()
  @IsEnum(ReviewStatus)
  reviewStatus?: ReviewStatus;

  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  shipmentStatus?: ShipmentStatus;

  @ApiPropertyOptional({ enum: ORDER_SETTLEMENT_STATUSES })
  @IsOptional()
  @IsIn(ORDER_SETTLEMENT_STATUSES)
  receivableStatus?: SettlementStatus;

  @ApiPropertyOptional({ enum: ORDER_SETTLEMENT_STATUSES })
  @IsOptional()
  @IsIn(ORDER_SETTLEMENT_STATUSES)
  submitterSettlementStatus?: SettlementStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  rebateScanned?: boolean;

  @ApiPropertyOptional({ description: '仅显示任一业务状态为异常的订单' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  exceptionOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  orderedFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  orderedTo?: string;
}
