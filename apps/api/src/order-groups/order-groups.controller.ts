import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { CurrentAdmin } from '../auth/current-admin.decorator';
import { AssignOrdersDto } from './dto/assign-orders.dto';
import { CreateOrderGroupDto } from './dto/create-order-group.dto';
import { UpdateOrderGroupDto } from './dto/update-order-group.dto';
import { OrderGroupsService } from './order-groups.service';

@ApiTags('admin-order-groups')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/order-groups')
export class OrderGroupsController {
  constructor(private readonly groups: OrderGroupsService) {}

  @Get()
  @ApiOperation({ summary: '归档分组列表及金额汇总' })
  list() {
    return this.groups.list();
  }

  @Post()
  @ApiOperation({ summary: '新建自定义归档分组' })
  create(
    @Body() dto: CreateOrderGroupDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.groups.create(dto, admin);
  }

  @Patch(':id')
  @ApiOperation({ summary: '重命名或修改归档分组' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderGroupDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.groups.update(id, dto, admin);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除归档分组，组内订单自动回到未归档' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.groups.remove(id, admin);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: '分页查询某个归档分组内的订单' })
  listOrders(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.groups.listOrders(
      id,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Post(':id/orders')
  @ApiOperation({ summary: '把订单加入归档分组（已在其他分组会自动移动）' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignOrdersDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.groups.assign(id, dto, admin);
  }

  @Delete(':id/orders')
  @ApiOperation({ summary: '把订单移出归档分组' })
  unassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignOrdersDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.groups.unassign(id, dto, admin);
  }
}
