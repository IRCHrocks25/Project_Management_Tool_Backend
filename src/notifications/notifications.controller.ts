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
    return this.notificationsService.findAll(
      req.user?.userId || req.user?.id,
      req.user?.role
    );
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const count = await this.notificationsService.findUnreadCount(req.user?.userId || req.user?.id);
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

