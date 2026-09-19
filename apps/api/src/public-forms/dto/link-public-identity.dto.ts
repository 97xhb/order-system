import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

export class LinkPublicIdentityDto {
  @ApiProperty({ example: 'WX-8F2K7M9P4Q' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]{2,50}$/, { message: '识别码格式不正确' })
  identityCode!: string;
}
