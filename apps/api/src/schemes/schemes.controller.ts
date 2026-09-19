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
import { CreateSchemeDto } from './dto/create-scheme.dto';
import { UpdateSchemeDto } from './dto/update-scheme.dto';
import { UpdateShareFormDto } from './dto/update-share-form.dto';
import { SchemesService } from './schemes.service';

@ApiTags('admin-schemes')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/schemes')
export class SchemesController {
  constructor(private readonly schemes: SchemesService) {}

  @Get()
  @ApiOperation({ summary: '下单方案及分享链接列表' })
  async list(@Query('includeDisabled') includeDisabled?: string) {
    return { items: await this.schemes.list(includeDisabled !== 'false') };
  }

  @Post()
  @ApiOperation({ summary: '创建方案并生成固定分享链接' })
  create(
    @Body() dto: CreateSchemeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.schemes.create(dto, admin);
  }

  @Patch(':id')
  @ApiOperation({ summary: '修改下单方案' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSchemeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.schemes.update(id, dto, admin);
  }

  @Patch(':id/share-form')
  @ApiOperation({ summary: '配置方案分享表单及外部权限' })
  updateShareForm(
    @Param('id') id: string,
    @Body() dto: UpdateShareFormDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.schemes.updateShareForm(id, dto, admin);
  }

  @Post(':id/share-form/regenerate-token')
  @ApiOperation({ summary: '重新生成分享 Token，旧链接立即失效' })
  regenerateToken(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.schemes.regenerateToken(id, admin);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除未被使用的下单方案' })
  remove(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.schemes.remove(id, admin);
  }
}
