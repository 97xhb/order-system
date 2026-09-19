import { Module } from '@nestjs/common';
import { PublicFormsController } from './public-forms.controller';
import { PublicFormsService } from './public-forms.service';
import { PublicIdentityService } from './public-identity.service';

@Module({
  controllers: [PublicFormsController],
  providers: [PublicFormsService, PublicIdentityService],
})
export class PublicFormsModule {}
