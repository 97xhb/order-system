import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShareFormStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSchemeDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'iphone-16-128' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/)
  code?: string;

  @ApiProperty({ example: 'iPhone 16 128G 方案 A' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({
    description: '方案内容，支持多行',
    example: 'iPhone 16 128G * 1\n颜色：黑色',
  })
  @IsString()
  @MaxLength(200)
  productName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  defaultValues?: object;

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

  @ApiPropertyOptional({
    enum: ShareFormStatus,
    default: ShareFormStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(ShareFormStatus)
  shareFormStatus?: ShareFormStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  shareTitle?: string;
}
