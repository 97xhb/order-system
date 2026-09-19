import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { RootAccessMode } from '@prisma/client';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { createAdminEntryGrant } from './admin-entry';
import type { RuntimeControlService } from './runtime-control.service';
import { SystemSettingsService } from './system-settings.service';

const ADMIN_ENTRY_PATH = 'Manage123';
const ADMIN_ENTRY_SECRET = 'system-settings-test-secret';

const configMock = () =>
  ({
    get: jest.fn((key: string, fallback?: string) =>
      key === 'DATA_ENCRYPTION_KEY' ? ADMIN_ENTRY_SECRET : fallback,
    ),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'DATA_ENCRYPTION_KEY') return ADMIN_ENTRY_SECRET;
      throw new Error(`Missing config: ${key}`);
    }),
  }) as unknown as ConfigService;

const runtimeControlMock = () =>
  ({
    getStatus: jest.fn(() => ({
      databaseAccessEnabled: true,
      databaseAccessUpdatedAt: null,
      apiRestartSupported: true,
      apiRestartMode: 'watch-trigger',
      webRestartSupported: true,
      webRestartMode: 'vite-server-restart',
    })),
  }) as unknown as RuntimeControlService;

describe('SystemSettingsService access address handling', () => {
  const service = new SystemSettingsService(
    {} as PrismaService,
    configMock(),
    runtimeControlMock(),
  );

  it('recognizes IPv4 and IPv6 loopback addresses', () => {
    expect(service.isLocalIp('127.0.0.1')).toBe(true);
    expect(service.isLocalIp('::1')).toBe(true);
    expect(service.isLocalIp('::ffff:127.0.0.1')).toBe(true);
    expect(service.isLocalIp('192.168.1.20')).toBe(false);
  });

  it('uses the forwarded client address only for the local Vite proxy', () => {
    const request = {
      socket: { remoteAddress: '::1' },
      headers: { 'x-forwarded-for': '203.0.113.9' },
    } as unknown as Request;

    expect(service.getClientIp(request)).toBe('203.0.113.9');
  });

  it('ignores spoofed forwarded addresses on direct external connections', () => {
    const request = {
      socket: { remoteAddress: '198.51.100.8' },
      headers: { 'x-forwarded-for': '127.0.0.1' },
    } as unknown as Request;

    expect(service.getClientIp(request)).toBe('198.51.100.8');
  });

  it('uses the original browser host supplied by the local Vite proxy', () => {
    const request = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        host: 'localhost:3000',
        'x-forwarded-host': 'www.example.com:5173',
      },
    } as unknown as Request;

    expect(service.getRequestHost(request)).toBe('www.example.com');
  });

  it('uses Express trusted-proxy values for a container reverse proxy', () => {
    const request = {
      ip: '203.0.113.10',
      hostname: 'orders.example.com',
      socket: { remoteAddress: '172.30.0.3' },
      headers: {
        host: 'api:3000',
        'x-forwarded-for': '203.0.113.10',
        'x-forwarded-host': 'orders.example.com',
      },
    } as unknown as Request;

    expect(service.getClientIp(request)).toBe('203.0.113.10');
    expect(service.getRequestHost(request)).toBe('orders.example.com');
  });

  it('normalizes pasted domains and removes duplicates', () => {
    expect(
      service.normalizeAllowedHosts([
        'localhost',
        'HTTPS://WWW.Example.com/path',
        'www.example.com',
        '*.Example.com',
      ]),
    ).toEqual(['localhost', 'www.example.com', '*.example.com']);
  });
});

