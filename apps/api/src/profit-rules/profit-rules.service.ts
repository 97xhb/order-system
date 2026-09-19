import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FundingType,
  Prisma,
  ProfitRuleScope,
  ProfitRuleStatus,
} from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import {
  assertProfitRuleDefinition,
  PROFIT_RULE_FIELD_OPTIONS,
} from '../orders/profit-calculator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfitRuleVersionDto } from './dto/create-profit-rule-version.dto';

@Injectable()
export class ProfitRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const [items, schemes, categories] = await Promise.all([
      this.prisma.profitRule.findMany({
        orderBy: [{ createdAt: 'desc' }],
        include: {
          scheme: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          createdBy: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.orderScheme.findMany({
        where: { enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
      this.prisma.category.findMany({
        where: { enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
    ]);

    return {
      items,
      options: {
        schemes,
        categories,
        fundingTypes: Object.values(FundingType),
        amountFields: PROFIT_RULE_FIELD_OPTIONS,
      },
    };
  }

  private async resolveScope(dto: CreateProfitRuleVersionDto) {
    switch (dto.scope) {
      case ProfitRuleScope.GLOBAL:
        if (dto.schemeId || dto.categoryId || dto.fundingType) {
          throw new BadRequestException(
            '全局规则不能绑定方案、品类或资金承担方式',
          );
        }
        return { scopeKey: 'GLOBAL' };

      case ProfitRuleScope.SCHEME:
        if (!dto.schemeId || dto.categoryId || dto.fundingType) {
          throw new BadRequestException('方案规则必须且只能选择一个方案');
        }
        if (
          !(await this.prisma.orderScheme.findUnique({
            where: { id: dto.schemeId },
            select: { id: true },
          }))
        ) {
          throw new BadRequestException('选择的下单方案不存在');
        }
        return { scopeKey: `SCHEME:${dto.schemeId}`, schemeId: dto.schemeId };

      case ProfitRuleScope.CATEGORY:
        if (!dto.categoryId || dto.schemeId || dto.fundingType) {
          throw new BadRequestException('品类规则必须且只能选择一个品类');
        }
        if (
          !(await this.prisma.category.findUnique({
            where: { id: dto.categoryId },
            select: { id: true },
          }))
        ) {
          throw new BadRequestException('选择的品类不存在');
        }
        return {
          scopeKey: `CATEGORY:${dto.categoryId}`,
          categoryId: dto.categoryId,
        };

      case ProfitRuleScope.FUNDING_TYPE:
        if (!dto.fundingType || dto.schemeId || dto.categoryId) {
          throw new BadRequestException(
            '资金承担方式规则必须且只能选择一个资金承担方式',
          );
        }
        return {
          scopeKey: `FUNDING_TYPE:${dto.fundingType}`,
          fundingType: dto.fundingType,
        };
    }
  }

  async createVersion(
    dto: CreateProfitRuleVersionDto,
    admin: AuthenticatedAdmin,
  ) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('规则名称不能为空');

    try {
      assertProfitRuleDefinition(dto.definition);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '利润规则格式不正确',
      );
    }

    const scope = await this.resolveScope(dto);
    const activate = dto.activate ?? true;
    const now = new Date();

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const latest = await transaction.profitRule.findFirst({
            where: { scopeKey: scope.scopeKey },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          const version = (latest?.version ?? 0) + 1;

          if (activate) {
            await transaction.profitRule.updateMany({
              where: {
                scopeKey: scope.scopeKey,
                status: ProfitRuleStatus.ACTIVE,
              },
              data: {
                status: ProfitRuleStatus.ARCHIVED,
                activeScopeKey: null,
                archivedAt: now,
              },
            });
          }

          const rule = await transaction.profitRule.create({
            data: {
              name,
              scope: dto.scope,
              scopeKey: scope.scopeKey,
              activeScopeKey: activate ? scope.scopeKey : null,
              schemeId: 'schemeId' in scope ? scope.schemeId : undefined,
              categoryId: 'categoryId' in scope ? scope.categoryId : undefined,
              fundingType:
                'fundingType' in scope ? scope.fundingType : undefined,
              version,
              definition: dto.definition as Prisma.InputJsonValue,
              requiresFullCustomerPayment: true,
              status: activate
                ? ProfitRuleStatus.ACTIVE
                : ProfitRuleStatus.DRAFT,
              createdById: admin.id,
            },
          });

          await transaction.auditLog.create({
            data: {
              actorAdminId: admin.id,
              source: 'ADMIN_WEB',
              action: activate
                ? 'PROFIT_RULE_VERSION_ACTIVATED'
                : 'PROFIT_RULE_VERSION_CREATED',
              entityType: 'ProfitRule',
              entityId: rule.id,
              afterData: {
                scope: rule.scope,
                scopeKey: rule.scopeKey,
                name: rule.name,
                version: rule.version,
                definition: dto.definition as Prisma.InputJsonValue,
                requiresFullCustomerPayment: rule.requiresFullCustomerPayment,
                status: rule.status,
              },
            },
          });

          return rule;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw new ConflictException('规则版本同时发生了变化，请刷新后重试');
      }
      throw error;
    }
  }

  async activate(id: string, admin: AuthenticatedAdmin) {
    const existing = await this.prisma.profitRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('利润规则版本不存在');
    if (existing.status === ProfitRuleStatus.ACTIVE) return existing;
    if (!existing.requiresFullCustomerPayment) {
      throw new BadRequestException(
        '该历史版本使用已取消的实时利润规则，请载入后保存为新版本',
      );
    }

    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.profitRule.updateMany({
        where: {
          scopeKey: existing.scopeKey,
          status: ProfitRuleStatus.ACTIVE,
        },
        data: {
          status: ProfitRuleStatus.ARCHIVED,
          activeScopeKey: null,
          archivedAt: now,
        },
      });

      const activated = await transaction.profitRule.update({
        where: { id },
        data: {
          status: ProfitRuleStatus.ACTIVE,
          activeScopeKey: existing.scopeKey,
          archivedAt: null,
        },
      });

      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'PROFIT_RULE_VERSION_ACTIVATED',
          entityType: 'ProfitRule',
          entityId: id,
          afterData: {
            scopeKey: activated.scopeKey,
            version: activated.version,
            status: activated.status,
          },
        },
      });

      return activated;
    });
  }
}
