import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
} from '../security/sensitive-value';
import {
  AFFILIATE_PLATFORM_DEFINITION_MAP,
  AFFILIATE_PLATFORM_DEFINITIONS,
  type AffiliateCredentialKey,
  type AffiliatePlatformDefinition,
} from './affiliate-platform.constants';
import { LihuaXiongAffiliateAdapter } from './adapters/lihuaxiong.adapter';
import { YouzaiAssistantAffiliateAdapter } from './adapters/youzai.adapter';
import { LIHUAXIONG_PROTOCOL } from './adapters/lihuaxiong.codec';
import { ConvertAffiliateLinkDto } from './dto/convert-affiliate-link.dto';
import { ListAffiliateConversionsDto } from './dto/list-affiliate-conversions.dto';
import {
  RefreshAffiliateTokenDto,
  VerifyAffiliateTokenDto,
} from './dto/refresh-affiliate-token.dto';
import {
  AffiliateCredentialsDto,
  UpdateAffiliatePlatformDto,
} from './dto/update-affiliate-platform.dto';

type StoredAffiliateConfig = {
  schemaVersion: 1;
  providerType: AffiliatePlatformDefinition['providerType'];
  supportedPlatformCodes: string[];
  apiBaseUrl: string | null;
  tokenEndpoint: string | null;
  device: string | null;
  notes: string | null;
};

type StoredAffiliateCredentials = Partial<
  Record<AffiliateCredentialKey, string>
>;

type AffiliatePlatformRecord = Prisma.AffiliatePlatformGetPayload<{
  include: {
    accounts: {
      orderBy: { createdAt: 'asc' };
      take: 1;
    };
  };
}>;

