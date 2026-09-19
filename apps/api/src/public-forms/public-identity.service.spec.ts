import type { ConfigService } from '@nestjs/config';
import { ExternalIdentityStatus, SubmitterStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { PublicIdentityService } from './public-identity.service';

describe('PublicIdentityService', () => {
  it('reuses the same identity after the public session cookie is stored', async () => {
    const configValues: Record<string, string> = {
      WEB_ORIGIN: 'http://localhost:5173',
      EXTERNAL_SESSION_COOKIE: 'order_external_session',
      EXTERNAL_SESSION_TTL_DAYS: '365',
      EXTERNAL_COOKIE_SECURE: 'auto',
    };
    const config = {
      get: jest.fn(
        (key: string, fallback?: string) => configValues[key] ?? fallback,
      ),
    } as unknown as ConfigService;

    let storedIdentity:
      | {
          id: string;
          displayCode: string;
          submitterId: null;
          status: ExternalIdentityStatus;
        }
      | undefined;
    let storedSession:
      | {
          id: string;
          externalIdentityId: string;
          tokenHash: string;
          expiresAt: Date;
          revokedAt: null;
        }
      | undefined;

    const transaction = {
      externalIdentity: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          storedIdentity = {
            id: 'identity-stable',
            displayCode: String(data.displayCode),
            submitterId: null,
            status: ExternalIdentityStatus.ACTIVE,
          };
          return storedIdentity;
        }),
      },
      externalIdentitySession: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          storedSession = {
            id: 'session-stable',
            externalIdentityId: String(data.externalIdentityId),
            tokenHash: String(data.tokenHash),
            expiresAt: data.expiresAt as Date,
            revokedAt: null,
          };
          return storedSession;
        }),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const externalIdentityCreate = transaction.externalIdentity.create;
    const prisma = {
      externalIdentitySession: {
        findUnique: jest.fn(
          async ({ where }: { where: { tokenHash: string } }) => {
            if (!storedSession || !storedIdentity) return null;
            if (where.tokenHash !== storedSession.tokenHash) return null;
            return { ...storedSession, externalIdentity: storedIdentity };
          },
        ),
        update: jest.fn(async () => ({})),
      },
      externalIdentity: { update: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (input: unknown) => {
        if (Array.isArray(input)) return Promise.all(input);
        return (input as (client: typeof transaction) => Promise<unknown>)(
          transaction,
        );
      }),
    } as unknown as PrismaService;
    const service = new PublicIdentityService(prisma, config);
    const request = (cookie?: string) =>
      ({
        headers: cookie ? { cookie } : {},
        ip: '127.0.0.1',
        get: jest.fn((name: string) =>
          name.toLowerCase() === 'user-agent' ? 'jest-browser' : undefined,
        ),
      }) as unknown as Request;

    const firstCookie = jest.fn();
    const firstIdentity = await service.resolve(request(), {
      cookie: firstCookie,
    } as unknown as Response);
    const sessionToken = String(firstCookie.mock.calls[0][1]);
    const cookieOptions = firstCookie.mock.calls[0][2];

    const secondIdentity = await service.resolve(
      request(`order_external_session=${encodeURIComponent(sessionToken)}`),
      { cookie: jest.fn() } as unknown as Response,
    );

    expect(firstIdentity).toEqual(secondIdentity);
    expect(externalIdentityCreate).toHaveBeenCalledTimes(1);
    expect(cookieOptions).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/api/public',
        expires: expect.any(Date),
      }),
    );
  });

  it('relinks the current device when a valid submitter identity code is entered', async () => {
    const externalIdentityUpdate = jest.fn(async () => ({}));
    const auditLogCreate = jest.fn(async () => ({}));
    const transaction = {
      externalIdentity: { update: externalIdentityUpdate },
      auditLog: { create: auditLogCreate },
    };
    const prisma = {
      submitter: {
        findUnique: jest.fn(async () => ({
          id: 'submitter-target',
          code: 'WX-8F2K7M9P4Q',
          status: SubmitterStatus.ACTIVE,
        })),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new PublicIdentityService(prisma, {
      get: jest.fn(),
    } as unknown as ConfigService);

    const result = await service.linkToSubmitterCode(
      {
        id: 'identity-current',
        displayCode: 'WX-DEVICE',
        submitterId: 'submitter-old',
      },
      ' wx-8f2k7m9p4q ',
      { ipAddress: '127.0.0.1', userAgent: 'jest-browser' },
    );

    expect(prisma.submitter.findUnique).toHaveBeenCalledWith({
      where: { code: 'WX-8F2K7M9P4Q' },
      select: { id: true, code: true, status: true },
    });
    expect(externalIdentityUpdate).toHaveBeenCalledWith({
      where: { id: 'identity-current' },
      data: { submitterId: 'submitter-target' },
    });
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'SUBMITTER_CODE_LINKED',
        beforeData: { submitterId: 'submitter-old' },
        afterData: {
          identityCode: 'WX-8F2K7M9P4Q',
          submitterId: 'submitter-target',
        },
      }),
    });
    expect(result).toEqual({
      id: 'identity-current',
      displayCode: 'WX-8F2K7M9P4Q',
      submitterId: 'submitter-target',
    });
  });
});
