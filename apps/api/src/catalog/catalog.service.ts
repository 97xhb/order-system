import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateFundingMethodDto } from './dto/create-funding-method.dto';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateFundingMethodDto } from './dto/update-funding-method.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';
import { normalizeFundingMethodCode } from './funding-methods';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeName(name: string) {
    return name.trim();
  }

  private normalizeCode(code: string) {
    return code.trim().toLowerCase();
  }

  private async createAudit(
    transaction: Prisma.TransactionClient,
    admin: AuthenticatedAdmin,
    action: string,
    entityType: 'Platform' | 'Category' | 'FundingMethod',
    entityId: string,
    beforeData?: Prisma.InputJsonValue,
    afterData?: Prisma.InputJsonValue,
  ) {
    await transaction.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action,
        entityType,
        entityId,
        beforeData,
        afterData,
      },
    });
  }

  private throwCatalogConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('编码或名称已经存在');
    }
    throw error;
  }

  listPlatforms(includeDisabled = false) {
    return this.prisma.platform.findMany({
      where: includeDisabled ? undefined : { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        enabled: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { orders: true } },
      },
    });
  }

  async createPlatform(dto: CreatePlatformDto, admin: AuthenticatedAdmin) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const platform = await transaction.platform.create({
          data: {
            code: this.normalizeCode(dto.code),
            name: this.normalizeName(dto.name),
            enabled: dto.enabled ?? true,
            sortOrder: dto.sortOrder ?? 0,
          },
        });
        await this.createAudit(
          transaction,
          admin,
          'CREATE',
          'Platform',
          platform.id,
          undefined,
          {
            code: platform.code,
            name: platform.name,
            enabled: platform.enabled,
            sortOrder: platform.sortOrder,
          },
        );
        return platform;
      });
    } catch (error) {
      this.throwCatalogConflict(error);
    }
  }

  async updatePlatform(
    id: string,
    dto: UpdatePlatformDto,
    admin: AuthenticatedAdmin,
  ) {
    const existing = await this.prisma.platform.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('平台不存在');

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const platform = await transaction.platform.update({
          where: { id },
          data: {
            code:
              dto.code === undefined ? undefined : this.normalizeCode(dto.code),
            name:
              dto.name === undefined ? undefined : this.normalizeName(dto.name),
            enabled: dto.enabled,
            sortOrder: dto.sortOrder,
          },
        });
        await this.createAudit(
          transaction,
          admin,
          'UPDATE',
          'Platform',
          platform.id,
          {
            code: existing.code,
            name: existing.name,
            enabled: existing.enabled,
            sortOrder: existing.sortOrder,
          },
          {
            code: platform.code,
            name: platform.name,
            enabled: platform.enabled,
            sortOrder: platform.sortOrder,
          },
        );
        return platform;
      });
    } catch (error) {
      this.throwCatalogConflict(error);
    }
  }

  async deletePlatform(id: string, admin: AuthenticatedAdmin) {
    const platform = await this.prisma.platform.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!platform) throw new NotFoundException('平台不存在');

    if (platform._count.orders > 0) {
      throw new ConflictException('平台已经被订单使用，请改为停用');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.platform.delete({ where: { id } });
      await this.createAudit(transaction, admin, 'DELETE', 'Platform', id, {
        code: platform.code,
        name: platform.name,
        enabled: platform.enabled,
        sortOrder: platform.sortOrder,
      });
    });
  }

  listCategories(includeDisabled = false) {
    return this.prisma.category.findMany({
      where: includeDisabled ? undefined : { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        enabled: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { schemes: true, orders: true, profitRules: true } },
      },
    });
  }

  async createCategory(dto: CreateCategoryDto, admin: AuthenticatedAdmin) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.category.create({
          data: {
            name: this.normalizeName(dto.name),
            enabled: dto.enabled ?? true,
            sortOrder: dto.sortOrder ?? 0,
          },
        });
        await this.createAudit(
          transaction,
          admin,
          'CREATE',
          'Category',
          category.id,
          undefined,
          {
            name: category.name,
            enabled: category.enabled,
            sortOrder: category.sortOrder,
          },
        );
        return category;
      });
    } catch (error) {
      this.throwCatalogConflict(error);
    }
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    admin: AuthenticatedAdmin,
  ) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('品类不存在');

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.category.update({
          where: { id },
          data: {
            name:
              dto.name === undefined ? undefined : this.normalizeName(dto.name),
            enabled: dto.enabled,
            sortOrder: dto.sortOrder,
          },
        });
        await this.createAudit(
          transaction,
          admin,
          'UPDATE',
          'Category',
          category.id,
          {
            name: existing.name,
            enabled: existing.enabled,
            sortOrder: existing.sortOrder,
          },
          {
            name: category.name,
            enabled: category.enabled,
            sortOrder: category.sortOrder,
          },
        );
        return category;
      });
    } catch (error) {
      this.throwCatalogConflict(error);
    }
  }

  async deleteCategory(id: string, admin: AuthenticatedAdmin) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { schemes: true, orders: true, profitRules: true } },
      },
    });
    if (!category) throw new NotFoundException('品类不存在');

    if (
      category._count.schemes > 0 ||
      category._count.orders > 0 ||
      category._count.profitRules > 0
    ) {
      throw new ConflictException(
        '品类已经被方案、订单或利润规则使用，请改为停用',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.category.delete({ where: { id } });
      await this.createAudit(transaction, admin, 'DELETE', 'Category', id, {
        name: category.name,
        enabled: category.enabled,
        sortOrder: category.sortOrder,
      });
    });
  }

  listFundingMethods(includeDisabled = false) {
    return this.prisma.fundingMethod.findMany({
      where: includeDisabled ? undefined : { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        enabled: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createFundingMethod(
    dto: CreateFundingMethodDto,
    admin: AuthenticatedAdmin,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const method = await transaction.fundingMethod.create({
          data: {
            code: normalizeFundingMethodCode(dto.code),
            name: this.normalizeName(dto.name),
            enabled: dto.enabled ?? true,
            sortOrder: dto.sortOrder ?? 0,
          },
        });
        await this.createAudit(
          transaction,
          admin,
          'CREATE',
          'FundingMethod',
          method.id,
          undefined,
          {
            code: method.code,
            name: method.name,
            enabled: method.enabled,
            sortOrder: method.sortOrder,
          },
        );
        return method;
      });
    } catch (error) {
      this.throwCatalogConflict(error);
    }
  }

  async updateFundingMethod(
    id: string,
    dto: UpdateFundingMethodDto,
    admin: AuthenticatedAdmin,
  ) {
    const existing = await this.prisma.fundingMethod.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('支付方式不存在');

    // 停用或改编码会让历史订单/利润规则找不到对应目录项，直接拦截并说明原因。
    const changesIdentity =
      (dto.enabled === false && existing.enabled) ||
      (dto.code !== undefined &&
        normalizeFundingMethodCode(dto.code) !== existing.code);
    if (changesIdentity) {
      const [orderCount, ruleCount] = await Promise.all([
        this.prisma.order.count({ where: { fundingType: existing.code } }),
        this.prisma.profitRule.count({
          where: { fundingType: existing.code },
        }),
      ]);
      if (orderCount > 0 || ruleCount > 0) {
        throw new ConflictException(
          '该支付方式已被订单或利润规则使用，请先调整相关数据后再停用或改编码',
        );
      }
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const method = await transaction.fundingMethod.update({
          where: { id },
          data: {
            code:
              dto.code === undefined
                ? undefined
                : normalizeFundingMethodCode(dto.code),
            name:
              dto.name === undefined ? undefined : this.normalizeName(dto.name),
            enabled: dto.enabled,
            sortOrder: dto.sortOrder,
          },
        });
        await this.createAudit(
          transaction,
          admin,
          'UPDATE',
          'FundingMethod',
          method.id,
          {
            code: existing.code,
            name: existing.name,
            enabled: existing.enabled,
            sortOrder: existing.sortOrder,
          },
          {
            code: method.code,
            name: method.name,
            enabled: method.enabled,
            sortOrder: method.sortOrder,
          },
        );
        return method;
      });
    } catch (error) {
      this.throwCatalogConflict(error);
    }
  }

  async deleteFundingMethod(id: string, admin: AuthenticatedAdmin) {
    const existing = await this.prisma.fundingMethod.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('支付方式不存在');

    const [orderCount, ruleCount] = await Promise.all([
      this.prisma.order.count({ where: { fundingType: existing.code } }),
      this.prisma.profitRule.count({
        where: { fundingType: existing.code },
      }),
    ]);

    if (orderCount > 0 || ruleCount > 0) {
      throw new ConflictException(
        '支付方式已经被订单或利润规则使用，请改为停用',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.fundingMethod.delete({ where: { id } });
      await this.createAudit(
        transaction,
        admin,
        'DELETE',
        'FundingMethod',
        id,
        {
          code: existing.code,
          name: existing.name,
          enabled: existing.enabled,
          sortOrder: existing.sortOrder,
        },
      );
    });
  }
}
