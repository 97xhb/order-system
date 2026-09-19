import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class LogisticsQueryDto {
  @IsOptional()
  @IsIn(['inbound', 'shipment'])
  kind?: 'inbound' | 'shipment';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  carrierCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  phoneSuffix?: string;
}

export class LogisticsTestDto {
  @IsString()
  @MaxLength(150)
  trackingNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  carrierCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  phoneSuffix?: string;
}
