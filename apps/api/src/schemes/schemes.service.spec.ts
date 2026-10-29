import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchemesService } from './schemes.service';

describe('SchemesService', () => {
  const admin = {
    id: 'admin-1',
    username: 'admin',
    displayName: '管理员',
  };

  it('counts public submissions by share form instead of the optional scheme relation', async () => {
    const scheme = {
      id: 'scheme-1',
      name: '测试方案',
      shareForm: {
        id: 'share-form-1',
        description: null,
      },
    };
    const prisma = {
      orderScheme: {
        findMany: jest.fn().mockResolvedValue([scheme]),
      },
      order: {
        groupBy: jest.fn().mockResolvedValue([
          {
            shareFormId: 'share-form-1',
            reviewStatus: ReviewStatus.PENDING,
            _count: { _all: 2 },
          },
          {
            shareFormId: 'share-form-1',
            reviewStatus: ReviewStatus.APPROVED,
            _count: { _all: 3 },
          },
        ]),
      },
    };
    const service = new SchemesService(prisma as unknown as PrismaService);

    const result = await service.list();

    expect(prisma.order.groupBy).toHaveBeenCalledWith({
      by: ['shareFormId', 'reviewStatus'],
      where: {
        shareFormId: { in: ['share-form-1'] },
        deletedAt: null,
      },
      _count: { _all: true },
    });
    expect(result[0]).toMatchObject({
      pendingOrderCount: 2,
      approvedOrderCount: 3,
    });
  });

  it('stores sanitized rich scheme content and derives plain text', async () => {
    const createScheme = jest.fn(async ({ data }) => ({
      id: 'scheme-1',
      ...data,
    }));
    const transaction = {
      orderScheme: { create: createScheme },
      shareForm: {
        create: jest.fn(async ({ data }) => ({
          id: 'share-form-1',
          ...data,
        })),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const service = new SchemesService(prisma as unknown as PrismaService);

    await service.create(
      {
        name: '测试方案',
        productName: '重点红色',
        productNameHtml:
          '<p><strong>重点</strong><script>alert(1)</script><font color="#d92d20">红色</font></p>',
      },
      admin,
    );

    expect(createScheme).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productName: '重点红色',
          productNameHtml:
            '<p><strong>重点</strong><font color="#d92d20">红色</font></p>',
        }),
      }),
    );
  });
});
