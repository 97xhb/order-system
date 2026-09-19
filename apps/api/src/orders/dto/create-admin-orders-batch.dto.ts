import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateAdminOrderDto } from './create-admin-order.dto';

export class CreateAdminOrdersBatchDto {
  @ApiProperty({ type: [CreateAdminOrderDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateAdminOrderDto)
  orders!: CreateAdminOrderDto[];
}