describe('SystemSettingsService access decisions', () => {
  const createService = (input: {
    externalAccessEnabled: boolean;
    allowedHosts: string[];
    adminEntryPath?: string | null;
  }) => {
    const prisma = {
      systemSetting: {
        upsert: jest.fn().mockResolvedValue({
          id: 'default',
          systemName: '下单登记系统',
          brandMarkText: '浪姐',
          adminEntryPath: ADMIN_ENTRY_PATH,
          rootAccessMode: RootAccessMode.NOT_FOUND,
          rootRedirectUrl: null,
          updatedAt: new Date('2026-08-16T00:00:00.000Z'),
          ...input,
        }),
      },
    } as unknown as PrismaService;
    return new SystemSettingsService(
      prisma,
      configMock(),
      runtimeControlMock(),
    );
  };

  const requestFrom = (clientIp: string, host: string, granted = true) => {
    const token = createAdminEntryGrant(
      ADMIN_ENTRY_PATH,
      ADMIN_ENTRY_SECRET,
      Date.now() + 60_000,
    );
    return {
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        host: 'localhost:3000',
        'x-forwarded-for': clientIp,
        'x-forwarded-host': host,
        ...(granted ? { cookie: `order_admin_entry=${token}` } : {}),
      },
    } as unknown as Request;
  };

  it('always permits a real loopback request', async () => {
    const service = createService({
      externalAccessEnabled: false,
      allowedHosts: [],
    });
    const decision = await service.getAccessDecision(
      requestFrom('127.0.0.1', 'localhost:5173'),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.accessReason).toBe('LOCAL_REQUEST');
  });

  it('permits the loopback-only Docker bootstrap host', async () => {
    const service = createService({
      externalAccessEnabled: false,
      allowedHosts: ['localhost'],
    });
    const request = {
      ip: '172.30.0.1',
      hostname: 'localhost',
      socket: { remoteAddress: '172.30.0.2' },
      headers: { host: 'localhost:8191' },
    } as unknown as Request;

    const decision = await service.getAccessDecision(request);
    expect(decision.allowed).toBe(true);
    expect(decision.accessReason).toBe('LOCAL_REQUEST');
  });

  it('permits LAN and public IP hosts only when external access is enabled', async () => {
    const service = createService({
      externalAccessEnabled: true,
      allowedHosts: [],
    });
    const decision = await service.getAccessDecision(
      requestFrom('192.168.31.22', '192.168.31.100:5173'),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.accessReason).toBe('IP_ADDRESS_ALLOWED');
  });

  it('permits exact and wildcard domains from the database whitelist', async () => {
    const service = createService({
      externalAccessEnabled: true,
      allowedHosts: ['www.example.com', '*.example.net'],
    });

    await expect(
      service.getAccessDecision(requestFrom('203.0.113.9', 'www.example.com')),
    ).resolves.toMatchObject({ allowed: true, accessReason: 'HOST_ALLOWED' });
    await expect(
      service.getAccessDecision(requestFrom('203.0.113.9', 'a.example.net')),
    ).resolves.toMatchObject({ allowed: true, accessReason: 'HOST_ALLOWED' });
  });

  it('rejects an unlisted domain even when external access is enabled', async () => {
    const service = createService({
      externalAccessEnabled: true,
      allowedHosts: ['www.example.com'],
    });
    const decision = await service.getAccessDecision(
      requestFrom('203.0.113.9', 'other.example.com'),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.accessReason).toBe('HOST_NOT_ALLOWED');
  });

  it('hides the admin area until the external browser uses the security entry', async () => {
    const service = createService({
      externalAccessEnabled: true,
      allowedHosts: ['www.example.com'],
    });
    const decision = await service.getAccessDecision(
      requestFrom('203.0.113.9', 'www.example.com', false),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.networkAllowed).toBe(true);
    expect(decision.adminEntryGranted).toBe(false);
    expect(decision.accessReason).toBe('ADMIN_ENTRY_REQUIRED');
    expect(decision.publicAllowed).toBe(true);
  });

  it('allows the first administrator login before a security entry is configured', async () => {
    const service = createService({
      externalAccessEnabled: true,
      allowedHosts: ['www.example.com'],
      adminEntryPath: null,
    });
    const decision = await service.getAccessDecision(
      requestFrom('203.0.113.9', 'www.example.com', false),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.networkAllowed).toBe(true);
    expect(decision.adminEntryGranted).toBe(true);
    expect(decision.accessReason).toBe('HOST_ALLOWED');
  });

  it('restricts the admin area but keeps whitelisted public links available when disabled', async () => {
    const service = createService({
      externalAccessEnabled: false,
      allowedHosts: ['www.example.com'],
    });
    const decision = await service.getAccessDecision(
      requestFrom('203.0.113.9', 'www.example.com'),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.publicAllowed).toBe(true);
    expect(decision.publicAccessReason).toBe('HOST_ALLOWED');
    expect(decision.accessReason).toBe('EXTERNAL_ACCESS_DISABLED');
  });

  it('rejects public links when the request domain is not whitelisted', async () => {
    const service = createService({
      externalAccessEnabled: false,
      allowedHosts: ['www.example.com'],
    });
    const decision = await service.getAccessDecision(
      requestFrom('203.0.113.9', 'not-listed.example.com'),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.publicAllowed).toBe(false);
    expect(decision.publicAccessReason).toBe('HOST_NOT_ALLOWED');
    expect(decision.accessReason).toBe('EXTERNAL_ACCESS_DISABLED');
  });
});

