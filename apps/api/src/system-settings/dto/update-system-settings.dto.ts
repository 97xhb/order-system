import { RootAccessMode } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateSystemSettingsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  systemName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4)
  brandMarkText!: string;

  @IsBoolean()
  externalAccessEnabled!: boolean;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  allowedHosts!: string[];

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(12)
  adminEntryPath?: string | null;

  @IsEnum(RootAccessMode)
  rootAccessMode!: RootAccessMode;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  rootRedirectUrl?: string | null;
}
