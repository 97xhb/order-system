import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  ADMIN_LOGIN_RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from '../security/rate-limit.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController login throttling', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: RATE_LIMIT_WINDOW_MS,
            limit: 100,
          },
        ]),
      ],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockResolvedValue({
              token: 'test-session-token',
              expiresAt: new Date('2026-09-14T00:00:00.000Z'),
              user: {
                id: 'admin-id',
                username: 'admin',
                displayName: '管理员',
              },
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (_key: string, defaultValue?: unknown) => defaultValue,
            ),
          },
        },
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows five attempts per IP and rejects the sixth attempt', async () => {
    for (
      let attempt = 0;
      attempt < ADMIN_LOGIN_RATE_LIMIT_REQUESTS;
      attempt++
    ) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'admin', password: 'password1234' })
        .expect(200);
    }

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'password1234' })
      .expect(429)
      .expect(({ body }) => {
        expect(body.message).toBe('ThrottlerException: Too Many Requests');
      });
  });
});
