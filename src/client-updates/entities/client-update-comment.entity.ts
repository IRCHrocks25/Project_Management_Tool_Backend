import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClientUpdate } from './client-update.entity';
import { User } from '../../users/entities/user.entity';

@Entity('client_update_comments')
export class ClientUpdateComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClientUpdate)
  @JoinColumn({ name: 'updateId' })
  update: ClientUpdate;

  @Column()
  updateId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'simple-array', nullable: true })
  mentionedUserIds: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

