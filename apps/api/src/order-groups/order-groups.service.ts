import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SettlementStatus } from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { ORDER_LIST_SELECT } from '../orders/order-select';
import { PrismaService } from '../prisma/prisma.service';
import { AssignOrdersDto } from './dto/assign-orders.dto';
import { CreateOrderGroupDto } from './dto/create-order-group.dto';
import { UpdateOrderGroupDto } from './dto/update-order-group.dto';

export interface OrderGroupSummary {
  orderCount: number;
  orderAmount: number;
  receivableDue: number;
  receivableReceived: number;
  settlementDue: number;
  settlementPaid: number;
  settledProfit: number;
  expectedProfit: number;
  status: 'EMPTY' | 'SETTLED' | 'OPEN' | 'EXCEPTION';
}

const GROUP_ORDER_WHERE: Prisma.OrderWhereInput = {
  deletedAt: null,
  archiveGroupId: { not: null },
};

@Injectable()
export class OrderGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  private clean(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private auditReason(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const reason = (value as Prisma.JsonObject).reason;
    if (typeof reason !== 'string') return null;
    const normalized = this.clean(reason);
    return normalized === '管理员完整编辑订单' ? null : normalized;
  }

  async list() {
    const [groups, totals, unsettled, exceptions] = await Promise.all([
      this.prisma.orderArchiveGroup.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.order.groupBy({
        by: ['archiveGroupId'],
        where: GROUP_ORDER_WHERE,
        _count: { _all: true },
        _sum: {
          orderAmount: true,
          saleAmount: true,
          customerReceivedAmount: true,
          submitterSettlementAmount: true,
          submitterPaidAmount: true,
          settledProfit: true,
          expectedProfit: true,
        },
      }),
      this.prisma.order.groupBy({
        by: ['archiveGroupId'],
        where: {
          ...GROUP_ORDER_WHERE,
          OR: [
            { receivableStatus: { not: SettlementStatus.PAID } },
            { submitterSettlementStatus: { not: SettlementStatus.PAID } },
          ],
        },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['archiveGroupId'],
        where: {
          ...GROUP_ORDER_WHERE,
          OR: [
            { receivableStatus: SettlementStatus.EXCEPTION },
            { submitterSettlementStatus: SettlementStatus.EXCEPTION },
          ],
        },
        _count: { _all: true },
      }),
    ]);

    const totalMap = new Map(totals.map((row) => [row.archiveGroupId, row]));
    const unsettledMap = new Map(
      unsettled.map((row) => [row.archiveGroupId, row._count._all]),
    );
    const exceptionMap = new Map(
      exceptions.map((row) => [row.archiveGroupId, row._count._all]),
    );

    return groups.map((group) => {
      const row = totalMap.get(group.id);
      const orderCount = row?._count._all ?? 0;
      const exceptionCount = exceptionMap.get(group.id) ?? 0;
      const unsettledCount = unsettledMap.get(group.id) ?? 0;
      const summary: OrderGroupSummary = {
        orderCount,
        orderAmount: Number(row?._sum.orderAmount ?? 0),
        receivableDue: Number(row?._sum.saleAmount ?? 0),
        receivableReceived: Number(row?._sum.customerReceivedAmount ?? 0),
        settlementDue: Number(row?._sum.submitterSettlementAmount ?? 0),
        settlementPaid: Number(row?._sum.submitterPaidAmount ?? 0),
        settledProfit: Number(row?._sum.settledProfit ?? 0),
        expectedProfit: Number(row?._sum.expectedProfit ?? 0),
        status:
          orderCount === 0
            ? 'EMPTY'
            : exceptionCount > 0
              ? 'EXCEPTION'
              : unsettledCount > 0
                ? 'OPEN'
                : 'SETTLED',
      };
      return { ...group, summary };
    });
  }

  async listOrders(id: string, page = 1, pageSize = 100) {
    const group = await this.prisma.orderArchiveGroup.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('归档分组不存在');

    const safePage = Math.max(1, Math.floor(page) || 1);
    const safePageSize = Math.min(200, Math.max(1, Math.floor(pageSize) || 100));
    const where: Prisma.OrderWhereInput = { archiveGroupId: id, deletedAt: null };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: [{ orderedAt: 'desc' }, { serialNo: 'desc' }],
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        select: ORDER_LIST_SELECT,
      }),
      this.prisma.order.count({ where }),
    ]);

    const editLogs = items.length
      ? await this.prisma.auditLog.findMany({
          where: {
            entityType: 'Order',
            entityId: { in: items.map((order) => order.id) },
            action: 'ORDER_UPDATED',
          },
          orderBy: { createdAt: 'desc' },
          select: { entityId: true, afterData: true, createdAt: true },
        })
      : [];
    const editReasonHistory = new Map<
      string,
      Array<{ reason: string; createdAt: string }>
    >();
    for (const log of editLogs) {
      const reason = this.auditReason(log.afterData);
      if (!reason) continue;
      const history = editReasonHistory.get(log.entityId) ?? [];
      history.push({ reason, createdAt: log.createdAt.toISOString() });
      editReasonHistory.set(log.entityId, history);
    }

    return {
      items: items.map((order) => ({
        ...order,
        editReasonHistory: editReasonHistory.get(order.id) ?? [],
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async create(dto: CreateOrderGroupDto, admin: AuthenticatedAdmin) {
    const name = this.clean(dto.name);
    if (!name) throw new BadRequestException('归档名称不能为空');

    return this.prisma.$transaction(async (transaction) => {
      const group = await transaction.orderArchiveGroup.create({
        data: {
          name,
          description: this.clean(dto.description),
          color: dto.color ?? null,
          createdById: admin.id,
        },
      });
      await this.audit(transaction, admin, 'ORDER_GROUP_CREATED', group.id, {
        name: group.name,
      });
      return group;
    });
  }

  async update(id: string, dto: UpdateOrderGroupDto, admin: AuthenticatedAdmin) {
    const existing = await this.prisma.orderArchiveGroup.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) throw new NotFoundException('归档分组不存在');
    const name = dto.name === undefined ? undefined : this.clean(dto.name);
    if (dto.name !== undefined && !name) {
      throw new BadRequestException('归档名称不能为空');
    }

    return this.prisma.$transaction(async (transaction) => {
      const group = await transaction.orderArchiveGroup.update({
        where: { id },
        data: {
          name: name ?? undefined,
          description:
            dto.description === undefined ? undefined : this.clean(dto.description),
          color: dto.color === undefined ? undefined : dto.color,
        },
      });
      await this.audit(transaction, admin, 'ORDER_GROUP_RENAMED', group.id, {
        before: existing.name,
        after: group.name,
      });
      return group;
    });
  }

  async remove(id: string, admin: AuthenticatedAdmin) {
    const existing = await this.prisma.orderArchiveGroup.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) throw new NotFoundException('归档分组不存在');

    return this.prisma.$transaction(async (transaction) => {
      const released = await transaction.order.updateMany({
        where: { archiveGroupId: id },
        data: { archiveGroupId: null },
      });
      await transaction.orderArchiveGroup.delete({ where: { id } });
      await this.audit(transaction, admin, 'ORDER_GROUP_DELETED', id, {
        name: existing.name,
        releasedOrderCount: released.count,
      });
      return { id, releasedOrderCount: released.count };
    });
  }

  async assign(id: string, dto: AssignOrdersDto, admin: AuthenticatedAdmin) {
    const group = await this.prisma.orderArchiveGroup.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!group) throw new NotFoundException('归档分组不存在');

    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.order.updateMany({
        where: { id: { in: dto.orderIds }, deletedAt: null },
        data: { archiveGroupId: id },
      });
      await this.audit(transaction, admin, 'ORDERS_GROUPED', id, {
        groupName: group.name,
        orderCount: result.count,
      });
      return { groupId: id, assigned: result.count };
    });
  }

  async unassign(id: string, dto: AssignOrdersDto, admin: AuthenticatedAdmin) {
    const group = await this.prisma.orderArchiveGroup.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!group) throw new NotFoundException('归档分组不存在');

    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.order.updateMany({
        where: { id: { in: dto.orderIds }, archiveGroupId: id },
        data: { archiveGroupId: null },
      });
      await this.audit(transaction, admin, 'ORDERS_UNGROUPED', id, {
        groupName: group.name,
        orderCount: result.count,
      });
      return { groupId: id, released: result.count };
    });
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    admin: AuthenticatedAdmin,
    action: string,
    entityId: string,
    afterData: Prisma.InputJsonValue,
  ) {
    await transaction.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action,
        entityType: 'OrderArchiveGroup',
        entityId,
        afterData,
      },
    });
  }
}
