import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ExternalIdentityProvider,
  ExternalIdentityStatus,
  Prisma,
  SubmitterStatus,
} from '@prisma/client';
import type { Request, Response } from 'express';
import { readCookie } from '../auth/cookie';
import {
  createExternalIdentityCredentials,
  hashIdentityToken,
} from '../identity/identity-token';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_EXTERNAL_SESSION_COOKIE,
  DEFAULT_EXTERNAL_SESSION_TTL_DAYS,
  EXTERNAL_SESSION_COOKIE_PATH,
} from './public-identity.constants';

export interface ResolvedPublicIdentity {
  id: string;
  displayCode: string;
  submitterId: string | null;
}

interface PublicIdentityRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class PublicIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private cookieName() {
    return this.config.get<string>(
      'EXTERNAL_SESSION_COOKIE',
      DEFAULT_EXTERNAL_SESSION_COOKIE,
    );
  }

  private ttlDays() {
    const value = Number(
      this.config.get<string>(
        'EXTERNAL_SESSION_TTL_DAYS',
        String(DEFAULT_EXTERNAL_SESSION_TTL_DAYS),
      ),
    );
    return Number.isInteger(value) && value > 0
      ? value
      : DEFAULT_EXTERNAL_SESSION_TTL_DAYS;
  }

  private cookieOptions(expires: Date) {
    const secureSetting = this.config.get<string>(
      'EXTERNAL_COOKIE_SECURE',
      'auto',
    );
    const webOrigin = this.config.get<string>('WEB_ORIGIN', '');
    const secure =
      secureSetting === 'true' ||
      (secureSetting === 'auto' &&
        webOrigin
          .split(',')
          .some((origin) => origin.trim().startsWith('https://')));

    return {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: EXTERNAL_SESSION_COOKIE_PATH,
      expires,
    };
  }

  private expiresAt() {
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + this.ttlDays());
    return expiresAt;
  }

  private userAgentHash(request: Request) {
    const userAgent = request.get('user-agent');
    return userAgent ? hashIdentityToken(userAgent).slice(0, 128) : null;
  }

  private async findExisting(token: string) {
    const now = new Date();
    const session = await this.prisma.externalIdentitySession.findUnique({
      where: { tokenHash: hashIdentityToken(token) },
      include: { externalIdentity: true },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.externalIdentity.status !== ExternalIdentityStatus.ACTIVE
    ) {
      return null;
    }

    await this.prisma.$transaction([
      this.prisma.externalIdentitySession.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      }),
      this.prisma.externalIdentity.update({
        where: { id: session.externalIdentityId },
        data: { lastSeenAt: now },
      }),
    ]);

    return {
      id: session.externalIdentity.id,
      displayCode: session.externalIdentity.displayCode,
      submitterId: session.externalIdentity.submitterId,
    } satisfies ResolvedPublicIdentity;
  }

  private async create(request: Request) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const credentials = createExternalIdentityCredentials();
      const expiresAt = this.expiresAt();
      try {
        const initialUserAgent = request.get('user-agent')?.slice(0, 500);
        const identity = await this.prisma.$transaction(
          async (transaction) => {
            const created = await transaction.externalIdentity.create({
              data: {
                provider: ExternalIdentityProvider.DEVICE_COOKIE,
                displayCode: credentials.displayCode,
                status: ExternalIdentityStatus.ACTIVE,
                metadata: initialUserAgent ? { initialUserAgent } : undefined,
              },
            });
            await transaction.externalIdentitySession.create({
              data: {
                externalIdentityId: created.id,
                tokenHash: credentials.sessionTokenHash,
                expiresAt,
                userAgentHash: this.userAgentHash(request),
              },
            });
            await transaction.auditLog.create({
              data: {
                source: 'PUBLIC_FORM',
                action: 'DEVICE_IDENTITY_CREATED',
                entityType: 'ExternalIdentity',
                entityId: created.id,
                ipAddress: request.ip?.slice(0, 64),
                userAgent: request.get('user-agent')?.slice(0, 2_000),
                afterData: { displayCode: created.displayCode },
              },
            });
            return created;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        return {
          identity: {
            id: identity.id,
            displayCode: identity.displayCode,
            submitterId: identity.submitterId,
          } satisfies ResolvedPublicIdentity,
          sessionToken: credentials.sessionToken,
          expiresAt,
        };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034')
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('外部身份识别码生成失败');
  }

  async resolve(request: Request, response: Response) {
    const sessionToken = readCookie(request, this.cookieName());
    if (sessionToken) {
      const identity = await this.findExisting(sessionToken);
      if (identity) return identity;
    }

    const created = await this.create(request);
    response.cookie(
      this.cookieName(),
      created.sessionToken,
      this.cookieOptions(created.expiresAt),
    );
    return created.identity;
  }

  async linkToSubmitterCode(
    identity: ResolvedPublicIdentity,
    rawIdentityCode: string,
    metadata: PublicIdentityRequestMetadata,
  ) {
    const identityCode = rawIdentityCode.trim().toUpperCase();
    const submitter = await this.prisma.submitter.findUnique({
      where: { code: identityCode },
      select: { id: true, code: true, status: true },
    });
    if (!submitter || submitter.status !== SubmitterStatus.ACTIVE) {
      throw new NotFoundException('识别码不存在，请检查后重新输入');
    }

    if (identity.submitterId !== submitter.id) {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.externalIdentity.update({
          where: { id: identity.id },
          data: { submitterId: submitter.id },
        });
        await transaction.auditLog.create({
          data: {
            source: 'PUBLIC_FORM',
            action: 'SUBMITTER_CODE_LINKED',
            entityType: 'ExternalIdentity',
            entityId: identity.id,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            beforeData: { submitterId: identity.submitterId },
            afterData: {
              identityCode: submitter.code ?? identityCode,
              submitterId: submitter.id,
            },
          },
        });
      });
    }

    return {
      id: identity.id,
      displayCode: submitter.code ?? identityCode,
      submitterId: submitter.id,
    } satisfies ResolvedPublicIdentity;
  }
}
