import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_NOTIFICATION_RULES,
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_LABELS,
  type NotificationEventKey,
} from './notification-events';
import {
  buildOrderChangeSnapshot,
  formatChangeDetail,
  type NotificationChange,
  renderNotificationTemplate,
  type NotificationVariables,
} from './notification-template';

const CHANNEL_ENDPOINT_DEFAULTS: Record<string, string> = {
  DINGTALK: '',
  WECOM: '',
  PUSHPLUS: 'https://www.pushplus.plus/send',
  CUSTOM: '',
};

const extractProductQuantity = (productName: string | null | undefined) => {
  const raw = productName?.trim() ?? '';
  if (!raw) return '1';
  const matches = [...raw.matchAll(/[×*＊xX✕]\s*(\d+(?:\.\d+)?)/g)];
  if (!matches.length) return '1';
  return String(matches.at(-1)?.[1] ?? '1');
};

export interface NotificationDeliveryResult {
  channelId: string;
  channelName: string;
  channelType: string;
  success: boolean;
  message: string;
}

export interface NotifyOrderOptions {
  changes?: NotificationChange[];
  requestMetadata?: { ipAddress?: string; userAgent?: string };
  extraVariables?: NotificationVariables;
}

interface OrderRow {
  id: string;
  serialNo: number;
  platformOrderNo: string | null;
  productNameSnapshot: string;
  submitterWechatNickname: string | null;
  notes: string | null;
  receiverName: string | null;
  purchaseAddress: string | null;
  inboundTrackingNo: string | null;
  fundingType: string;
  orderAmount: unknown;
  submitterSettlementAmount: unknown;
  orderedAt: Date;
  reviewStatus: string;
  dispatchStatus: string;
  rebateScanned: boolean | null;
  platform: { name: string } | null;
  category: { name: string } | null;
  submitter: { name: string; nickname: string | null } | null;
  shareForm: { title: string } | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------ 渠道管理 ------------------------------ */

