import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfitRulesController } from './profit-rules.controller';
import { ProfitRulesService } from './profit-rules.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfitRulesController],
  providers: [ProfitRulesService],
})
export class ProfitRulesModule {}
