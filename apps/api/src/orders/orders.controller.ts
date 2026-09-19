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
import { CurrentAdmin } from '../auth/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { CreateAdminOrderDto } from './dto/create-admin-order.dto';
import { CreateAdminOrdersBatchDto } from './dto/create-admin-orders-batch.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ReviewOrderDto } from './dto/review-order.dto';
import { UpdateAdminOrderDto } from './dto/update-admin-order.dto';
import { UpdateOrderProgressDto } from './dto/update-order-progress.dto';
import { OrdersService } from './orders.service';

@ApiTags('admin-orders')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: '服务端筛选、排序和分页订单列表' })
  list(@Query() query: ListOrdersQueryDto) {
    return this.orders.list(query);
  }

  @Post()
  @ApiOperation({ summary: '管理员手动创建并确认订单' })
  create(
    @Body() dto: CreateAdminOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.orders.create(dto, admin);
  }

  @Post('batch')
  @ApiOperation({ summary: '管理员批量创建并确认订单，单行失败不影响其他订单' })
  createBatch(
    @Body() dto: CreateAdminOrdersBatchDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.orders.createBatch(dto, admin);
  }

  @Patch(':id')
  @ApiOperation({ summary: '管理员修改完整订单资料、寄件及双向回款状态' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.orders.update(id, dto, admin);
  }

  @Delete(':id/edit-reasons')
  @ApiOperation({ summary: '清空当前订单的全部修改说明文字' })
  clearEditReasons(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.orders.clearEditReasons(id, admin);
  }

  @Delete(':id')
  @ApiOperation({ summary: '管理员软删除订单并保留审计记录' })
  remove(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.orders.remove(id, admin);
  }

  @Patch(':id/review')
  @ApiOperation({ summary: '审核通过或驳回外部登记订单' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.orders.review(id, dto, admin);
  }

  @Patch(':id/progress')
  @ApiOperation({ summary: '手动更新寄件、收货佬回款和下单人回款状态' })
  updateProgress(
    @Param('id') id: string,
    @Body() dto: UpdateOrderProgressDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.orders.updateProgress(id, dto, admin);
  }

  @Get('dashboard/summary')
  @ApiOperation({ summary: '后台首页真实金额与待处理统计' })
  dashboard() {
    return this.orders.dashboard();
  }
}
