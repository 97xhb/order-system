import { BadRequestException } from '@nestjs/common';
import { ProfitRuleScope, ProfitRuleStatus } from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { DEFAULT_PROFIT_RULE_DEFINITION } from '../orders/profit-calculator';
import type { PrismaService } from '../prisma/prisma.service';
import { ProfitRulesService } from './profit-rules.service';

describe('ProfitRulesService fixed settlement gate', () => {
  const admin: AuthenticatedAdmin = {
    id: 'admin-id',
    username: 'admin',
    displayName: '管理员',
  };

  it('always enables the full customer payment gate for new versions', async () => {
    const create = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'profit-rule-id',
        ...data,
      }),
    );
    const transaction = {
      profitRule: {
        findFirst: jest.fn(async () => null),
        updateMany: jest.fn(async () => ({ count: 0 })),
        create,
      },
      auditLog: { create: jest.fn(async (_args: unknown) => ({})) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new ProfitRulesService(prisma);

    await service.createVersion(
      {
        name: '固定回款门槛',
        scope: ProfitRuleScope.GLOBAL,
        definition: DEFAULT_PROFIT_RULE_DEFINITION,
        activate: true,
      },
      admin,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requiresFullCustomerPayment: true,
        }),
      }),
    );
  });

  it('rejects reactivating an obsolete real-time profit version', async () => {
    const prisma = {
      profitRule: {
        findUnique: jest.fn(async () => ({
          id: 'legacy-rule-id',
          status: ProfitRuleStatus.ARCHIVED,
          requiresFullCustomerPayment: false,
        })),
      },
    } as unknown as PrismaService;
    const service = new ProfitRulesService(prisma);

    await expect(
      service.activate('legacy-rule-id', admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes a misconfigured version and records an audit entry', async () => {
    const remove = jest.fn(async () => ({}));
    const transaction = {
      profitRule: { delete: remove },
      auditLog: { create: jest.fn(async (_args: unknown) => ({})) },
    };
    const prisma = {
      profitRule: {
        findUnique: jest.fn(async () => ({
          id: 'rule-id',
          name: '支付方式 · 代付',
          scope: ProfitRuleScope.FUNDING_TYPE,
          scopeKey: 'FUNDING_TYPE:SUBMITTER_ADVANCED',
          version: 1,
          status: ProfitRuleStatus.ACTIVE,
          definition: DEFAULT_PROFIT_RULE_DEFINITION,
          requiresFullCustomerPayment: true,
        })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new ProfitRulesService(prisma);

    const result = await service.deleteVersion('rule-id', admin);

    expect(remove).toHaveBeenCalledWith({ where: { id: 'rule-id' } });
    expect(result).toEqual({
      deleted: true,
      wasActive: true,
      scopeKey: 'FUNDING_TYPE:SUBMITTER_ADVANCED',
    });
  });

  it('refuses to delete the active global fallback rule', async () => {
    const prisma = {
      profitRule: {
        findUnique: jest.fn(async () => ({
          id: 'global-rule-id',
          name: '默认利润规则',
          scope: ProfitRuleScope.GLOBAL,
          scopeKey: 'GLOBAL',
          version: 1,
          status: ProfitRuleStatus.ACTIVE,
          definition: DEFAULT_PROFIT_RULE_DEFINITION,
          requiresFullCustomerPayment: true,
        })),
      },
    } as unknown as PrismaService;
    const service = new ProfitRulesService(prisma);

    await expect(
      service.deleteVersion('global-rule-id', admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
