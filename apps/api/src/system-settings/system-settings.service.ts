import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SystemSetting } from '@prisma/client';
import type { Request, Response } from 'express';
import { isIP } from 'node:net';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { domainToASCII } from 'node:url';
import { AdminStatus, Prisma, RootAccessMode } from '@prisma/client';
import { readCookie } from '../auth/cookie';
import { describeUserAgent, normalizeDeviceName } from '../auth/device';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { DEFAULT_ADMIN_SESSION_TTL_DAYS } from '../auth/auth.constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_LOGIN_RATE_LIMIT_REQUESTS,
  API_RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from '../security/rate-limit.constants';
import {
  ADMIN_ENTRY_COOKIE_PATH,
  createAdminEntryGrant,
  DEFAULT_ADMIN_ENTRY_COOKIE,
  DEFAULT_ADMIN_ENTRY_TTL_DAYS,
  isValidAdminEntryPath,
  matchesAdminEntryPath,
  normalizeAdminEntryPath,
  verifyAdminEntryGrant,
} from './admin-entry';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { ListSystemAuditLogsDto } from './dto/list-system-audit-logs.dto';
import { RuntimeControlService } from './runtime-control.service';

const SETTINGS_ID = 'default';
const DEFAULT_SYSTEM_NAME = '下单登记系统';
const DEFAULT_BRAND_MARK_TEXT = '浪姐';
const DEFAULT_ALLOWED_HOSTS = ['localhost'];
const SETTINGS_CACHE_TTL_MS = 3_000;

interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
  requestHost?: string;
  localRequest?: boolean;
}

