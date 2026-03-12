import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';
import { User } from '../../users/entities/user.entity';

@Entity('chat_room_participants')
@Unique(['roomId', 'userId'])
export class ChatRoomParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  roomId: string;

  @ManyToOne(() => ChatRoom, (room) => room.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId' })
  room: ChatRoom;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'timestamp', nullable: true })
  lastReadAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
