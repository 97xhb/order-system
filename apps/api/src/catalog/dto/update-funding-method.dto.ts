import { PartialType } from '@nestjs/swagger';
import { CreateFundingMethodDto } from './create-funding-method.dto';

export class UpdateFundingMethodDto extends PartialType(
  CreateFundingMethodDto,
) {}
