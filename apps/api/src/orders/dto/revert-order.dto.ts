import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RevertOrderDto {
  @ApiPropertyOptional({ description: '退回说明，会记录在订单备注与审计日志里' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;
}
