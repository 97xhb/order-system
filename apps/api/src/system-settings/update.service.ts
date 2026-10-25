import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export interface ReleaseManifest {
  version: string;
  releasedAt?: string;
  title?: string;
  notes?: string[];
}

export interface UpdateStatusFile {
  state?: 'IDLE' | 'REQUESTED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  version?: string | null;
  message?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
}

interface RuntimeRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class UpdateService {
  private readonly runtimeDir: string;
  private readonly requestPath: string;
  private readonly statusPath: string;
  private readonly releaseUrl =
    'https://cdn.jsdelivr.net/gh/97xhb/order-system@main/release.json';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const statePath =
      this.config.get<string>('LOCAL_RUNTIME_STATE_PATH')?.trim() ||
      path.join(process.cwd(), '.local-data', 'runtime-control.json');
    this.runtimeDir = path.dirname(statePath);
    this.requestPath = path.join(this.runtimeDir, 'update-request.json');
    this.statusPath = path.join(this.runtimeDir, 'update-status.json');
  }

  private currentVersion() {
    const candidates = [
      path.join(process.cwd(), 'package.json'),
      path.join(process.cwd(), '../../package.json'),
      path.join(__dirname, '../../../../package.json'),
    ];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as {
          version?: string;
        };
        if (parsed.version) return parsed.version;
      } catch {
        continue;
      }
    }
    return '0.0.0';
  }

  private compareVersions(left: string, right: string) {
    const a = left.split(/[.-]/).map((part) => Number(part) || 0);
    const b = right.split(/[.-]/).map((part) => Number(part) || 0);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      if ((a[index] ?? 0) !== (b[index] ?? 0)) {
        return (a[index] ?? 0) - (b[index] ?? 0);
      }
    }
    return 0;
  }

  private async remoteRelease(): Promise<ReleaseManifest> {
    const response = await fetch(this.releaseUrl, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new BadRequestException(`读取在线版本失败（HTTP ${response.status}）`);
    }
    const manifest = (await response.json()) as Partial<ReleaseManifest>;
    if (!manifest.version || typeof manifest.version !== 'string') {
      throw new BadRequestException('在线版本文件缺少 version');
    }
    return {
      version: manifest.version,
      releasedAt:
        typeof manifest.releasedAt === 'string'
          ? manifest.releasedAt
          : undefined,
      title: typeof manifest.title === 'string' ? manifest.title : undefined,
      notes: Array.isArray(manifest.notes)
        ? manifest.notes.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
    };
  }

  private status(): UpdateStatusFile {
    try {
      return JSON.parse(readFileSync(this.statusPath, 'utf8')) as UpdateStatusFile;
    } catch {
      return { state: 'IDLE', version: null, message: null };
    }
  }

  private updaterAvailable() {
    if (!existsSync(this.statusPath)) return false;
    const status = this.status();
    const updatedAt = status.updatedAt ? Date.parse(status.updatedAt) : 0;
    return Date.now() - updatedAt < 60_000;
  }

  async getStatus() {
    const currentVersion = this.currentVersion();
    let latest: ReleaseManifest | null = null;
    let error: string | null = null;
    try {
      latest = await this.remoteRelease();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : '在线版本读取失败';
    }
    return {
      currentVersion,
      latestVersion: latest?.version ?? null,
      updateAvailable: latest
        ? this.compareVersions(latest.version, currentVersion) > 0
        : false,
      release: latest,
      error,
      updaterAvailable: this.updaterAvailable(),
      requestPending: existsSync(this.requestPath),
      status: this.status(),
    };
  }

  async requestUpdate(
    admin: AuthenticatedAdmin,
    metadata: RuntimeRequestMetadata,
  ) {
    const currentVersion = this.currentVersion();
    const latest = await this.remoteRelease();
    if (this.compareVersions(latest.version, currentVersion) <= 0) {
      return {
        requested: false,
        reason: 'ALREADY_LATEST',
        currentVersion,
      };
    }
    if (!this.updaterAvailable()) {
      throw new BadRequestException('在线更新执行器未运行');
    }
    if (existsSync(this.requestPath)) {
      throw new ConflictException('已有更新请求正在处理');
    }

    await mkdir(this.runtimeDir, { recursive: true });
    const requestedAt = new Date().toISOString();
    await writeFile(
      this.requestPath,
      `${JSON.stringify(
        {
          version: latest.version,
          requestedAt,
          requestedBy: admin.username,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await this.prisma.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action: 'SYSTEM_UPDATE_REQUESTED',
        entityType: 'RuntimeControl',
        entityId: 'online-update',
        afterData: {
          currentVersion,
          targetVersion: latest.version,
          requestedAt,
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    return {
      requested: true,
      currentVersion,
      targetVersion: latest.version,
      requestedAt,
    };
  }
}
