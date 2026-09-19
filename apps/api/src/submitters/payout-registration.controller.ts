import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import { CurrentAdmin } from '../auth/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { PublicIdentityService } from '../public-forms/public-identity.service';
import { RATE_LIMIT_WINDOW_MS } from '../security/rate-limit.constants';
import { CreatePublicPayoutRegistrationDto } from './dto/create-public-payout-registration.dto';
import { LookupPayoutHistoryDto } from './dto/lookup-payout-history.dto';
import { UpdatePayoutQueryFormDto } from './dto/update-payout-query-form.dto';
import { UpdatePayoutRegistrationFormDto } from './dto/update-payout-registration-form.dto';
import { PayoutRegistrationService } from './payout-registration.service';

@ApiTags('admin-payout-registration')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/payout-registration')
export class AdminPayoutRegistrationController {
  constructor(private readonly registrations: PayoutRegistrationService) {}

  @Get()
  @ApiOperation({ summary: '获取回款资料固定分享链接和填写开关' })
  getForm() {
    return this.registrations.getAdminForm();
  }

  @Patch()
  @ApiOperation({ summary: '打开或关闭回款资料分享填写权限' })
  updateForm(
    @Body() dto: UpdatePayoutRegistrationFormDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.registrations.updateEnabled(dto.enabled, admin);
  }
}

@ApiTags('admin-payout-query')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/payout-query')
export class AdminPayoutQueryController {
  constructor(private readonly registrations: PayoutRegistrationService) {}

  @Get()
  @ApiOperation({ summary: '获取订单查询固定链接和查询开关' })
  getForm() {
    return this.registrations.getAdminLookupForm();
  }

  @Patch()
  @ApiOperation({ summary: '更新下单人订单查询开关和可见字段' })
  updateForm(
    @Body() dto: UpdatePayoutQueryFormDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.registrations.updateLookupSettings(dto, admin);
  }
}

@ApiTags('public-payout-registration')
@Controller('public/payout-registration')
export class PublicPayoutRegistrationController {
  constructor(
    private readonly registrations: PayoutRegistrationService,
    private readonly identities: PublicIdentityService,
  ) {}

  private metadata(request: Request) {
    return {
      ipAddress: request.ip?.slice(0, 64),
      userAgent: request.get('user-agent')?.slice(0, 2_000),
    };
  }

  @Get(':token')
  @Throttle({ default: { limit: 60, ttl: RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({ summary: '打开回款资料填写链接并建立微信设备身份' })
  async describe(
    @Param('token') token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.registrations.ensureExists(token);
    const identity = await this.identities.resolve(request, response);
    return this.registrations.describe(token, identity);
  }

  @Post(':token')
  @Throttle({ default: { limit: 20, ttl: RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({ summary: '下单人提交微信昵称和多种回款方式' })
  async submit(
    @Param('token') token: string,
    @Body() dto: CreatePublicPayoutRegistrationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.registrations.ensureAvailable(token);
    const identity = await this.identities.resolve(request, response);
    return this.registrations.submit(
      token,
      identity,
      dto,
      this.metadata(request),
    );
  }
}

@ApiTags('public-payout-query')
@Controller('public/payout-query')
export class PublicPayoutQueryController {
  constructor(
    private readonly registrations: PayoutRegistrationService,
    private readonly identities: PublicIdentityService,
  ) {}

  private metadata(request: Request) {
    return {
      ipAddress: request.ip?.slice(0, 64),
      userAgent: request.get('user-agent')?.slice(0, 2_000),
    };
  }

  @Get(':token')
  @Throttle({ default: { limit: 60, ttl: RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({ summary: '打开独立订单查询链接并识别当前设备' })
  async describe(
    @Param('token') token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = await this.identities.resolve(request, response);
    return this.registrations.describeLookup(token, identity);
  }

  @Post(':token/lookup')
  @Throttle({ default: { limit: 20, ttl: RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({ summary: '通过下单人唯一识别码查询回款资料和历史订单' })
  async lookup(
    @Param('token') token: string,
    @Body() dto: LookupPayoutHistoryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = await this.identities.resolve(request, response);
    return this.registrations.lookup(
      token,
      identity,
      dto,
      this.metadata(request),
    );
  }
}
