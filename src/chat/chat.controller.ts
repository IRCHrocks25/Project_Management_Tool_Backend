import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms')
  async getMyRooms(@Request() req: any) {
    return this.chatService.getMyRooms(req.user.userId);
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req: any) {
    const count = await this.chatService.getUnreadCount(req.user.userId);
    return { count };
  }

  @Post('rooms')
  async getOrCreateRoom(@Body() dto: CreateChatRoomDto, @Request() req: any) {
    return this.chatService.getOrCreateDmRoom(req.user.userId, dto.otherUserId);
  }

  @Get('rooms/:roomId/messages')
  async getRoomMessages(
    @Param('roomId') roomId: string,
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.chatService.getRoomMessages(
      roomId,
      req.user.userId,
      limit ? parseInt(limit, 10) : 50,
      before,
    );
  }

  @Patch('rooms/:roomId/read')
  async markRoomAsRead(@Param('roomId') roomId: string, @Request() req: any) {
    return this.chatService.markRoomAsRead(roomId, req.user.userId);
  }
}
