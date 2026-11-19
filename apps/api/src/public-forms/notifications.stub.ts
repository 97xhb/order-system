import type { NotificationsService } from '../notifications/notifications.service';

/** 测试里用的通知服务替身：只记录调用，不真的发消息。 */
export const createNotificationsStub = () =>
  ({
    notifyOrderEvent: jest.fn(async () => undefined),
    buildOrderChangeSnapshot: jest.fn(async () => null),
  }) as unknown as NotificationsService;

