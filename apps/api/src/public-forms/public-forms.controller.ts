import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { RATE_LIMIT_WINDOW_MS } from '../security/rate-limit.constants';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { CreatePublicPayoutMethodDto } from './dto/create-public-payout-method.dto';
import { LinkPublicIdentityDto } from './dto/link-public-identity.dto';
import { UpdatePublicOrderDto } from './dto/update-public-order.dto';
import { PublicFormsService } from './public-forms.service';
import { PublicIdentityService } from './public-identity.service';

@ApiTags('public-forms')
@Controller('public/forms')
export class PublicFormsController {
  constructor(
    private readonly forms: PublicFormsService,
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
  @ApiOperation({ summary: '打开分享链接并建立微信设备身份' })
  async describe(
    @Param('token') token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.forms.ensureForm(token, true);
    const identity = await this.identities.resolve(request, response);
    return this.forms.describe(token, identity);
  }

  @Post(':token/identity/link')
  @Throttle({ default: { limit: 10, ttl: RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({ summary: '通过唯一识别码重新关联报单设备身份' })
  async linkIdentity(
    @Param('token') token: string,
    @Body() dto: LinkPublicIdentityDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.forms.ensureForm(token, true);
    const identity = await this.identities.resolve(request, response);
    const linkedIdentity = await this.identities.linkToSubmitterCode(
      identity,
      dto.identityCode,
      this.metadata(request),
    );
    return this.forms.describe(token, linkedIdentity);
  }

  @Post(':token/orders')
  @Throttle({ default: { limit: 20, ttl: RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({ summary: '通过方案分享链接提交待确认订单' })
  async createOrder(
    @Param('token') token: string,
    @Body() dto: CreatePublicOrderDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.forms.ensureForm(token, true);
    const identity = await this.identities.resolve(request, response);
    return this.forms.createOrder(token, identity, dto, this.metadata(request));
  }

  @Get(':token/orders/mine')
  @ApiOperation({ summary: '查看当前微信设备在该方案下的登记' })
  async listMine(
    @Param('token') token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.forms.ensureForm(token, false);
    const identity = await this.identities.resolve(request, response);
    return { items: await this.forms.listMine(token, identity) };
  }

  @Patch(':token/orders/:orderId')
  @Throttle({ default: { limit: 30, ttl: RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({ summary: '确认前修改当前身份提交的订单' })
  async updateMine(
    @Param('token') token: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpdatePublicOrderDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.forms.ensureForm(token, false);
    const identity = await this.identities.resolve(request, response);
    return this.forms.updateMine(
      token,
      orderId,
      identity,
      dto,
      this.metadata(request),
    );
  }

  @Delete(':token/orders/:orderId')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({ summary: '确认前删除当前身份提交的订单' })
  async deleteMine(
    @Param('token') token: string,
    @Param('orderId') orderId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.forms.ensureForm(token, false);
    const identity = await this.identities.resolve(request, response);
    return this.forms.deleteMine(
      token,
      orderId,
      identity,
      this.metadata(request),
    );
  }

  @Post(':token/payout-methods')
  @Throttle({ default: { limit: 20, ttl: RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({ summary: '下单人登记长期使用的收款方式' })
  async createPayoutMethod(
    @Param('token') token: string,
    @Body() dto: CreatePublicPayoutMethodDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.forms.ensureForm(token, true);
    const identity = await this.identities.resolve(request, response);
    return this.forms.createPayoutMethod(
      token,
      identity,
      dto,
      this.metadata(request),
    );
  }

  @Delete(':token/payout-methods/:methodId')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({ summary: '删除本人尚未审核的收款方式' })
  async deletePayoutMethod(
    @Param('token') token: string,
    @Param('methodId') methodId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.forms.ensureForm(token, false);
    const identity = await this.identities.resolve(request, response);
    return this.forms.deletePayoutMethod(
      token,
      methodId,
      identity,
      this.metadata(request),
    );
  }
}
