import {
  Controller,
  Get,
  Patch,
  Param,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@Request() req) {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      console.error('[NotificationsController] findAll: userId is undefined', { user: req.user });
      return [];
    }
    return this.notificationsService.findAll(userId, req.user?.role);
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      console.error('[NotificationsController] getUnreadCount: userId is undefined', { user: req.user });
      return { count: 0 };
    }
    const count = await this.notificationsService.findUnreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @Request() req) {
    return this.notificationsService.markAsRead(id, req.user?.userId || req.user?.id);
  }

  @Patch('read-all')
  markAllAsRead(@Request() req) {
    return this.notificationsService.markAllAsRead(req.user?.userId || req.user?.id);
  }
}

