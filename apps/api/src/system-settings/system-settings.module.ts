import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminSystemSettingsController,
  PublicSystemSettingsController,
} from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';
import { RuntimeControlService } from './runtime-control.service';
import { BackupService } from './backup.service';
import { UpdateService } from './update.service';

@Module({
  imports: [AuthModule],
  controllers: [PublicSystemSettingsController, AdminSystemSettingsController],
  providers: [
    SystemSettingsService,
    RuntimeControlService,
    BackupService,
    UpdateService,
  ],
  exports: [
    SystemSettingsService,
    RuntimeControlService,
    BackupService,
    UpdateService,
  ],
})
export class SystemSettingsModule {}
