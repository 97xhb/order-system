import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import {
  CurrentAdmin,
  CurrentAdminSessionId,
} from '../auth/current-admin.decorator';
import { RATE_LIMIT_WINDOW_MS } from '../security/rate-limit.constants';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { RenameAdminSessionDto } from './dto/rename-admin-session.dto';
import { UpdateDatabaseAccessDto } from './dto/update-database-access.dto';
import { ListSystemAuditLogsDto } from './dto/list-system-audit-logs.dto';
import {
  BackupPayloadDto,
  ExportBackupDto,
  RestoreBackupDto,
} from './dto/backup.dto';
import { RuntimeControlService } from './runtime-control.service';
import { SystemSettingsService } from './system-settings.service';
import { BackupService } from './backup.service';

@ApiTags('system')
@Controller('system')
export class PublicSystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get('public-settings')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @ApiOperation({ summary: '获取公开系统名称及当前访问状态' })
  getPublicSettings(@Req() request: Request) {
    return this.systemSettingsService.getPublicSettings(request);
  }

  @Post('admin-entry')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Throttle({ default: { limit: 20, ttl: RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({ summary: '验证后台安全入口并写入入口授权' })
  grantAdminEntry(
    @Body('entry') entry: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.systemSettingsService.grantAdminEntry(entry, request, response);
  }
}

@ApiTags('admin-system')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/system')
export class AdminSystemSettingsController {
  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly runtimeControlService: RuntimeControlService,
    private readonly backupService: BackupService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: '获取系统设置、运行状态与访问安全信息' })
  getSettings(
    @Req() request: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @CurrentAdminSessionId() currentSessionId: string,
  ) {
    return this.systemSettingsService.getAdminSettings(
      request,
      currentSessionId,
      admin.id,
    );
  }

  @Get('audit-logs')
  @ApiOperation({ summary: '分页查询系统操作日志' })
  listAuditLogs(@Query() query: ListSystemAuditLogsDto) {
    return this.systemSettingsService.listAuditLogs(query);
  }

  @Delete('audit-logs')
  @ApiOperation({ summary: '清空系统操作日志并保留本次清空记录' })
  clearAuditLogs(
    @Req() request: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.systemSettingsService.clearAuditLogs(
      admin,
      this.systemSettingsService.getRequestMetadata(request),
    );
  }

  @Get('backups/export')
  @ApiOperation({ summary: '导出完整加密数据备份' })
  async exportBackup(@Res() response: Response) {
    const buffer = await this.backupService.exportBackup();
    const stamp = new Date().toISOString().replace(/[.:]/g, '-');
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="order-system-backup-${stamp}.osbackup"`,
    );
    response.setHeader('Content-Length', String(buffer.length));
    response.send(buffer);
  }

  @Get('backups/options')
  @ApiOperation({ summary: '获取可选择的数据备份分类' })
  getBackupOptions() {
    return this.backupService.getOptions();
  }

  @Post('backups/export')
  @ApiOperation({ summary: '按所选分类导出加密数据备份' })
  async exportSelectedBackup(
    @Body() dto: ExportBackupDto,
    @Res() response: Response,
  ) {
    const result = await this.backupService.exportBackup(dto.categories);
    const stamp = new Date().toISOString().replace(/[.:]/g, '-');
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="order-system-backup-${result.scope.toLowerCase()}-${stamp}.osbackup"`,
    );
    response.setHeader('Content-Length', String(result.buffer.length));
    response.send(result.buffer);
  }

  @Post('backups/inspect')
  @ApiOperation({ summary: '检查加密备份文件' })
  inspectBackup(@Body() dto: BackupPayloadDto) {
    return this.backupService.inspect(dto.backup);
  }

  @Post('backups/restore')
  @HttpCode(200)
  @ApiOperation({ summary: '恢复完整加密数据备份' })
  restoreBackup(
    @Body() dto: RestoreBackupDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.backupService.restore(
      dto.backup,
      dto.password,
      dto.confirmation,
      admin,
    );
  }

  @Patch('settings')
  @ApiOperation({ summary: '更新系统名称、品牌标识及外网访问设置' })
  async updateSettings(
    @Body() dto: UpdateSystemSettingsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const result = await this.systemSettingsService.updateSettings(
      dto,
      admin,
      this.systemSettingsService.getRequestMetadata(request),
    );
    if (result.adminEntryPath) {
      this.systemSettingsService.writeAdminEntryCookie(
        request,
        response,
        result.adminEntryPath,
      );
    }
    return result;
  }

  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: '注销指定管理员会话' })
  revokeSession(
    @Param('sessionId') sessionId: string,
    @Req() request: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @CurrentAdminSessionId() currentSessionId: string,
  ) {
    return this.systemSettingsService.revokeSession(
      sessionId,
      currentSessionId,
      admin,
      this.systemSettingsService.getRequestMetadata(request),
    );
  }

  @Patch('sessions/:sessionId/name')
  @ApiOperation({ summary: '修改管理员登录设备名称' })
  renameSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: RenameAdminSessionDto,
    @Req() request: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.systemSettingsService.renameSession(
      sessionId,
      dto.deviceName,
      admin,
      this.systemSettingsService.getRequestMetadata(request),
    );
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  @ApiOperation({ summary: '注销当前管理员的其他登录会话' })
  revokeOtherSessions(
    @Req() request: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @CurrentAdminSessionId() currentSessionId: string,
  ) {
    return this.systemSettingsService.revokeOtherSessions(
      currentSessionId,
      admin,
      this.systemSettingsService.getRequestMetadata(request),
    );
  }

  @Patch('runtime/database')
  @ApiOperation({ summary: '开启或暂停业务数据库访问' })
  updateDatabaseAccess(
    @Body() dto: UpdateDatabaseAccessDto,
    @Req() request: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.runtimeControlService.setDatabaseAccess(
      dto.enabled,
      admin,
      this.systemSettingsService.getRequestMetadata(request),
    );
  }

  @Post('runtime/api/restart')
  @HttpCode(202)
  @ApiOperation({ summary: '重启当前 API 进程' })
  restartApi(
    @Req() request: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.runtimeControlService.scheduleApiRestart(
      admin,
      this.systemSettingsService.getRequestMetadata(request),
    );
  }

  @Post('runtime/web/restart')
  @HttpCode(202)
  @ApiOperation({ summary: '重启当前 Web 面板服务' })
  restartWeb(
    @Req() request: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.runtimeControlService.scheduleWebRestart(
      admin,
      this.systemSettingsService.getRequestMetadata(request),
    );
  }
}
