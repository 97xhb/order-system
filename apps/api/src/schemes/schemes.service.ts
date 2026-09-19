import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReviewStatus, ShareFormStatus } from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchemeDto } from './dto/create-scheme.dto';
import { UpdateSchemeDto } from './dto/update-scheme.dto';
import { UpdateShareFormDto } from './dto/update-share-form.dto';
import {
  DEFAULT_SHARE_FORM_FIELD_CONFIG,
  normalizeShareFormFieldConfig,
} from './share-form-config';
import { sanitizeShareFormRichText } from './share-form-rich-text';

const DEFAULT_SHARE_FORM_TITLE = '在线报单系统';

@Injectable()
export class SchemesService {
  constructor(private readonly prisma: PrismaService) {}

  private clean(value: string | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private token() {
    return randomBytes(24).toString('base64url');
  }

  private code() {
    return `SC-${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    admin: AuthenticatedAdmin,
    action: string,
    entityType: string,
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

  private throwConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('方案编码或分享链接发生重复，请重试');
    }
    throw error;
  }

  private async assertCategory(categoryId: string | null | undefined) {
    if (
      categoryId &&
      !(await this.prisma.category.findUnique({ where: { id: categoryId } }))
    ) {
      throw new BadRequestException('选择的品类不存在');
    }
  }

  async list(includeDisabled = true) {
    const schemes = await this.prisma.orderScheme.findMany({
      where: includeDisabled ? undefined : { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        category: { select: { id: true, name: true } },
        shareForm: {
          select: {
            id: true,
            publicToken: true,
            status: true,
            title: true,
            description: true,
            fieldConfig: true,
            allowEditBeforeApproval: true,
            allowDeleteBeforeApproval: true,
            startsAt: true,
            expiresAt: true,
            submissionLimit: true,
            updatedAt: true,
            _count: { select: { orders: true } },
          },
        },
        _count: { select: { orders: true, profitRules: true } },
      },
    });

    if (!schemes.length) return schemes;

    const shareFormIds = schemes.flatMap((scheme) =>
      scheme.shareForm ? [scheme.shareForm.id] : [],
    );
    const counts = shareFormIds.length
      ? await this.prisma.order.groupBy({
          by: ['shareFormId', 'reviewStatus'],
          where: {
            shareFormId: { in: shareFormIds },
            deletedAt: null,
          },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map<string, { pending: number; approved: number }>();
    for (const item of counts) {
      if (!item.shareFormId) continue;
      const current = countMap.get(item.shareFormId) ?? {
        pending: 0,
        approved: 0,
      };
      if (item.reviewStatus === ReviewStatus.PENDING) {
        current.pending = item._count._all;
      }
      if (item.reviewStatus === ReviewStatus.APPROVED) {
        current.approved = item._count._all;
      }
      countMap.set(item.shareFormId, current);
    }

    return schemes.map((scheme) => ({
      ...scheme,
      shareForm: scheme.shareForm
        ? {
            ...scheme.shareForm,
            description: sanitizeShareFormRichText(
              scheme.shareForm.description,
            ),
          }
        : null,
      pendingOrderCount: scheme.shareForm
        ? (countMap.get(scheme.shareForm.id)?.pending ?? 0)
        : 0,
      approvedOrderCount: scheme.shareForm
        ? (countMap.get(scheme.shareForm.id)?.approved ?? 0)
        : 0,
    }));
  }

  async create(dto: CreateSchemeDto, admin: AuthenticatedAdmin) {
    await this.assertCategory(dto.categoryId);
    const name = dto.name.trim();
    const productName = dto.productName.trim();
    if (!name || !productName) {
      throw new BadRequestException('方案名称和方案内容不能为空');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const scheme = await transaction.orderScheme.create({
          data: {
            categoryId: dto.categoryId,
            code: (dto.code?.trim() || this.code()).toUpperCase(),
            name,
            productName,
            description: this.clean(dto.description),
            defaultValues: (dto.defaultValues ?? {
              fundingType: 'SUBMITTER_ADVANCED',
            }) as Prisma.InputJsonValue,
            enabled: dto.enabled ?? true,
            sortOrder: dto.sortOrder ?? 0,
          },
        });
        const shareForm = await transaction.shareForm.create({
          data: {
            schemeId: scheme.id,
            publicToken: this.token(),
            status: dto.shareFormStatus ?? ShareFormStatus.DRAFT,
            title: dto.shareTitle?.trim() || DEFAULT_SHARE_FORM_TITLE,
            description: sanitizeShareFormRichText(scheme.description),
            fieldConfig:
              DEFAULT_SHARE_FORM_FIELD_CONFIG as unknown as Prisma.InputJsonValue,
            createdById: admin.id,
          },
        });
        await this.audit(
          transaction,
          admin,
          'CREATE',
          'OrderScheme',
          scheme.id,
          undefined,
          {
            code: scheme.code,
            name: scheme.name,
            productName: scheme.productName,
            categoryId: scheme.categoryId,
            enabled: scheme.enabled,
            shareFormId: shareForm.id,
            shareFormStatus: shareForm.status,
          },
        );
        return { ...scheme, shareForm };
      });
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async update(id: string, dto: UpdateSchemeDto, admin: AuthenticatedAdmin) {
    const existing = await this.prisma.orderScheme.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('下单方案不存在');
    await this.assertCategory(dto.categoryId);
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('方案名称不能为空');
    }
    if (dto.productName !== undefined && !dto.productName.trim()) {
      throw new BadRequestException('方案内容不能为空');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const scheme = await transaction.orderScheme.update({
          where: { id },
          data: {
            categoryId: dto.categoryId,
            code: dto.code?.trim().toUpperCase(),
            name: dto.name?.trim(),
            productName: dto.productName?.trim(),
            description:
              dto.description === undefined
                ? undefined
                : this.clean(dto.description),
            defaultValues: dto.defaultValues as
              Prisma.InputJsonValue | undefined,
            enabled: dto.enabled,
            sortOrder: dto.sortOrder,
          },
        });
        await this.audit(
          transaction,
          admin,
          'UPDATE',
          'OrderScheme',
          id,
          {
            code: existing.code,
            name: existing.name,
            productName: existing.productName,
            categoryId: existing.categoryId,
            enabled: existing.enabled,
          },
          {
            code: scheme.code,
            name: scheme.name,
            productName: scheme.productName,
            categoryId: scheme.categoryId,
            enabled: scheme.enabled,
          },
        );
        return scheme;
      });
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async updateShareForm(
    schemeId: string,
    dto: UpdateShareFormDto,
    admin: AuthenticatedAdmin,
  ) {
    const existing = await this.prisma.shareForm.findUnique({
      where: { schemeId },
    });
    if (!existing) throw new NotFoundException('方案分享表单不存在');
    if (dto.title !== undefined && !dto.title.trim()) {
      throw new BadRequestException('分享表单标题不能为空');
    }

    let fieldConfig: Prisma.InputJsonValue | undefined;
    if (dto.fieldConfig !== undefined) {
      try {
        fieldConfig = normalizeShareFormFieldConfig(
          dto.fieldConfig,
        ) as unknown as Prisma.InputJsonValue;
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : '分享字段配置不正确',
        );
      }
    }

    const startsAt =
      dto.startsAt === undefined
        ? undefined
        : dto.startsAt === null
          ? null
          : new Date(dto.startsAt);
    const expiresAt =
      dto.expiresAt === undefined
        ? undefined
        : dto.expiresAt === null
          ? null
          : new Date(dto.expiresAt);
    const resultingStart =
      startsAt === undefined ? existing.startsAt : startsAt;
    const resultingEnd =
      expiresAt === undefined ? existing.expiresAt : expiresAt;
    if (resultingStart && resultingEnd && resultingStart >= resultingEnd) {
      throw new BadRequestException('分享链接结束时间必须晚于开始时间');
    }

    return this.prisma.$transaction(async (transaction) => {
      const form = await transaction.shareForm.update({
        where: { schemeId },
        data: {
          status: dto.status,
          title: dto.title?.trim(),
          description:
            dto.description === undefined
              ? undefined
              : sanitizeShareFormRichText(dto.description),
          fieldConfig,
          allowEditBeforeApproval: dto.allowEditBeforeApproval,
          allowDeleteBeforeApproval: dto.allowDeleteBeforeApproval,
          startsAt,
          expiresAt,
          submissionLimit: dto.submissionLimit,
        },
      });
      await this.audit(
        transaction,
        admin,
        'UPDATE',
        'ShareForm',
        form.id,
        {
          status: existing.status,
          title: existing.title,
          fieldConfig: existing.fieldConfig,
          allowEditBeforeApproval: existing.allowEditBeforeApproval,
          allowDeleteBeforeApproval: existing.allowDeleteBeforeApproval,
          startsAt: existing.startsAt?.toISOString(),
          expiresAt: existing.expiresAt?.toISOString(),
          submissionLimit: existing.submissionLimit,
        },
        {
          status: form.status,
          title: form.title,
          fieldConfig: form.fieldConfig,
          allowEditBeforeApproval: form.allowEditBeforeApproval,
          allowDeleteBeforeApproval: form.allowDeleteBeforeApproval,
          startsAt: form.startsAt?.toISOString(),
          expiresAt: form.expiresAt?.toISOString(),
          submissionLimit: form.submissionLimit,
        },
      );
      return form;
    });
  }

  async regenerateToken(schemeId: string, admin: AuthenticatedAdmin) {
    const existing = await this.prisma.shareForm.findUnique({
      where: { schemeId },
    });
    if (!existing) throw new NotFoundException('方案分享表单不存在');

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const form = await transaction.shareForm.update({
          where: { schemeId },
          data: { publicToken: this.token() },
        });
        await this.audit(
          transaction,
          admin,
          'REGENERATE_TOKEN',
          'ShareForm',
          form.id,
          { publicTokenPrefix: existing.publicToken.slice(0, 6) },
          { publicTokenPrefix: form.publicToken.slice(0, 6) },
        );
        return form;
      });
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async remove(id: string, admin: AuthenticatedAdmin) {
    const existing = await this.prisma.orderScheme.findUnique({
      where: { id },
      include: {
        shareForm: { include: { _count: { select: { orders: true } } } },
        _count: { select: { orders: true, profitRules: true } },
      },
    });
    if (!existing) throw new NotFoundException('下单方案不存在');
    if (
      existing._count.orders > 0 ||
      existing._count.profitRules > 0 ||
      (existing.shareForm?._count.orders ?? 0) > 0
    ) {
      throw new ConflictException('方案已经被订单或利润规则使用，请改为停用');
    }

    await this.prisma.$transaction(async (transaction) => {
      if (existing.shareForm) {
        await transaction.shareForm.delete({
          where: { id: existing.shareForm.id },
        });
      }
      await transaction.orderScheme.delete({ where: { id } });
      await this.audit(transaction, admin, 'DELETE', 'OrderScheme', id, {
        code: existing.code,
        name: existing.name,
        productName: existing.productName,
      });
    });
  }
}
