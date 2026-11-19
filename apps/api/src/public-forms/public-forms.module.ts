import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicFormsController } from './public-forms.controller';
import { PublicFormsService } from './public-forms.service';
import { PublicIdentityService } from './public-identity.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PublicFormsController],
  providers: [PublicFormsService, PublicIdentityService],
})
export class PublicFormsModule {}
