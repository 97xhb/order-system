import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfitRuleScope } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateProfitRuleVersionDto {
  @ApiProperty({ example: '默认利润规则' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: ProfitRuleScope, example: ProfitRuleScope.GLOBAL })
  @IsEnum(ProfitRuleScope)
  scope!: ProfitRuleScope;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  schemeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      '支付方式 code，来自支付方式目录；scope 为 FUNDING_TYPE 时必填',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  fundingType?: string;

  @ApiProperty({
    example: {
      schemaVersion: 1,
      roundingScale: 2,
      terms: [
        { field: 'CUSTOMER_RECEIVED_AMOUNT', operation: 'ADD' },
        { field: 'SUBMITTER_SETTLEMENT_AMOUNT', operation: 'SUBTRACT' },
      ],
    },
  })
  @IsObject()
  definition!: object;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}
