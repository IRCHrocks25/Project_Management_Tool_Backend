import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Deliverable } from './deliverable.entity';
import { User } from '../../users/entities/user.entity';

export enum DeliverableAction {
  APPROVED = 'Approved',
  REVISION_REQUESTED = 'Revision Requested',
  STATUS_CHANGED = 'Status Changed',
}

@Entity('deliverable_history')
export class DeliverableHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Deliverable)
  @JoinColumn({ name: 'deliverableId' })
  deliverable: Deliverable;

  @Column()
  deliverableId: string;

  @Column('text', { nullable: true })
  fileUrl: string; // Track history per file/link

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: DeliverableAction,
  })
  action: DeliverableAction;

  @Column()
  previousStatus: string;

  @Column()
  newStatus: string;

  @Column('text', { nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}

