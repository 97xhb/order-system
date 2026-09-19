import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminSystemSettingsController,
  PublicSystemSettingsController,
} from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';
import { RuntimeControlService } from './runtime-control.service';
import { BackupService } from './backup.service';

@Module({
  imports: [AuthModule],
  controllers: [PublicSystemSettingsController, AdminSystemSettingsController],
  providers: [SystemSettingsService, RuntimeControlService, BackupService],
  exports: [SystemSettingsService, RuntimeControlService, BackupService],
})
export class SystemSettingsModule {}