describe('SystemSettingsService domain root settings', () => {
  const baseSetting = {
    id: 'default',
    systemName: '下单登记系统',
    brandMarkText: '浪姐',
    externalAccessEnabled: true,
    allowedHosts: ['www.example.com'],
    adminEntryPath: ADMIN_ENTRY_PATH,
    rootAccessMode: RootAccessMode.NOT_FOUND,
    rootRedirectUrl: null,
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
  };

  const createService = () => {
    const transaction = {
      systemSetting: {
        upsert: jest.fn().mockImplementation(({ create }) => ({
          ...baseSetting,
          ...create,
          updatedAt: new Date('2026-08-16T01:00:00.000Z'),
        })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      systemSetting: { upsert: jest.fn().mockResolvedValue(baseSetting) },
      $transaction: jest.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    return new SystemSettingsService(
      prisma,
      configMock(),
      runtimeControlMock(),
    );
  };

  const admin = {
    id: '94522c00-9ab6-4bba-a165-553c5c0a4f4f',
    username: 'admin',
    displayName: '管理员',
  };

  it('accepts and normalizes an http redirect target', async () => {
    const service = createService();
    const result = await service.updateSettings(
      {
        systemName: '下单登记系统',
        brandMarkText: '浪姐',
        externalAccessEnabled: true,
        allowedHosts: ['www.example.com'],
        adminEntryPath: ADMIN_ENTRY_PATH,
        rootAccessMode: RootAccessMode.REDIRECT,
        rootRedirectUrl: 'https://target.example/path',
      },
      admin,
      { ipAddress: '127.0.0.1', localRequest: true },
    );

    expect(result.rootAccessMode).toBe(RootAccessMode.REDIRECT);
    expect(result.rootRedirectUrl).toBe('https://target.example/path');
    expect(result.brandMarkText).toBe('浪姐');
  });

  it('rejects unsafe protocols and a redirect loop to the same domain root', async () => {
    const service = createService();
    const update = (rootRedirectUrl: string) =>
      service.updateSettings(
        {
          systemName: '下单登记系统',
          brandMarkText: '浪姐',
          externalAccessEnabled: true,
          allowedHosts: ['www.example.com'],
          adminEntryPath: ADMIN_ENTRY_PATH,
          rootAccessMode: RootAccessMode.REDIRECT,
          rootRedirectUrl,
        },
        admin,
        {
          ipAddress: '203.0.113.9',
          localRequest: false,
          requestHost: 'www.example.com',
        },
      );

    await expect(update('javascript:alert(1)')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(update('https://www.example.com/')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('SystemSettingsService audit log maintenance', () => {
  it('clears prior logs and keeps one audit record for the clear action', async () => {
    const transaction = {
      auditLog: {
        deleteMany: jest.fn().mockResolvedValue({ count: 28 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    const service = new SystemSettingsService(
      prisma,
      configMock(),
      runtimeControlMock(),
    );

    const result = await service.clearAuditLogs(
      {
        id: '94522c00-9ab6-4bba-a165-553c5c0a4f4f',
        username: 'admin',
        displayName: '管理员',
      },
      {
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        localRequest: true,
      },
    );

    expect(transaction.auditLog.deleteMany).toHaveBeenCalledWith({});
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorAdminId: '94522c00-9ab6-4bba-a165-553c5c0a4f4f',
        action: 'AUDIT_LOGS_CLEARED',
        entityType: 'AuditLog',
        entityId: 'all',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        afterData: expect.objectContaining({ deletedCount: 28 }),
      }),
    });
    expect(result).toEqual({ success: true, deletedCount: 28 });
  });
});
