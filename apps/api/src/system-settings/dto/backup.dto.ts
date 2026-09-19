import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const BACKUP_SELECTION_VALUES = [
  'all',
  'orders',
  'submitters',
  'catalog',
  'integrationConfig',
  'affiliateHistory',
  'system',
  'auditLogs',
] as const;

export type BackupSelection = (typeof BACKUP_SELECTION_VALUES)[number];

export class ExportBackupDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(BACKUP_SELECTION_VALUES, { each: true })
  categories!: BackupSelection[];
}

export class BackupPayloadDto {
  @IsString()
  @MinLength(32)
  @MaxLength(150_000_000)
  backup!: string;
}

export class RestoreBackupDto extends BackupPayloadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(20)
  confirmation!: string;
}
