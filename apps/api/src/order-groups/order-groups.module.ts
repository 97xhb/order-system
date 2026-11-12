import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrderGroupsController } from './order-groups.controller';
import { OrderGroupsService } from './order-groups.service';

@Module({
  imports: [AuthModule],
  controllers: [OrderGroupsController],
  providers: [OrderGroupsService],
  exports: [OrderGroupsService],
})
export class OrderGroupsModule {}
