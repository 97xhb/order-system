import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';

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
    entityType: 'Platform' | 'Category',
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
}
