import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdatePayoutQueryFormDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description:
      '允许下单人查看的订单列表字段；字段选项由订单列表动态提供，传空数组表示不显示任何字段',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  visibleFields?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      '后台锁定为专用字段的订单列；锁定后不会出现在下单人的查询页面，可随时解锁。',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  lockedFields?: string[];
}
