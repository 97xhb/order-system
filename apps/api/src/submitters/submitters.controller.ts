import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import { CurrentAdmin } from '../auth/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { CreatePayoutMethodDto } from './dto/create-payout-method.dto';
import { CreateSubmitterDto } from './dto/create-submitter.dto';
import { UpdatePayoutMethodDto } from './dto/update-payout-method.dto';
import { UpdateSubmitterDto } from './dto/update-submitter.dto';
import { SubmittersService } from './submitters.service';

@ApiTags('admin-submitters')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/submitters')
export class SubmittersController {
  constructor(private readonly submitters: SubmittersService) {}

  @Get()
  @ApiOperation({ summary: '下单账号（下单人）和回款方式列表' })
  async list(@Query('includeDisabled') includeDisabled?: string) {
    return { items: await this.submitters.list(includeDisabled === 'true') };
  }

  @Post()
  @ApiOperation({ summary: '创建下单账号（下单人）' })
  create(
    @Body() dto: CreateSubmitterDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.submitters.create(dto, admin);
  }

  @Patch(':id')
  @ApiOperation({ summary: '修改下单账号（下单人）' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSubmitterDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.submitters.update(id, dto, admin);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除未使用的下单账号（下单人）' })
  remove(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.submitters.remove(id, admin);
  }

  @Post(':id/payout-methods')
  @ApiOperation({ summary: '给下单账号添加回款方式' })
  createPayoutMethod(
    @Param('id') id: string,
    @Body() dto: CreatePayoutMethodDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.submitters.createPayoutMethod(id, dto, admin);
  }
}

@ApiTags('admin-payout-methods')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/payout-methods')
export class PayoutMethodsController {
  constructor(private readonly submitters: SubmittersService) {}

  @Get(':id/account-value')
  @ApiOperation({ summary: '读取已加密保存的支付宝账号或银行卡号' })
  accountValue(@Param('id') id: string) {
    return this.submitters.getPayoutMethodAccountValue(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '修改下单人的回款方式资料或确认状态' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePayoutMethodDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.submitters.updatePayoutMethod(id, dto, admin);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除下单人的回款方式' })
  remove(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.submitters.removePayoutMethod(id, admin);
  }
}
