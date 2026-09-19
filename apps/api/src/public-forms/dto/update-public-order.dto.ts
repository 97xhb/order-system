import { PartialType } from '@nestjs/swagger';
import { CreatePublicOrderDto } from './create-public-order.dto';

export class UpdatePublicOrderDto extends PartialType(CreatePublicOrderDto) {}
