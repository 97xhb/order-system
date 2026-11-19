import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const channelRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'channel-1',
    name: '测试渠道',
    type: 'CUSTOM',
    endpoint: 'https://example.com/hook',
    secret: null,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createService = () => {
    const prisma = {
      notificationChannel: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }) => channelRow(data)),
        update: jest.fn(async ({ data }) => channelRow(data)),
        delete: jest.fn(async () => ({})),
      },
      notificationRule: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async () => null),
        updateMany: jest.fn(async () => ({ count: 0 })),
        update: jest.fn(async () => ({})),
      },
      notificationMessage: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async () => null),
        count: jest.fn(async () => 0),
        create: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 0 })),
        delete: jest.fn(async () => ({})),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      order: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async () => null),
      },
    };
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
    );
    return { service, prisma };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('渠道管理', () => {
    it('新增渠道时缺少推送地址会报错', async () => {
      const { service } = createService();
      await expect(
        service.createChannel({ name: '钉钉', type: 'DINGTALK' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PushPlus 未填 Token 时报错', async () => {
      const { service } = createService();
      await expect(
        service.createChannel({ name: '推送', type: 'PUSHPLUS' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PushPlus 默认带上官方推送地址', async () => {
      const { service, prisma } = createService();
      await service.createChannel({
        name: '推送',
        type: 'PUSHPLUS',
        secret: 'token-1',
      });
      expect(prisma.notificationChannel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            endpoint: 'https://www.pushplus.plus/send',
          }),
        }),
      );
    });

    it('列表不返回明文密钥，只返回是否已配置', async () => {
      const { service, prisma } = createService();
      prisma.notificationChannel.findMany.mockResolvedValue([
        channelRow({ secret: 'super-secret' }),
      ] as never);
      const [item] = await service.listChannels();
      expect(item.secretConfigured).toBe(true);
      expect(JSON.stringify(item)).not.toContain('super-secret');
    });

    it('删除渠道时同步从所有规则里摘掉该渠道', async () => {
      const { service, prisma } = createService();
      prisma.notificationChannel.findUnique.mockResolvedValue(
        channelRow() as never,
      );
      prisma.notificationRule.findMany.mockResolvedValue([
        { id: 'rule-1', channelIds: ['channel-1', 'channel-2'] },
      ] as never);
      await service.deleteChannel('channel-1');
      expect(prisma.notificationRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { channelIds: ['channel-2'] },
      });
    });
  });

  describe('外部渠道投递', () => {
    const fetchMock = () =>
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ errcode: 0, errmsg: 'ok' }),
      } as unknown as Response);

    it('钉钉按 markdown 格式推送并附带签名', async () => {
      const { service, prisma } = createService();
      const fetchSpy = fetchMock();
      prisma.notificationChannel.findUnique.mockResolvedValue(
        channelRow({
          type: 'DINGTALK',
          endpoint: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
          secret: 'ding-secret',
        }) as never,
      );
      const result = await service.testChannel('channel-1');
      expect(result.success).toBe(true);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('timestamp=');
      expect(url).toContain('sign=');
      const body = JSON.parse(String(init.body));
      expect(body.msgtype).toBe('markdown');
      expect(body.markdown.title).toBe('订单变动监控测试通知');
    });

    it('企业微信按 markdown 格式推送', async () => {
      const { service, prisma } = createService();
      const fetchSpy = fetchMock();
      prisma.notificationChannel.findUnique.mockResolvedValue(
        channelRow({
          type: 'WECOM',
          endpoint: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc',
        }) as never,
      );
      const result = await service.testChannel('channel-1');
      expect(result.success).toBe(true);
      const body = JSON.parse(
        String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body),
      );
      expect(body.msgtype).toBe('markdown');
      expect(body.markdown.content).toContain('订单变动监控测试通知');
    });

    it('PushPlus 带上 token 与模板', async () => {
      const { service, prisma } = createService();
      const fetchSpy = fetchMock();
      prisma.notificationChannel.findUnique.mockResolvedValue(
        channelRow({
          type: 'PUSHPLUS',
          endpoint: 'https://www.pushplus.plus/send',
          secret: 'push-token',
        }) as never,
      );
      const result = await service.testChannel('channel-1');
      expect(result.success).toBe(true);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://www.pushplus.plus/send');
      const body = JSON.parse(String(init.body));
      expect(body.token).toBe('push-token');
      expect(body.template).toBe('markdown');
    });

    it('自定义 Webhook 把标题正文和变量一起发出去', async () => {
      const { service, prisma } = createService();
      const fetchSpy = fetchMock();
      prisma.notificationChannel.findUnique.mockResolvedValue(
        channelRow({
          type: 'CUSTOM',
          endpoint: 'https://example.com/hook',
          secret: 'hook-key',
        }) as never,
      );
      const result = await service.testChannel('channel-1');
      expect(result.success).toBe(true);
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Notification-Key']).toBe('hook-key');
      const body = JSON.parse(String(init.body));
      expect(body.title).toBe('订单变动监控测试通知');
      expect(body.content).toContain('发送时间');
    });

    it('渠道返回业务错误码时判定为失败', async () => {
      const { service, prisma } = createService();
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ errcode: 310000, errmsg: '关键词不匹配' }),
      } as unknown as Response);
      prisma.notificationChannel.findUnique.mockResolvedValue(
        channelRow({ type: 'DINGTALK' }) as never,
      );
      const result = await service.testChannel('channel-1');
      expect(result.success).toBe(false);
      expect(result.message).toContain('关键词不匹配');
    });

    it('HTTP 状态异常时判定为失败并带回原因', async () => {
      const { service, prisma } = createService();
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'server exploded',
      } as unknown as Response);
      prisma.notificationChannel.findUnique.mockResolvedValue(
        channelRow({ type: 'WECOM' }) as never,
      );
      const result = await service.testChannel('channel-1');
      expect(result.success).toBe(false);
      expect(result.message).toContain('500');
    });
  });

  describe('事件触发与模板变量', () => {
    const orderRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'order-1',
      serialNo: 12,
      platformOrderNo: 'PDD-9988',
      productNameSnapshot: '短袖*3',
      orderAmount: 66.6,
      submitterSettlementAmount: 50,
      fundingType: 'SELF_PAID',
      orderedAt: new Date('2026-11-20T00:00:00+08:00'),
      receiverName: '张三',
      purchaseAddress: '浙江省杭州市',
      inboundTrackingNo: 'SF123',
      notes: '备注内容',
      reviewStatus: 'PENDING',
      platform: { name: '拼多多' },
      category: { name: '服饰' },
      submitter: { name: '李四', nickname: '小李' },
      shareForm: { title: '夏季报单' },
      ...overrides,
    });

    it('规则关闭时不发消息也不调渠道', async () => {
      const { service, prisma } = createService();
      const fetchSpy = jest.spyOn(global, 'fetch');
      prisma.notificationRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        event: 'ORDER_SUBMITTED',
        enabled: false,
        titleTemplate: 'x',
        bodyTemplate: 'y',
        channelIds: ['channel-1'],
      } as never);
      await service.notifyOrderEvent('ORDER_SUBMITTED', ['order-1']);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.notificationMessage.create).not.toHaveBeenCalled();
    });

    it('把变量替换成真实内容后写站内消息', async () => {
      const { service, prisma } = createService();
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ errcode: 0 }),
      } as unknown as Response);
      prisma.notificationRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        event: 'ORDER_SUBMITTED',
        enabled: true,
        titleTemplate: '新报单：{{submitter}} 提交了订单 {{orderNo}}',
        bodyTemplate: '商品：{{product}}\n数量：{{quantity}}\n金额：{{amount}}',
        channelIds: [],
      } as never);
      prisma.order.findMany.mockResolvedValue([orderRow()] as never);
      await service.notifyOrderEvent('ORDER_SUBMITTED', ['order-1']);
      expect(prisma.notificationMessage.create).toHaveBeenCalled();
      const payload = (prisma.notificationMessage.create as jest.Mock).mock
        .calls[0][0].data;
      expect(payload.title).toBe('新报单：小李 提交了订单 PDD-9988');
      expect(payload.content).toContain('商品：短袖*3');
      expect(payload.content).toContain('数量：3');
      expect(payload.content).toContain('金额：¥66.60');
      expect(payload.content).not.toContain('{{');
    });

    it('改单通知带上变更字段与新旧值对照', async () => {
      const { service, prisma } = createService();
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ errcode: 0 }),
      } as unknown as Response);
      prisma.notificationRule.findUnique.mockResolvedValue({
        id: 'rule-2',
        event: 'ORDER_UPDATED_BY_SUBMITTER',
        enabled: true,
        titleTemplate: '下单人修改了订单 {{orderNo}}',
        bodyTemplate:
          '变更字段：{{changedFields}}\n变更明细：\n{{changeDetail}}',
        channelIds: [],
      } as never);
      prisma.order.findMany.mockResolvedValue([orderRow()] as never);
      await service.notifyOrderEvent('ORDER_UPDATED_BY_SUBMITTER', ['order-1'], {
        changes: [
          { field: 'orderAmount', label: '下单金额', before: '100', after: '66.6' },
        ],
      });
      const payload = (prisma.notificationMessage.create as jest.Mock).mock
        .calls[0][0].data;
      expect(payload.content).toContain('变更字段：下单金额');
      expect(payload.content).toContain('下单金额：100 → 66.6');
    });

    it('渠道投递失败也不影响站内消息落库', async () => {
      const { service, prisma } = createService();
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('网络不通'));
      prisma.notificationRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        event: 'ORDER_SUBMITTED',
        enabled: true,
        titleTemplate: '标题 {{orderNo}}',
        bodyTemplate: '正文',
        channelIds: ['channel-1'],
      } as never);
      prisma.order.findMany.mockResolvedValue([orderRow()] as never);
      prisma.notificationChannel.findMany.mockResolvedValue([
        channelRow() as never,
      ]);
      await service.notifyOrderEvent('ORDER_SUBMITTED', ['order-1']);
      expect(prisma.notificationMessage.create).toHaveBeenCalled();
      const payload = (prisma.notificationMessage.create as jest.Mock).mock
        .calls[0][0].data;
      expect(payload.payload.deliveryResults[0].success).toBe(false);
    });

    it('推送过程抛异常时静默吞掉，不影响报单主流程', async () => {
      const { service, prisma } = createService();
      prisma.notificationRule.findUnique.mockRejectedValue(
        new Error('数据库连接中断'),
      );
      await expect(
        service.notifyOrderEvent('ORDER_SUBMITTED', ['order-1']),
      ).resolves.toBeUndefined();
    });
  });
});
