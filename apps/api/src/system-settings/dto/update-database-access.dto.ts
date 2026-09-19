import { IsBoolean } from 'class-validator';

export class UpdateDatabaseAccessDto {
  @IsBoolean()
  enabled!: boolean;
}