  async listChannels() {
    const channels = await this.prisma.notificationChannel.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      endpoint: channel.endpoint,
      secret: channel.secret ? 'configured' : '',
      secretConfigured: Boolean(channel.secret),
      enabled: channel.enabled,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    }));
  }

  async createChannel(input: {
    name: string;
    type: string;
    endpoint?: string;
    secret?: string;
    enabled?: boolean;
  }) {
    const type = this.assertChannelType(input.type);
    const endpoint = (input.endpoint ?? CHANNEL_ENDPOINT_DEFAULTS[type] ?? '').trim();
    if (!endpoint && type !== 'PUSHPLUS') {
      throw new BadRequestException('请填写推送地址');
    }
    if (type === 'PUSHPLUS' && !input.secret?.trim()) {
      throw new BadRequestException('PushPlus 需要填写 Token');
    }
    return this.prisma.notificationChannel.create({
      data: {
        name: input.name.trim(),
        type,
        endpoint,
        secret: input.secret?.trim() || null,
        enabled: input.enabled ?? true,
      },
    });
  }

  async updateChannel(
    id: string,
    input: {
      name?: string;
      type?: string;
      endpoint?: string;
      secret?: string;
      enabled?: boolean;
    },
  ) {
    const existing = await this.prisma.notificationChannel.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('通知渠道不存在');
    const type = input.type ? this.assertChannelType(input.type) : existing.type;
    const endpoint =
      input.endpoint === undefined
        ? existing.endpoint
        : input.endpoint.trim() || CHANNEL_ENDPOINT_DEFAULTS[type] || '';
    const secret =
      input.secret === undefined
        ? existing.secret
        : input.secret.trim() || null;
    if (type === 'PUSHPLUS' && !secret) {
      throw new BadRequestException('PushPlus 需要填写 Token');
    }
    return this.prisma.notificationChannel.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? existing.name,
        type,
        endpoint,
        secret,
        enabled: input.enabled ?? existing.enabled,
      },
    });
  }

  async deleteChannel(id: string) {
    const existing = await this.prisma.notificationChannel.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('通知渠道不存在');
    await this.prisma.notificationChannel.delete({ where: { id } });
    const rules = await this.prisma.notificationRule.findMany();
    await Promise.all(
      rules.map((rule) =>
        this.prisma.notificationRule.update({
          where: { id: rule.id },
          data: {
            channelIds: rule.channelIds.filter((channelId) => channelId !== id),
          },
        }),
      ),
    );
    return { deleted: true };
  }

  /** 发送一条测试消息，用于确认渠道配置是否可用。 */
  async testChannel(id: string) {
    const channel = await this.prisma.notificationChannel.findUnique({
      where: { id },
    });
    if (!channel) throw new NotFoundException('通知渠道不存在');
    const title = '订单变动监控测试通知';
    const content = [
      '这是一条来自下单登记系统的测试消息。',
      '如果收到了，说明该渠道配置正确。',
      `发送时间：${this.formatTime(new Date())}`,
    ].join('\n');
    const result = await this.deliver(channel, title, content, {
      event: 'TEST',
      eventLabel: '测试通知',
    });
    return {
      success: result.success,
      message: result.message,
      channel: {
        id: channel.id,
        name: channel.name,
        type: channel.type,
      },
    };
  }

  /* ------------------------------ 规则管理 ------------------------------ */

  async listRules() {
    await this.ensureRules();
    const rules = await this.prisma.notificationRule.findMany();
    const ruleMap = new Map(rules.map((rule) => [rule.event, rule]));
    return NOTIFICATION_EVENTS.map((event) => {
      const rule = ruleMap.get(event);
      return {
        event,
        eventLabel: NOTIFICATION_EVENT_LABELS[event],
        enabled: rule?.enabled ?? true,
        titleTemplate:
          rule?.titleTemplate ?? DEFAULT_NOTIFICATION_RULES[event].titleTemplate,
        bodyTemplate:
          rule?.bodyTemplate ?? DEFAULT_NOTIFICATION_RULES[event].bodyTemplate,
        channelIds: rule?.channelIds ?? [],
        updatedAt: rule?.updatedAt ?? null,
      };
    });
  }

  async updateRule(
    event: string,
    input: {
      enabled?: boolean;
      titleTemplate?: string;
      bodyTemplate?: string;
      channelIds?: string[];
    },
  ) {
    this.assertEvent(event);
    await this.ensureRules();
    const current = await this.prisma.notificationRule.findUnique({
      where: { event },
    });
    if (!current) throw new NotFoundException('通知规则不存在');
    const channelIds = Array.from(
      new Set(
        (input.channelIds ?? current.channelIds).filter(
          (channelId) => typeof channelId === 'string' && channelId.length > 0,
        ),
      ),
    );
    return this.prisma.notificationRule.update({
      where: { event },
      data: {
        enabled: input.enabled ?? current.enabled,
        titleTemplate:
          input.titleTemplate?.trim() || current.titleTemplate,
        bodyTemplate: input.bodyTemplate?.trim() || current.bodyTemplate,
        channelIds,
      },
    });
  }

  /* ------------------------------ 消息中心 ------------------------------ */

  async listMessages(options: { unreadOnly?: boolean; limit?: number }) {
    const messages = await this.prisma.notificationMessage.findMany({
      where: options.unreadOnly ? { readAt: null } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(options.limit ?? 50, 1), 200),
    });
    return messages.map((message) => ({
      id: message.id,
      event: message.event,
      eventLabel: NOTIFICATION_EVENT_LABELS[message.event] ?? message.event,
      title: message.title,
      content: message.content,
      read: Boolean(message.readAt),
      createdAt: message.createdAt,
    }));
  }

  async unreadCount() {
    return this.prisma.notificationMessage.count({ where: { readAt: null } });
  }

  async markRead(id: string) {
    await this.prisma.notificationMessage.updateMany({
      where: { id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: true };
  }

  async markAllRead() {
    const result = await this.prisma.notificationMessage.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async deleteMessage(id: string) {
    await this.prisma.notificationMessage.deleteMany({ where: { id } });
    return { deleted: true };
  }

  async clearMessages() {
    const result = await this.prisma.notificationMessage.deleteMany({});
    return { deleted: result.count };
  }

  /* ------------------------------ 事件触发 ------------------------------ */

  /**
   * 订单变动通知入口。任何异常都不会向上抛出，避免影响报单主流程。
   */
  async notifyOrderEvent(
    event: NotificationEventKey,
    orderIds: string[],
    options: NotifyOrderOptions = {},
  ): Promise<void> {
    try {
      const rule = await this.prisma.notificationRule.findUnique({
        where: { event },
      });
      if (!rule || !rule.enabled) return;
      if (!orderIds.length) return;

      const orders = await this.prisma.order.findMany({
        where: { id: { in: orderIds } },
        include: {
          platform: { select: { name: true } },
          category: { select: { name: true } },
          submitter: { select: { name: true, nickname: true } },
          shareForm: { select: { title: true } },
        },
      });
      if (!orders.length) return;

      const variables = this.buildVariables(event, orders, options);
      const title = renderNotificationTemplate(rule.titleTemplate, variables);
      const content = renderNotificationTemplate(rule.bodyTemplate, variables);

      const deliveryResults: NotificationDeliveryResult[] = [];
      if (rule.channelIds.length) {
        const channels = await this.prisma.notificationChannel.findMany({
          where: { id: { in: rule.channelIds }, enabled: true },
        });
        for (const channel of channels) {
          const result = await this.deliver(channel, title, content, {
            event,
            eventLabel: NOTIFICATION_EVENT_LABELS[event],
            variables,
          });
          deliveryResults.push(result);
        }
      }

      await this.prisma.notificationMessage.create({
        data: {
          event,
          title,
          content,
          payload: {
            variables: { ...variables },
            deliveryResults: deliveryResults.map((item) => ({ ...item })),
            orderIds,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch {
      // 通知失败不能影响业务主流程，这里静默处理。
    }
  }

  /** 对比同一订单修改前后的内容，给出变更字段清单。 */
  async buildOrderChangeSnapshot(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        platform: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
    if (!order) return null;
    return buildOrderChangeSnapshot({
      productNameSnapshot: order.productNameSnapshot,
      platformOrderNo: order.platformOrderNo,
      platformName: order.platform?.name,
      categoryName: order.category?.name,
      fundingType: order.fundingType,
      orderedAt: order.orderedAt,
      receiverName: order.receiverName,
      purchaseAddress: order.purchaseAddress,
      inboundTrackingNo: order.inboundTrackingNo,
      orderAmount: order.orderAmount,
      submitterSettlementAmount: order.submitterSettlementAmount,
      paymentDiscountAmount: order.paymentDiscountAmount,
      rebateScanned: order.rebateScanned,
      dispatchStatus: order.dispatchStatus,
      notes: order.notes,
    });
  }

  private buildVariables(
    event: NotificationEventKey,
    orders: OrderRow[],
    options: NotifyOrderOptions,
  ): NotificationVariables {
    const first = orders[0];
    const changes = options.changes ?? [];
    const orderList = orders
      .map((order, index) => {
        const amount = this.money(order.orderAmount);
        return `${index + 1}. ${order.productNameSnapshot}｜平台订单号：${
          order.platformOrderNo || '-'
        }｜金额：${amount}`;
      })
      .join('\n');
    const variables: NotificationVariables = {
      event,
      eventLabel: NOTIFICATION_EVENT_LABELS[event],
      time: this.formatTime(new Date()),
      count: orders.length,
      orderList,
      orderNo: first?.platformOrderNo || '-',
      serialNo: first?.serialNo ?? '-',
      product: first?.productNameSnapshot || '-',
      quantity: extractProductQuantity(first?.productNameSnapshot),
      amount: this.money(first?.orderAmount),
      settlementAmount: this.money(first?.submitterSettlementAmount),
      submitter:
        first?.submitterWechatNickname ||
        first?.submitter?.nickname ||
        first?.submitter?.name ||
        '-',
      platform: first?.platform?.name || '-',
      category: first?.category?.name || '-',
      fundingType: first?.fundingType || '-',
      address: first?.purchaseAddress || '-',
      receiver: first?.receiverName || '-',
      trackingNo: first?.inboundTrackingNo || '-',
      notes: first?.notes || '-',
      status: first?.reviewStatus || '-',
      formName: first?.shareForm?.title || '-',
      ip: options.requestMetadata?.ipAddress || '-',
      device: this.deviceSummary(options.requestMetadata?.userAgent),
      changedFields: changes.map((change) => change.label).join('、') || '-',
      changeDetail: formatChangeDetail(changes) || '-',
      ...(options.extraVariables ?? {}),
    };
    return variables;
  }

  /* ------------------------------ 渠道发送 ------------------------------ */

  private async deliver(
    channel: {
      id: string;
      name: string;
      type: string;
      endpoint: string;
      secret: string | null;
    },
    title: string,
    content: string,
    payload: Record<string, unknown>,
  ): Promise<NotificationDeliveryResult> {
    const base = {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
    };
    try {
      if (channel.type === 'DINGTALK') {
        await this.postJson(this.dingTalkUrl(channel), {
          msgtype: 'markdown',
          markdown: { title, text: `${title}\n\n${content}` },
        });
      } else if (channel.type === 'WECOM') {
        await this.postJson(channel.endpoint, {
          msgtype: 'markdown',
          markdown: { content: `**${title}**\n${content}` },
        });
      } else if (channel.type === 'PUSHPLUS') {
        await this.postJson(channel.endpoint || CHANNEL_ENDPOINT_DEFAULTS.PUSHPLUS, {
          token: channel.secret,
          title,
          content,
          template: 'markdown',
        });
      } else {
        await this.postJson(
          channel.endpoint,
          { title, content, ...payload },
          channel.secret
            ? { 'X-Notification-Key': channel.secret }
            : undefined,
        );
      }
      return { ...base, success: true, message: '发送成功' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '发送失败，请检查渠道配置';
      return { ...base, success: false, message };
    }
  }

  private dingTalkUrl(channel: { endpoint: string; secret: string | null }) {
    if (!channel.secret) return channel.endpoint;
    const timestamp = Date.now();
    const signature = createHmac('sha256', channel.secret)
      .update(`${timestamp}\n${channel.secret}`)
      .digest('base64');
    const separator = channel.endpoint.includes('?') ? '&' : '?';
    return `${channel.endpoint}${separator}timestamp=${timestamp}&sign=${encodeURIComponent(
      signature,
    )}`;
  }

  private async postJson(
    url: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) {
    if (!url) throw new Error('推送地址为空');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(headers ?? {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`渠道返回 ${response.status}：${text.slice(0, 120)}`);
      }
      if (text) {
        try {
          const parsed = JSON.parse(text) as {
            errcode?: number;
            errmsg?: string;
            code?: number;
            msg?: string;
          };
          if (
            (parsed.errcode !== undefined && parsed.errcode !== 0) ||
            (parsed.code !== undefined && parsed.code !== 0)
          ) {
            throw new Error(
              `渠道返回错误：${
                parsed.errmsg ||
                parsed.msg ||
                `错误码 ${parsed.errcode ?? parsed.code}`
              }`,
            );
          }
        } catch (error) {
          // 这里只关心「渠道业务错误码」，JSON 解析失败要按成功处理。
          if (
            error instanceof Error &&
            error.message.startsWith('渠道返回错误：')
          ) {
            throw error;
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /* ------------------------------ 内部工具 ------------------------------ */

  private async ensureRules() {
    const existing = await this.prisma.notificationRule.findMany();
    const existingEvents = new Set(existing.map((rule) => rule.event));
    const missing = NOTIFICATION_EVENTS.filter(
      (event) => !existingEvents.has(event),
    );
    if (!missing.length) return;
    await this.prisma.$transaction(
      missing.map((event) =>
        this.prisma.notificationRule.create({
          data: {
            event,
            enabled: true,
            titleTemplate: DEFAULT_NOTIFICATION_RULES[event].titleTemplate,
            bodyTemplate: DEFAULT_NOTIFICATION_RULES[event].bodyTemplate,
            channelIds: [],
          },
        }),
      ),
    );
  }

  private assertChannelType(type: string) {
    const allowed = ['DINGTALK', 'WECOM', 'PUSHPLUS', 'CUSTOM'];
    if (!allowed.includes(type)) {
      throw new BadRequestException('不支持的通知渠道类型');
    }
    return type as 'DINGTALK' | 'WECOM' | 'PUSHPLUS' | 'CUSTOM';
  }

  private assertEvent(event: string): asserts event is NotificationEventKey {
    if (!NOTIFICATION_EVENTS.includes(event as NotificationEventKey)) {
      throw new BadRequestException('不支持的通知事件');
    }
  }

  private money(value: unknown) {
    if (value === undefined || value === null) return '-';
    const text =
      typeof value === 'object' && 'toString' in (value as object)
        ? (value as { toString(): string }).toString()
        : String(value);
    const amount = Number(text);
    if (!Number.isFinite(amount)) return text;
    return `¥${amount.toFixed(2)}`;
  }

  private formatTime(date: Date) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  }

  private deviceSummary(userAgent?: string) {
    if (!userAgent) return '-';
    const trimmed = userAgent.slice(0, 120);
    return trimmed || '-';
  }
}

