import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutMethodStatus, PayoutMethodType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePayoutMethodDto {
  @ApiProperty({ enum: PayoutMethodType })
  @IsEnum(PayoutMethodType)
  type!: PayoutMethodType;

  @ApiPropertyOptional({ example: '支付宝' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  accountName?: string;

  @ApiPropertyOptional({ description: '账号、卡号或其他收款标识，入库前加密' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accountValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankName?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ enum: PayoutMethodStatus })
  @IsOptional()
  @IsEnum(PayoutMethodStatus)
  status?: PayoutMethodStatus;
}
