import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface ReleaseManifest {
  version: string;
  releasedAt?: string;
  title?: string;
  notes: string[];
}

@Injectable()
export class UpdateService {
  private readonly releaseUrl =
    'https://github.com/97xhb/order-system/raw/refs/heads/main/release.json';

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
      release: latest ?? (existsSync(path.join(process.cwd(), 'release.json'))
        ? (JSON.parse(
            readFileSync(path.join(process.cwd(), 'release.json'), 'utf8'),
          ) as ReleaseManifest)
        : null),
      error,
    };
  }
}
