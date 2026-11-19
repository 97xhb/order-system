import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import {
  CreateNotificationChannelDto,
  UpdateNotificationChannelDto,
} from './dto/notification-channel.dto';
import { UpdateNotificationRuleDto } from './dto/notification-rule.dto';
import {
  NOTIFICATION_EVENT_DESCRIPTIONS,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_VARIABLES,
} from './notification-events';
import { NotificationsService } from './notifications.service';

@ApiTags('admin-notifications')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('channels')
  @ApiOperation({ summary: '通知渠道列表' })
  listChannels() {
    return this.notifications.listChannels();
  }

  @Post('channels')
  @ApiOperation({ summary: '新增通知渠道' })
  createChannel(@Body() dto: CreateNotificationChannelDto) {
    return this.notifications.createChannel(dto);
  }

  @Patch('channels/:id')
  @ApiOperation({ summary: '修改通知渠道' })
  updateChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotificationChannelDto,
  ) {
    return this.notifications.updateChannel(id, dto);
  }

  @Delete('channels/:id')
  @ApiOperation({ summary: '删除通知渠道' })
  removeChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.deleteChannel(id);
  }

  @Post('channels/:id/test')
  @ApiOperation({ summary: '发送测试通知' })
  testChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.testChannel(id);
  }

  @Get('rules')
  @ApiOperation({ summary: '通知事件规则列表' })
  listRules() {
    return this.notifications.listRules();
  }

  @Patch('rules/:event')
  @ApiOperation({ summary: '保存通知事件规则' })
  updateRule(
    @Param('event') event: string,
    @Body() dto: UpdateNotificationRuleDto,
  ) {
    return this.notifications.updateRule(event, dto);
  }

  @Get('variables')
  @ApiOperation({ summary: '通知模板可用变量列表' })
  listVariables() {
    return {
      variables: NOTIFICATION_VARIABLES,
      events: Object.entries(NOTIFICATION_EVENT_LABELS).map(
        ([event, label]) => ({
          event,
          label,
          description: NOTIFICATION_EVENT_DESCRIPTIONS[
            event as keyof typeof NOTIFICATION_EVENT_DESCRIPTIONS
          ],
        }),
      ),
    };
  }

  @Get('messages')
  @ApiOperation({ summary: '站内通知消息列表' })
  listMessages(
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.listMessages({
      unreadOnly: unreadOnly === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('messages/unread-count')
  @ApiOperation({ summary: '未读消息数量' })
  unreadCount() {
    return this.notifications.unreadCount();
  }

  @Post('messages/read-all')
  @ApiOperation({ summary: '全部标记为已读' })
  markAllRead() {
    return this.notifications.markAllRead();
  }

  @Post('messages/:id/read')
  @ApiOperation({ summary: '标记消息已读' })
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(id);
  }

  @Delete('messages/:id')
  @ApiOperation({ summary: '删除单条消息' })
  removeMessage(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.deleteMessage(id);
  }

  @Delete('messages')
  @ApiOperation({ summary: '清空通知消息' })
  clearMessages() {
    return this.notifications.clearMessages();
  }
}