@Injectable()
export class AffiliateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly lihuaXiongAdapter: LihuaXiongAffiliateAdapter,
    private readonly youzaiAssistantAdapter: YouzaiAssistantAffiliateAdapter,
  ) {}

  private encryptionKey() {
    return this.config.getOrThrow<string>('DATA_ENCRYPTION_KEY');
  }

  private clean(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private definition(code: string) {
    const normalized = code.trim().toLowerCase();
    const definition = AFFILIATE_PLATFORM_DEFINITION_MAP.get(normalized);
    if (!definition) throw new NotFoundException('返利平台接口不存在');
    return definition;
  }

  private storedConfig(
    definition: AffiliatePlatformDefinition,
    value: Prisma.JsonValue | null | undefined,
  ): StoredAffiliateConfig {
    const config =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, Prisma.JsonValue>)
        : {};

    return {
      schemaVersion: 1,
      providerType: definition.providerType,
      supportedPlatformCodes: definition.supportedPlatforms.map(
        (platform) => platform.code,
      ),
      apiBaseUrl:
        typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl : null,
      tokenEndpoint:
        typeof config.tokenEndpoint === 'string'
          ? this.clean(config.tokenEndpoint)
          : null,
      device:
        typeof config.device === 'string' ? this.clean(config.device) : null,
      notes: typeof config.notes === 'string' ? config.notes : null,
    };
  }

  private readCredentials(encrypted?: string | null) {
    if (!encrypted) {
      return {
        values: {} as StoredAffiliateCredentials,
        readable: true,
      };
    }

    try {
      const parsed: unknown = JSON.parse(
        decryptSensitiveValue(encrypted, this.encryptionKey()),
      );
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('返利接口密钥格式不正确');
      }

      const values: StoredAffiliateCredentials = {};
      for (const key of [
        'apiKey',
        'apiSecret',
        'accessToken',
        'promotionId',
      ] as AffiliateCredentialKey[]) {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.trim()) values[key] = value;
      }
      return { values, readable: true };
    } catch {
      return {
        values: {} as StoredAffiliateCredentials,
        readable: false,
      };
    }
  }

  private mergeCredentials(
    existing: StoredAffiliateCredentials,
    requested?: AffiliateCredentialsDto,
  ) {
    const merged = { ...existing };
    if (!requested) return merged;

    for (const key of [
      'apiKey',
      'apiSecret',
      'accessToken',
      'promotionId',
    ] as AffiliateCredentialKey[]) {
      const value = this.clean(requested[key]);
      if (value) merged[key] = value;
    }
    return merged;
  }

  private configuredFields(credentials: StoredAffiliateCredentials) {
    return (Object.keys(credentials) as AffiliateCredentialKey[]).filter(
      (key) => Boolean(credentials[key]),
    );
  }

  private toView(
    definition: AffiliatePlatformDefinition,
    record?: AffiliatePlatformRecord,
  ) {
    const account = record?.accounts[0];
    const storedConfig = this.storedConfig(definition, record?.config);
    const credentials = this.readCredentials(account?.credentialsEncrypted);
    const configuredCredentialFields = this.configuredFields(
      credentials.values,
    );

    return {
      id: record?.id ?? null,
      code: definition.code,
      name: definition.name,
      shortName: definition.shortName,
      providerType: definition.providerType,
      description: definition.description,
      supportedPlatforms: definition.supportedPlatforms,
      credentialFields: definition.credentialFields,
      enabled: record?.enabled ?? false,
      accountName: account?.name ?? `${definition.name}默认接口`,
      apiBaseUrl: storedConfig.apiBaseUrl ?? definition.defaultApiBaseUrl ?? '',
      tokenEndpoint: storedConfig.tokenEndpoint ?? '',
      device:
        definition.adapterType === 'LIHUA_XIONG'
          ? (storedConfig.device ?? LIHUAXIONG_PROTOCOL.device)
          : '',
      notes: storedConfig.notes ?? '',
      configured: configuredCredentialFields.length > 0,
      configuredCredentialFields,
      credentialsReadable: credentials.readable,
      updatedAt: record?.updatedAt ?? null,
    };
  }

  async list() {
    const records = await this.prisma.affiliatePlatform.findMany({
      where: {
        code: { in: AFFILIATE_PLATFORM_DEFINITIONS.map(({ code }) => code) },
      },
      include: {
        accounts: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    const recordMap = new Map(records.map((record) => [record.code, record]));

    return {
      items: AFFILIATE_PLATFORM_DEFINITIONS.map((definition) =>
        this.toView(definition, recordMap.get(definition.code)),
      ),
    };
  }

  async update(
    code: string,
    dto: UpdateAffiliatePlatformDto,
    admin: AuthenticatedAdmin,
  ) {
    const definition = this.definition(code);
    const existing = await this.prisma.affiliatePlatform.findUnique({
      where: { code: definition.code },
      include: {
        accounts: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    const existingAccount = existing?.accounts[0];
    const existingConfig = this.storedConfig(definition, existing?.config);
    const existingCredentials = this.readCredentials(
      existingAccount?.credentialsEncrypted,
    );
    const mergedCredentials = this.mergeCredentials(
      existingCredentials.values,
      dto.credentials,
    );
    const hasCredentialReplacement = dto.credentials
      ? (Object.values(dto.credentials) as Array<string | undefined>).some(
          (value) => Boolean(this.clean(value)),
        )
      : false;
    const storedConfig: StoredAffiliateConfig = {
      schemaVersion: 1,
      providerType: definition.providerType,
      supportedPlatformCodes: definition.supportedPlatforms.map(
        (platform) => platform.code,
      ),
      apiBaseUrl:
        dto.apiBaseUrl === undefined
          ? existingConfig.apiBaseUrl
          : this.clean(dto.apiBaseUrl),
      tokenEndpoint:
        dto.tokenEndpoint === undefined
          ? existingConfig.tokenEndpoint
          : this.clean(dto.tokenEndpoint),
      device:
        definition.adapterType === 'LIHUA_XIONG'
          ? dto.device === undefined
            ? existingConfig.device
            : this.clean(dto.device)
          : null,
      notes:
        dto.notes === undefined ? existingConfig.notes : this.clean(dto.notes),
    };
    const accountName =
      this.clean(dto.accountName) ??
      existingAccount?.name ??
      `${definition.name}默认接口`;
    const encryptedCredentials =
      existingAccount &&
      !existingCredentials.readable &&
      !hasCredentialReplacement
        ? existingAccount.credentialsEncrypted
        : encryptSensitiveValue(
            JSON.stringify(mergedCredentials),
            this.encryptionKey(),
          );
    const configuredCredentialFields = this.configuredFields(mergedCredentials);

    const platform = await this.prisma.$transaction(async (transaction) => {
      const savedPlatform = await transaction.affiliatePlatform.upsert({
        where: { code: definition.code },
        create: {
          code: definition.code,
          name: definition.name,
          enabled: dto.enabled ?? false,
          config: storedConfig,
        },
        update: {
          name: definition.name,
          enabled: dto.enabled,
          config: storedConfig,
        },
      });

      if (existingAccount) {
        await transaction.affiliateAccount.update({
          where: { id: existingAccount.id },
          data: {
            name: accountName,
            enabled: dto.enabled ?? existingAccount.enabled,
            credentialsEncrypted: encryptedCredentials,
          },
        });
      } else {
        await transaction.affiliateAccount.create({
          data: {
            affiliatePlatformId: savedPlatform.id,
            name: accountName,
            enabled: dto.enabled ?? false,
            credentialsEncrypted: encryptedCredentials,
          },
        });
      }

      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: existing ? 'UPDATE' : 'CREATE',
          entityType: 'AffiliatePlatform',
          entityId: savedPlatform.id,
          beforeData: existing
            ? {
                code: definition.code,
                enabled: existing.enabled,
                accountName: existingAccount?.name ?? null,
                apiBaseUrl: existingConfig.apiBaseUrl,
                tokenEndpoint: existingConfig.tokenEndpoint,
                device: existingConfig.device,
                notes: existingConfig.notes,
                configuredCredentialFields: this.configuredFields(
                  existingCredentials.values,
                ),
              }
            : undefined,
          afterData: {
            code: definition.code,
            enabled: savedPlatform.enabled,
            accountName,
            apiBaseUrl: storedConfig.apiBaseUrl,
            tokenEndpoint: storedConfig.tokenEndpoint,
            device: storedConfig.device,
            notes: storedConfig.notes,
            configuredCredentialFields,
          },
        },
      });

      return savedPlatform;
    });

    const refreshed = await this.prisma.affiliatePlatform.findUniqueOrThrow({
      where: { id: platform.id },
      include: {
        accounts: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    return this.toView(definition, refreshed);
  }

  /**
   * 在线获取 Authorization：后台填写一个取 token 的接口地址，由服务端代请求，
   * 解析出的值只回填到前端输入框，管理员确认后再走保存流程落库。
   */
  private assertTokenEndpoint(value: string) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException('Authorization 获取接口地址格式不正确');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException(
        'Authorization 获取接口地址只支持 http 或 https',
      );
    }
    if (parsed.username || parsed.password) {
      throw new BadRequestException(
        'Authorization 获取接口地址不能包含账号或密码',
      );
    }
    const host = parsed.hostname.toLowerCase().replace(/^[|]$/g, '');
    const blocked =
      host === 'localhost' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.localhost') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (blocked) {
      throw new BadRequestException(
        'Authorization 获取接口地址不能指向本机或内网地址',
      );
    }
    return parsed.toString();
  }

  private pickToken(value: unknown, depth = 0): string | null {
    if (depth > 4 || value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const normalized = value
        .trim()
        .replace(/^Bearer\s+/i, '')
        .replace(/^["']|["']$/g, '')
        .trim();
      return /^[A-Za-z0-9._-]{8,512}$/.test(normalized) ? normalized : null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.pickToken(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const preferred = [
      'authorization',
      'token',
      'access_token',
      'accessToken',
      'value',
      'data',
      'result',
    ];
    for (const key of preferred) {
      if (!(key in record)) continue;
      const found = this.pickToken(record[key], depth + 1);
      if (found) return found;
    }
    return null;
  }

  /**
   * 校验 Authorization：已保存的、或前端刚填/刚在线取到的值都能测。
   * 只调用 /user/get 做鉴权探测，不落库、不写转换历史。
   */
  async verifyAuthorization(
    code: string,
    dto: VerifyAffiliateTokenDto,
    admin: AuthenticatedAdmin,
  ) {
    const definition = this.definition(code);
    if (definition.adapterType !== 'YOUZAI_ASSISTANT') {
      throw new BadRequestException(
        `${definition.name}暂不支持 Authorization 校验`,
      );
    }

    const platform = await this.prisma.affiliatePlatform.findUnique({
      where: { code: definition.code },
      include: {
        accounts: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });
    const storedConfig = this.storedConfig(definition, platform?.config);

    let token = this.clean(dto.token);
    if (!token) {
      const credentials = this.readCredentials(
        platform?.accounts[0]?.credentialsEncrypted,
      );
      if (!credentials.readable) {
        throw new BadRequestException('已保存的密钥读取失败，请重新填写并保存');
      }
      token = credentials.values.accessToken ?? null;
    }
    if (!token) {
      throw new BadRequestException('请先填写 Authorization 再测试');
    }

    let result: Awaited<
      ReturnType<YouzaiAssistantAffiliateAdapter['verifyToken']>
    >;
    try {
      result = await this.youzaiAssistantAdapter.verifyToken(
        token,
        this.clean(dto.apiBaseUrl) ??
          storedConfig.apiBaseUrl ??
          definition.defaultApiBaseUrl,
      );
    } catch (error) {
      throw new BadGatewayException(
        error instanceof Error ? error.message : 'Authorization 校验失败',
      );
    }

    await this.prisma.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action: 'AFFILIATE_TOKEN_VERIFY',
        entityType: 'AffiliatePlatform',
        entityId: platform?.id ?? definition.code,
        afterData: {
          code: definition.code,
          valid: result.valid,
          providerCode: result.code,
          providerMessage: result.message,
          tokenLength: token.length,
        },
      },
    });

    return result;
  }

  async refreshAuthorization(
    code: string,
    dto: RefreshAffiliateTokenDto,
    admin: AuthenticatedAdmin,
  ) {
    const definition = this.definition(code);
    const platform = await this.prisma.affiliatePlatform.findUnique({
      where: { code: definition.code },
      select: { id: true, config: true },
    });
    const storedConfig = this.storedConfig(definition, platform?.config);
    const endpoint = this.clean(dto.endpoint) ?? storedConfig.tokenEndpoint;
    if (!endpoint) {
      throw new BadRequestException(
        '请先填写在线获取 Authorization 的接口地址',
      );
    }
    const target = this.assertTokenEndpoint(endpoint);

    let response: Response;
    try {
      response = await fetch(target, {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json, text/plain, */*' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new BadGatewayException('Authorization 获取接口连接失败');
    }

    const text = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(
        `Authorization 获取接口返回 HTTP ${response.status}`,
      );
    }

    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    const authorization = this.pickToken(parsed);
    if (!authorization) {
      throw new BadGatewayException(
        'Authorization 获取接口没有返回可用值，请检查接口返回字段',
      );
    }

    await this.prisma.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action: 'AFFILIATE_TOKEN_FETCH',
        entityType: 'AffiliatePlatform',
        entityId: platform?.id ?? definition.code,
        afterData: {
          code: definition.code,
          endpoint: target,
          tokenLength: authorization.length,
        },
      },
    });

    return {
      authorization,
      endpoint: target,
      fetchedAt: new Date().toISOString(),
    };
  }

  private async persistConversion(
    definition: AffiliatePlatformDefinition,
    platformId: string,
    content: string,
    result: {
      normalizedUrl: string | null;
      productExternalId: string | null;
      promotionUrl: string | null;
      shortUrl: string | null;
      outputText: string;
      providerCode: string | number | null;
      providerMessage: string | null;
      rawData: unknown;
    },
    admin: AuthenticatedAdmin,
  ) {
    const conversion = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.affiliateLinkConversion.create({
        data: {
          affiliatePlatformId: platformId,
          originalUrl: content,
          normalizedUrl: result.normalizedUrl,
          productExternalId: result.productExternalId?.slice(0, 150),
          promotionUrl: result.promotionUrl,
          shortUrl: result.shortUrl,
          promotionText: result.outputText,
          source: 'ADMIN_WEB',
          status: 'SUCCESS',
        },
      });

      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'CREATE',
          entityType: 'AffiliateLinkConversion',
          entityId: saved.id,
          afterData: {
            platformCode: definition.code,
            status: 'SUCCESS',
            normalizedUrl: result.normalizedUrl,
            promotionUrl: result.promotionUrl,
            shortUrl: result.shortUrl,
          },
        },
      });
      return saved;
    });

    return {
      id: conversion.id,
      platformCode: definition.code,
      platformName: definition.name,
      status: conversion.status,
      outputText: result.outputText,
      normalizedUrl: result.normalizedUrl,
      productExternalId: result.productExternalId,
      promotionUrl: result.promotionUrl,
      shortUrl: result.shortUrl,
      providerCode: result.providerCode,
      providerMessage: result.providerMessage,
      rawData: result.rawData,
      createdAt: conversion.createdAt,
    };
  }

  private async recordFailedConversion(
    platformId: string,
    content: string,
    errorMessage: string,
  ) {
    try {
      await this.prisma.affiliateLinkConversion.create({
        data: {
          affiliatePlatformId: platformId,
          originalUrl: content,
          normalizedUrl: content.match(/https?:\/\/[^\s<>"']+/i)?.[0],
          source: 'ADMIN_WEB',
          status: 'FAILED',
          errorMessage,
        },
      });
    } catch {
      // 转换错误优先返回给管理员，历史写入失败由应用日志继续定位。
    }
  }

  async convert(
    code: string,
    dto: ConvertAffiliateLinkDto,
    admin: AuthenticatedAdmin,
  ) {
    const definition = this.definition(code);
    if (
      definition.adapterType !== 'LIHUA_XIONG' &&
      definition.adapterType !== 'YOUZAI_ASSISTANT'
    ) {
      throw new BadRequestException(`${definition.name}转换适配器尚未接入`);
    }

    const platform = await this.prisma.affiliatePlatform.findUnique({
      where: { code: definition.code },
      include: {
        accounts: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    const content = dto.content.trim();

    if (definition.adapterType === 'YOUZAI_ASSISTANT') {
      if (!platform?.enabled) {
        throw new BadRequestException(`请先保存并启用${definition.name}`);
      }
      const account = platform.accounts[0];
      if (!account?.enabled) {
        throw new BadRequestException(`${definition.name}默认接口账号尚未启用`);
      }

      const credentials = this.readCredentials(account.credentialsEncrypted);
      if (!credentials.readable) {
        throw new BadRequestException(
          `${definition.name}密钥读取失败，请重新填写并保存`,
        );
      }
      const token = credentials.values.accessToken;
      if (!token) {
        throw new BadRequestException(
          '请先在返利平台配置中填写并保存 Authorization',
        );
      }

      const storedConfig = this.storedConfig(definition, platform.config);
      try {
        const result = await this.youzaiAssistantAdapter.convert({
          content,
          apiBaseUrl: storedConfig.apiBaseUrl ?? definition.defaultApiBaseUrl,
          credentials: { token },
        });
        return await this.persistConversion(
          definition,
          platform.id,
          content,
          result,
          admin,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : '有赞助手接口转换失败';
        await this.recordFailedConversion(platform.id, content, errorMessage);
        throw new BadGatewayException(errorMessage);
      }
    }

    if (!platform?.enabled) {
      throw new BadRequestException('请先保存并启用梨花熊聚合返利接口');
    }

    const account = platform.accounts[0];
    if (!account?.enabled) {
      throw new BadRequestException('梨花熊默认接口账号尚未启用');
    }

    const credentials = this.readCredentials(account.credentialsEncrypted);
    if (!credentials.readable) {
      throw new BadRequestException('梨花熊接口密钥读取失败，请重新填写并保存');
    }

    const xid = credentials.values.apiKey ?? LIHUAXIONG_PROTOCOL.defaultXid;
    const signatureSalt =
      credentials.values.apiSecret ?? LIHUAXIONG_PROTOCOL.defaultSignatureSalt;
    const token = credentials.values.accessToken;
    const missingFields = [
      !xid ? 'XID' : null,
      !signatureSalt ? '签名盐' : null,
      !token ? '登录 Token' : null,
    ].filter((value): value is string => Boolean(value));
    if (!xid || !signatureSalt || !token) {
      throw new BadRequestException(
        `请先配置梨花熊接口的${missingFields.join('、')}`,
      );
    }

    const storedConfig = this.storedConfig(definition, platform.config);
    try {
      const result = await this.lihuaXiongAdapter.convert({
        content,
        apiBaseUrl: storedConfig.apiBaseUrl ?? definition.defaultApiBaseUrl,
        credentials: {
          xid,
          signatureSalt,
          token,
          device: storedConfig.device ?? LIHUAXIONG_PROTOCOL.device,
          promotionId: credentials.values.promotionId,
        },
      });
      return await this.persistConversion(
        definition,
        platform.id,
        content,
        result,
        admin,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '梨花熊接口转换失败';
      await this.recordFailedConversion(platform.id, content, errorMessage);
      throw new BadGatewayException(errorMessage);
    }
  }

  async listConversions(code: string, query: ListAffiliateConversionsDto) {
    const definition = this.definition(code);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const platform = await this.prisma.affiliatePlatform.findUnique({
      where: { code: definition.code },
      select: { id: true },
    });

    if (!platform) {
      return {
        items: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      };
    }

    const where = { affiliatePlatformId: platform.id };
    const [items, total] = await Promise.all([
      this.prisma.affiliateLinkConversion.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.affiliateLinkConversion.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        platformCode: definition.code,
        platformName: definition.name,
        originalText: item.originalUrl,
        outputText:
          item.promotionText ?? item.shortUrl ?? item.promotionUrl ?? '',
        normalizedUrl: item.normalizedUrl,
        productExternalId: item.productExternalId,
        promotionUrl: item.promotionUrl,
        shortUrl: item.shortUrl,
        status: item.status,
        errorMessage: item.errorMessage,
        createdAt: item.createdAt,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async deleteConversion(code: string, id: string, admin: AuthenticatedAdmin) {
    const definition = this.definition(code);
    const platform = await this.prisma.affiliatePlatform.findUnique({
      where: { code: definition.code },
      select: { id: true },
    });
    if (!platform) throw new NotFoundException('返利平台接口不存在');

    const conversion = await this.prisma.affiliateLinkConversion.findFirst({
      where: { id, affiliatePlatformId: platform.id },
    });
    if (!conversion) throw new NotFoundException('转换历史不存在');

    await this.prisma.$transaction(async (transaction) => {
      await transaction.affiliateLinkConversion.delete({ where: { id } });
      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'DELETE',
          entityType: 'AffiliateLinkConversion',
          entityId: id,
          beforeData: {
            platformCode: definition.code,
            status: conversion.status,
            createdAt: conversion.createdAt.toISOString(),
          },
        },
      });
    });

    return { success: true };
  }

  async clearConversions(code: string, admin: AuthenticatedAdmin) {
    const definition = this.definition(code);
    const platform = await this.prisma.affiliatePlatform.findUnique({
      where: { code: definition.code },
      select: { id: true },
    });
    if (!platform) return { success: true, deletedCount: 0 };

    const deletedCount = await this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.affiliateLinkConversion.deleteMany({
        where: { affiliatePlatformId: platform.id },
      });
      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'CLEAR',
          entityType: 'AffiliateLinkConversion',
          entityId: platform.id,
          beforeData: {
            platformCode: definition.code,
            deletedCount: deleted.count,
          },
        },
      });
      return deleted.count;
    });

    return { success: true, deletedCount };
  }
}
