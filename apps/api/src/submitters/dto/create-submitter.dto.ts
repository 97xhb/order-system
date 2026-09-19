import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubmitterStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSubmitterDto {
  @ApiProperty({ example: '微信昵称小黄牛' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: '小张' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  wechatId?: string;

  @ApiPropertyOptional({ enum: SubmitterStatus })
  @IsOptional()
  @IsEnum(SubmitterStatus)
  status?: SubmitterStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}
