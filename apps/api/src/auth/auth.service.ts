import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ADMIN_SESSION_TTL_DAYS } from './auth.constants';
import type { AuthenticatedAdmin, RequestMetadata } from './auth.types';
import {
  describeUserAgent,
  hashDeviceIdentifier,
  normalizeDeviceName,
} from './device';
import { hashPassword, verifyPassword } from './password';
import { createSessionToken, hashSessionToken } from './session-token';

interface LoginResult {
  token: string;
  expiresAt: Date;
  user: AuthenticatedAdmin;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private getSessionTtlDays() {
    const configured = Number(
      this.config.get<string>(
        'ADMIN_SESSION_TTL_DAYS',
        String(DEFAULT_ADMIN_SESSION_TTL_DAYS),
      ),
    );

    return Number.isInteger(configured) && configured >= 1 && configured <= 365
      ? configured
      : DEFAULT_ADMIN_SESSION_TTL_DAYS;
  }

  private toAuthenticatedAdmin(admin: {
    id: string;
    username: string;
    displayName: string;
  }): AuthenticatedAdmin {
    return {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
    };
  }

  async login(
    usernameInput: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<LoginResult> {
    const username = usernameInput.trim().toLowerCase();
    const admin = await this.prisma.adminUser.findUnique({
      where: { username },
    });

    if (
      !admin ||
      admin.status !== AdminStatus.ACTIVE ||
      !(await verifyPassword(password, admin.passwordHash))
    ) {
      await this.prisma.auditLog.create({
        data: {
          source: 'ADMIN_WEB',
          action: 'LOGIN_FAILED',
          entityType: 'AdminUser',
          entityId: username || 'unknown',
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      throw new UnauthorizedException('账号或密码不正确');
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.getSessionTtlDays() * 24 * 60 * 60 * 1000,
    );
    const token = createSessionToken();
    const deviceIdHash = hashDeviceIdentifier(metadata.deviceId);
    const deviceFingerprintHash = hashDeviceIdentifier(
      metadata.deviceFingerprint,
    );
    const deviceIdentityFilters = [
      ...(deviceFingerprintHash ? [{ deviceFingerprintHash }] : []),
      ...(deviceIdHash ? [{ deviceIdHash }] : []),
    ];
    const previousDevice = deviceIdentityFilters.length
      ? await this.prisma.adminSession.findFirst({
          where: {
            adminUserId: admin.id,
            OR: deviceIdentityFilters,
            deviceName: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: { deviceName: true },
        })
      : null;
    const deviceName =
      normalizeDeviceName(previousDevice?.deviceName) ??
      normalizeDeviceName(metadata.deviceName) ??
      describeUserAgent(metadata.userAgent);

    await this.prisma.$transaction(async (transaction) => {
      if (deviceFingerprintHash && metadata.userAgent) {
        await transaction.adminSession.updateMany({
          where: {
            adminUserId: admin.id,
            deviceFingerprintHash: null,
            userAgent: metadata.userAgent,
            revokedAt: null,
          },
          data: { deviceFingerprintHash },
        });
      }
      await transaction.adminSession.updateMany({
        where: deviceFingerprintHash
          ? {
              adminUserId: admin.id,
              revokedAt: null,
              OR: [
                { deviceFingerprintHash },
                ...(metadata.userAgent
                  ? [
                      {
                        deviceFingerprintHash: null,
                        userAgent: metadata.userAgent,
                      },
                    ]
                  : []),
              ],
            }
          : deviceIdHash
            ? {
                adminUserId: admin.id,
                revokedAt: null,
                OR: [
                  { deviceIdHash },
                  ...(metadata.userAgent
                    ? [{ deviceIdHash: null, userAgent: metadata.userAgent }]
                    : []),
                ],
              }
            : {
                adminUserId: admin.id,
                deviceIdHash: null,
                userAgent: metadata.userAgent ?? null,
                revokedAt: null,
              },
        data: { revokedAt: now },
      });

      await transaction.adminSession.create({
        data: {
          adminUserId: admin.id,
          tokenHash: hashSessionToken(token),
          deviceIdHash,
          deviceFingerprintHash,
          deviceName,
          expiresAt,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      await transaction.adminUser.update({
        where: { id: admin.id },
        data: { lastLoginAt: now },
      });
      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'LOGIN_SUCCESS',
          entityType: 'AdminUser',
          entityId: admin.id,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
    });

    return {
      token,
      expiresAt,
      user: this.toAuthenticatedAdmin(admin),
    };
  }

  async validateSession(
    token: string,
    deviceId?: string,
    deviceFingerprint?: string,
  ) {
    const now = new Date();
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { adminUser: true },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.adminUser.status !== AdminStatus.ACTIVE
    ) {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }

    if (
      session.deviceFingerprintHash &&
      hashDeviceIdentifier(deviceFingerprint) !== session.deviceFingerprintHash
    ) {
      throw new UnauthorizedException('登录设备已变化，请重新登录');
    }

    if (
      !session.deviceFingerprintHash &&
      session.deviceIdHash &&
      hashDeviceIdentifier(deviceId) !== session.deviceIdHash
    ) {
      throw new UnauthorizedException('登录设备已变化，请重新登录');
    }

    if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await this.prisma.adminSession.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      });
    }

    return {
      sessionId: session.id,
      admin: this.toAuthenticatedAdmin(session.adminUser),
    };
  }

  async logout(sessionId: string, admin: AuthenticatedAdmin) {
    await this.prisma.$transaction([
      this.prisma.adminSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'LOGOUT',
          entityType: 'AdminSession',
          entityId: sessionId,
        },
      }),
    ]);
  }

  async changePassword(
    admin: AuthenticatedAdmin,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const adminRecord = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: admin.id },
    });

    if (!(await verifyPassword(currentPassword, adminRecord.passwordHash))) {
      throw new UnauthorizedException('当前密码不正确');
    }
    if (await verifyPassword(newPassword, adminRecord.passwordHash)) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      this.prisma.adminSession.updateMany({
        where: {
          adminUserId: admin.id,
          id: { not: sessionId },
          revokedAt: null,
        },
        data: { revokedAt: now },
      }),
      this.prisma.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'PASSWORD_CHANGED',
          entityType: 'AdminUser',
          entityId: admin.id,
        },
      }),
    ]);
  }
}
