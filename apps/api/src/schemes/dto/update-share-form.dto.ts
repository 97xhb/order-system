import { ApiPropertyOptional } from '@nestjs/swagger';
import { ShareFormStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateShareFormDto {
  @ApiPropertyOptional({ enum: ShareFormStatus })
  @IsOptional()
  @IsEnum(ShareFormStatus)
  status?: ShareFormStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  fieldConfig?: object;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowEditBeforeApproval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowDeleteBeforeApproval?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  submissionLimit?: number | null;
}
