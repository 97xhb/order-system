import { RootAccessMode, ThemeSurface } from '@prisma/client';
import {
  ArrayMaxSize,
  IsInt,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
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

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: '主题色必须是 #RRGGBB 格式' })
  themePrimary?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  themeRadiusChip?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  themeRadiusControl?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  themeRadiusCard?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  themeRadiusDialog?: number;

  @IsOptional()
  @IsEnum(ThemeSurface)
  themeSurface?: ThemeSurface;
}
