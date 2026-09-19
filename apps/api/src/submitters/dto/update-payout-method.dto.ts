import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutMethodStatus, PayoutMethodType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdatePayoutMethodDto {
  @ApiPropertyOptional({ enum: PayoutMethodType })
  @IsOptional()
  @IsEnum(PayoutMethodType)
  type?: PayoutMethodType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  accountName?: string;

  @ApiPropertyOptional({ description: '留空表示不修改现有账号' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accountValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ enum: PayoutMethodStatus })
  @IsOptional()
  @IsEnum(PayoutMethodStatus)
  status?: PayoutMethodStatus;
}
