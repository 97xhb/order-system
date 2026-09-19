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
import { LIHUAXIONG_PROTOCOL } from './adapters/lihuaxiong.codec';
import { ConvertAffiliateLinkDto } from './dto/convert-affiliate-link.dto';
import { ListAffiliateConversionsDto } from './dto/list-affiliate-conversions.dto';
import {
  AffiliateCredentialsDto,
  UpdateAffiliatePlatformDto,
} from './dto/update-affiliate-platform.dto';

type StoredAffiliateConfig = {
  schemaVersion: 1;
  providerType: AffiliatePlatformDefinition['providerType'];
  supportedPlatformCodes: string[];
  apiBaseUrl: string | null;
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

  async convert(
    code: string,
    dto: ConvertAffiliateLinkDto,
    admin: AuthenticatedAdmin,
  ) {
    const definition = this.definition(code);
    if (definition.adapterType !== 'LIHUA_XIONG') {
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

    const content = dto.content.trim();
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

      const conversion = await this.prisma.$transaction(async (transaction) => {
        const saved = await transaction.affiliateLinkConversion.create({
          data: {
            affiliatePlatformId: platform.id,
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '梨花熊接口转换失败';
      try {
        await this.prisma.affiliateLinkConversion.create({
          data: {
            affiliatePlatformId: platform.id,
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
