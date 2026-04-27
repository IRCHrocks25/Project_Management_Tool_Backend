import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Deliverable } from './deliverable.entity';
import { User } from '../../users/entities/user.entity';

@Entity('deliverable_team_members')
@Unique(['deliverableId', 'userId'])
export class DeliverableTeamMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Deliverable, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deliverableId' })
  deliverable: Deliverable;

  @Column()
  deliverableId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @CreateDateColumn()
  assignedAt: Date;
}
