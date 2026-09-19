import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @Length(1, 64)
  username!: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @Length(1, 200)
  password!: string;
}
