import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import { CurrentAdmin } from '../auth/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { CatalogService } from './catalog.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';

@ApiTags('admin catalog')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  private includeDisabled(value?: string) {
    return value === 'true' || value === '1';
  }

  @Get('platforms')
  @ApiOperation({ summary: '查询下单平台' })
  async listPlatforms(@Query('includeDisabled') includeDisabled?: string) {
    return {
      items: await this.catalogService.listPlatforms(
        this.includeDisabled(includeDisabled),
      ),
    };
  }

  @Post('platforms')
  @ApiOperation({ summary: '新增下单平台' })
  createPlatform(
    @Body() dto: CreatePlatformDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.catalogService.createPlatform(dto, admin);
  }

  @Patch('platforms/:id')
  @ApiOperation({ summary: '修改或停用下单平台' })
  updatePlatform(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.catalogService.updatePlatform(id, dto, admin);
  }

  @Delete('platforms/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除未被使用的下单平台' })
  deletePlatform(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.catalogService.deletePlatform(id, admin);
  }

  @Get('categories')
  @ApiOperation({ summary: '查询下单品类' })
  async listCategories(@Query('includeDisabled') includeDisabled?: string) {
    return {
      items: await this.catalogService.listCategories(
        this.includeDisabled(includeDisabled),
      ),
    };
  }

  @Post('categories')
  @ApiOperation({ summary: '新增下单品类' })
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.catalogService.createCategory(dto, admin);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: '修改或停用下单品类' })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.catalogService.updateCategory(id, dto, admin);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除未被使用的下单品类' })
  deleteCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.catalogService.deleteCategory(id, admin);
  }
}
