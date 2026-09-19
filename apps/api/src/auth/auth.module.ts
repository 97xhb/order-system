import { Module } from '@nestjs/common';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminSessionGuard } from './admin-session.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AdminSessionGuard, AdminBootstrapService],
  exports: [AuthService, AdminSessionGuard],
})
export class AuthModule {}
