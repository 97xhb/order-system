import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminBootstrapService } from './admin-bootstrap.service';

describe('AdminBootstrapService', () => {
  const createService = (adminCount: number, password: string) => {
    const prisma = {
      adminUser: {
        count: jest.fn().mockResolvedValue(adminCount),
        create: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          ADMIN_USERNAME: 'admin',
          ADMIN_DISPLAY_NAME: '管理员',
          ADMIN_INITIAL_PASSWORD: password,
        };
        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;

    return { service: new AdminBootstrapService(prisma, config), prisma };
  };

  it('rejects an unchanged Compose placeholder on a fresh database', async () => {
    const { service } = createService(0, 'CHANGE_ME_ADMIN_PASSWORD');

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'ADMIN_INITIAL_PASSWORD 必须替换示例值，且至少需要 6 个字符',
    );
  });

  it('does not require the initial password after an administrator exists', async () => {
    const { service, prisma } = createService(1, 'CHANGE_ME_ADMIN_PASSWORD');

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(prisma.adminUser.create).not.toHaveBeenCalled();
  });
});
