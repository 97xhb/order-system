import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutMethodType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePublicPayoutMethodDto {
  @ApiProperty({ enum: PayoutMethodType })
  @IsEnum(PayoutMethodType)
  type!: PayoutMethodType;

  @ApiProperty({ example: '常用微信' })
  @IsString()
  @MaxLength(100)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  accountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accountValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankName?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
