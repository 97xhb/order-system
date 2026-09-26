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

export class VerifyAffiliateTokenDto {
  @ApiPropertyOptional({
    description: '待校验的 Authorization；省略时校验已保存的值',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  token?: string;

  @ApiPropertyOptional({
    description: '覆盖使用的接口地址；省略时使用已保存的地址或默认地址',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  apiBaseUrl?: string;
}
