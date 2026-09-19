import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { MIN_ADMIN_PASSWORD_LENGTH } from '../auth.constants';

export class ChangePasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @Length(1, 200)
  currentPassword!: string;

  @ApiProperty({
    format: 'password',
    minLength: MIN_ADMIN_PASSWORD_LENGTH,
  })
  @IsString()
  @Length(MIN_ADMIN_PASSWORD_LENGTH, 200)
  newPassword!: string;
}
