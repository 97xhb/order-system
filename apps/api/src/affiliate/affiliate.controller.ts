import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { CurrentAdmin } from '../auth/current-admin.decorator';
import { AffiliateService } from './affiliate.service';
import { ConvertAffiliateLinkDto } from './dto/convert-affiliate-link.dto';
import { ListAffiliateConversionsDto } from './dto/list-affiliate-conversions.dto';
import { UpdateAffiliatePlatformDto } from './dto/update-affiliate-platform.dto';

@ApiTags('affiliate platforms')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/affiliate-platforms')
export class AffiliateController {
  constructor(private readonly affiliateService: AffiliateService) {}

  @Get()
  @ApiOperation({ summary: '查询返利平台接口及配置状态' })
  list() {
    return this.affiliateService.list();
  }

  @Get(':code/conversions')
  @ApiOperation({ summary: '分页查询指定返利接口的转换历史' })
  listConversions(
    @Param('code') code: string,
    @Query() query: ListAffiliateConversionsDto,
  ) {
    return this.affiliateService.listConversions(code, query);
  }

  @Patch(':code')
  @ApiOperation({ summary: '保存返利平台接口配置' })
  update(
    @Param('code') code: string,
    @Body() dto: UpdateAffiliatePlatformDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.affiliateService.update(code, dto, admin);
  }

  @Post(':code/convert')
  @ApiOperation({ summary: '使用指定返利接口转换商品链接' })
  convert(
    @Param('code') code: string,
    @Body() dto: ConvertAffiliateLinkDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.affiliateService.convert(code, dto, admin);
  }

  @Delete(':code/conversions/:id')
  @ApiOperation({ summary: '删除一条返利链接转换历史' })
  deleteConversion(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.affiliateService.deleteConversion(code, id, admin);
  }

  @Delete(':code/conversions')
  @ApiOperation({ summary: '清空指定返利接口的转换历史' })
  clearConversions(
    @Param('code') code: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.affiliateService.clearConversions(code, admin);
  }
}
