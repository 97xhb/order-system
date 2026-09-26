import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LihuaXiongAffiliateAdapter } from './adapters/lihuaxiong.adapter';
import { YouzaiAssistantAffiliateAdapter } from './adapters/youzai.adapter';
import { AffiliateController } from './affiliate.controller';
import { AffiliateService } from './affiliate.service';

@Module({
  imports: [AuthModule],
  controllers: [AffiliateController],
  providers: [
    AffiliateService,
    LihuaXiongAffiliateAdapter,
    YouzaiAssistantAffiliateAdapter,
  ],
})
export class AffiliateModule {}
