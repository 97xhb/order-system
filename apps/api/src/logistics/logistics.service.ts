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
const DEFAULT_ENDPOINT = 'https://v1.apizero.cn/api/express-pro';
const CACHE_TTL_MS = 60_000;

/**
 * 快递查询 PRO 限速 2 req/s，这里留出余量串行化外发请求，
 * 避免连续点击时触发 4029（调用过快）。
 */
const MIN_REQUEST_INTERVAL_MS = 550;

/**
 * 快递查询 PRO 业务错误码，取自官方文档「错误码」章节，
 * 用来把接口回包翻译成管理员能直接处理的中文提示。
 */
const API_ZERO_ERROR_LABELS: Record<number, string> = {
  4000: '请求参数错误',
  4011: 'API Key 无效',
  4013: 'API Key 已暂停',
  4014: '当前 IP 不在 API Key 白名单',
  4015: '该接口需要 API Key',
  4022: '账户余额不足',
  4029: '调用过于频繁，请稍后重试',
  4030: '今日免费额度已用完',
  4040: '接口已下线',
  4041: '接口不存在',
  5000: '接口服务器内部错误',
  5020: '上游服务暂时不可用',
  5021: '上游返回格式异常',
  5030: '暂无可用节点',
};

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

  private nextRequestAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private encryptionKey() {
    return this.config.getOrThrow<string>('DATA_ENCRYPTION_KEY');
  }

  /**
   * 接口地址由后台自行填写和保存，需要校验为合法的 http/https 地址，
   * 避免保存出无效地址后查询直接报错。
   */
  private normalizeEndpoint(value?: string | null) {
    const input = value?.trim();
    if (!input) throw new BadRequestException('请填写接口地址');
    if (input.length > 2048) {
      throw new BadRequestException('接口地址不能超过 2048 个字符');
    }

    let parsed: URL;
    try {
      parsed = new URL(input);
    } catch {
      throw new BadRequestException('接口地址格式不正确');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('接口地址只支持 http 或 https');
    }
    if (parsed.username || parsed.password) {
      throw new BadRequestException('接口地址不能包含账号或密码');
    }
    return parsed.toString();
  }

  /** 按 PRO 文档把业务错误码翻译成可操作的中文提示。 */
  private describeApiZeroError(payload: ApiZeroResponse, httpStatus: number) {
    const code = Number(payload.code);
    const label = Number.isFinite(code)
      ? API_ZERO_ERROR_LABELS[code]
      : undefined;
    const message = this.clean(payload.msg);
    const detail = label || message;
    if (detail) return detail;
    return `ApiZero 快递接口返回 HTTP ${httpStatus}`;
  }

  /** PRO 接口限速 2 req/s，串行化外发请求并保留安全间隔。 */
  private async waitForRequestSlot() {
    const now = Date.now();
    const scheduledAt = Math.max(now, this.nextRequestAt);
    this.nextRequestAt = scheduledAt + MIN_REQUEST_INTERVAL_MS;
    const wait = scheduledAt - now;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
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
    endpoint: string;
    updatedAt: Date;
  }) {
    return {
      id: settings.id,
      provider: settings.provider,
      enabled: settings.enabled,
      apiKeyConfigured: Boolean(settings.appKeyEncrypted),
      apiKeyMasked: settings.appKeyEncrypted ? '已加密保存' : '',
      endpoint: settings.endpoint,
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
    const endpoint = dto.endpoint
      ? this.normalizeEndpoint(dto.endpoint)
      : before.endpoint;
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
          endpoint,
          requestType: 'GET',
          autoDetectType: 'AUTO',
        },
        update: {
          provider: PROVIDER,
          enabled: dto.enabled,
          businessId: null,
          appKeyEncrypted: apiKeyEncrypted,
          endpoint,
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
            endpoint: before.endpoint,
          } satisfies Prisma.InputJsonObject,
          afterData: {
            provider: setting.provider,
            enabled: setting.enabled,
            apiKeyConfigured: Boolean(setting.appKeyEncrypted),
            endpoint: setting.endpoint,
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

  /** 回包里的公司编码，PRO 自动识别后返回，直接规范成小写。 */
  private normalizeCarrierCode(value?: string | null) {
    const input = this.clean(value)?.toLowerCase();
    if (!input) return null;
    return /^[a-z0-9_-]{2,20}$/.test(input) ? input : null;
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

  /**
   * 订单列表里的运单号允许写成 `运单号-手机尾号`，例如 `SF5137788186075-1429`。
   * 有些快递（顺丰、中通等）查询时必须额外提供收件人手机号后四位，
   * 因此这里把两者拆开，避免把 `运单号-尾号` 整体当成运单号提交给接口。
   * 只把“最后一段恰好是 4 位数字”的情况视为尾号，运单号本身带短横线时不会被误拆。
   */
  private splitTrackingNo(value: string) {
    const raw = value.trim();
    const matched = /^(.*\S)-(\d{4})$/.exec(raw);
    if (!matched) return { trackingNo: raw, phoneSuffix: null };
    return { trackingNo: matched[1].trim(), phoneSuffix: matched[2] };
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
      throw new BadGatewayException(
        `ApiZero 快递接口：${this.describeApiZeroError(value, 200)}`,
      );
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
    settings: { appKeyEncrypted: string | null; endpoint: string },
    trackingNo: string,
    phoneSuffix?: string | null,
  ) {
    // PRO 文档：com 可省略，缺省由接口按单号自动识别快递公司。
    const url = new URL(settings.endpoint);
    url.searchParams.set('number', trackingNo);
    if (phoneSuffix) url.searchParams.set('phone', phoneSuffix);
    const apiKey = this.getApiKey(settings);

    let response: Response;
    await this.waitForRequestSlot();
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
    // PRO 文档约定：HTTP 200 也要先判断业务 code === 0。
    if (Number(payload.code) !== 0) {
      throw new BadGatewayException(
        `ApiZero 快递接口：${this.describeApiZeroError(payload, response.status)}`,
      );
    }
    if (!response.ok) {
      throw new BadGatewayException(
        `ApiZero 快递接口：${this.describeApiZeroError(payload, response.status)}`,
      );
    }
    return payload;
  }

  private async queryTracking(
    trackingNoInput: string,
    phoneSuffixInput?: string | null,
  ): Promise<LogisticsResult> {
    const trackingNo = this.validateTrackingNo(trackingNoInput);
    const phoneSuffix = this.validatePhoneSuffix(phoneSuffixInput);
    const settings = await this.loadSettings();
    if (!settings.enabled) {
      throw new ServiceUnavailableException('ApiZero 快递查询功能未启用');
    }
    // 快递查询 PRO 没有匿名额度，请求必须携带 API Key。
    if (!settings.appKeyEncrypted) {
      throw new ServiceUnavailableException(
        '快递查询 PRO 需要先在系统设置中填写 API Key',
      );
    }

    const cacheKey = `${trackingNo}:${phoneSuffix || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    const response = await this.request(settings, trackingNo, phoneSuffix);
    const result = this.normalizeResponse(response, trackingNo);
    this.cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result });
    return result;
  }

  async test(trackingNo: string, phoneSuffix?: string) {
    const parsed = this.splitTrackingNo(trackingNo);
    return this.queryTracking(
      parsed.trackingNo,
      phoneSuffix || parsed.phoneSuffix,
    );
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
          select: { shipment: { select: { trackingNo: true } } },
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
    const parsed = this.splitTrackingNo(trackingNo);
    const result = await this.queryTracking(
      parsed.trackingNo,
      dto.phoneSuffix || parsed.phoneSuffix,
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
