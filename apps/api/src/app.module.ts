import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AffiliateModule } from './affiliate/affiliate.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfitRulesModule } from './profit-rules/profit-rules.module';
import { PublicFormsModule } from './public-forms/public-forms.module';
import { SchemesModule } from './schemes/schemes.module';
import {
  API_RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from './security/rate-limit.constants';
import { SubmittersModule } from './submitters/submitters.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { LogisticsModule } from './logistics/logistics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: RATE_LIMIT_WINDOW_MS,
          limit: API_RATE_LIMIT_REQUESTS,
        },
      ],
      errorMessage: '请求过于频繁，请稍后再试',
    }),
    PrismaModule,
    AffiliateModule,
    AuthModule,
    CatalogModule,
    OrdersModule,
    ProfitRulesModule,
    PublicFormsModule,
    SchemesModule,
    SubmittersModule,
    SystemSettingsModule,
    LogisticsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
