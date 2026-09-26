import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RefreshAffiliateTokenDto {
  @ApiPropertyOptional({
    description: '在线获取 Authorization 的接口地址，省略时使用已保存的地址',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  endpoint?: string;
}
