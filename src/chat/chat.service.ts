import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatRoom } from './entities/chat-room.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatRoomParticipant } from './entities/chat-room-participant.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatRoom)
    private chatRoomRepository: Repository<ChatRoom>,
    @InjectRepository(ChatMessage)
    private chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatRoomParticipant)
    private participantRepository: Repository<ChatRoomParticipant>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getOrCreateDmRoom(userId: string, otherUserId: string): Promise<ChatRoom> {
    if (userId === otherUserId) {
      throw new ForbiddenException('Cannot create a chat room with yourself');
    }

    // Check if DM room already exists between these two users
    const existing = await this.chatRoomRepository
      .createQueryBuilder('room')
      .innerJoin('room.participants', 'p1', 'p1.userId = :userId', { userId })
      .innerJoin('room.participants', 'p2', 'p2.userId = :otherUserId', { otherUserId })
      .where('room.type = :type', { type: 'dm' })
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from(ChatRoomParticipant, 'p')
          .where('p.roomId = room.id')
          .getQuery();
        return `(SELECT COUNT(*) FROM chat_room_participants WHERE "roomId" = room.id) = 2`;
      })
      .getOne();

    if (existing) {
      return this.formatExistingRoom(existing, userId);
    }

    // Create new DM room
    const room = this.chatRoomRepository.create({ type: 'dm' });
    const savedRoom = await this.chatRoomRepository.save(room);

    await this.participantRepository.save([
      this.participantRepository.create({ roomId: savedRoom.id, userId }),
      this.participantRepository.create({ roomId: savedRoom.id, userId: otherUserId }),
    ]);

    // Reload with participants to return formatted room
    const reloaded = await this.chatRoomRepository.findOne({
      where: { id: savedRoom.id },
      relations: ['participants', 'participants.user'],
    });
    return this.formatRoomForUser({ ...reloaded!, messages: [] }, userId);
  }

  private async formatExistingRoom(room: ChatRoom, userId: string): Promise<any> {
    const withParticipants = await this.chatRoomRepository.findOne({
      where: { id: room.id },
      relations: ['participants', 'participants.user'],
    });
    const lastMsg = await this.chatMessageRepository.findOne({
      where: { roomId: room.id },
      order: { createdAt: 'DESC' },
      relations: ['sender'],
    });
    return this.formatRoomForUser({ ...withParticipants!, messages: lastMsg ? [lastMsg] : [] }, userId);
  }

  async getMyRooms(userId: string): Promise<any[]> {
    const rooms = await this.chatRoomRepository
      .createQueryBuilder('room')
      .innerJoin('room.participants', 'myParticipant', 'myParticipant.userId = :userId', { userId })
      .leftJoinAndSelect('room.participants', 'participants')
      .leftJoinAndSelect('participants.user', 'participantUser')
      .where('room.type = :type', { type: 'dm' })
      .orderBy('room.updatedAt', 'DESC')
      .getMany();

    const result: any[] = [];
    for (const room of rooms) {
      const lastMsg = await this.chatMessageRepository.findOne({
        where: { roomId: room.id },
        order: { createdAt: 'DESC' },
        relations: ['sender'],
      });
      result.push(this.formatRoomForUser({ ...room, messages: lastMsg ? [lastMsg] : [] }, userId));
    }
    return result;
  }

  private formatRoomForUser(room: ChatRoom, currentUserId: string): any {
    const otherParticipant = room.participants?.find((p: any) => p.userId !== currentUserId);
    const otherUser = otherParticipant?.user;
    const lastMessage = Array.isArray(room.messages) ? room.messages[0] : null;
    const otherLastReadAt = otherParticipant?.lastReadAt?.toISOString() ?? null;

    return {
      id: room.id,
      type: room.type,
      name: room.name || (otherUser ? otherUser.name : 'Unknown'),
      otherUser: otherUser
        ? {
            id: otherUser.id,
            name: otherUser.name,
            email: otherUser.email,
            role: otherUser.role,
          }
        : null,
      otherUserLastReadAt: otherLastReadAt,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            senderId: lastMessage.senderId,
            senderName: (lastMessage as any).sender?.name,
            createdAt: lastMessage.createdAt,
          }
        : null,
      updatedAt: room.updatedAt,
    };
  }

  async getRoomMessages(
    roomId: string,
    userId: string,
    limit = 50,
    before?: string,
  ): Promise<{ messages: any[]; otherUserLastReadAt: string | null }> {
    const isParticipant = await this.participantRepository.findOne({
      where: { roomId, userId },
    });
    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant of this room');
    }

    const otherUserLastReadAt = await this.getOtherParticipantLastReadAt(roomId, userId);

    let query = this.chatMessageRepository
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.sender', 'sender')
      .where('msg.roomId = :roomId', { roomId })
      .orderBy('msg.createdAt', 'DESC')
      .limit(limit);

    if (before) {
      query = query.andWhere('msg.createdAt < :before', { before });
    }

    const messages = await query.getMany();
    const formatted = messages.reverse().map((m) => ({
      id: m.id,
      roomId: m.roomId,
      senderId: m.senderId,
      senderName: (m as any).sender?.name,
      content: m.content,
      createdAt: m.createdAt,
    }));
    return { messages: formatted, otherUserLastReadAt };
  }

  async createMessage(roomId: string, senderId: string, content: string): Promise<ChatMessage> {
    const isParticipant = await this.participantRepository.findOne({
      where: { roomId, userId: senderId },
    });
    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant of this room');
    }

    const room = await this.chatRoomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const message = this.chatMessageRepository.create({
      roomId,
      senderId,
      content: content.trim(),
    });
    const saved = await this.chatMessageRepository.save(message);

    // Update room's updatedAt for sorting
    room.updatedAt = new Date();
    await this.chatRoomRepository.save(room);

    return saved;
  }

  async markRoomAsRead(roomId: string, userId: string): Promise<{ lastReadAt: string }> {
    const participant = await this.participantRepository.findOne({
      where: { roomId, userId },
    });
    if (!participant) {
      throw new ForbiddenException('You are not a participant of this room');
    }
    const now = new Date();
    participant.lastReadAt = now;
    await this.participantRepository.save(participant);
    return { lastReadAt: now.toISOString() };
  }

  async getUnreadCount(userId: string): Promise<number> {
    const myParticipants = await this.participantRepository.find({
      where: { userId },
      select: ['roomId', 'lastReadAt'],
    });
    let total = 0;
    for (const p of myParticipants) {
      const cutoff = p.lastReadAt ?? new Date(0);
      const count = await this.chatMessageRepository
        .createQueryBuilder('m')
        .where('m.roomId = :roomId', { roomId: p.roomId })
        .andWhere('m.senderId != :userId', { userId })
        .andWhere('m.createdAt > :cutoff', { cutoff: cutoff.toISOString() })
        .getCount();
      total += count;
    }
    return total;
  }

  async getOtherParticipantLastReadAt(roomId: string, currentUserId: string): Promise<string | null> {
    const participants = await this.participantRepository.find({
      where: { roomId },
    });
    const otherParticipant = participants.find((p) => p.userId !== currentUserId);
    return otherParticipant?.lastReadAt?.toISOString() ?? null;
  }

  async getMessageWithSender(messageId: string): Promise<any> {
    const msg = await this.chatMessageRepository.findOne({
      where: { id: messageId },
      relations: ['sender'],
    });
    if (!msg) return null;
    return {
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      senderName: (msg as any).sender?.name,
      content: msg.content,
      createdAt: msg.createdAt,
    };
  }
}
