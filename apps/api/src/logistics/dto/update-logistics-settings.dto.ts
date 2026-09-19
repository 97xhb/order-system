import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateLogisticsSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  endpoint?: string;
}
