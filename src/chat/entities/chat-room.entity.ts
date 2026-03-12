import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';

@Entity('chat_rooms')
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, default: 'dm' })
  type: string; // 'dm' for direct messages, 'group' for future

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null; // For group chats; null for DMs

  @OneToMany(() => ChatRoomParticipant, (p) => p.room)
  participants: ChatRoomParticipant[];

  @OneToMany(() => ChatMessage, (m) => m.room)
  messages: ChatMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