@Injectable()
export class SystemSettingsService {
  private cachedSettings: SystemSetting | null = null;
  private cacheExpiresAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly runtimeControl: RuntimeControlService,
  ) {}

  private normalizeIp(value?: string | null) {
    if (!value) return 'unknown';
    let ip = value.trim().split(',')[0]?.trim() || 'unknown';
    if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
    if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7);
    if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return '127.0.0.1';
    return ip;
  }

  isLocalIp(value?: string | null) {
    const ip = this.normalizeIp(value);
    return ip === '127.0.0.1' || ip.startsWith('127.');
  }

  getClientIp(request: Request) {
    const expressIp = this.normalizeIp(request.ip);
    if (expressIp !== 'unknown') return expressIp;

    const socketIp = this.normalizeIp(request.socket.remoteAddress);
    if (!this.isLocalIp(socketIp)) return socketIp;

    const forwarded = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return forwardedIp ? this.normalizeIp(forwardedIp) : socketIp;
  }

  getRequestMetadata(request: Request): RequestMetadata {
    const clientIp = this.getClientIp(request);
    const requestHost = this.getRequestHost(request);
    return {
      ipAddress: clientIp.slice(0, 64),
      userAgent: request.get('user-agent')?.slice(0, 2_000),
      requestHost,
      localRequest: this.isLocalIp(clientIp) || requestHost === 'localhost',
    };
  }

  private normalizeRequestHost(value?: string | null) {
    if (!value) return '';
    let host = value.split(',')[0]?.trim().toLowerCase() ?? '';
    if (!host) return '';

    if (host.includes('://')) {
      try {
        host = new URL(host).hostname;
      } catch {
        return '';
      }
    } else if (host.startsWith('[')) {
      const closingBracket = host.indexOf(']');
      host = closingBracket > 0 ? host.slice(1, closingBracket) : host;
    } else {
      host = host.split('/')[0]?.replace(/:\d+$/, '') ?? '';
    }

    host = host.replace(/\.$/, '');
    return domainToASCII(host) || host;
  }

  getRequestHost(request: Request) {
    const expressHostname = this.normalizeRequestHost(request.hostname);
    if (expressHostname) return expressHostname;

    const socketIp = this.normalizeIp(request.socket.remoteAddress);
    const forwarded = request.headers['x-forwarded-host'];
    const forwardedHost = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const source =
      this.isLocalIp(socketIp) && forwardedHost
        ? forwardedHost
        : request.headers.host;
    return this.normalizeRequestHost(source);
  }

  private normalizeAllowedHost(value: string) {
    let candidate = value.trim().toLowerCase();
    if (!candidate) return '';

    const wildcard = candidate.startsWith('*.');
    if (wildcard) candidate = candidate.slice(2);
    candidate = this.normalizeRequestHost(candidate);

    if (candidate === 'localhost') return candidate;
    if (!candidate || isIP(candidate)) {
      throw new BadRequestException(
        '域名白名单只需要填写域名，IP 地址无需添加',
      );
    }
    if (candidate.length > 253 || candidate.includes('*')) {
      throw new BadRequestException(`域名格式不正确：${value}`);
    }

    const labels = candidate.split('.');
    if (
      labels.some(
        (label) =>
          !label ||
          label.length > 63 ||
          !/^[a-z0-9-]+$/i.test(label) ||
          label.startsWith('-') ||
          label.endsWith('-'),
      )
    ) {
      throw new BadRequestException(`域名格式不正确：${value}`);
    }

    return wildcard ? `*.${candidate}` : candidate;
  }

  normalizeAllowedHosts(values: string[]) {
    const normalized = values
      .map((value) => this.normalizeAllowedHost(value))
      .filter(Boolean);
    return [...new Set(normalized)];
  }

  private initialAllowedHosts() {
    const configured = this.config
      .get<string>('INITIAL_ALLOWED_HOSTS')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return configured?.length
      ? this.normalizeAllowedHosts(configured)
      : DEFAULT_ALLOWED_HOSTS;
  }

  private isHostAllowed(host: string, allowedHosts: string[]) {
    if (!host) return false;
    return allowedHosts.some((allowedHost) => {
      if (allowedHost.startsWith('*.')) {
        const suffix = allowedHost.slice(1);
        return host.endsWith(suffix) && host.length > suffix.length;
      }
      return host === allowedHost;
    });
  }

  private normalizeRootRedirectUrl(
    mode: RootAccessMode,
    value?: string | null,
    currentHost?: string,
  ) {
    if (mode === RootAccessMode.NOT_FOUND) return null;

    const input = value?.trim();
    if (!input) throw new BadRequestException('请填写域名首页跳转地址');

    let redirectUrl: URL;
    try {
      redirectUrl = new URL(input);
    } catch {
      throw new BadRequestException('跳转地址格式不正确');
    }

    if (!['http:', 'https:'].includes(redirectUrl.protocol)) {
      throw new BadRequestException('跳转地址只支持 http 或 https');
    }
    if (redirectUrl.username || redirectUrl.password) {
      throw new BadRequestException('跳转地址不能包含账号或密码');
    }

    const normalized = redirectUrl.toString();
    if (normalized.length > 2048) {
      throw new BadRequestException('跳转地址不能超过 2048 个字符');
    }

    if (
      currentHost &&
      this.normalizeRequestHost(redirectUrl.hostname) === currentHost &&
      redirectUrl.pathname === '/' &&
      !redirectUrl.search &&
      !redirectUrl.hash
    ) {
      throw new BadRequestException('跳转地址不能仍然是当前域名首页');
    }

    return normalized;
  }

  private normalizeAdminEntryPath(value?: string | null) {
    const normalized = normalizeAdminEntryPath(value ?? '');
    if (!normalized) return null;
    if (!isValidAdminEntryPath(normalized)) {
      throw new BadRequestException(
        '后台安全入口需为 5 至 12 位字母和数字，并且必须同时包含字母与数字',
      );
    }
    return normalized;
  }

  private async loadSettings(force = false) {
    const now = Date.now();
    if (!force && this.cachedSettings && this.cacheExpiresAt > now) {
      return this.cachedSettings;
    }

    const settings = await this.prisma.systemSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        systemName: DEFAULT_SYSTEM_NAME,
        brandMarkText: DEFAULT_BRAND_MARK_TEXT,
        externalAccessEnabled: true,
        allowedHosts: this.initialAllowedHosts(),
        adminEntryPath: null,
        rootAccessMode: RootAccessMode.NOT_FOUND,
        rootRedirectUrl: null,
      },
      update: {},
    });
    this.cachedSettings = settings;
    this.cacheExpiresAt = now + SETTINGS_CACHE_TTL_MS;
    return settings;
  }

  private buildAccessDecision(settings: SystemSetting, request: Request) {
    const clientIp = this.getClientIp(request);
    const requestHost = this.getRequestHost(request);
    const localRequest =
      this.isLocalIp(clientIp) || requestHost === 'localhost';
    const ipHost = isIP(requestHost) > 0;
    const hostAllowed =
      localRequest ||
      ipHost ||
      this.isHostAllowed(requestHost, settings.allowedHosts);
    const publicAccessReason = localRequest
      ? 'LOCAL_REQUEST'
      : ipHost
        ? 'IP_ADDRESS_ALLOWED'
        : hostAllowed
          ? 'HOST_ALLOWED'
          : 'HOST_NOT_ALLOWED';
    let accessReason = 'HOST_ALLOWED';
    let networkAllowed = hostAllowed;

    if (localRequest) {
      accessReason = 'LOCAL_REQUEST';
      networkAllowed = true;
    } else if (!settings.externalAccessEnabled) {
      accessReason = 'EXTERNAL_ACCESS_DISABLED';
      networkAllowed = false;
    } else if (ipHost) {
      accessReason = 'IP_ADDRESS_ALLOWED';
      networkAllowed = true;
    } else if (!hostAllowed) {
      accessReason = 'HOST_NOT_ALLOWED';
      networkAllowed = false;
    }

    const adminEntryGranted =
      localRequest ||
      !settings.adminEntryPath ||
      (networkAllowed && this.hasValidAdminEntryGrant(request, settings));
    if (networkAllowed && !adminEntryGranted) {
      accessReason = 'ADMIN_ENTRY_REQUIRED';
    }

    return {
      allowed: networkAllowed && adminEntryGranted,
      networkAllowed,
      adminEntryGranted,
      publicAllowed: hostAllowed,
      publicAccessReason,
      clientIp,
      localRequest,
      requestHost,
      hostAllowed,
      accessReason,
      settings,
    };
  }

  async getAccessDecision(request: Request) {
    return this.buildAccessDecision(await this.loadSettings(), request);
  }

  async getPublicSettings(request: Request) {
    const decision = await this.getAccessDecision(request);
    return {
      systemName: decision.settings.systemName,
      brandMarkText: decision.settings.brandMarkText,
      externalAccessEnabled: decision.settings.externalAccessEnabled,
      accessAllowed: decision.allowed,
      publicAccessAllowed: decision.publicAllowed,
      publicAccessReason: decision.publicAccessReason,
      rootAccessMode: decision.settings.rootAccessMode,
      rootRedirectUrl: decision.settings.rootRedirectUrl,
      adminEntryGranted: decision.adminEntryGranted,
      clientIp: decision.clientIp,
      localRequest: decision.localRequest,
      requestHost: decision.requestHost,
      hostAllowed: decision.hostAllowed,
      accessReason: decision.accessReason,
      updatedAt: decision.settings.updatedAt,
    };
  }

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

  private getAdminEntryCookieName() {
    return this.config.get<string>(
      'ADMIN_ENTRY_COOKIE',
      DEFAULT_ADMIN_ENTRY_COOKIE,
    );
  }

  private getAdminEntrySecret() {
    return this.config.getOrThrow<string>('DATA_ENCRYPTION_KEY');
  }

  private getAdminEntryTtlDays() {
    const configured = Number(
      this.config.get<string>(
        'ADMIN_ENTRY_TTL_DAYS',
        String(DEFAULT_ADMIN_ENTRY_TTL_DAYS),
      ),
    );
    return Number.isInteger(configured) && configured >= 1 && configured <= 365
      ? configured
      : DEFAULT_ADMIN_ENTRY_TTL_DAYS;
  }

  private hasValidAdminEntryGrant(request: Request, settings: SystemSetting) {
    if (!settings.adminEntryPath) return true;
    const token = readCookie(request, this.getAdminEntryCookieName());
    if (!token) return false;
    return verifyAdminEntryGrant(
      token,
      settings.adminEntryPath,
      this.getAdminEntrySecret(),
    );
  }

  private getCookieSecure(request?: Request) {
    const setting = this.config.get<string>('ADMIN_COOKIE_SECURE', 'auto');
    const webOrigins = this.getWebOrigins();
    const forwardedProto = request
      ?.get('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
      .toLowerCase();
    return (
      setting === 'true' ||
      (setting === 'auto' &&
        (request?.secure ||
          forwardedProto === 'https' ||
          webOrigins.some((origin) => origin.startsWith('https://'))))
    );
  }

  writeAdminEntryCookie(
    request: Request,
    response: Response,
    adminEntryPath: string,
  ) {
    const expiresAt = new Date(
      Date.now() + this.getAdminEntryTtlDays() * 24 * 60 * 60 * 1_000,
    );
    response.cookie(
      this.getAdminEntryCookieName(),
      createAdminEntryGrant(
        adminEntryPath,
        this.getAdminEntrySecret(),
        expiresAt.getTime(),
      ),
      {
        httpOnly: true,
        secure: this.getCookieSecure(request),
        sameSite: 'lax',
        path: ADMIN_ENTRY_COOKIE_PATH,
        expires: expiresAt,
      },
    );
    return expiresAt;
  }

  async grantAdminEntry(
    entryInput: unknown,
    request: Request,
    response: Response,
  ) {
    const settings = await this.loadSettings();
    const decision = this.buildAccessDecision(settings, request);
    const entry =
      typeof entryInput === 'string' ? normalizeAdminEntryPath(entryInput) : '';
    if (
      !decision.networkAllowed ||
      !settings.adminEntryPath ||
      !entry ||
      !matchesAdminEntryPath(entry, settings.adminEntryPath)
    ) {
      throw new NotFoundException('页面不存在');
    }

    return {
      granted: true,
      expiresAt: this.writeAdminEntryCookie(
        request,
        response,
        settings.adminEntryPath,
      ),
    };
  }

  private getWebOrigins() {
    return this.config
      .get<string>('WEB_ORIGIN', 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  /**
   * 将同一浏览器在不同域名、IP 或反向代理入口产生的会话归并成一个设备。
   * 新会话优先使用稳定指纹；历史记录没有指纹时再使用设备 Cookie 或 User-Agent
   * 兼容，避免后台把同一台电脑显示成多个设备。
   */
  private sessionGroupWhere(session: {
    id: string;
    deviceFingerprintHash: string | null;
    deviceIdHash: string | null;
    userAgent: string | null;
  }) {
    const candidates: Prisma.AdminSessionWhereInput[] = [];
    if (session.deviceFingerprintHash) {
      candidates.push({ deviceFingerprintHash: session.deviceFingerprintHash });
      if (session.userAgent) {
        candidates.push({
          deviceFingerprintHash: null,
          userAgent: session.userAgent,
        });
      }
    }
    if (session.deviceIdHash) {
      candidates.push({ deviceIdHash: session.deviceIdHash });
    }
    if (!session.deviceFingerprintHash && session.userAgent) {
      // 旧版本没有指纹时，设备 Cookie 会因域名/IP 隔离而不同；同一 UA 归并，
      // 让历史记录也能从“多个地址”恢复为一个设备。
      candidates.push({
        deviceFingerprintHash: null,
        userAgent: session.userAgent,
      });
    }
    if (!candidates.length) candidates.push({ id: session.id });
    return candidates.length === 1 ? candidates[0] : { OR: candidates };
  }

  private async getActiveSessionGroup(sessionId: string, adminId: string) {
    const now = new Date();
    const anchor = await this.prisma.adminSession.findFirst({
      where: {
        id: sessionId,
        adminUserId: adminId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        deviceFingerprintHash: true,
        deviceIdHash: true,
        userAgent: true,
      },
    });
    if (!anchor) throw new NotFoundException('会话不存在或已经失效');

    const groupWhere = this.sessionGroupWhere(anchor);
    return this.prisma.adminSession.findMany({
      where: {
        adminUserId: adminId,
        revokedAt: null,
        expiresAt: { gt: now },
        ...groupWhere,
      },
      select: { id: true },
    });
  }

  async getAdminSettings(
    request: Request,
    currentSessionId: string,
    adminId: string,
  ) {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const databaseStartedAt = performance.now();
    let databaseStatus: 'online' | 'offline' = 'online';
    let databaseResponseTimeMs: number | null = null;
    let databaseError = '';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseResponseTimeMs = Math.max(
        1,
        Math.round(performance.now() - databaseStartedAt),
      );
    } catch (error) {
      databaseStatus = 'offline';
      databaseError = error instanceof Error ? error.message : '数据库连接失败';
    }

    const [
      settings,
      activeSessions,
      failedLoginAttempts24h,
      lastFailedLogin,
      admin,
    ] = await Promise.all([
      this.loadSettings(true),
      this.prisma.adminSession.findMany({
        where: {
          adminUserId: adminId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { lastSeenAt: 'desc' },
        select: {
          id: true,
          deviceIdHash: true,
          deviceFingerprintHash: true,
          ipAddress: true,
          userAgent: true,
          deviceName: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
          adminUser: { select: { displayName: true, username: true } },
        },
      }),
      this.prisma.auditLog.count({
        where: { action: 'LOGIN_FAILED', createdAt: { gte: since } },
      }),
      this.prisma.auditLog.findFirst({
        where: { action: 'LOGIN_FAILED' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, ipAddress: true },
      }),
      this.prisma.adminUser.findFirst({
        where: { id: adminId, status: AdminStatus.ACTIVE },
        select: { lastLoginAt: true },
      }),
    ]);

    const memory = process.memoryUsage();
    const uptimeSeconds = Math.max(0, Math.floor(process.uptime()));
    const accessDecision = this.buildAccessDecision(settings, request);
    const runtimeControl = this.runtimeControl.getStatus();

    const sessionGroups = new Map<
      string,
      {
        sessions: typeof activeSessions;
        current: boolean;
      }
    >();
    const fingerprintsByUserAgent = new Map<string, Set<string>>();
    for (const session of activeSessions) {
      if (!session.deviceFingerprintHash || !session.userAgent) continue;
      const fingerprints =
        fingerprintsByUserAgent.get(session.userAgent) ?? new Set<string>();
      fingerprints.add(session.deviceFingerprintHash);
      fingerprintsByUserAgent.set(session.userAgent, fingerprints);
    }
    for (const session of activeSessions) {
      const legacyFingerprint =
        session.userAgent &&
        !session.deviceFingerprintHash &&
        fingerprintsByUserAgent.get(session.userAgent)?.size === 1
          ? [...fingerprintsByUserAgent.get(session.userAgent)!][0]
          : null;
      const key = session.deviceFingerprintHash
        ? `fingerprint:${session.deviceFingerprintHash}`
        : legacyFingerprint
          ? `fingerprint:${legacyFingerprint}`
          : session.userAgent
            ? `ua:${session.userAgent}`
            : session.deviceIdHash
              ? `device:${session.deviceIdHash}`
              : `session:${session.id}`;
      const existing = sessionGroups.get(key);
      if (existing) {
        existing.sessions.push(session);
        existing.current ||= session.id === currentSessionId;
      } else {
        sessionGroups.set(key, {
          sessions: [session],
          current: session.id === currentSessionId,
        });
      }
    }
    const groupedSessions = [...sessionGroups.values()].map((group) => {
      const sorted = [...group.sessions].sort(
        (left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime(),
      );
      const latest = sorted[0];
      const createdAt = group.sessions.reduce(
        (earliest, session) =>
          session.createdAt < earliest ? session.createdAt : earliest,
        latest.createdAt,
      );
      const expiresAt = group.sessions.reduce(
        (latestExpiry, session) =>
          session.expiresAt > latestExpiry ? session.expiresAt : latestExpiry,
        latest.expiresAt,
      );
      return {
        id: latest.id,
        sessionIds: group.sessions.map((session) => session.id),
        sessionCount: group.sessions.length,
        ipAddress: latest.ipAddress,
        ipAddresses: [
          ...new Set(
            group.sessions
              .map((session) => session.ipAddress)
              .filter((value): value is string => Boolean(value)),
          ),
        ],
        userAgent: latest.userAgent,
        deviceName:
          normalizeDeviceName(latest.deviceName) ??
          describeUserAgent(latest.userAgent),
        createdAt,
        lastSeenAt: latest.lastSeenAt,
        expiresAt,
        adminUser: latest.adminUser,
        current: group.current,
      };
    });

    return {
      settings: {
        systemName: settings.systemName,
        brandMarkText: settings.brandMarkText,
        externalAccessEnabled: settings.externalAccessEnabled,
        allowedHosts: settings.allowedHosts,
        adminEntryPath: settings.adminEntryPath,
        rootAccessMode: settings.rootAccessMode,
        rootRedirectUrl: settings.rootRedirectUrl,
        updatedAt: settings.updatedAt,
      },
      runtime: {
        api: {
          status: 'online',
          service: 'order-system-api',
          startedAt: new Date(Date.now() - uptimeSeconds * 1_000),
          uptimeSeconds,
          nodeVersion: process.version,
          environment: this.config.get<string>('NODE_ENV', 'development'),
        },
        database: {
          status: databaseStatus,
          responseTimeMs: databaseResponseTimeMs,
          error: databaseError,
          accessEnabled: runtimeControl.databaseAccessEnabled,
          accessUpdatedAt: runtimeControl.databaseAccessUpdatedAt,
        },
        control: {
          apiRestartSupported: runtimeControl.apiRestartSupported,
          apiRestartMode: runtimeControl.apiRestartMode,
          webRestartSupported: runtimeControl.webRestartSupported,
          webRestartMode: runtimeControl.webRestartMode,
        },
        process: {
          pid: process.pid,
          platform: process.platform,
          arch: process.arch,
          hostname: os.hostname(),
          cpuCount: os.cpus().length,
          memoryRssMb: Math.round(memory.rss / 1024 / 1024),
          heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
        },
        webOrigins: this.getWebOrigins(),
        serverTime: now,
      },
      security: {
        currentIp: accessDecision.clientIp,
        localRequest: accessDecision.localRequest,
        requestHost: accessDecision.requestHost,
        hostAllowed: accessDecision.hostAllowed,
        accessReason: accessDecision.accessReason,
        adminEntryGranted: accessDecision.adminEntryGranted,
        adminEntryTtlDays: this.getAdminEntryTtlDays(),
        allowedHosts: settings.allowedHosts,
        activeSessionCount: groupedSessions.length,
        failedLoginAttempts24h,
        lastFailedLoginAt: lastFailedLogin?.createdAt ?? null,
        lastFailedLoginIp: lastFailedLogin?.ipAddress ?? null,
        lastSuccessfulLoginAt: admin?.lastLoginAt ?? null,
        sessionTtlDays: this.getSessionTtlDays(),
        cookieSecure: this.getCookieSecure(request),
        apiRateLimit: API_RATE_LIMIT_REQUESTS,
        loginRateLimit: ADMIN_LOGIN_RATE_LIMIT_REQUESTS,
        rateLimitWindowSeconds: Math.round(RATE_LIMIT_WINDOW_MS / 1_000),
        allowedOrigins: this.getWebOrigins(),
        sessions: groupedSessions,
      },
    };
  }

  private isAuditObject(
    value: Prisma.JsonValue | null,
  ): value is Prisma.JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private getAuditChangedFields(
    beforeData: Prisma.JsonValue | null,
    afterData: Prisma.JsonValue | null,
  ) {
    const before = this.isAuditObject(beforeData) ? beforeData : {};
    const after = this.isAuditObject(afterData) ? afterData : {};
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    );
  }

  async listAuditLogs(query: ListSystemAuditLogsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const keyword = query.keyword?.trim();
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(keyword
        ? {
            OR: [
              { action: { contains: keyword, mode: 'insensitive' } },
              { entityType: { contains: keyword, mode: 'insensitive' } },
              { entityId: { contains: keyword, mode: 'insensitive' } },
              { source: { contains: keyword, mode: 'insensitive' } },
              { ipAddress: { contains: keyword, mode: 'insensitive' } },
              {
                actor: {
                  is: {
                    OR: [
                      {
                        displayName: {
                          contains: keyword,
                          mode: 'insensitive',
                        },
                      },
                      {
                        username: {
                          contains: keyword,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total, allTotal, entityTypes, actions] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          source: true,
          action: true,
          entityType: true,
          entityId: true,
          beforeData: true,
          afterData: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          actor: {
            select: {
              id: true,
              displayName: true,
              username: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findMany({
        distinct: ['entityType'],
        orderBy: { entityType: 'asc' },
        select: { entityType: true },
      }),
      this.prisma.auditLog.findMany({
        distinct: ['action'],
        orderBy: { action: 'asc' },
        select: { action: true },
      }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        source: item.source,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        changedFields: this.getAuditChangedFields(
          item.beforeData,
          item.afterData,
        ),
        ipAddress: item.ipAddress,
        deviceName: describeUserAgent(item.userAgent),
        createdAt: item.createdAt,
        actor: item.actor,
      })),
      pagination: {
        page,
        pageSize,
        total,
        allTotal,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      filters: {
        entityTypes: entityTypes.map((item) => item.entityType),
        actions: actions.map((item) => item.action),
      },
    };
  }

  async clearAuditLogs(admin: AuthenticatedAdmin, metadata: RequestMetadata) {
    const clearedAt = new Date();
    const deletedCount = await this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.auditLog.deleteMany({});
      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'AUDIT_LOGS_CLEARED',
          entityType: 'AuditLog',
          entityId: 'all',
          afterData: {
            deletedCount: deleted.count,
            clearedAt: clearedAt.toISOString(),
          } satisfies Prisma.InputJsonObject,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      return deleted.count;
    });

    return { success: true, deletedCount };
  }

  async updateSettings(
    dto: UpdateSystemSettingsDto,
    admin: AuthenticatedAdmin,
    metadata: RequestMetadata,
  ) {
    const systemName = dto.systemName.trim();
    if (systemName.length < 2)
      throw new BadRequestException('系统名称至少需要 2 个字符');
    const brandMarkText = dto.brandMarkText.trim();
    if (!brandMarkText || brandMarkText.length > 4) {
      throw new BadRequestException('品牌图标文字需要 1 至 4 个字符');
    }
    const allowedHosts = this.normalizeAllowedHosts(dto.allowedHosts);
    const adminEntryPath = this.normalizeAdminEntryPath(dto.adminEntryPath);
    const rootRedirectUrl = this.normalizeRootRedirectUrl(
      dto.rootAccessMode,
      dto.rootRedirectUrl,
      metadata.requestHost,
    );
    const currentHost = metadata.requestHost ?? '';
    if (
      dto.externalAccessEnabled &&
      !metadata.localRequest &&
      currentHost &&
      !isIP(currentHost) &&
      !this.isHostAllowed(currentHost, allowedHosts)
    ) {
      throw new BadRequestException(
        `当前访问域名 ${currentHost} 必须保留在白名单中`,
      );
    }

    const before = await this.loadSettings(true);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const setting = await transaction.systemSetting.upsert({
        where: { id: SETTINGS_ID },
        create: {
          id: SETTINGS_ID,
          systemName,
          brandMarkText,
          externalAccessEnabled: dto.externalAccessEnabled,
          allowedHosts,
          adminEntryPath,
          rootAccessMode: dto.rootAccessMode,
          rootRedirectUrl,
        },
        update: {
          systemName,
          brandMarkText,
          externalAccessEnabled: dto.externalAccessEnabled,
          allowedHosts,
          adminEntryPath,
          rootAccessMode: dto.rootAccessMode,
          rootRedirectUrl,
        },
      });

      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'SYSTEM_SETTINGS_UPDATED',
          entityType: 'SystemSetting',
          entityId: SETTINGS_ID,
          beforeData: {
            systemName: before.systemName,
            brandMarkText: before.brandMarkText,
            externalAccessEnabled: before.externalAccessEnabled,
            allowedHosts: before.allowedHosts,
            adminEntryPath: before.adminEntryPath,
            rootAccessMode: before.rootAccessMode,
            rootRedirectUrl: before.rootRedirectUrl,
          } satisfies Prisma.InputJsonObject,
          afterData: {
            systemName: setting.systemName,
            brandMarkText: setting.brandMarkText,
            externalAccessEnabled: setting.externalAccessEnabled,
            allowedHosts: setting.allowedHosts,
            adminEntryPath: setting.adminEntryPath,
            rootAccessMode: setting.rootAccessMode,
            rootRedirectUrl: setting.rootRedirectUrl,
          } satisfies Prisma.InputJsonObject,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });

      return setting;
    });

    this.cachedSettings = updated;
    this.cacheExpiresAt = Date.now() + SETTINGS_CACHE_TTL_MS;
    return {
      systemName: updated.systemName,
      brandMarkText: updated.brandMarkText,
      externalAccessEnabled: updated.externalAccessEnabled,
      allowedHosts: updated.allowedHosts,
      adminEntryPath: updated.adminEntryPath,
      rootAccessMode: updated.rootAccessMode,
      rootRedirectUrl: updated.rootRedirectUrl,
      updatedAt: updated.updatedAt,
    };
  }

  async renameSession(
    sessionId: string,
    deviceNameInput: string,
    admin: AuthenticatedAdmin,
    metadata: RequestMetadata,
  ) {
    const deviceName = normalizeDeviceName(deviceNameInput);
    if (!deviceName) throw new BadRequestException('设备名称不能为空');

    const group = await this.getActiveSessionGroup(sessionId, admin.id);
    const result = await this.prisma.adminSession.updateMany({
      where: { id: { in: group.map((session) => session.id) } },
      data: { deviceName },
    });

    await this.prisma.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action: 'ADMIN_SESSION_RENAMED',
        entityType: 'AdminSession',
        entityId: sessionId,
        afterData: { deviceName },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    return { deviceName };
  }

  async revokeSession(
    sessionId: string,
    currentSessionId: string,
    admin: AuthenticatedAdmin,
    metadata: RequestMetadata,
  ) {
    const group = await this.getActiveSessionGroup(sessionId, admin.id);
    if (group.some((session) => session.id === currentSessionId)) {
      throw new BadRequestException('当前设备请使用右上角退出登录');
    }
    const result = await this.prisma.adminSession.updateMany({
      where: { id: { in: group.map((session) => session.id) } },
      data: { revokedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action: 'ADMIN_SESSION_REVOKED',
        entityType: 'AdminSession',
        entityId: sessionId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    return { revoked: result.count };
  }

  async revokeOtherSessions(
    currentSessionId: string,
    admin: AuthenticatedAdmin,
    metadata: RequestMetadata,
  ) {
    const now = new Date();
    const currentGroup = await this.getActiveSessionGroup(
      currentSessionId,
      admin.id,
    );
    const currentIds = currentGroup.map((session) => session.id);
    const result = await this.prisma.adminSession.updateMany({
      where: {
        adminUserId: admin.id,
        id: { notIn: currentIds },
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    });

    await this.prisma.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action: 'OTHER_ADMIN_SESSIONS_REVOKED',
        entityType: 'AdminUser',
        entityId: admin.id,
        afterData: { revokedCount: result.count },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    return { revoked: result.count };
  }
}
