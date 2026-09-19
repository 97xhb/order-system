import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePayoutRegistrationFormDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
