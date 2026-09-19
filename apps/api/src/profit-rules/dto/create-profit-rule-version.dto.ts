import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FundingType, ProfitRuleScope } from '@prisma/client';
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

  @ApiPropertyOptional({ enum: FundingType })
  @IsOptional()
  @IsEnum(FundingType)
  fundingType?: FundingType;

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
