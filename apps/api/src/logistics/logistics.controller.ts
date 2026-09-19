import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { CurrentAdmin } from '../auth/current-admin.decorator';
import { LogisticsQueryDto, LogisticsTestDto } from './dto/logistics-query.dto';
import { UpdateLogisticsSettingsDto } from './dto/update-logistics-settings.dto';
import { LogisticsService } from './logistics.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@ApiTags('admin-logistics')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/logistics')
export class LogisticsController {
  constructor(
    private readonly logisticsService: LogisticsService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: '获取 ApiZero 快递查询配置' })
  getSettings() {
    return this.logisticsService.getSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: '保存 ApiZero 快递查询配置' })
  updateSettings(
    @Body() dto: UpdateLogisticsSettingsDto,
    @Req() request: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.logisticsService.updateSettings(
      dto,
      admin,
      this.systemSettingsService.getRequestMetadata(request),
    );
  }

  @Post('test')
  @ApiOperation({ summary: '测试 ApiZero 快递查询' })
  test(@Body() dto: LogisticsTestDto) {
    return this.logisticsService.test(dto.trackingNo, dto.phoneSuffix);
  }

  @Post('orders/:orderId/query')
  @ApiOperation({ summary: '查询订单运单轨迹' })
  queryOrder(
    @Param('orderId') orderId: string,
    @Body() dto: LogisticsQueryDto,
    @Req() request: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.logisticsService.queryOrder(
      orderId,
      dto,
      admin,
      this.systemSettingsService.getRequestMetadata(request),
    );
  }
}
