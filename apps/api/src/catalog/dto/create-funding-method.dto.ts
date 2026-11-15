import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFundingMethodDto {
  @ApiProperty({ example: 'FRIEND_PAID' })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
  code!: string;

  @ApiProperty({ example: '朋友付款' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-100_000)
  @Max(100_000)
  sortOrder?: number;
}
