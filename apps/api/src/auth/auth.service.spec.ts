import type { ConfigService } from '@nestjs/config';
import { AdminStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashDeviceIdentifier } from './device';

jest.mock('./password', () => ({
  hashPassword: jest.fn().mockResolvedValue('new-hash'),
  verifyPassword: jest.fn().mockResolvedValue(true),
}));

describe('AuthService device sessions', () => {
  const admin = {
    id: '94522c00-9ab6-4bba-a165-553c5c0a4f4f',
    username: 'admin',
    passwordHash: 'password-hash',
    displayName: '管理员',
    status: AdminStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createContext = (previousDeviceName: string | null = null) => {
    const transaction = {
      adminSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'new-session' }),
      },
      adminUser: { update: jest.fn().mockResolvedValue(admin) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      adminUser: { findUnique: jest.fn().mockResolvedValue(admin) },
      adminSession: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            previousDeviceName ? { deviceName: previousDeviceName } : null,
          ),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {
      get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
    } as unknown as ConfigService);
    return { service, prisma, transaction };
  };

  it('revokes the previous session for the same stable browser device', async () => {
    const { service, transaction } = createContext('办公室电脑');
    const deviceId = '824eaeec-ae95-474a-ad69-dd6d254ba457';

    await service.login('admin', 'password123', {
      ipAddress: '192.168.31.22',
      userAgent: 'Mozilla/5.0 Chrome/140.0.0.0',
      deviceId,
      deviceName: 'Windows · Google Chrome',
    });

    expect(transaction.adminSession.updateMany).toHaveBeenCalledWith({
      where: {
        adminUserId: admin.id,
        revokedAt: null,
        OR: [
          { deviceIdHash: hashDeviceIdentifier(deviceId) },
          {
            deviceIdHash: null,
            userAgent: 'Mozilla/5.0 Chrome/140.0.0.0',
          },
        ],
      },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction.adminSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: admin.id,
        deviceIdHash: hashDeviceIdentifier(deviceId),
        deviceName: '办公室电脑',
      }),
    });
  });

  it('falls back to IP and user agent deduplication for older clients', async () => {
    const { service, transaction } = createContext();

    await service.login('admin', 'password123', {
      ipAddress: '192.168.31.22',
      userAgent: 'legacy-browser',
    });

    expect(transaction.adminSession.updateMany).toHaveBeenCalledWith({
      where: {
        adminUserId: admin.id,
        deviceIdHash: null,
        userAgent: 'legacy-browser',
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
