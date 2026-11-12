import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class AssignOrdersDto {
  @ApiProperty({ type: [String], description: '要加入或移出归档分组的订单 id' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  orderIds!: string[];
}
