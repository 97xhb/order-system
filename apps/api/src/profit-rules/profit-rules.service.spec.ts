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
});
