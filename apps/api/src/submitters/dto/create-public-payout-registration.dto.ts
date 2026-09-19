import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutMethodType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PublicPayoutRegistrationMethodDto {
  @ApiProperty({
    enum: [
      PayoutMethodType.WECHAT,
      PayoutMethodType.ALIPAY,
      PayoutMethodType.BANK_CARD,
    ],
  })
  @IsIn([
    PayoutMethodType.WECHAT,
    PayoutMethodType.ALIPAY,
    PayoutMethodType.BANK_CARD,
  ])
  type!: PayoutMethodType;

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
}

export class CreatePublicPayoutRegistrationDto {
  @ApiProperty({ example: '微信昵称' })
  @IsString()
  @MaxLength(100)
  nickname!: string;

  @ApiProperty({ type: [PublicPayoutRegistrationMethodDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique((method: PublicPayoutRegistrationMethodDto) => method.type)
  @ValidateNested({ each: true })
  @Type(() => PublicPayoutRegistrationMethodDto)
  methods!: PublicPayoutRegistrationMethodDto[];
}
