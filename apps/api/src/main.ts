import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { resolveTrustProxySetting } from './security/trust-proxy';
import { SystemSettingsService } from './system-settings/system-settings.service';
import { RuntimeControlService } from './system-settings/runtime-control.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(express.json({ limit: '120mb' }));
  expressApp.use(express.urlencoded({ extended: true, limit: '120mb' }));
  expressApp.disable('x-powered-by');
  expressApp.set(
    'trust proxy',
    resolveTrustProxySetting(config.get<string>('TRUST_PROXY')),
  );
  const port = config.get<number>('API_PORT', 3000);
  const webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
  const webOrigins = webOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const systemSettings = app.get(SystemSettingsService);
  const runtimeControl = app.get(RuntimeControlService);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: webOrigins,
    credentials: true,
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (
      request.path.startsWith('/api/admin/') ||
      request.path.startsWith('/api/auth/')
    ) {
      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.setHeader('Pragma', 'no-cache');
    }
    next();
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (
      request.path === '/api/system/public-settings' ||
      request.path === '/api/system/admin-entry'
    ) {
      next();
      return;
    }

    void systemSettings
      .getAccessDecision(request)
      .then((decision) => {
        const publicApiRequest = request.path.startsWith('/api/public/');
        const requestAllowed = publicApiRequest
          ? decision.publicAllowed
          : decision.allowed;

        if (requestAllowed) {
          if (runtimeControl.shouldBlockDatabaseRequest(request.path)) {
            response.status(503).json({
              statusCode: 503,
              code: 'DATABASE_ACCESS_PAUSED',
              message: '数据库访问已在系统设置中暂停',
            });
            return;
          }
          next();
          return;
        }

        if (!publicApiRequest) {
          response.status(404).json({
            statusCode: 404,
            message: 'Not Found',
          });
          return;
        }

        response.status(403).json({
          statusCode: 403,
          code: decision.publicAccessReason,
          message: '当前访问域名未加入系统白名单',
        });
      })
      .catch(() => {
        response.status(503).json({
          statusCode: 503,
          code: 'SYSTEM_SETTINGS_UNAVAILABLE',
          message: '系统访问设置暂时不可用',
        });
      });
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('下单登记与资金结算系统 API')
    .setDescription('订单、分享登记、出货、收货佬回款和下单人回款接口')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  let shutdownStarted = false;
  const shutdown = async () => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      console.error('API graceful shutdown failed', error);
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  await app.listen(port);
}
bootstrap();
