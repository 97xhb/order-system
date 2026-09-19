import { IsString, MaxLength, MinLength } from 'class-validator';

export class RenameAdminSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  deviceName!: string;
}
