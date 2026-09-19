import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicIdentityService } from '../public-forms/public-identity.service';
import {
  AdminPayoutQueryController,
  AdminPayoutRegistrationController,
  PublicPayoutQueryController,
  PublicPayoutRegistrationController,
} from './payout-registration.controller';
import { PayoutRegistrationService } from './payout-registration.service';
import {
  PayoutMethodsController,
  SubmittersController,
} from './submitters.controller';
import { SubmittersService } from './submitters.service';

@Module({
  imports: [AuthModule],
  controllers: [
    SubmittersController,
    PayoutMethodsController,
    AdminPayoutRegistrationController,
    AdminPayoutQueryController,
    PublicPayoutRegistrationController,
    PublicPayoutQueryController,
  ],
  providers: [
    SubmittersService,
    PayoutRegistrationService,
    PublicIdentityService,
  ],
  exports: [SubmittersService],
})
export class SubmittersModule {}
