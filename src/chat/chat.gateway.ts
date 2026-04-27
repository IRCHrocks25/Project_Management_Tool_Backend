import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private chatService: ChatService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>(
          'JWT_SECRET',
          'your-secret-key-change-in-production',
        ),
      });
      client.userId = payload.sub;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    // Cleanup if needed
  }

  @SubscribeMessage('join_room')
  handleJoinRoom(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() roomId: string) {
    if (client.userId && roomId) {
      client.join(`room:${roomId}`);
    }
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() roomId: string) {
    if (roomId) {
      client.leave(`room:${roomId}`);
    }
  }

  @SubscribeMessage('mark_room_read')
  async handleMarkRoomRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() roomId: string,
  ) {
    if (!client.userId || !roomId) return;
    try {
      const result = await this.chatService.markRoomAsRead(roomId, client.userId);
      this.server.to(`room:${roomId}`).emit('room_read', {
        roomId,
        userId: client.userId,
        lastReadAt: result.lastReadAt,
      });
    } catch {
      client.emit('error', { message: 'Failed to mark room as read' });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomId: string; content: string },
  ) {
    if (!client.userId || !payload?.roomId || !payload?.content?.trim()) {
      return;
    }
    try {
      const message = await this.chatService.createMessage(
        payload.roomId,
        client.userId,
        payload.content.trim(),
      );
      const fullMessage = await this.chatService.getMessageWithSender(message.id);
      if (fullMessage) {
        this.server.to(`room:${payload.roomId}`).emit('new_message', fullMessage);
      }
    } catch (err) {
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  // Called by REST API when message is created (alternative path - we use socket flow above)
  emitNewMessage(roomId: string, message: any) {
    this.server.to(`room:${roomId}`).emit('new_message', message);
  }
}
