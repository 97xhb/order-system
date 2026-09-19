import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchemesService } from './schemes.service';

describe('SchemesService', () => {
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
});
