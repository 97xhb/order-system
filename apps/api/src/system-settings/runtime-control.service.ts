import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

interface RuntimeRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

interface PersistedRuntimeState {
  databaseAccessEnabled: boolean;
  databaseAccessUpdatedAt: string | null;
}

const DEFAULT_RUNTIME_STATE: PersistedRuntimeState = {
  databaseAccessEnabled: true,
  databaseAccessUpdatedAt: null,
};

const DATABASE_PROTECTED_PREFIXES = [
  '/api/admin/orders',
  '/api/admin/platforms',
  '/api/admin/categories',
  '/api/admin/affiliate-platforms',
  '/api/admin/profit-rules',
  '/api/admin/schemes',
  '/api/admin/submitters',
  '/api/admin/payout-methods',
  '/api/admin/payout-registration',
  '/api/admin/payout-query',
  '/api/public/forms',
  '/api/public/payout-registration',
  '/api/public/payout-query',
];

@Injectable()
export class RuntimeControlService {
  private state: PersistedRuntimeState = { ...DEFAULT_RUNTIME_STATE };
  private readonly workspaceRoot: string;
  private readonly statePath: string;
  private readonly restartTriggerPath: string;
  private readonly webRestartTriggerPath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.workspaceRoot = this.resolveWorkspaceRoot();
    this.statePath =
      this.config.get<string>('LOCAL_RUNTIME_STATE_PATH')?.trim() ||
      path.join(this.workspaceRoot, '.local-data', 'runtime-control.json');
    this.restartTriggerPath = path.join(
      this.workspaceRoot,
      'apps',
      'api',
      'src',
      'runtime-restart.trigger.ts',
    );
    this.webRestartTriggerPath = path.join(
      this.workspaceRoot,
      'apps',
      'web',
      'src',
      'runtime-restart.trigger.ts',
    );
    this.loadState();
  }

  private resolveWorkspaceRoot() {
    const candidates = [
      process.cwd(),
      path.resolve(process.cwd(), '../..'),
      path.resolve(__dirname, '../../../..'),
    ];
    return (
      candidates.find((candidate) =>
        existsSync(path.join(candidate, 'apps', 'api', 'package.json')),
      ) ?? process.cwd()
    );
  }

  private loadState() {
    try {
      const parsed = JSON.parse(
        readFileSync(this.statePath, 'utf8'),
      ) as Partial<PersistedRuntimeState>;
      this.state = {
        databaseAccessEnabled:
          typeof parsed.databaseAccessEnabled === 'boolean'
            ? parsed.databaseAccessEnabled
            : true,
        databaseAccessUpdatedAt:
          typeof parsed.databaseAccessUpdatedAt === 'string'
            ? parsed.databaseAccessUpdatedAt
            : null,
      };
    } catch {
      this.state = { ...DEFAULT_RUNTIME_STATE };
    }
  }

  private async persistState(state: PersistedRuntimeState) {
    mkdirSync(path.dirname(this.statePath), { recursive: true });
    await writeFile(
      this.statePath,
      `${JSON.stringify(state, null, 2)}\n`,
      'utf8',
    );
    this.state = state;
  }

  getStatus() {
    const watchRestartEnabled =
      this.config.get<string>('API_WATCH_RESTART_ENABLED', 'false') === 'true';
    const apiRestartSupported =
      watchRestartEnabled && existsSync(this.restartTriggerPath);
    const webWatchRestartEnabled =
      this.config.get<string>(
        'WEB_WATCH_RESTART_ENABLED',
        watchRestartEnabled ? 'true' : 'false',
      ) === 'true';
    const webRestartSupported =
      webWatchRestartEnabled && existsSync(this.webRestartTriggerPath);
    return {
      databaseAccessEnabled: this.state.databaseAccessEnabled,
      databaseAccessUpdatedAt: this.state.databaseAccessUpdatedAt,
      apiRestartSupported,
      apiRestartMode: apiRestartSupported
        ? 'watch-trigger'
        : 'external-manager',
      webRestartSupported,
      webRestartMode: webRestartSupported
        ? 'vite-server-restart'
        : 'external-manager',
    };
  }

  isDatabaseAccessEnabled() {
    return this.state.databaseAccessEnabled;
  }

  shouldBlockDatabaseRequest(requestPath: string) {
    if (this.state.databaseAccessEnabled) return false;
    return DATABASE_PROTECTED_PREFIXES.some(
      (prefix) =>
        requestPath === prefix || requestPath.startsWith(`${prefix}/`),
    );
  }

  async setDatabaseAccess(
    enabled: boolean,
    admin: AuthenticatedAdmin,
    metadata: RuntimeRequestMetadata,
  ) {
    const before = this.state;
    if (before.databaseAccessEnabled === enabled) return this.getStatus();

    const updatedAt = new Date();
    const nextState: PersistedRuntimeState = {
      databaseAccessEnabled: enabled,
      databaseAccessUpdatedAt: updatedAt.toISOString(),
    };
    await this.persistState(nextState);

    try {
      await this.prisma.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: enabled
            ? 'DATABASE_ACCESS_ENABLED'
            : 'DATABASE_ACCESS_DISABLED',
          entityType: 'RuntimeControl',
          entityId: 'database-access',
          beforeData: {
            enabled: before.databaseAccessEnabled,
          } satisfies Prisma.InputJsonObject,
          afterData: {
            enabled,
            updatedAt: updatedAt.toISOString(),
          } satisfies Prisma.InputJsonObject,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
    } catch (error) {
      await this.persistState(before);
      throw error;
    }

    return this.getStatus();
  }

  async scheduleApiRestart(
    admin: AuthenticatedAdmin,
    metadata: RuntimeRequestMetadata,
  ) {
    const status = this.getStatus();
    if (!status.apiRestartSupported) {
      throw new BadRequestException('当前启动方式未启用 API 进程重启支持');
    }

    const requestedAt = new Date();
    await this.prisma.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action: 'API_RESTART_REQUESTED',
        entityType: 'RuntimeControl',
        entityId: String(process.pid),
        afterData: {
          pid: process.pid,
          requestedAt: requestedAt.toISOString(),
          mode: status.apiRestartMode,
        } satisfies Prisma.InputJsonObject,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });

    const restartAt = new Date(Date.now() + 800);
    const timer = setTimeout(() => {
      void writeFile(
        this.restartTriggerPath,
        `// 本机开发模式下，系统设置会更新此值，交由 Nest watch 真实重启 API 进程。\nexport const API_RESTART_TRIGGER = '${new Date().toISOString()}';\n`,
        'utf8',
      ).catch((error: unknown) => {
        console.error('API restart trigger failed', error);
      });
    }, 800);
    timer.unref();

    return {
      scheduled: true,
      currentPid: process.pid,
      requestedAt,
      restartAt,
    };
  }

  async scheduleWebRestart(
    admin: AuthenticatedAdmin,
    metadata: RuntimeRequestMetadata,
  ) {
    const status = this.getStatus();
    if (!status.webRestartSupported) {
      throw new BadRequestException('当前启动方式未启用面板服务重启支持');
    }

    const requestedAt = new Date();
    await this.prisma.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action: 'WEB_RESTART_REQUESTED',
        entityType: 'RuntimeControl',
        entityId: 'order-system-web',
        afterData: {
          requestedAt: requestedAt.toISOString(),
          mode: status.webRestartMode,
        } satisfies Prisma.InputJsonObject,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });

    const restartAt = new Date(Date.now() + 800);
    const timer = setTimeout(() => {
      void writeFile(
        this.webRestartTriggerPath,
        `// 本机开发模式下，系统设置会更新此值，交由 Vite 真实重启面板服务。\nexport const WEB_RESTART_TRIGGER = '${new Date().toISOString()}';\n`,
        'utf8',
      ).catch((error: unknown) => {
        console.error('Web panel restart trigger failed', error);
      });
    }, 800);
    timer.unref();

    return {
      scheduled: true,
      requestedAt,
      restartAt,
    };
  }
}
