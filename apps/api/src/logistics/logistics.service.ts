import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
} from '../security/sensitive-value';
import { LogisticsQueryDto } from './dto/logistics-query.dto';
import { UpdateLogisticsSettingsDto } from './dto/update-logistics-settings.dto';

const SETTINGS_ID = 'default';
const PROVIDER = 'APIZERO';
const DEFAULT_ENDPOINT = 'https://v1.apizero.cn/api/express';
const CACHE_TTL_MS = 60_000;

type RequestMetadata = { ipAddress?: string; userAgent?: string };

interface ApiZeroTrace {
  time?: string;
  content?: string;
}

interface ApiZeroResponse {
  code?: number | string;
  msg?: string;
  data?: {
    number?: string;
    com?: string;
    com_name?: string;
    state?: number | string;
    status?: string;
    status_desc?: string;
    trace_count?: number;
    traces?: ApiZeroTrace[];
  };
  request_id?: string;
  tips?: string;
}

export interface LogisticsResult {
  success: boolean;
  trackingNo: string;
  carrierCode: string | null;
  carrierName: string | null;
  state: string;
  stateText: string;
  reason: string | null;
  updatedAt: string;
  traces: Array<{
    time: string;
    station: string;
    remark: string;
    action: string;
  }>;
}

@Injectable()
export class LogisticsService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; result: LogisticsResult }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private encryptionKey() {
    return this.config.getOrThrow<string>('DATA_ENCRYPTION_KEY');
  }

  private clean(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private async loadSettings() {
    const settings = await this.prisma.logisticsSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        provider: PROVIDER,
        enabled: false,
        endpoint: DEFAULT_ENDPOINT,
        requestType: 'GET',
        autoDetectType: 'AUTO',
      },
      update: {},
    });
    if (settings.provider === PROVIDER) return settings;
    return this.prisma.logisticsSetting.update({
      where: { id: SETTINGS_ID },
      data: {
        provider: PROVIDER,
        enabled: false,
        businessId: null,
        appKeyEncrypted: null,
        endpoint: DEFAULT_ENDPOINT,
        requestType: 'GET',
        autoDetectType: 'AUTO',
      },
    });
  }

  private toView(settings: {
    id: string;
    provider: string;
    enabled: boolean;
    appKeyEncrypted: string | null;
    updatedAt: Date;
  }) {
    return {
      id: settings.id,
      provider: settings.provider,
      enabled: settings.enabled,
      apiKeyConfigured: Boolean(settings.appKeyEncrypted),
      apiKeyMasked: settings.appKeyEncrypted ? '已加密保存' : '',
      endpoint: DEFAULT_ENDPOINT,
      anonymousDailyLimit: 3,
      authenticatedDailyLimit: 10,
      updatedAt: settings.updatedAt,
    };
  }

  async getSettings() {
    return this.toView(await this.loadSettings());
  }

  async updateSettings(
    dto: UpdateLogisticsSettingsDto,
    admin: AuthenticatedAdmin,
    metadata: RequestMetadata,
  ) {
    const before = await this.loadSettings();
    const apiKey = this.clean(dto.apiKey);
    if (apiKey && dto.clearApiKey) {
      throw new BadRequestException('新 API Key 与清除密钥不能同时提交');
    }
    const apiKeyEncrypted = apiKey
      ? encryptSensitiveValue(apiKey, this.encryptionKey())
      : dto.clearApiKey
        ? null
        : before.appKeyEncrypted;

    const updated = await this.prisma.$transaction(async (transaction) => {
      const setting = await transaction.logisticsSetting.upsert({
        where: { id: SETTINGS_ID },
        create: {
          id: SETTINGS_ID,
          provider: PROVIDER,
          enabled: dto.enabled,
          appKeyEncrypted: apiKeyEncrypted,
          endpoint: DEFAULT_ENDPOINT,
          requestType: 'GET',
          autoDetectType: 'AUTO',
        },
        update: {
          provider: PROVIDER,
          enabled: dto.enabled,
          businessId: null,
          appKeyEncrypted: apiKeyEncrypted,
          endpoint: DEFAULT_ENDPOINT,
          requestType: 'GET',
          autoDetectType: 'AUTO',
        },
      });
      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'LOGISTICS_SETTINGS_UPDATED',
          entityType: 'LogisticsSetting',
          entityId: SETTINGS_ID,
          beforeData: {
            provider: before.provider,
            enabled: before.enabled,
            apiKeyConfigured: Boolean(before.appKeyEncrypted),
          } satisfies Prisma.InputJsonObject,
          afterData: {
            provider: setting.provider,
            enabled: setting.enabled,
            apiKeyConfigured: Boolean(setting.appKeyEncrypted),
          } satisfies Prisma.InputJsonObject,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      return setting;
    });
    this.cache.clear();
    return this.toView(updated);
  }

  private getApiKey(settings: { appKeyEncrypted: string | null }) {
    if (!settings.appKeyEncrypted) return null;
    try {
      return decryptSensitiveValue(
        settings.appKeyEncrypted,
        this.encryptionKey(),
      );
    } catch {
      throw new ServiceUnavailableException(
        'ApiZero API Key 无法解密，请重新保存',
      );
    }
  }

  private normalizeCarrierCode(value?: string | null) {
    const input = this.clean(value)?.toLowerCase();
    if (!input) return null;
    const aliases: Record<string, string> = {
      sf: 'sf',
      顺丰: 'sf',
      顺丰速运: 'sf',
      yto: 'yto',
      圆通: 'yto',
      圆通快递: 'yto',
      zto: 'zto',
      中通: 'zto',
      中通快递: 'zto',
      sto: 'sto',
      申通: 'sto',
      申通快递: 'sto',
      yunda: 'yunda',
      yd: 'yunda',
      韵达: 'yunda',
      韵达快递: 'yunda',
      jt: 'jt',
      jtsd: 'jt',
      极兔: 'jt',
      极兔速递: 'jt',
      jd: 'jd',
      京东: 'jd',
      京东物流: 'jd',
      ems: 'ems',
      邮政: 'ems',
      中国邮政: 'ems',
    };
    return aliases[input] || (/^[a-z0-9_-]{2,20}$/.test(input) ? input : null);
  }

  private validateTrackingNo(value: string) {
    const trackingNo = value.trim();
    if (!/^[A-Za-z0-9]{8,40}$/.test(trackingNo)) {
      throw new BadRequestException('运单号需为 8 至 40 位字母或数字');
    }
    return trackingNo;
  }

  private validatePhoneSuffix(value?: string | null) {
    const phoneSuffix = this.clean(value);
    if (phoneSuffix && !/^\d{4}$/.test(phoneSuffix)) {
      throw new BadRequestException('手机号后四位必须是 4 位数字');
    }
    return phoneSuffix;
  }

  private stateText(status: string, fallback?: string | null) {
    const labels: Record<string, string> = {
      EMPTY: '暂无轨迹',
      COLLECTED: '已揽收',
      ACCEPTED: '已揽收',
      TRANSIT: '运输中',
      DELIVERING: '派送中',
      SIGNED: '已签收',
      EXCEPTION: '物流异常',
      RETURNING: '退回中',
      RETURNED: '已退回',
    };
    return labels[status] || fallback || status || '未知状态';
  }

  private normalizeResponse(value: ApiZeroResponse, trackingNo: string) {
    const data = value.data;
    if (Number(value.code) !== 0 || !data) {
      const message =
        this.clean(value.msg) || `接口错误 ${String(value.code ?? 'UNKNOWN')}`;
      throw new BadGatewayException(`ApiZero 快递接口：${message}`);
    }
    const state = String(data.status || data.state || 'UNKNOWN').toUpperCase();
    const traces = Array.isArray(data.traces)
      ? data.traces
          .map((trace) => ({
            time: trace.time || '',
            station: trace.content || '',
            remark: '',
            action: '',
          }))
          .filter((trace) => trace.time || trace.station)
      : [];
    return {
      success: true,
      trackingNo: data.number || trackingNo,
      carrierCode: this.normalizeCarrierCode(data.com),
      carrierName: this.clean(data.com_name),
      state,
      stateText: this.stateText(state, this.clean(data.status_desc)),
      reason:
        state === 'EMPTY' || !traces.length
          ? this.clean(data.status_desc) || '接口未返回物流轨迹'
          : null,
      updatedAt: traces[0]?.time || new Date().toISOString(),
      traces,
    } satisfies LogisticsResult;
  }

  private async request(
    settings: { appKeyEncrypted: string | null },
    trackingNo: string,
    carrierCode?: string | null,
    phoneSuffix?: string | null,
  ) {
    const url = new URL(DEFAULT_ENDPOINT);
    url.searchParams.set('number', trackingNo);
    if (carrierCode) url.searchParams.set('com', carrierCode);
    if (phoneSuffix) url.searchParams.set('phone', phoneSuffix);
    const apiKey = this.getApiKey(settings);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new BadGatewayException('ApiZero 快递接口连接失败');
    }
    const text = await response.text();
    let payload: ApiZeroResponse;
    try {
      payload = JSON.parse(text) as ApiZeroResponse;
    } catch {
      throw new BadGatewayException('ApiZero 快递接口返回内容无法解析');
    }
    if (!response.ok) {
      const reason = this.clean(payload.msg);
      throw new BadGatewayException(
        reason
          ? `ApiZero 快递接口：${reason}`
          : `ApiZero 快递接口返回 HTTP ${response.status}`,
      );
    }
    return payload;
  }

  private async queryTracking(
    trackingNoInput: string,
    carrierCodeInput?: string | null,
    phoneSuffixInput?: string | null,
  ): Promise<LogisticsResult> {
    const trackingNo = this.validateTrackingNo(trackingNoInput);
    const carrierCode = this.normalizeCarrierCode(carrierCodeInput);
    const phoneSuffix = this.validatePhoneSuffix(phoneSuffixInput);
    const settings = await this.loadSettings();
    if (!settings.enabled) {
      throw new ServiceUnavailableException('ApiZero 快递查询功能未启用');
    }

    const cacheKey = `${trackingNo}:${carrierCode || ''}:${phoneSuffix || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    const response = await this.request(
      settings,
      trackingNo,
      carrierCode,
      phoneSuffix,
    );
    const result = this.normalizeResponse(response, trackingNo);
    if (carrierCode && !result.carrierCode) result.carrierCode = carrierCode;
    this.cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result });
    return result;
  }

  async test(trackingNo: string, carrierCode?: string, phoneSuffix?: string) {
    return this.queryTracking(trackingNo, carrierCode, phoneSuffix);
  }

  async queryOrder(
    orderId: string,
    dto: LogisticsQueryDto,
    admin: AuthenticatedAdmin,
    metadata: RequestMetadata,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        inboundTrackingNo: true,
        shipmentLink: {
          select: { shipment: { select: { trackingNo: true, carrier: true } } },
        },
      },
    });
    if (!order) throw new BadRequestException('订单不存在');
    const kind = dto.kind === 'inbound' ? 'inbound' : 'shipment';
    const trackingNo =
      kind === 'inbound'
        ? order.inboundTrackingNo
        : order.shipmentLink?.shipment.trackingNo;
    if (!trackingNo) throw new BadRequestException('该订单没有可查询的运单号');
    const savedCarrier =
      kind === 'shipment' ? order.shipmentLink?.shipment.carrier : null;
    const result = await this.queryTracking(
      trackingNo,
      dto.carrierCode || savedCarrier,
      dto.phoneSuffix,
    );
    await this.prisma.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action: 'LOGISTICS_QUERY',
        entityType: 'Order',
        entityId: order.id,
        afterData: {
          provider: PROVIDER,
          kind,
          trackingNo,
          carrierCode: result.carrierCode,
          state: result.state,
          traceCount: result.traces.length,
        } satisfies Prisma.InputJsonObject,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    return { ...result, kind };
  }
}
